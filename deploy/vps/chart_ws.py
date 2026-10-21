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
# Soft cap for on-read coarser→finer expand (avoid OOM on small VPS).
BACKFILL_MAX_NEED = int(os.environ.get("CHART_BACKFILL_MAX_NEED", "4000"))

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


def _price_along_ohlc(o: float, h: float, l: float, c: float, t01: float) -> float:
    """O→extreme→extreme→C path for synthesizing finer bars from coarser OHLC."""
    t = min(1.0, max(0.0, float(t01)))
    bullish = c >= o
    p1, p2, p3, p4 = o, (l if bullish else h), (h if bullish else l), c
    if t < 0.28:
        f = t / 0.28
        return p1 + (p2 - p1) * f
    if t < 0.62:
        f = (t - 0.28) / 0.34
        return p2 + (p3 - p2) * f
    f = (t - 0.62) / 0.38
    return p3 + (p4 - p3) * f


def expand_coarser_to_finer(
    parent: list[float],
    parent_step: int,
    child_step: int,
) -> list[list[float]]:
    """Expand one coarser bar [t,o,h,l,c,v] into child_step bars.

    Used when XAUUSD (etc.) 1m is missing for a range but 1h / 1d exists
    (e.g. Apr 2026 has daily + hourly, while 1m only starts mid-Aug).
    """
    if child_step <= 0 or parent_step < child_step or parent_step % child_step != 0:
        return [list(parent)]
    n = parent_step // child_step
    t_base = int(parent[0])
    o, h, l, c = float(parent[1]), float(parent[2]), float(parent[3]), float(parent[4])
    v_each = float(parent[5] if len(parent) > 5 else 0) / n
    out: list[list[float]] = []
    prev = o
    bullish = c >= o
    for i in range(n):
        t_end = (i + 1) / n
        px = _price_along_ohlc(o, h, l, c, t_end)
        samples = [prev, px]
        for k in (1, 2, 3):
            samples.append(_price_along_ohlc(o, h, l, c, (i + k / 4) / n))
        if bullish:
            if i == 0 or (i / n) <= 0.28 < ((i + 1) / n):
                samples.append(l)
            if (i / n) <= 0.62 < ((i + 1) / n) or i == n - 1:
                samples.append(h)
        else:
            if i == 0 or (i / n) <= 0.28 < ((i + 1) / n):
                samples.append(h)
            if (i / n) <= 0.62 < ((i + 1) / n) or i == n - 1:
                samples.append(l)
        if i == n - 1:
            px = c
            samples.append(c)
        hi = min(h, max(samples))
        lo = max(l, min(samples))
        hi = max(hi, prev, px)
        lo = min(lo, prev, px)
        out.append([float(t_base + i * child_step), prev, hi, lo, px, v_each])
        prev = px
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

    def _backfill_from_coarser(
        self,
        symbol: str,
        parent: str,
        bars: list[list[float]],
        need: int,
        before: int | None,
    ) -> list[list[float]]:
        """Fill missing finer bars from coarser Mongo hist (1h → 1m only on-read).

        Skip when native coverage is already dense — expensive 1d→1m expand is
        offline-only (--materialize-finer) so live /history stays fast on a 2GB VPS.
        """
        if parent != "1m":
            return bars
        need = min(max(1, need), BACKFILL_MAX_NEED)
        # Already enough native/materialized bars — do not touch coarser TFs.
        if len(bars) >= max(need * 0.85, need - 50):
            return bars
        child_step = STEP_SEC[parent]
        # On-read: only 1h→1m (60×). Never expand 1d here (1440× blows RAM).
        sources: list[tuple[str, int]] = [("1h", 3600)]
        wall = int(time.time())
        end_t = int(before) if before else wall + child_step
        start_t = end_t - need * child_step
        existing: dict[int, list[float]] = {int(b[0]): b for b in bars}

        filled = 0
        for src_parent, src_step in sources:
            if src_step <= child_step or src_step % child_step != 0:
                continue
            parents = self._hist_parents_in_range(
                symbol, src_parent, start_t - src_step, end_t
            )
            if not parents:
                continue
            for p in parents:
                for child in expand_coarser_to_finer(p, src_step, child_step):
                    t0 = int(child[0])
                    if t0 < start_t or t0 >= end_t or t0 > wall:
                        continue
                    if t0 in existing:
                        continue
                    existing[t0] = child
                    filled += 1
        if filled:
            LOG.info(
                "backfill %s %s: +%s from 1h (need=%s before=%s)",
                symbol,
                parent,
                filled,
                need,
                before,
            )
        out = [existing[t] for t in sorted(existing)]
        if before:
            out = [b for b in out if b[0] < before]
        return out

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
        # Heal holes from coarser hist before aggregating derived TFs (5m/15m/…).
        need = max(limit, limit * max(group, 1))
        bars = self._backfill_from_coarser(symbol, parent, bars, need, before)
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

    def materialize_finer_from_coarser(
        self,
        symbol: str,
        *,
        child: str = "1m",
        sources: list[str] | None = None,
    ) -> int:
        """Persist derived finer bars into Mongo where native child hist is missing.

        Prefer 1h→1m, then 1d→1m for remaining holes (XAUUSD Apr 2026 pattern).
        """
        from pymongo import UpdateOne

        symbol = normalize_symbol(symbol)
        if child not in STEP_SEC or child not in HIST_SUFFIX:
            return 0
        child_step = STEP_SEC[child]
        src_list = sources or (["1h", "1d"] if child == "1m" else ["1d"])
        dest = self.hist[f"{symbol}{HIST_SUFFIX[child]}"]
        id_fmt = ID_FORMAT[child]
        written = 0
        # Daily→1m expands 1440×; keep parent pages small to avoid OOM.
        page_size = 50 if any(s == "1d" for s in src_list) else 2_000
        for src in src_list:
            if src not in STEP_SEC or STEP_SEC[src] <= child_step:
                continue
            src_step = STEP_SEC[src]
            if src_step % child_step != 0:
                continue
            src_coll = self.hist[f"{symbol}{HIST_SUFFIX[src]}"]
            cursor_id = ""
            src_page = 50 if src == "1d" else page_size
            while True:
                parents_raw = list(
                    src_coll.find(
                        {"_id": {"$gt": cursor_id}} if cursor_id else {},
                        projection={"data": 1},
                    )
                    .sort("_id", 1)
                    .limit(src_page)
                )
                if not parents_raw:
                    break
                cursor_id = str(parents_raw[-1]["_id"])
                parents: list[list[float]] = []
                for doc in parents_raw:
                    data = doc.get("data") or {}
                    t = to_unix(data.get("time") or doc.get("_id"))
                    if t is None:
                        continue
                    try:
                        parents.append(
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
                if not parents:
                    continue
                ops: list[Any] = []
                for p in parents:
                    t_min = int(p[0])
                    t_max = t_min + src_step
                    # Skip dense days already covered by native/1h-derived 1m.
                    existing_n = dest.count_documents(
                        {
                            "_id": {
                                "$gte": datetime.fromtimestamp(
                                    t_min, tz=timezone.utc
                                ).strftime(id_fmt),
                                "$lt": datetime.fromtimestamp(
                                    t_max, tz=timezone.utc
                                ).strftime(id_fmt),
                            }
                        }
                    )
                    expect = src_step // child_step
                    if existing_n >= expect * 0.85:
                        continue
                    existing_ids = {
                        d["_id"]
                        for d in dest.find(
                            {
                                "_id": {
                                    "$gte": datetime.fromtimestamp(
                                        t_min, tz=timezone.utc
                                    ).strftime(id_fmt),
                                    "$lt": datetime.fromtimestamp(
                                        t_max, tz=timezone.utc
                                    ).strftime(id_fmt),
                                }
                            },
                            {"_id": 1},
                        )
                    }
                    for child_bar in expand_coarser_to_finer(p, src_step, child_step):
                        t0 = int(child_bar[0])
                        bar_id = datetime.fromtimestamp(t0, tz=timezone.utc).strftime(
                            id_fmt
                        )
                        if bar_id in existing_ids:
                            continue
                        iso = datetime.fromtimestamp(t0, tz=timezone.utc)
                        ops.append(
                            UpdateOne(
                                {"_id": bar_id},
                                {
                                    "$set": {
                                        "_id": bar_id,
                                        "data": {
                                            "time": iso,
                                            "open": float(child_bar[1]),
                                            "high": float(child_bar[2]),
                                            "low": float(child_bar[3]),
                                            "close": float(child_bar[4]),
                                            "volume": float(child_bar[5]),
                                        },
                                        "src": f"derived-{src}",
                                    }
                                },
                                upsert=True,
                            )
                        )
                        existing_ids.add(bar_id)
                for i in range(0, len(ops), 1_000):
                    dest.bulk_write(ops[i : i + 1_000], ordered=False)
                written += len(ops)
                if ops:
                    LOG.info(
                        "materialize %s %s from %s: +%s (batch)",
                        symbol,
                        child,
                        src,
                        len(ops),
                    )
        return written


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
    import argparse
    import sys

    parser = argparse.ArgumentParser(description="cp_fetcher chart WS + history")
    parser.add_argument(
        "--materialize-finer",
        metavar="SYMBOL",
        help="Persist missing 1m from 1h/1d into Mongo (e.g. xauusd), then exit",
    )
    parser.add_argument(
        "--child",
        default="1m",
        help="Child TF to materialize (default 1m)",
    )
    args, _unknown = parser.parse_known_args()
    if args.materialize_finer:
        logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
        hub.ping()
        n = hub.materialize_finer_from_coarser(args.materialize_finer, child=args.child)
        print(f"materialized {n} {args.child} bars for {normalize_symbol(args.materialize_finer)}")
        sys.exit(0)
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
