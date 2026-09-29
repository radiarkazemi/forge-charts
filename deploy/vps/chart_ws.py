#!/usr/bin/env python3
"""Realtime chart WebSocket + Mongo history with derived timeframe aggregation.

Base candles in Mongo: 1m / 1h / 1d (cp_fetcher live + historical).
All other TFs (2m, 5m, 15m, 4h, 1W, …) are built by aggregating those parents
for both HTTP history and live WS forming bars.

HTTP (port CHART_HTTP_PORT, default 8003):
  GET /history?symbol=btcusdt&interval=5&limit=10000&before=<unix>
  GET /history?symbol=btcusdt&timeframe=1m&group=5&limit=10000
  -> {"symbol","parent","group","count","bars":[[t,o,h,l,c,v],...]}

WS (port CHART_WS_PORT, default 8002):
  client -> {"op":"subscribe","symbol":"BTCUSDT","interval":"5"}
  server -> aggregated forming bar for that TF (from 1m parents)
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from datetime import datetime, timezone
from typing import Any

import websockets
from aiohttp import web
from pymongo import MongoClient
from websockets.server import WebSocketServerProtocol

LOG = logging.getLogger("cp_fetcher.chart_ws")

MONGO_URI = os.environ.get("MONGO_URI", "mongodb://127.0.0.1:27017/")
MONGO_DB_LAST = os.environ.get("MONGO_DB_LAST", "last")
MONGO_DB_HIST = os.environ.get("MONGO_DB_HISTORICAL", "historical_data")
HOST = os.environ.get("CHART_WS_HOST", "127.0.0.1")
PORT = int(os.environ.get("CHART_WS_PORT", "8002"))
HTTP_PORT = int(os.environ.get("CHART_HTTP_PORT", "8003"))
POLL_SEC = float(os.environ.get("CHART_WS_POLL_SEC", "1.0"))
CACHE_TTL = float(os.environ.get("CHART_HIST_CACHE_TTL", "15"))

MAX_HISTORY_LIMIT = int(os.environ.get("CHART_HIST_MAX_LIMIT", "25000"))
MAX_RAW_LIMIT = int(os.environ.get("CHART_HIST_MAX_RAW", "60000"))

# Native Mongo bases written by cp_fetcher live/historical scrapers.
TF_COLL = {"1m": "1", "1h": "1h", "1d": "1D"}
HIST_SUFFIX = {"1m": "_1m", "1h": "_1h", "1d": ""}
ID_FORMAT = {
    "1m": "%Y-%m-%d %H:%M:%S",
    "1h": "%Y-%m-%d %H:%M:%S",
    "1d": "%Y-%m-%d",
}
STEP_SEC = {"1m": 60, "1h": 3600, "1d": 86400}

# TV / client interval → (parent base TF, group multiplier).
# Higher TFs are always derived from an existing base candle stream.
INTERVAL_SPEC: dict[str, tuple[str, int]] = {
    "1": ("1m", 1),
    "1m": ("1m", 1),
    "2": ("1m", 2),
    "2m": ("1m", 2),
    "3": ("1m", 3),
    "3m": ("1m", 3),
    "5": ("1m", 5),
    "5m": ("1m", 5),
    "10": ("1m", 10),
    "10m": ("1m", 10),
    "15": ("1m", 15),
    "15m": ("1m", 15),
    "30": ("1m", 30),
    "30m": ("1m", 30),
    "45": ("1m", 45),
    "45m": ("1m", 45),
    "60": ("1h", 1),
    "1h": ("1h", 1),
    "120": ("1h", 2),
    "2h": ("1h", 2),
    "180": ("1h", 3),
    "3h": ("1h", 3),
    "240": ("1h", 4),
    "4h": ("1h", 4),
    "360": ("1h", 6),
    "6h": ("1h", 6),
    "480": ("1h", 8),
    "8h": ("1h", 8),
    "720": ("1h", 12),
    "12h": ("1h", 12),
    "1D": ("1d", 1),
    "1d": ("1d", 1),
    "D": ("1d", 1),
    "1W": ("1d", 7),
    "1w": ("1d", 7),
    "W": ("1d", 7),
    "1M": ("1d", 30),
    "1mo": ("1d", 30),
}


def normalize_symbol(symbol: str) -> str:
    symbol = symbol.strip().upper()
    if ":" in symbol:
        symbol = symbol.split(":", 1)[1]
    return symbol.lower()


def resolve_spec(raw: str) -> tuple[str, int]:
    key = str(raw).strip()
    if key in INTERVAL_SPEC:
        return INTERVAL_SPEC[key]
    # Numeric minutes fallback (e.g. "20")
    try:
        n = int(float(key))
        if 1 <= n <= 720:
            if n % 60 == 0:
                return ("1h", max(1, n // 60))
            return ("1m", n)
    except ValueError:
        pass
    return ("1m", 1)


def to_unix(value: Any) -> int | None:
    if value is None:
        return None
    if hasattr(value, "timestamp"):
        try:
            return int(value.timestamp())
        except Exception:
            return None
    if isinstance(value, (int, float)):
        n = float(value)
        if n > 1e12:
            n /= 1000.0
        return int(n)
    if isinstance(value, str) and value:
        try:
            text = value.strip().replace("Z", "+00:00")
            if "T" not in text and " " in text:
                dt = datetime.strptime(text, "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
            else:
                dt = datetime.fromisoformat(text)
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
            return int(dt.timestamp())
        except Exception:
            return None
    return None


def before_id(before_sec: int | None, timeframe: str) -> str | None:
    if not before_sec or before_sec <= 0:
        return None
    fmt = ID_FORMAT.get(timeframe) or ID_FORMAT["1m"]
    return datetime.fromtimestamp(int(before_sec), tz=timezone.utc).strftime(fmt)


def close_to_open(close_sec: int, step: int) -> int:
    if step <= 0:
        return close_sec
    return ((int(close_sec) - 1) // step) * step


def aggregate(bars: list[list[float]], group: int, step: int) -> list[list[float]]:
    if group <= 1 or not bars:
        return bars
    bucket = step * group
    out: list[list[float]] = []
    cur: list[float] | None = None
    bucket_start = -1
    for t, o, h, l, c, v in bars:
        start = int(t // bucket) * bucket
        if cur is None or start != bucket_start:
            if cur is not None:
                out.append(cur)
            bucket_start = start
            cur = [float(start), o, h, l, c, v]
        else:
            cur[2] = max(cur[2], h)
            cur[3] = min(cur[3], l)
            cur[4] = c
            cur[5] += v
    if cur is not None:
        out.append(cur)
    return out


def pack_bar(rows: list[list[float]]) -> list[float] | None:
    if not rows:
        return None
    t0 = float(rows[0][0])
    o = float(rows[0][1])
    h = max(r[2] for r in rows)
    l = min(r[3] for r in rows)
    c = float(rows[-1][4])
    v = sum(r[5] for r in rows)
    return [t0, o, h, l, c, v]


class PriceHub:
    def __init__(self) -> None:
        self.client = MongoClient(MONGO_URI, maxPoolSize=20, serverSelectionTimeoutMS=5000)
        self.db = self.client[MONGO_DB_LAST]
        self.hist = self.client[MONGO_DB_HIST]
        # sub value: symbol, parent, group, label (requested interval string)
        self.subs: dict[WebSocketServerProtocol, dict[str, Any]] = {}
        self._cache: dict[str, tuple[float, bytes]] = {}

    def ping(self) -> None:
        self.client.admin.command("ping")

    def read_parent_last(self, symbol: str, parent: str) -> dict[str, Any] | None:
        coll_name = TF_COLL[parent]
        doc = self.db[coll_name].find_one({"_id": symbol})
        if not doc or doc.get("_id") == "time":
            return None
        bct = doc.get("bct")
        if bct is None:
            return None
        step = STEP_SEC[parent]
        open_t = close_to_open(int(bct), step)
        return {
            "open": open_t,
            "close_t": int(bct),
            "o": float(doc.get("po") or 0),
            "h": float(doc.get("pmax") or 0),
            "l": float(doc.get("pmin") or 0),
            "c": float(doc.get("pl") or 0),
            "v": float(doc.get("vol") or 0),
            "ex": (doc.get("ex") or "").lower() or None,
            "pc": doc.get("pc") or 0,
        }

    def _hist_parents_in_range(
        self, symbol: str, parent: str, start: int, end: int
    ) -> list[list[float]]:
        """Load parent hist bars with open time in [start, end)."""
        coll = self.hist[f"{symbol}{HIST_SUFFIX[parent]}"]
        start_id = before_id(start, parent) or ""
        end_id = before_id(end, parent) or "9999"
        # Inclusive start via $gte on _id string; exclusive end via $lt.
        query = {"_id": {"$gte": start_id, "$lt": end_id}}
        bars: list[list[float]] = []
        for doc in coll.find(query, projection={"data": 1}).sort("_id", 1):
            data = doc.get("data") or {}
            t = to_unix(data.get("time") or doc.get("_id"))
            if t is None or t < start or t >= end:
                continue
            try:
                bars.append(
                    [
                        float(t),
                        float(data["open"]),
                        float(data["high"]),
                        float(data["low"]),
                        float(data["close"]),
                        float(data.get("volume") or 0),
                    ]
                )
            except (KeyError, TypeError, ValueError):
                continue
        return bars

    def read_forming_bar(self, symbol: str, parent: str, group: int, label: str) -> dict[str, Any] | None:
        """Build the current (possibly multi-parent) forming candle for a derived TF."""
        live = self.read_parent_last(symbol, parent)
        if not live:
            return None
        parent_step = STEP_SEC[parent]
        target_step = parent_step * max(1, group)
        bucket = (live["open"] // target_step) * target_step

        if group <= 1:
            return {
                "type": "bar",
                "exchange": live["ex"],
                "symbol": symbol,
                "interval": label,
                "parent": parent,
                "group": 1,
                # Period OPEN — TradingView countdown / bar alignment.
                "t": bucket,
                "bct": live["close_t"],
                "o": live["o"],
                "h": live["h"],
                "l": live["l"],
                "c": live["c"],
                "v": live["v"],
                "pc": live["pc"],
            }

        rows = self._hist_parents_in_range(symbol, parent, bucket, bucket + target_step)
        # Overlay / append the live forming parent (may be ahead of hist flush).
        live_row = [float(live["open"]), live["o"], live["h"], live["l"], live["c"], live["v"]]
        if rows and int(rows[-1][0]) == live["open"]:
            rows[-1] = live_row
        elif live["open"] >= bucket and live["open"] < bucket + target_step:
            rows.append(live_row)
            rows.sort(key=lambda r: r[0])

        packed = pack_bar(rows) if rows else live_row
        if not packed:
            return None
        # Force bucket open time even if first parent is later (gap).
        packed[0] = float(bucket)
        return {
            "type": "bar",
            "exchange": live["ex"],
            "symbol": symbol,
            "interval": label,
            "parent": parent,
            "group": group,
            "t": int(packed[0]),
            "bct": bucket + target_step,
            "o": packed[1],
            "h": packed[2],
            "l": packed[3],
            "c": packed[4],
            "v": packed[5],
            "pc": live["pc"],
        }

    def read_history(
        self,
        symbol: str,
        parent: str,
        limit: int,
        group: int,
        before: int | None = None,
    ) -> dict[str, Any]:
        cache_key = f"{symbol}|{parent}|{limit}|{group}|{before or 0}"
        now = time.time()
        hit = self._cache.get(cache_key)
        if hit and now - hit[0] <= CACHE_TTL:
            return json.loads(hit[1])

        coll_name = f"{symbol}{HIST_SUFFIX[parent]}"
        coll = self.hist[coll_name]
        raw_limit = min(MAX_RAW_LIMIT, max(limit, limit * max(group, 1)))
        query: dict[str, Any] = {}
        bid = before_id(before, parent)
        if bid:
            query["_id"] = {"$lt": bid}

        cursor = coll.find(query, projection={"data": 1}).sort("_id", -1).limit(raw_limit)
        bars: list[list[float]] = []
        for doc in cursor:
            data = doc.get("data") or {}
            t = to_unix(data.get("time") or doc.get("_id"))
            if t is None:
                continue
            if before and t >= before:
                continue
            try:
                o = float(data["open"])
                h = float(data["high"])
                l = float(data["low"])
                c = float(data["close"])
                v = float(data.get("volume") or 0)
            except (KeyError, TypeError, ValueError):
                continue
            bars.append([t, o, h, l, c, v])
        bars.reverse()
        step = STEP_SEC[parent]
        if group > 1:
            bars = aggregate(bars, group, step)
            if before:
                bars = [b for b in bars if b[0] < before]
            if len(bars) > limit:
                bars = bars[-limit:]
        elif len(bars) > limit:
            bars = bars[-limit:]

        payload = {
            "symbol": symbol,
            "parent": parent,
            "timeframe": parent,
            "group": group,
            "before": before,
            "count": len(bars),
            "bars": bars,
        }
        self._cache[cache_key] = (now, json.dumps(payload, separators=(",", ":")).encode())
        if len(self._cache) > 256:
            oldest = sorted(self._cache.items(), key=lambda kv: kv[1][0])[:64]
            for key, _ in oldest:
                self._cache.pop(key, None)
        return payload


hub = PriceHub()


async def handle(ws: WebSocketServerProtocol) -> None:
    peer = getattr(ws, "remote_address", None)
    LOG.info("connect %s", peer)
    hub.subs[ws] = {}
    try:
        await ws.send(json.dumps({"type": "hello", "status": "ok"}))
        async for raw in ws:
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                await ws.send(json.dumps({"type": "error", "detail": "invalid json"}))
                continue
            op = str(msg.get("op") or msg.get("action") or msg.get("type") or "").lower()
            if op in {"subscribe", "sub"}:
                symbol = normalize_symbol(str(msg.get("symbol") or ""))
                label = str(msg.get("interval") or msg.get("resolution") or "1m").strip()
                parent, group = resolve_spec(label)
                if not symbol:
                    await ws.send(json.dumps({"type": "error", "detail": "symbol required"}))
                    continue
                hub.subs[ws] = {
                    "symbol": symbol,
                    "parent": parent,
                    "group": group,
                    "label": label,
                }
                bar = hub.read_forming_bar(symbol, parent, group, label)
                await ws.send(
                    json.dumps(
                        {
                            "type": "subscribed",
                            "symbol": symbol,
                            "interval": label,
                            "parent": parent,
                            "group": group,
                            "bar": bar,
                        }
                    )
                )
                if bar:
                    await ws.send(json.dumps(bar))
            elif op in {"unsubscribe", "unsub", "ping"}:
                if op == "ping":
                    await ws.send(json.dumps({"type": "pong"}))
                else:
                    hub.subs[ws] = {}
                    await ws.send(json.dumps({"type": "unsubscribed"}))
            else:
                await ws.send(json.dumps({"type": "error", "detail": f"unknown op {op}"}))
    except websockets.ConnectionClosed:
        pass
    finally:
        hub.subs.pop(ws, None)
        LOG.info("disconnect %s", peer)


async def broadcaster() -> None:
    last_payload: dict[tuple[str, str, int], str] = {}
    while True:
        await asyncio.sleep(POLL_SEC)
        targets: dict[tuple[str, str, int, str], list[WebSocketServerProtocol]] = {}
        for ws, sub in list(hub.subs.items()):
            if not sub:
                continue
            key = (sub["symbol"], sub["parent"], int(sub["group"]), str(sub["label"]))
            targets.setdefault(key, []).append(ws)
        for (symbol, parent, group, label), sockets in targets.items():
            try:
                bar = hub.read_forming_bar(symbol, parent, group, label)
            except Exception:
                LOG.exception("mongo read failed %s %s x%s", symbol, parent, group)
                continue
            if not bar:
                continue
            payload = json.dumps(bar, separators=(",", ":"))
            cache_key = (symbol, parent, group)
            if last_payload.get(cache_key) == payload:
                continue
            last_payload[cache_key] = payload
            dead: list[WebSocketServerProtocol] = []
            for ws in sockets:
                try:
                    await ws.send(payload)
                except Exception:
                    dead.append(ws)
            for ws in dead:
                hub.subs.pop(ws, None)


async def http_health(_: web.Request) -> web.Response:
    try:
        hub.ping()
        return web.json_response({"status": "ok", "mongo": True})
    except Exception as exc:
        return web.json_response({"status": "error", "detail": str(exc)}, status=503)


async def http_history(request: web.Request) -> web.Response:
    symbol = normalize_symbol(str(request.query.get("symbol") or ""))
    # Prefer explicit timeframe+group; else derive from TV `interval`.
    raw_interval = request.query.get("interval") or request.query.get("resolution")
    if request.query.get("timeframe") or request.query.get("group"):
        parent = str(request.query.get("timeframe") or "1m").strip()
        if parent not in HIST_SUFFIX:
            parent, _g = resolve_spec(parent)
        try:
            group = int(request.query.get("group") or 1)
        except ValueError:
            group = 1
    elif raw_interval:
        parent, group = resolve_spec(str(raw_interval))
    else:
        parent, group = "1m", 1

    if parent not in HIST_SUFFIX:
        parent = "1m"
    try:
        limit = int(request.query.get("limit") or 400)
    except ValueError:
        limit = 400
    before: int | None = None
    before_raw = request.query.get("before") or request.query.get("to") or request.query.get("end")
    if before_raw:
        try:
            before = int(float(before_raw))
            if before > 1e12:
                before = int(before / 1000)
        except ValueError:
            before = None
    limit = max(1, min(limit, MAX_HISTORY_LIMIT))
    group = max(1, min(group, 720))
    if not symbol:
        return web.json_response({"detail": "symbol required"}, status=400)
    try:
        payload = await asyncio.to_thread(hub.read_history, symbol, parent, limit, group, before)
    except Exception as exc:
        LOG.exception("history failed")
        return web.json_response({"detail": str(exc)}, status=500)
    body = json.dumps(payload, separators=(",", ":"))
    return web.Response(
        text=body,
        content_type="application/json",
        headers={
            "Cache-Control": "public, max-age=10",
            "Access-Control-Allow-Origin": "*",
        },
    )


async def start_http() -> web.AppRunner:
    app = web.Application(client_max_size=16 * 1024 * 1024)
    app.router.add_get("/health", http_health)
    app.router.add_get("/health/", http_health)
    app.router.add_get("/history", http_history)
    app.router.add_get("/history/", http_history)
    runner = web.AppRunner(app, access_log=None)
    await runner.setup()
    site = web.TCPSite(runner, HOST, HTTP_PORT)
    await site.start()
    LOG.info("HTTP history on http://%s:%s (max_limit=%s)", HOST, HTTP_PORT, MAX_HISTORY_LIMIT)
    return runner


async def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    hub.ping()
    http_runner = await start_http()
    asyncio.create_task(broadcaster())
    async with websockets.serve(handle, HOST, PORT, ping_interval=20, ping_timeout=20, max_size=8 * 1024 * 1024):
        LOG.info("chart WS on ws://%s:%s (derived TF aggregation on)", HOST, PORT)
        await asyncio.Future()
    await http_runner.cleanup()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
