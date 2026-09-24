#!/usr/bin/env python3
"""Low-latency market tick relay for Forge charts.

Primary: TradingView quote WebSocket (same feed TV Supercharts use) via
cp_fetcher's tvws helpers — pushes ticks as soon as TV emits `qsd`.

Fallbacks (in parallel):
  - Mongo `last.1` poll (cp_fetcher live candle writer)
  - Germany Market Price API HTTP (crypto ~0.25s, forex ~1s throttle)

Client protocol:
  -> {"op":"subscribe","channel":"crypto:btcusdt"}
  -> {"op":"subscribe","channel":"forex:xauusd:FXPRO"}
  <- {"type":"tick","channel":"...","price":123.4,"ts":1710000000,"volume":0,"src":"tv"}
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import sys
import time
from typing import Any

import aiohttp
from aiohttp import web

# cp_fetcher package (TradingView protocol helpers)
sys.path.insert(0, os.environ.get("CP_FETCHER_SRC", "/opt/cp_fetcher/src"))

LOG = logging.getLogger("forge.market_ticks")

API_BASE = os.environ.get("MARKET_API_BASE", "http://2.28.37.51:8088/api/v1").rstrip("/")
API_KEY = os.environ.get("MARKET_API_KEY", "")
HOST = os.environ.get("MARKET_TICKS_HOST", "127.0.0.1")
PORT = int(os.environ.get("MARKET_TICKS_PORT", "8015"))
CRYPTO_POLL = float(os.environ.get("MARKET_TICKS_CRYPTO_POLL", "0.25"))
FOREX_POLL = float(os.environ.get("MARKET_TICKS_FOREX_POLL", "1.0"))
MONGO_POLL = float(os.environ.get("MARKET_TICKS_MONGO_POLL", "0.12"))
MONGO_URI = os.environ.get("MONGO_URI", "mongodb://127.0.0.1:27017/")
TV_ENABLED = os.environ.get("MARKET_TICKS_TV", "1") not in {"0", "false", "False"}
# If a channel got a TV/mongo tick within this window, skip Germany HTTP for it.
GERMANY_SKIP_IF_FRESH_MS = float(os.environ.get("MARKET_TICKS_GERMANY_SKIP_MS", "800"))

# channel -> set of WebSocketResponse
SUBS: dict[str, set[web.WebSocketResponse]] = {}
# last prices to avoid spamming identical ticks
LAST: dict[str, float] = {}
# channel -> last tick monotonic ms / source
LAST_TICK_MS: dict[str, float] = {}
LAST_SRC: dict[str, str] = {}
# desired TV symbols from active channels
TV_WANTED: set[str] = set()
LOCK = asyncio.Lock()
# Higher wins. Lower-priority sources cannot clobber a fresh higher-priority tick.
SOURCE_PRIORITY = {"tv": 40, "mongo": 20, "germany": 10, "cache": 0}
SOURCE_HOLD_MS = {"tv": 1_200, "mongo": 400, "germany": 250}

# channel prefix -> TradingView symbol
CHANNEL_TO_TV: dict[str, str] = {
    "crypto:btcusdt": "BINANCE:BTCUSDT",
    "crypto:ethusdt": "BINANCE:ETHUSDT",
    "crypto:solusdt": "BINANCE:SOLUSDT",
    "crypto:bnbusdt": "BINANCE:BNBUSDT",
    "crypto:xrpusdt": "BINANCE:XRPUSDT",
    "crypto:adausdt": "BINANCE:ADAUSDT",
    "crypto:dogeusdt": "BINANCE:DOGEUSDT",
    "crypto:avaxusdt": "BINANCE:AVAXUSDT",
    "crypto:dotusdt": "BINANCE:DOTUSDT",
    "crypto:linkusdt": "BINANCE:LINKUSDT",
    "crypto:ltcusdt": "BINANCE:LTCUSDT",
    "crypto:maticusdt": "BINANCE:MATICUSDT",
    "crypto:atomusdt": "BINANCE:ATOMUSDT",
    "crypto:nearusdt": "BINANCE:NEARUSDT",
    "crypto:uniusdt": "BINANCE:UNIUSDT",
    "crypto:aaveusdt": "BINANCE:AAVEUSDT",
    "crypto:suiusdt": "BINANCE:SUIUSDT",
    "crypto:aptusdt": "BINANCE:APTUSDT",
    "crypto:arbusdt": "BINANCE:ARBUSDT",
    "crypto:opusdt": "BINANCE:OPUSDT",
    "crypto:paxgusdt": "BINANCE:PAXGUSDT",
    "forex:xauusd": "FOREXCOM:XAUUSD",
    "forex:xauusd:forexcom": "FOREXCOM:XAUUSD",
    "forex:xauusd:fxpro": "FOREXCOM:XAUUSD",
    "forex:xagusd": "FOREXCOM:XAGUSD",
    "forex:eurusd": "FOREXCOM:EURUSD",
    "forex:gbpusd": "FOREXCOM:GBPUSD",
    "forex:usdjpy": "FOREXCOM:USDJPY",
}

# reverse: TV symbol -> channels that should receive the tick
TV_TO_CHANNELS: dict[str, list[str]] = {}
for _ch, _tv in CHANNEL_TO_TV.items():
    TV_TO_CHANNELS.setdefault(_tv, []).append(_ch)


def parse_updated_at(raw: Any) -> int:
    if not raw:
        return int(time.time())
    if isinstance(raw, (int, float)):
        n = float(raw)
        return int(n / 1000) if n > 1e12 else int(n)
    try:
        from datetime import datetime

        text = str(raw).strip().replace("Z", "+00:00")
        dt = datetime.fromisoformat(text)
        return int(dt.timestamp())
    except Exception:
        return int(time.time())


def normalize_channel(raw: str) -> str | None:
    channel = raw.strip().lower()
    if not channel:
        return None
    if channel.startswith("forex:xauusd"):
        parts = channel.split(":")
        return "forex:xauusd" if len(parts) < 3 else f"forex:xauusd:{parts[2].upper()}"
    if channel.startswith("forex:"):
        return channel
    if channel.startswith("crypto:"):
        return f"crypto:{channel.split(':', 1)[1].lower()}"
    return None


def tv_symbol_for_channel(channel: str) -> str | None:
    key = channel.lower()
    if key in CHANNEL_TO_TV:
        return CHANNEL_TO_TV[key]
    # forex:xauusd:FXPRO → try base
    if key.startswith("forex:xauusd"):
        return "FOREXCOM:XAUUSD"
    if key.startswith("crypto:"):
        sym = key.split(":", 1)[1].upper()
        return f"BINANCE:{sym}"
    return None


def channels_for_tv(tv_symbol: str) -> list[str]:
    mapped = list(TV_TO_CHANNELS.get(tv_symbol, []))
    # Also fan-out to any live subscribed channel that maps to this TV symbol.
    for channel in list(SUBS.keys()):
        if tv_symbol_for_channel(channel) == tv_symbol and channel not in mapped:
            mapped.append(channel)
    return mapped


async def broadcast(channel: str, price: float, ts: int, volume: float = 0.0, src: str = "") -> None:
    now_ms = time.monotonic() * 1000
    prev = LAST.get(channel)
    if prev is not None and abs(prev - price) < 1e-12:
        # Same price — refresh freshness only for equal-or-higher priority sources.
        prev_src = LAST_SRC.get(channel, "")
        if SOURCE_PRIORITY.get(src, 0) >= SOURCE_PRIORITY.get(prev_src, 0):
            LAST_TICK_MS[channel] = now_ms
            if src:
                LAST_SRC[channel] = src
        return

    prev_src = LAST_SRC.get(channel, "")
    age = now_ms - LAST_TICK_MS.get(channel, 0)
    hold = SOURCE_HOLD_MS.get(prev_src, 0)
    if (
        prev_src
        and src
        and SOURCE_PRIORITY.get(src, 0) < SOURCE_PRIORITY.get(prev_src, 0)
        and age < hold
    ):
        # Stale Mongo/Germany must not yank the chart off a fresh TV quote.
        return

    LAST[channel] = price
    LAST_TICK_MS[channel] = now_ms
    if src:
        LAST_SRC[channel] = src
    payload: dict[str, Any] = {
        "type": "tick",
        "channel": channel,
        "price": price,
        "ts": ts,
        "volume": volume,
    }
    if src:
        payload["src"] = src
    msg = json.dumps(payload, separators=(",", ":"))
    dead: list[web.WebSocketResponse] = []
    for ws in list(SUBS.get(channel, ())):
        if ws.closed:
            dead.append(ws)
            continue
        try:
            await ws.send_str(msg)
        except Exception:
            dead.append(ws)
    if dead:
        async with LOCK:
            bucket = SUBS.get(channel)
            if not bucket:
                return
            for ws in dead:
                bucket.discard(ws)
            if not bucket:
                SUBS.pop(channel, None)


async def broadcast_tv(tv_symbol: str, price: float, volume: float = 0.0) -> None:
    ts = int(time.time())
    for channel in channels_for_tv(tv_symbol):
        if channel in SUBS and SUBS[channel]:
            await broadcast(channel, price, ts, volume, src="tv")


async def refresh_tv_wanted() -> None:
    wanted: set[str] = set()
    async with LOCK:
        for channel, sockets in SUBS.items():
            if not sockets:
                continue
            tv = tv_symbol_for_channel(channel)
            if tv:
                wanted.add(tv)
    TV_WANTED.clear()
    TV_WANTED.update(wanted)


async def poll_crypto(session: aiohttp.ClientSession) -> None:
    while True:
        async with LOCK:
            channels = [c for c in SUBS if c.startswith("crypto:") and SUBS[c]]
        now_ms = time.monotonic() * 1000
        for channel in channels:
            if now_ms - LAST_TICK_MS.get(channel, 0) < GERMANY_SKIP_IF_FRESH_MS:
                continue
            sym = channel.split(":", 1)[1]
            url = f"{API_BASE}/crypto/prices/{sym}/"
            try:
                async with session.get(
                    url, params={"timeframe": "1s"}, timeout=aiohttp.ClientTimeout(total=2.5)
                ) as resp:
                    if resp.status != 200:
                        continue
                    data = await resp.json()
                price = float(data.get("price"))
                ts = parse_updated_at(data.get("updated_at")) or int(data.get("bar_close_time") or time.time())
                vol = float(data.get("volume") or 0)
                await broadcast(channel, price, ts, vol, src="germany")
            except Exception as exc:
                LOG.debug("crypto poll %s: %s", channel, exc)
        await asyncio.sleep(CRYPTO_POLL)


async def poll_forex(session: aiohttp.ClientSession) -> None:
    backoff = FOREX_POLL
    while True:
        async with LOCK:
            channels = [c for c in SUBS if c.startswith("forex:") and SUBS[c]]
        if not channels:
            backoff = FOREX_POLL
            await asyncio.sleep(0.5)
            continue
        now_ms = time.monotonic() * 1000
        # Skip Germany when any subscribed forex channel is fresh from TV/mongo.
        if any(now_ms - LAST_TICK_MS.get(c, 0) < GERMANY_SKIP_IF_FRESH_MS for c in channels):
            await asyncio.sleep(min(0.35, backoff))
            continue
        try:
            async with session.get(
                f"{API_BASE}/forex/xauusd/", timeout=aiohttp.ClientTimeout(total=2.0)
            ) as resp:
                if resp.status == 429:
                    backoff = min(3.0, max(1.2, backoff * 1.5))
                    LOG.warning("forex throttled — backing off to %.1fs", backoff)
                elif resp.status == 200:
                    data = await resp.json()
                    price = float(data.get("price"))
                    ts = parse_updated_at(data.get("updated_at"))
                    for channel in channels:
                        if channel.startswith("forex:xauusd") or channel == "forex:xauusd":
                            await broadcast(channel, price, ts, 0.0, src="germany")
                    backoff = FOREX_POLL
                else:
                    backoff = min(3.0, backoff * 1.2)
        except Exception as exc:
            LOG.debug("forex poll: %s", exc)
            backoff = min(3.0, backoff * 1.2)
        await asyncio.sleep(backoff)


async def poll_mongo() -> None:
    """Push forming-bar closes from cp_fetcher Mongo as a secondary low-latency path."""
    try:
        from pymongo import MongoClient
    except Exception:
        LOG.warning("pymongo unavailable — mongo tick poll disabled")
        return
    client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=3000, maxPoolSize=8)
    coll = client["last"]["1"]
    while True:
        try:
            async with LOCK:
                channels = [c for c, sockets in SUBS.items() if sockets]
            # Map channel → mongo _id (ticker lower, no exchange)
            ids: dict[str, str] = {}
            for channel in channels:
                tv = tv_symbol_for_channel(channel)
                if not tv:
                    continue
                ticker = tv.split(":", 1)[-1].lower()
                ids[channel] = ticker
            if ids:
                docs = {
                    d["_id"]: d
                    for d in coll.find({"_id": {"$in": list(set(ids.values()))}}, {"pl": 1, "vol": 1, "bct": 1})
                }
                for channel, ticker in ids.items():
                    doc = docs.get(ticker)
                    if not doc:
                        continue
                    price = doc.get("pl")
                    if price is None:
                        continue
                    try:
                        price_f = float(price)
                    except (TypeError, ValueError):
                        continue
                    vol = float(doc.get("vol") or 0)
                    ts = int(doc.get("bct") or time.time())
                    await broadcast(channel, price_f, ts, vol, src="mongo")
        except Exception as exc:
            LOG.debug("mongo poll: %s", exc)
        await asyncio.sleep(MONGO_POLL)


async def tv_quote_feeder() -> None:
    """Primary path: TradingView quote session → immediate tick broadcast."""
    if not TV_ENABLED:
        LOG.info("TV quote feeder disabled")
        return
    try:
        from cp_fetcher.config import load_settings
        from cp_fetcher.protocol import generate_session, is_heartbeat, iter_json_messages
        from cp_fetcher.tvws import connect, reply_heartbeat, send
    except Exception:
        LOG.exception("cp_fetcher tvws import failed — TV feeder offline")
        return

    settings = load_settings()
    subscribed: set[str] = set()

    while True:
        ws = None
        try:
            ws = await connect(settings)
            await send(ws, "set_auth_token", ["unauthorized_user_token"])
            qs = generate_session("qs_")
            await send(ws, "quote_create_session", [qs])
            await send(ws, "quote_set_fields", [qs, "lp", "volume", "bid", "ask", "ch", "chp"])
            subscribed.clear()
            LOG.info("TV quote session %s connected", qs)

            async def sync_symbols() -> None:
                while True:
                    await refresh_tv_wanted()
                    add = TV_WANTED - subscribed
                    rem = subscribed - TV_WANTED
                    for sym in sorted(add):
                        await send(ws, "quote_add_symbols", [qs, sym])
                        subscribed.add(sym)
                        LOG.info("TV quote add %s", sym)
                    for sym in sorted(rem):
                        try:
                            await send(ws, "quote_remove_symbols", [qs, sym])
                        except Exception:
                            pass
                        subscribed.discard(sym)
                        LOG.info("TV quote remove %s", sym)
                    await asyncio.sleep(0.35)

            sync_task = asyncio.create_task(sync_symbols())
            try:
                async for raw in ws:
                    if isinstance(raw, bytes):
                        try:
                            await ws.pong(raw)
                        except Exception:
                            pass
                        continue
                    for payload, data in iter_json_messages(raw):
                        if is_heartbeat(payload):
                            await reply_heartbeat(ws, payload)
                            continue
                        if not data or data.get("m") != "qsd":
                            continue
                        try:
                            body = data["p"][1]
                            tv_sym = str(body.get("n") or "")
                            vals = body.get("v") or {}
                            lp = vals.get("lp")
                            if lp is None:
                                # mid from bid/ask if lp missing
                                bid, ask = vals.get("bid"), vals.get("ask")
                                if bid is not None and ask is not None:
                                    lp = (float(bid) + float(ask)) / 2.0
                            if lp is None or not tv_sym:
                                continue
                            vol = float(vals.get("volume") or 0)
                            await broadcast_tv(tv_sym, float(lp), vol)
                        except Exception as exc:
                            LOG.debug("qsd parse: %s", exc)
            finally:
                sync_task.cancel()
                try:
                    await sync_task
                except asyncio.CancelledError:
                    pass
        except asyncio.CancelledError:
            raise
        except Exception:
            LOG.exception("TV quote feeder error")
        finally:
            if ws is not None:
                try:
                    await ws.close()
                except Exception:
                    pass
        LOG.info("TV quote feeder reconnecting in 2s")
        await asyncio.sleep(2.0)


async def ws_handler(request: web.Request) -> web.WebSocketResponse:
    ws = web.WebSocketResponse(heartbeat=20)
    await ws.prepare(request)
    subscribed: set[str] = set()
    try:
        async for msg in ws:
            if msg.type != aiohttp.WSMsgType.TEXT:
                continue
            try:
                payload = json.loads(msg.data)
            except Exception:
                continue
            if payload.get("op") != "subscribe":
                continue
            channel = normalize_channel(str(payload.get("channel") or ""))
            if not channel:
                continue
            async with LOCK:
                SUBS.setdefault(channel, set()).add(ws)
            subscribed.add(channel)
            await refresh_tv_wanted()
            # Immediately replay last known price if we have one.
            if channel in LAST:
                await ws.send_str(
                    json.dumps(
                        {
                            "type": "tick",
                            "channel": channel,
                            "price": LAST[channel],
                            "ts": int(time.time()),
                            "volume": 0,
                            "src": "cache",
                        },
                        separators=(",", ":"),
                    )
                )
            await ws.send_str(json.dumps({"type": "subscribed", "channel": channel}))
    finally:
        async with LOCK:
            for channel in subscribed:
                bucket = SUBS.get(channel)
                if not bucket:
                    continue
                bucket.discard(ws)
                if not bucket:
                    SUBS.pop(channel, None)
        await refresh_tv_wanted()
    return ws


async def health(_request: web.Request) -> web.Response:
    return web.json_response(
        {
            "status": "ok",
            "channels": {k: len(v) for k, v in SUBS.items()},
            "tv_wanted": sorted(TV_WANTED),
            "tv_enabled": TV_ENABLED,
            "last_tick_age_ms": {
                k: int(time.monotonic() * 1000 - LAST_TICK_MS[k]) for k in LAST_TICK_MS
            },
        }
    )


async def start_background(app: web.Application) -> None:
    headers = {"X-API-Key": API_KEY} if API_KEY else {}
    session = aiohttp.ClientSession(headers=headers)
    app["session"] = session
    app["tasks"] = [
        asyncio.create_task(tv_quote_feeder()),
        asyncio.create_task(poll_mongo()),
        asyncio.create_task(poll_crypto(session)),
        asyncio.create_task(poll_forex(session)),
    ]


async def cleanup(app: web.Application) -> None:
    for task in app.get("tasks", []):
        task.cancel()
    session = app.get("session")
    if session:
        await session.close()


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    app = web.Application()
    app.router.add_get("/market-ticks", ws_handler)
    app.router.add_get("/health", health)
    app.on_startup.append(start_background)
    app.on_cleanup.append(cleanup)
    LOG.info(
        "market-ticks on %s:%s tv=%s crypto_poll=%.2f forex_poll=%.2f mongo_poll=%.2f → %s",
        HOST,
        PORT,
        TV_ENABLED,
        CRYPTO_POLL,
        FOREX_POLL,
        MONGO_POLL,
        API_BASE,
    )
    web.run_app(app, host=HOST, port=PORT, print=None)


if __name__ == "__main__":
    main()
