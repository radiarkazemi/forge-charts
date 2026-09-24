#!/usr/bin/env python3
"""Realtime chart WebSocket + compact Mongo history HTTP for cp_fetcher.

WS (port CHART_WS_PORT, default 8002):
  client -> {"op":"subscribe","exchange":"BINANCE","symbol":"BTCUSDT","interval":"1m"}
  server -> {"type":"bar", ...}

HTTP (port CHART_HTTP_PORT, default 8003):
  GET /health
  GET /history?symbol=btcusdt&timeframe=1m&limit=400&group=1&before=<unix>
  -> {"symbol":"btcusdt","timeframe":"1m","group":1,"bars":[[t,o,h,l,c,v],...]}

Deep history targets (TradingView scroll-back):
  1m → up to 20_000 bars
  5m (1m×group=5) → up to 10_000 bars
  other TF → up to 5_000 bars
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

# Serve deep Mongo history for TV scroll-back (1m 20k / 5m 10k / others 5k).
MAX_HISTORY_LIMIT = int(os.environ.get("CHART_HIST_MAX_LIMIT", "25000"))
MAX_RAW_LIMIT = int(os.environ.get("CHART_HIST_MAX_RAW", "60000"))

TF_COLL = {"1m": "1", "1h": "1h", "1d": "1D"}
HIST_SUFFIX = {"1m": "_1m", "1h": "_1h", "1d": ""}
ID_FORMAT = {
    "1m": "%Y-%m-%d %H:%M:%S",
    "1h": "%Y-%m-%d %H:%M:%S",
    "1d": "%Y-%m-%d",
}
INTERVAL_ALIAS = {
    "1": "1m",
    "1m": "1m",
    "5": "1m",
    "5m": "1m",
    "15": "1m",
    "15m": "1m",
    "30": "1m",
    "30m": "1m",
    "60": "1h",
    "1h": "1h",
    "120": "1h",
    "2h": "1h",
    "240": "1h",
    "4h": "1h",
    "1D": "1d",
    "1d": "1d",
    "D": "1d",
    "1W": "1d",
    "1M": "1d",
}
STEP_SEC = {"1m": 60, "1h": 3600, "1d": 86400}


def normalize_symbol(symbol: str) -> str:
    symbol = symbol.strip().upper()
    if ":" in symbol:
        symbol = symbol.split(":", 1)[1]
    return symbol.lower()


def resolve_interval(raw: str) -> str:
    return INTERVAL_ALIAS.get(str(raw).strip(), "1m")


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
        # "2026-08-25 16:31:00" or ISO
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
    """Mongo hist `_id` is a zero-padded UTC datetime string — lexicographic $lt works."""
    if not before_sec or before_sec <= 0:
        return None
    fmt = ID_FORMAT.get(timeframe) or ID_FORMAT["1m"]
    return datetime.fromtimestamp(int(before_sec), tz=timezone.utc).strftime(fmt)


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


class PriceHub:
    def __init__(self) -> None:
        self.client = MongoClient(MONGO_URI, maxPoolSize=20, serverSelectionTimeoutMS=5000)
        self.db = self.client[MONGO_DB_LAST]
        self.hist = self.client[MONGO_DB_HIST]
        self.subs: dict[WebSocketServerProtocol, dict[str, str]] = {}
        self._cache: dict[str, tuple[float, bytes]] = {}

    def ping(self) -> None:
        self.client.admin.command("ping")

    def read_bar(self, symbol: str, interval: str) -> dict[str, Any] | None:
        coll_name = TF_COLL[interval]
        doc = self.db[coll_name].find_one({"_id": symbol})
        if not doc or doc.get("_id") == "time":
            return None
        bct = doc.get("bct")
        return {
            "type": "bar",
            "exchange": (doc.get("ex") or "").lower() or None,
            "symbol": symbol,
            "interval": interval,
            "t": int(bct) if bct is not None else None,
            "o": doc.get("po"),
            "h": doc.get("pmax"),
            "l": doc.get("pmin"),
            "c": doc.get("pl"),
            "v": doc.get("vol") or 0,
            "pc": doc.get("pc") or 0,
        }

    def read_history(
        self,
        symbol: str,
        timeframe: str,
        limit: int,
        group: int,
        before: int | None = None,
    ) -> dict[str, Any]:
        cache_key = f"{symbol}|{timeframe}|{limit}|{group}|{before or 0}"
        now = time.time()
        hit = self._cache.get(cache_key)
        if hit and now - hit[0] <= CACHE_TTL:
            return json.loads(hit[1])

        coll_name = f"{symbol}{HIST_SUFFIX[timeframe]}"
        coll = self.hist[coll_name]
        # Raw parents needed for aggregation (e.g. 10k of 5m → 50k of 1m).
        raw_limit = min(MAX_RAW_LIMIT, max(limit, limit * max(group, 1)))
        query: dict[str, Any] = {}
        bid = before_id(before, timeframe)
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
        step = STEP_SEC[timeframe]
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
            "timeframe": timeframe,
            "group": group,
            "before": before,
            "count": len(bars),
            "bars": bars,
        }
        self._cache[cache_key] = (now, json.dumps(payload, separators=(",", ":")).encode())
        # Opportunistic cache trim
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
                interval = resolve_interval(str(msg.get("interval") or msg.get("resolution") or "1m"))
                if not symbol:
                    await ws.send(json.dumps({"type": "error", "detail": "symbol required"}))
                    continue
                hub.subs[ws] = {"symbol": symbol, "interval": interval}
                bar = hub.read_bar(symbol, interval)
                await ws.send(
                    json.dumps(
                        {
                            "type": "subscribed",
                            "symbol": symbol,
                            "interval": interval,
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
    last_payload: dict[tuple[str, str], str] = {}
    while True:
        await asyncio.sleep(POLL_SEC)
        targets: dict[tuple[str, str], list[WebSocketServerProtocol]] = {}
        for ws, sub in list(hub.subs.items()):
            if not sub:
                continue
            key = (sub["symbol"], sub["interval"])
            targets.setdefault(key, []).append(ws)
        for (symbol, interval), sockets in targets.items():
            try:
                bar = hub.read_bar(symbol, interval)
            except Exception:
                LOG.exception("mongo read failed %s %s", symbol, interval)
                continue
            if not bar:
                continue
            payload = json.dumps(bar, separators=(",", ":"))
            cache_key = (symbol, interval)
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
    timeframe = resolve_interval(str(request.query.get("timeframe") or request.query.get("interval") or "1m"))
    if timeframe not in HIST_SUFFIX:
        timeframe = "1m"
    try:
        limit = int(request.query.get("limit") or 400)
    except ValueError:
        limit = 400
    try:
        group = int(request.query.get("group") or 1)
    except ValueError:
        group = 1
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
        payload = await asyncio.to_thread(hub.read_history, symbol, timeframe, limit, group, before)
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
        LOG.info("chart WS on ws://%s:%s", HOST, PORT)
        await asyncio.Future()
    await http_runner.cleanup()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
