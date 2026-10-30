#!/usr/bin/env python3
"""Low-latency market tick relay for Forge charts.

Primary: TradingView quote WebSocket (same feed TV Supercharts use) via
cp_fetcher's tvws helpers — pushes ticks as soon as TV emits `qsd`.

Fallbacks (in parallel):
  - Mongo `last.1` poll (cp_fetcher live candle writer)
  - Germany Market Price API HTTP (crypto ~0.25s, forex ~1s throttle)
  - Iran gold (آبشده / گرم ۱۸ / سکه) via Faraz @ 1s
    (Germany market-api `/gold/live/` proxies Faraz; VPS is CF-blocked from faraz.io)

Client protocol:
  -> {"op":"subscribe","channel":"crypto:btcusdt"}
  -> {"op":"subscribe","channel":"forex:xauusd:FXPRO"}
  -> {"op":"subscribe","channel":"iran:abshode"}
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
IRAN_POLL = float(os.environ.get("MARKET_TICKS_IRAN_POLL", "1.0"))
MONGO_URI = os.environ.get("MONGO_URI", "mongodb://127.0.0.1:27017/")
ANIL_GOLD_API = os.environ.get("ANIL_GOLD_API", "http://127.0.0.1:8000/api/v1").rstrip("/")
# Direct Faraz (often CF-blocked on Iran VPS). Prefer Germany market-api Faraz proxy.
FARAZ_BASE = os.environ.get("FARAZ_BASE_URL", "https://faraz.io").rstrip("/")
# Germany relay for Faraz trading-view chart-history + customer history.
FARAZ_HISTORY_PROXY = os.environ.get(
    "FARAZ_HISTORY_PROXY",
    "http://2.28.37.51:8091",
).rstrip("/")
# Cookie / token for Faraz customer trading-view history (deep countback).
FARAZ_COOKIE = os.environ.get("FARAZ_COOKIE", "").strip()
FARAZ_USER_ID = os.environ.get("FARAZ_USER_ID", "").strip()
FARAZ_TOKEN = os.environ.get("FARAZ_TOKEN", "").strip()
FARAZ_ADJUST_TYPE = int(os.environ.get("FARAZ_ADJUST_TYPE", "2"))
# Faraz client caps: <1m → 1000, else 10000.
FARAZ_COUNTBACK_MAX = int(os.environ.get("FARAZ_COUNTBACK_MAX", "10000"))
FARAZ_COUNTBACK_MAX_SUBMIN = int(os.environ.get("FARAZ_COUNTBACK_MAX_SUBMIN", "1000"))
# Only accept Faraz-sourced quotes for iran:* (never TGJU).
IRAN_FARAZ_ONLY = os.environ.get("MARKET_TICKS_IRAN_FARAZ_ONLY", "1") not in {"0", "false", "False"}
TV_ENABLED = os.environ.get("MARKET_TICKS_TV", "1") not in {"0", "false", "False"}
# If a channel got a TV/mongo tick within this window, skip Germany HTTP for it.
GERMANY_SKIP_IF_FRESH_MS = float(os.environ.get("MARKET_TICKS_GERMANY_SKIP_MS", "800"))
# Bootstrap Faraz customer/public history once per process, then append realtime.
IRAN_HISTORY_BOOTSTRAP = os.environ.get("MARKET_TICKS_IRAN_BOOTSTRAP", "1") not in {
    "0",
    "false",
    "False",
}

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
SOURCE_PRIORITY = {"tv": 40, "iran": 30, "mongo": 20, "germany": 10, "cache": 0}
SOURCE_HOLD_MS = {"tv": 1_200, "iran": 900, "mongo": 400, "germany": 250}

# Iran gold fields → market-ticks channels (Faraz only).
# Faraz `abshodeNaghdi` = آبشده نقدی 1 (نقدی تهران). نقدی 2 = abshodeNaghdiShanbei.
# G18 = geramTalaHejdah (گرم طلای ۱۸ عیار) — native Faraz symbol, not derived.
IRAN_FIELDS: dict[str, str] = {
    "mesghal_17": "iran:abshode",
    "price_18k_per_gram": "iran:g18",
    "price_24k_per_gram": "iran:g24",
    "coin_emami": "iran:sekke",
    "coin_half": "iran:nim",
    "coin_quarter": "iran:rob",
    "ounce_usd": "iran:ons",
}
IRAN_FIELD_BY_CHANNEL = {v: k for k, v in IRAN_FIELDS.items()}
# Native Faraz trading-view symbols (customer + public history).
IRAN_FARAZ_HISTORY_SYMBOL: dict[str, str] = {
    "iran:abshode": "abshodeNaghdi",
    "iran:g18": "geramTalaHejdah",
    "iran:g24": "tala24Estjt",
    "iran:sekke": "sekkeNewEstjt",
    "iran:nim": "nimSekkeEstjt",
    "iran:rob": "robSekkeEstjt",
    "iran:ons": "FOREXCOM_XAUUSD",
}
# Resolutions to bootstrap once from Faraz customer history (max countback).
IRAN_BOOTSTRAP_RESOLUTIONS = (
    "1",
    "5",
    "15",
    "30",
    "60",
    "240",
    "1D",
    "1W",
    "1M",
)
_IRAN_BOOTSTRAP_DONE: set[str] = set()
_FARAZ_CUSTOMER_AUTH_OK: bool | None = None
# Retry customer auth after this monotonic time (avoid permanent lockout on expired cookie).
_FARAZ_AUTH_RETRY_AT: float = 0.0
_FARAZ_AUTH_RETRY_SEC = float(os.environ.get("FARAZ_AUTH_RETRY_SEC", "300"))
# channel|resolution -> monotonic time of last live/tail merge into response path
_FARAZ_HISTORY_LIVE_AT: dict[str, float] = {}
# Aliases so clients can subscribe with friendlier names.
IRAN_ALIASES: dict[str, str] = {
    "iran:mesghal": "iran:abshode",
    "iran:mesghal17": "iran:abshode",
    "iran:abshodenaghdi": "iran:abshode",
    "iran:abshode1": "iran:abshode",
    "iran:abshodenaghdi1": "iran:abshode",
    "iran:gram18": "iran:g18",
    "iran:18k": "iran:g18",
    "iran:gram24": "iran:g24",
    "iran:24k": "iran:g24",
    "iran:emami": "iran:sekke",
    "iran:sekke_emami": "iran:sekke",
    "iran:half": "iran:nim",
    "iran:quarter": "iran:rob",
    "iran:ounce": "iran:ons",
}
# cp_fetcher-style history depths (bars) — raised for Faraz customer max-countback stores.
IRAN_HISTORY_DEPTH = {
    "seconds": 50_000,
    "1m": 50_000,
    "5m": 40_000,
    "default": 20_000,
}
_MONGO_CLIENT: Any = None


def mongo_client() -> Any:
    global _MONGO_CLIENT
    if _MONGO_CLIENT is not None:
        return _MONGO_CLIENT
    try:
        from pymongo import MongoClient
    except Exception:
        return None
    _MONGO_CLIENT = MongoClient(MONGO_URI, serverSelectionTimeoutMS=3000, maxPoolSize=8)
    return _MONGO_CLIENT

# channel prefix -> TradingView symbol (static seeds; dynamic forex:* also supported)
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
    # FXCM TV resolve is currently invalid — use FOREXCOM book for live ticks.
    "forex:xauusd:fxcm": "FOREXCOM:XAUUSD",
    "forex:xagusd": "FOREXCOM:XAGUSD",
    "forex:eurusd": "FOREXCOM:EURUSD",
    "forex:gbpusd": "FOREXCOM:GBPUSD",
    "forex:usdjpy": "FOREXCOM:USDJPY",
}

# Venues whose TV resolve is invalid → nearest live TV book.
TV_EXCHANGE_FALLBACK: dict[str, str] = {
    "FXCM": "FOREXCOM",
    "FXPRO": "FOREXCOM",
    "TVC": "FOREXCOM",
    "DJ": "FOREXCOM",
    "SP": "FOREXCOM",
    "NASDAQ": "FOREXCOM",
}

# Forge ticker → TradingView ticker on a given data exchange.
TV_TICKER_ALIAS: dict[str, dict[str, str]] = {
    "OANDA": {
        "NAS100": "NAS100USD",
        "US30": "US30USD",
        "US500": "SPX500USD",
        "SPX500": "SPX500USD",
        "GER40": "DE30EUR",
        "UK100": "UK100GBP",
        "JPN225": "JP225USD",
        "AUS200": "AU200AUD",
    },
    "FOREXCOM": {
        "US500": "SPX500",
        "SPX500": "SPX500",
    },
    "CAPITALCOM": {
        "SPX500": "US500",
    },
    # IG uses its own TV tickers (NASDAQ / DOW / …), not NAS100 / US30.
    "IG": {
        "NAS100": "NASDAQ",
        "US30": "DOW",
        "US500": "SPX500",
        "SPX500": "SPX500",
        "GER40": "DAX",
        "UK100": "FTSE",
        "JPN225": "NIKKEI",
        "AUS200": "ASX",
    },
    "PEPPERSTONE": {
        "SPX500": "US500",
        "US500": "US500",
    },
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
    if channel.startswith("forex:"):
        parts = channel.split(":")
        if len(parts) < 2 or not parts[1]:
            return None
        ticker = parts[1].lower()
        if len(parts) >= 3 and parts[2]:
            return f"forex:{ticker}:{parts[2].upper()}"
        return f"forex:{ticker}"
    if channel.startswith("crypto:"):
        return f"crypto:{channel.split(':', 1)[1].lower()}"
    if channel.startswith("iran:"):
        return IRAN_ALIASES.get(channel, channel if channel in IRAN_FIELD_BY_CHANNEL else None)
    return None


def resolve_tv_broker_symbol(exchange: str, ticker: str) -> str:
    """Map Forge exchange+ticker onto a resolvable TradingView EX:SYMBOL."""
    forge_ex = (exchange or "FOREXCOM").upper()
    forge_ticker = (ticker or "").upper()
    forge_alias = TV_TICKER_ALIAS.get(forge_ex, {}).get(forge_ticker)
    # Prefer native broker books when TV resolve works (IG:NAS100 → IG:NASDAQ).
    if forge_alias is not None and forge_ex not in TV_EXCHANGE_FALLBACK:
        return f"{forge_ex}:{forge_alias}"
    data_ex = TV_EXCHANGE_FALLBACK.get(forge_ex, forge_ex)
    alias = TV_TICKER_ALIAS.get(data_ex, {}).get(forge_ticker)
    if alias is None:
        alias = forge_alias if forge_alias is not None else forge_ticker
    return f"{data_ex}:{alias}"


def tv_symbol_for_channel(channel: str) -> str | None:
    key = channel.lower()
    if key in CHANNEL_TO_TV:
        return CHANNEL_TO_TV[key]
    if key.startswith("forex:"):
        parts = key.split(":")
        ticker = parts[1] if len(parts) >= 2 else ""
        ex = parts[2] if len(parts) >= 3 else "FOREXCOM"
        if not ticker:
            return None
        return resolve_tv_broker_symbol(ex, ticker)
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


async def broadcast(
    channel: str,
    price: float,
    ts: int,
    volume: float = 0.0,
    src: str = "",
    *,
    force: bool = False,
) -> None:
    now_ms = time.monotonic() * 1000
    prev = LAST.get(channel)
    same = prev is not None and abs(prev - price) < 1e-12
    if same and not force:
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
                    # CRITICAL: Mongo `bct` is bar CLOSE time (period end). Using it as a
                    # trade timestamp makes the chart open the *next* candle early and
                    # keeps countdown inventing bars. Always stamp "price now" with wall clock.
                    ts = int(time.time())
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


def _is_faraz_source(src: str) -> bool:
    s = (src or "").lower()
    return "faraz" in s


def _quote_from_anil_shape(data: dict[str, Any], default_src: str) -> tuple[dict[str, float], str] | None:
    g18 = float(data.get("price_18k_per_gram") or 0)
    if g18 <= 0:
        return None
    src = str(data.get("source") or default_src)
    if IRAN_FARAZ_ONLY and not _is_faraz_source(src):
        return None
    return (
        {
            "mesghal_17": float(data.get("mesghal_17") or data.get("mesghal") or 0),
            "price_18k_per_gram": g18,
            "price_24k_per_gram": float(data.get("price_24k_per_gram") or 0),
            "coin_emami": float(data.get("coin_emami") or 0),
            "coin_half": float(data.get("coin_half") or 0),
            "coin_quarter": float(data.get("coin_quarter") or 0),
            "ounce_usd": float(data.get("ounce_usd") or 0),
        },
        "faraz" if _is_faraz_source(src) else src,
    )


def _extract_faraz_price(entry: Any) -> float:
    if entry is None:
        return 0.0
    if isinstance(entry, (int, float)):
        return float(entry)
    if isinstance(entry, dict):
        for key in ("price", "close", "last", "value", "p"):
            if entry.get(key) is not None:
                try:
                    return float(entry[key])
                except (TypeError, ValueError):
                    continue
    return 0.0


def _quote_from_faraz_public_raw(raw: dict[str, Any]) -> tuple[dict[str, float], str] | None:
    """Map Faraz public get-data payload → iran quote. Prefer native geramTalaHejdah."""
    mesghal = _extract_faraz_price(raw.get("abshodeNaghdi"))
    # Native G18 first; never silently prefer mesghal-derived when native exists.
    g18_native = _extract_faraz_price(raw.get("geramTalaHejdah"))
    if g18_native <= 0:
        g18_native = _extract_faraz_price(raw.get("tala18Estjt"))
    g18 = g18_native
    g24 = _extract_faraz_price(raw.get("tala24Estjt"))
    derived = 0.0
    if mesghal > 0:
        derived = float(int(round((mesghal * 750 / 705) / 4.608)))
    # Fallback only if native G18 missing — keep abshode usable.
    if g18 <= 0 and derived > 0:
        g18 = derived
        LOG.warning("faraz G18 missing — using mesghal-derived %s", int(g18))
    elif g18 > 0 and derived > 0 and abs(g18 - derived) < 1.0:
        # Exact match usually means upstream derived; still accept (native may equal formula).
        pass
    if g24 <= 0 and g18 > 0:
        g24 = float(int(round(g18 * 999 / 750)))
    if mesghal <= 0 and g18 <= 0:
        return None
    ounce = _extract_faraz_price(raw.get("FOREXCOM_XAUUSD"))
    return (
        {
            "mesghal_17": float(int(round(mesghal))) if mesghal > 0 else 0.0,
            "price_18k_per_gram": float(int(round(g18))) if g18 > 0 else 0.0,
            "price_24k_per_gram": float(int(round(g24))) if g24 > 0 else 0.0,
            "coin_emami": float(int(round(_extract_faraz_price(raw.get("sekkeNewEstjt"))))),
            "coin_half": float(int(round(_extract_faraz_price(raw.get("nimSekkeEstjt"))))),
            "coin_quarter": float(int(round(_extract_faraz_price(raw.get("robSekkeEstjt"))))),
            "ounce_usd": float(ounce) if ounce else 0.0,
        },
        "faraz",
    )


async def fetch_iran_quote_faraz_direct(session: aiohttp.ClientSession) -> tuple[dict[str, float], str] | None:
    """Direct Faraz public market API — native symbols (geramTalaHejdah, abshodeNaghdi, …)."""
    symbols = [
        "abshodeNaghdi",
        "geramTalaHejdah",
        "tala24Estjt",
        "sekkeNewEstjt",
        "nimSekkeEstjt",
        "robSekkeEstjt",
        "FOREXCOM_XAUUSD",
    ]
    try:
        async with session.get(
            f"{FARAZ_BASE}/api/public/market/get-data",
            params={
                "symbolNames": json.dumps(symbols, separators=(",", ":")),
                "cache": "false",
            },
            timeout=aiohttp.ClientTimeout(total=2.5),
            headers={
                "Accept": "application/json, text/plain, */*",
                "Origin": FARAZ_BASE,
                "Referer": f"{FARAZ_BASE}/markets/gold-currency",
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                ),
            },
        ) as resp:
            if resp.status != 200:
                return None
            raw = await resp.json(content_type=None)
        if not isinstance(raw, dict):
            return None
        return _quote_from_faraz_public_raw(raw)
    except Exception as exc:
        LOG.debug("faraz direct: %s", exc)
        return None


async def fetch_iran_quote_faraz_relay(session: aiohttp.ClientSession) -> tuple[dict[str, float], str] | None:
    """Faraz public market via Germany faraz-history-proxy (Iran VPS is CF-blocked)."""
    symbols = [
        "abshodeNaghdi",
        "geramTalaHejdah",
        "tala24Estjt",
        "sekkeNewEstjt",
        "nimSekkeEstjt",
        "robSekkeEstjt",
        "FOREXCOM_XAUUSD",
    ]
    try:
        async with session.get(
            f"{FARAZ_HISTORY_PROXY}/faraz/public-market",
            params={
                "symbolNames": json.dumps(symbols, separators=(",", ":")),
                "cache": "false",
            },
            timeout=aiohttp.ClientTimeout(total=4.0),
        ) as resp:
            if resp.status != 200:
                return None
            raw = await resp.json(content_type=None)
        if not isinstance(raw, dict):
            return None
        return _quote_from_faraz_public_raw(raw)
    except Exception as exc:
        LOG.debug("faraz relay public-market: %s", exc)
        return None


# Written by an external Faraz bridge (e.g. cloud agent → scp) when Germany is down.
_FARAZ_BRIDGE_PATH = os.environ.get("FARAZ_BRIDGE_QUOTE_PATH", "/tmp/faraz_live_quote.json")
_FARAZ_BRIDGE_MAX_AGE_SEC = float(os.environ.get("FARAZ_BRIDGE_MAX_AGE_SEC", "8"))


def fetch_iran_quote_faraz_bridge_file() -> tuple[dict[str, float], str] | None:
    """Fresh Faraz quote dropped on disk by an external bridge (native geramTalaHejdah)."""
    try:
        st = os.stat(_FARAZ_BRIDGE_PATH)
        age = time.time() - st.st_mtime
        if age > _FARAZ_BRIDGE_MAX_AGE_SEC:
            return None
        with open(_FARAZ_BRIDGE_PATH, "r", encoding="utf-8") as fh:
            data = json.load(fh)
        if not isinstance(data, dict):
            return None
        # Accept either raw Faraz get-data shape or already-mapped quote fields.
        if "geramTalaHejdah" in data or "abshodeNaghdi" in data:
            return _quote_from_faraz_public_raw(data)
        mapped = _quote_from_anil_shape(data, "faraz")
        if mapped is None:
            return None
        quote, _src = mapped
        return quote, "faraz-bridge"
    except FileNotFoundError:
        return None
    except Exception as exc:
        LOG.debug("faraz bridge file: %s", exc)
        return None


async def fetch_iran_quote_faraz_proxy(session: aiohttp.ClientSession) -> tuple[dict[str, float], str] | None:
    """Faraz via Germany market-api `/gold/live/` (reachable from Iran VPS)."""
    try:
        async with session.get(
            f"{API_BASE}/gold/live/",
            timeout=aiohttp.ClientTimeout(total=3.0),
        ) as resp:
            if resp.status != 200:
                return None
            data = await resp.json(content_type=None)
        if not isinstance(data, dict):
            return None
        # Live endpoint should report source=faraz; reject anything else.
        return _quote_from_anil_shape(data, "faraz")
    except Exception as exc:
        LOG.debug("faraz proxy (market-api gold/live): %s", exc)
        return None


async def fetch_iran_quote_anil_faraz(session: aiohttp.ClientSession) -> tuple[dict[str, float], str] | None:
    """Anil cache only when it is still a Faraz quote."""
    try:
        async with session.get(
            f"{ANIL_GOLD_API}/gold-price/",
            params={"auto": "0"},
            timeout=aiohttp.ClientTimeout(total=1.5),
        ) as resp:
            if resp.status != 200:
                return None
            data = await resp.json(content_type=None)
        if not isinstance(data, dict):
            return None
        return _quote_from_anil_shape(data, "anil")
    except Exception as exc:
        LOG.debug("anil faraz cache: %s", exc)
        return None


async def fetch_iran_quote_mongo_faraz() -> tuple[dict[str, float], str] | None:
    """Latest Faraz row from anil_gold.price_history (ignore TGJU rows)."""
    client = mongo_client()
    if client is None:
        return None
    try:
        query: dict[str, Any] = {
            "price_18k_per_gram": {"$gt": 0},
            "source": {"$regex": "faraz", "$options": "i"},
        }
        doc = client["anil_gold"]["price_history"].find_one(query, sort=[("ts", -1)])
        if not doc:
            return None
        return _quote_from_anil_shape(doc, "faraz")
    except Exception as exc:
        LOG.debug("mongo faraz: %s", exc)
        return None


async def fetch_iran_quote(session: aiohttp.ClientSession) -> tuple[dict[str, float], str] | None:
    """Prefer native Faraz (geramTalaHejdah). Fall back only when Germany is down.

    Order: bridge file → Germany :8091 public-market → direct Faraz → market-api
    gold/live → Anil (any source, emergency) → Mongo Faraz (last resort).
    """
    bridge = fetch_iran_quote_faraz_bridge_file()
    if bridge:
        return bridge

    for fetcher in (
        lambda: fetch_iran_quote_faraz_relay(session),  # Germany :8091 → faraz.io public
        lambda: fetch_iran_quote_faraz_direct(session),  # direct faraz.io when unblocked
        lambda: fetch_iran_quote_faraz_proxy(session),  # market-api /gold/live (may be stale)
    ):
        quote_src = await fetcher()
        if quote_src:
            return quote_src

    # Emergency: Anil live prices beat a frozen Mongo Faraz row when Germany is offline.
    try:
        async with session.get(
            f"{ANIL_GOLD_API}/gold-price/",
            params={"auto": "0"},
            timeout=aiohttp.ClientTimeout(total=1.5),
        ) as resp:
            if resp.status == 200:
                data = await resp.json(content_type=None)
                if isinstance(data, dict):
                    g18 = float(data.get("price_18k_per_gram") or 0)
                    if g18 > 0:
                        quote = {
                            "mesghal_17": float(
                                data.get("mesghal_17") or data.get("mesghal") or 0
                            ),
                            "price_18k_per_gram": g18,
                            "price_24k_per_gram": float(data.get("price_24k_per_gram") or 0),
                            "coin_emami": float(data.get("coin_emami") or 0),
                            "coin_half": float(data.get("coin_half") or 0),
                            "coin_quarter": float(data.get("coin_quarter") or 0),
                            "ounce_usd": float(data.get("ounce_usd") or 0),
                        }
                        src = str(data.get("source") or "anil")
                        LOG.warning(
                            "iran quote emergency fallback to anil/%s g18=%s",
                            src,
                            int(g18),
                        )
                        return quote, f"anil:{src}"
    except Exception as exc:
        LOG.debug("anil emergency: %s", exc)

    return await fetch_iran_quote_mongo_faraz()


def persist_iran_tick_1s(quote: dict[str, float], src_name: str, ts: int) -> None:
    """Store 1s snapshots for chart history (separate from Anil's sparse price_history)."""
    client = mongo_client()
    if client is None:
        return
    try:
        from datetime import datetime, timezone

        client["anil_gold"]["tick_1s"].insert_one(
            {
                **{k: float(v) for k, v in quote.items() if float(v or 0) > 0},
                "source": src_name,
                "ts": datetime.fromtimestamp(ts, tz=timezone.utc),
                "ts_unix": ts,
            }
        )
    except Exception as exc:
        LOG.debug("iran tick_1s persist: %s", exc)


async def poll_iran_gold(session: aiohttp.ClientSession) -> None:
    """Push Iran gold ticks every IRAN_POLL seconds (Faraz only).

    Mirrors cp_fetcher realtime: continuous poll → persist → force WS ticks.
    Always updates LAST for every iran:* channel (cache replay on subscribe)
    and force-broadcasts to live subscribers so 1S forming bars never stall.
    """
    while True:
        try:
            quote_src = await fetch_iran_quote(session)
            if quote_src:
                quote, src_name = quote_src
                ts = int(time.time())
                src = f"iran:{src_name}"
                # Mongo writes off the event loop — append_realtime does many
                # upserts per tick and must not stall /iran-gold/history.
                await asyncio.to_thread(persist_iran_tick_1s, quote, src_name, ts)
                await asyncio.to_thread(append_realtime_ohlc, quote, src_name, ts)
                # Warm LAST + push to any live WS subscribers (cp_fetcher-style).
                for field, channel in IRAN_FIELDS.items():
                    price = float(quote.get(field) or 0)
                    if price <= 0:
                        continue
                    await broadcast(channel, price, ts, 0.0, src=src, force=True)
        except Exception as exc:
            LOG.debug("iran poll: %s", exc)
        await asyncio.sleep(IRAN_POLL)


def _parse_step_seconds(interval: str) -> int:
    raw = (interval or "1").strip().upper()
    if raw.endswith("S") and raw[:-1].isdigit():
        return max(1, int(raw[:-1] or 1))
    if raw.endswith("D") and (not raw[:-1] or raw[:-1].isdigit()):
        return max(1, int(raw[:-1] or 1)) * 86_400
    if raw.endswith("W") and (not raw[:-1] or raw[:-1].isdigit()):
        return max(1, int(raw[:-1] or 1)) * 604_800
    # Month (TradingView `1M`) — approx 30d. Must be before bare-digit minutes.
    if raw.endswith("M") and (not raw[:-1] or raw[:-1].isdigit()) and not raw.endswith("SM"):
        return max(1, int(raw[:-1] or 1)) * 30 * 86_400
    if raw.isdigit():
        return max(1, int(raw)) * 60
    return 60


# Faraz 1h/4h (and other hour-based intraday) bars are aligned to Asia/Tehran
# local clock (UTC+03:30), not UTC epoch boundaries. UTC flooring shifts every
# bar by 30 minutes and lets ohlc_1h/tick overlays smash Faraz OHLC.
IRAN_TZ_OFFSET_SEC = 3 * 3600 + 1800


def _align_iran_bar_time(ts: int, step: int) -> int:
    """Bucket start for Iran gold — Tehran grid for hour+ intraday, else UTC."""
    ts_i = int(ts)
    step_i = int(step)
    if step_i <= 0:
        return ts_i
    if 3600 <= step_i < 86_400:
        shifted = ts_i + IRAN_TZ_OFFSET_SEC
        return (shifted - (shifted % step_i)) - IRAN_TZ_OFFSET_SEC
    return ts_i - (ts_i % step_i)


def _iran_history_limit(step: int, requested: int) -> int:
    if step < 60:
        cap = IRAN_HISTORY_DEPTH["seconds"]
    elif step == 60:
        cap = IRAN_HISTORY_DEPTH["1m"]
    elif step == 300:
        cap = IRAN_HISTORY_DEPTH["5m"]
    else:
        cap = IRAN_HISTORY_DEPTH["default"]
    return min(cap, max(1, requested))


def _faraz_resolution_for_step(step: int) -> str | None:
    """Best stored / Faraz resolution for a chart step.

    Sub-minute (10S–45S) are our live tick folds into faraz_ohlc (Faraz customer
    history has no sub-minute); 1m+ can also pull Faraz customer/chart history.
    """
    if step >= 30 * 86_400:
        return "1M"
    if step >= 7 * 86_400:
        return "1W"
    if step >= 86_400:
        return "1D"
    if step >= 14_400:
        return "240"
    if step >= 3600:
        return "60"
    if step >= 1800:
        return "30"
    if step >= 900:
        return "15"
    if step >= 300:
        return "5"
    if step >= 60:
        return "1"
    # Persist/serve live sub-minute buckets (1S → 45S) from tick folds.
    if step >= 45:
        return "45S"
    if step >= 30:
        return "30S"
    if step >= 15:
        return "15S"
    if step >= 10:
        return "10S"
    if step >= 5:
        return "5S"
    if step >= 1:
        return "1S"
    return None


def _faraz_countback_cap(resolution: str) -> int:
    """Match Faraz SPA: sub-minute → 1000, else 10000."""
    raw = (resolution or "").strip()
    if raw.endswith("S") and raw[:-1].isdigit():
        return FARAZ_COUNTBACK_MAX_SUBMIN
    return FARAZ_COUNTBACK_MAX


def _faraz_auth_headers(faraz_sym: str = "") -> dict[str, str]:
    headers = {
        "Accept": "application/json, text/plain, */*",
        "Origin": FARAZ_BASE,
        "Referer": (
            f"{FARAZ_BASE}/dashboard?s={faraz_sym}" if faraz_sym else f"{FARAZ_BASE}/dashboard"
        ),
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        ),
    }
    if FARAZ_COOKIE:
        headers["Cookie"] = FARAZ_COOKIE
    if FARAZ_USER_ID:
        headers["UserId"] = FARAZ_USER_ID
    if FARAZ_TOKEN:
        headers["Authorization"] = f"Bearer {FARAZ_TOKEN}"
        headers["X-Auth-Token"] = FARAZ_TOKEN
    return headers


def _bars_from_tv_columns(entry: dict[str, Any]) -> list[dict[str, float]]:
    """Parse Faraz column OHLC (`t/o/h/l/c/v`) — times may be sec or ms."""
    ts_list = entry.get("t") or []
    o_list = entry.get("o") or []
    h_list = entry.get("h") or []
    l_list = entry.get("l") or []
    c_list = entry.get("c") or []
    v_list = entry.get("v") or []
    out: list[dict[str, float]] = []
    for i, t_raw in enumerate(ts_list):
        try:
            t = int(t_raw)
            if t > 1e12:
                t //= 1000
            o = float(o_list[i])
            h = float(h_list[i])
            l = float(l_list[i])
            c = float(c_list[i])
            v = float(v_list[i]) if i < len(v_list) else 0.0
        except (IndexError, TypeError, ValueError):
            continue
        if c <= 0:
            continue
        out.append({"t": t, "o": o, "h": h, "l": l, "c": c, "v": v})
    return out


def _bars_from_candle_list(rows: list[Any]) -> list[dict[str, float]]:
    out: list[dict[str, float]] = []
    for row in rows:
        try:
            if isinstance(row, dict):
                t = int(row.get("time") or row.get("t") or 0)
                if t > 1e12:
                    t //= 1000
                o = float(row.get("open") if row.get("open") is not None else row.get("o"))
                h = float(row.get("high") if row.get("high") is not None else row.get("h"))
                l = float(row.get("low") if row.get("low") is not None else row.get("l"))
                c = float(row.get("close") if row.get("close") is not None else row.get("c"))
                v = float(row.get("volume") if row.get("volume") is not None else row.get("v") or 0)
            elif isinstance(row, (list, tuple)) and len(row) >= 5:
                t = int(row[0])
                if t > 1e12:
                    t //= 1000
                o, h, l, c = float(row[1]), float(row[2]), float(row[3]), float(row[4])
                v = float(row[5]) if len(row) > 5 else 0.0
            else:
                continue
        except (TypeError, ValueError):
            continue
        if t <= 0 or c <= 0:
            continue
        out.append({"t": t, "o": o, "h": h, "l": l, "c": c, "v": v})
    return out


def _parse_faraz_history_payload(
    data: Any,
    faraz_sym: str,
    channel: str = "",
) -> list[dict[str, float]]:
    """Accept public chart-history dict, customer `{result:…}`, or candle list."""
    del channel  # native symbols — no price-scale transform
    if isinstance(data, list):
        return _bars_from_candle_list(data)
    if not isinstance(data, dict):
        return []
    if data.get("detail") or data.get("success") is False:
        return []
    result = data.get("result")
    if isinstance(result, dict) and (result.get("t") is not None):
        return _bars_from_tv_columns(result)
    if isinstance(result, list):
        return _bars_from_candle_list(result)
    entry = data.get(faraz_sym)
    if isinstance(entry, dict) and (entry.get("t") is not None):
        return _bars_from_tv_columns(entry)
    if isinstance(data.get("t"), list):
        return _bars_from_tv_columns(data)
    return []


def _ohlc_coll_for_resolution(resolution: str) -> str | None:
    raw = (resolution or "").strip()
    if raw == "1":
        return "ohlc_1m"
    if raw == "60":
        return "ohlc_1h"
    if raw.upper() in {"1D", "D"}:
        return "ohlc_1d"
    return None


def _plausible_intraday_bars(
    bars: list[dict[str, float]],
    step: int,
) -> list[dict[str, float]]:
    """Drop Faraz rows that are clearly the wrong timeframe.

    When customer auth is 401, Faraz public TV history often returns *daily*
    bars regardless of `resolution=1`. Persisting those as 1m creates
    multi-hour holes on the chart (one bar per midnight).
    """
    if not bars or step <= 0:
        return bars
    if step >= 86_400:
        return bars
    # Expected spacing ≈ step; reject series whose median gap is >> step.
    ordered = sorted(bars, key=lambda b: int(b["t"]))
    if len(ordered) < 3:
        # Single/dual bars: keep only if on a sensible grid for this step.
        out: list[dict[str, float]] = []
        for b in ordered:
            t = int(b["t"])
            if step < 3600 and t % 86_400 == 0:
                continue
            out.append(b)
        return out
    gaps = [int(ordered[i]["t"]) - int(ordered[i - 1]["t"]) for i in range(1, len(ordered))]
    gaps_pos = sorted(g for g in gaps if g > 0)
    if not gaps_pos:
        return []
    med = gaps_pos[len(gaps_pos) // 2]
    # Daily (or hourly) junk served as 1m/5m/…
    if med >= max(step * 8, 3_600):
        LOG.warning(
            "reject Faraz bars: median gap %ss for step %ss (likely wrong TF)",
            med,
            step,
        )
        return []
    # Keep bars whose gap to previous is within a generous band of `step`.
    kept: list[dict[str, float]] = [ordered[0]]
    for i in range(1, len(ordered)):
        g = int(ordered[i]["t"]) - int(ordered[i - 1]["t"])
        if g <= 0:
            continue
        if g > max(step * 12, 3_600):
            # Allow a session break but drop isolated day stamps inside 1m series.
            if step <= 900 and int(ordered[i]["t"]) % 86_400 == 0 and g >= 86_400:
                continue
        kept.append(ordered[i])
    return kept


def persist_faraz_bars(
    channel: str,
    resolution: str,
    bars: list[dict[str, float]],
    *,
    src: str = "faraz",
) -> int:
    """Upsert Faraz OHLC into Mongo (once-per-symbol history base)."""
    if not bars:
        return 0
    step = _parse_step_seconds(resolution)
    bars = _plausible_intraday_bars(bars, step)
    if not bars:
        return 0
    client = mongo_client()
    if client is None:
        return 0
    try:
        from datetime import datetime, timezone

        from pymongo import UpdateOne

        faraz_sym = IRAN_FARAZ_HISTORY_SYMBOL.get(channel, "")
        field = IRAN_FIELD_BY_CHANNEL.get(channel, "")
        now = datetime.now(tz=timezone.utc)
        # Canonical deep store — every resolution.
        base = client["anil_gold"]["faraz_ohlc"]
        base_ops: list[UpdateOne] = []
        parent_ops: list[UpdateOne] = []
        parent = _ohlc_coll_for_resolution(resolution)
        for bar in bars:
            t = int(bar["t"])
            payload = {
                "channel": channel,
                "faraz_symbol": faraz_sym,
                "field": field,
                "resolution": resolution,
                "t": t,
                "o": float(bar["o"]),
                "h": float(bar["h"]),
                "l": float(bar["l"]),
                "c": float(bar["c"]),
                "v": float(bar.get("v") or 0),
                "src": src,
                "updated_at": now,
            }
            base_ops.append(
                UpdateOne(
                    {"channel": channel, "resolution": resolution, "t": t},
                    {"$set": payload},
                    upsert=True,
                )
            )
            if parent:
                parent_ops.append(
                    UpdateOne(
                        {"channel": channel, "t": t},
                        {
                            "$set": {
                                "channel": channel,
                                "field": field,
                                "t": t,
                                "o": payload["o"],
                                "h": payload["h"],
                                "l": payload["l"],
                                "c": payload["c"],
                                "v": payload["v"],
                                "src": src,
                                "updated_at": now,
                            }
                        },
                        upsert=True,
                    )
                )
        batch = 1000
        for i in range(0, len(base_ops), batch):
            base.bulk_write(base_ops[i : i + batch], ordered=False)
        base.create_index(
            [("channel", 1), ("resolution", 1), ("t", -1)],
            background=True,
        )
        if parent and parent_ops:
            coll = client["anil_gold"][parent]
            for i in range(0, len(parent_ops), batch):
                coll.bulk_write(parent_ops[i : i + batch], ordered=False)
            coll.create_index([("channel", 1), ("t", -1)], background=True)
        return len(base_ops)
    except Exception as exc:
        LOG.warning("persist faraz bars %s %s: %s", channel, resolution, exc)
        return 0


# Resolutions updated on every live Faraz tick (keeps faraz_ohlc from going stale).
# Persist 1S/5S/10S→… so lower TFs + Bar Replay can densify from real folds
# (Faraz customer history has no sub-minute archive).
_IRAN_LIVE_RES_STEPS: tuple[tuple[str, int], ...] = (
    ("1S", 1),
    ("5S", 5),
    ("10S", 10),
    ("15S", 15),
    ("30S", 30),
    ("45S", 45),
    ("1", 60),
    ("5", 300),
    ("15", 900),
    ("30", 1_800),
    ("60", 3600),
    ("240", 14_400),
)


def append_realtime_ohlc(quote: dict[str, float], src_name: str, ts: int) -> None:
    """Fold each live Faraz tick into forming candles + faraz_ohlc (all live TFs)."""
    client = mongo_client()
    if client is None:
        return
    try:
        from datetime import datetime, timezone

        now = datetime.now(tz=timezone.utc)
        now_ts = int(time.time())
        for field, channel in IRAN_FIELDS.items():
            price = float(quote.get(field) or 0)
            if price <= 0:
                continue
            faraz_sym = IRAN_FARAZ_HISTORY_SYMBOL.get(channel, "")
            # Parent cp-style collections — only the forming bucket (never rewrite closed bars).
            # Always use wall-clock bucket: Faraz poll timestamps often lag 1–2s and
            # skipping those left permanent holes vs Faraz’s continuous series.
            for step, coll_name in ((60, "ohlc_1m"), (3600, "ohlc_1h"), (86_400, "ohlc_1d")):
                wall_t = _align_iran_bar_time(now_ts, step)
                t0 = wall_t
                coll = client["anil_gold"][coll_name]
                # Do not $setOnInsert h/l/v while also using $max/$min/$inc on the
                # same paths — Mongo rejects that conflict and aborted the whole
                # append (so 10S/1S faraz_ohlc never got written).
                coll.update_one(
                    {"channel": channel, "t": t0},
                    {
                        "$set": {
                            "channel": channel,
                            "field": field,
                            "t": t0,
                            "c": price,
                            "src": src_name,
                            "updated_at": now,
                        },
                        "$setOnInsert": {
                            "o": price,
                        },
                        "$max": {"h": price},
                        "$min": {"l": price},
                        "$inc": {"v": 1},
                    },
                    upsert=True,
                )
            # Canonical Faraz store — forming bucket only. Closed minutes are owned by
            # Faraz customer history (tail/live refresh); ticks must not reshape them.
            # Tag tick folds as faraz-tick so history can prefer real Faraz OHLC.
            tick_src = "faraz-tick"
            base = client["anil_gold"]["faraz_ohlc"]
            for resolution, step in _IRAN_LIVE_RES_STEPS:
                wall_t = _align_iran_bar_time(now_ts, step)
                t0 = wall_t
                # Single upsert — avoid find_one+update (was stalling the event loop).
                # Preserve Faraz customer/bootstrap/tail/live src via pipeline.
                base.update_one(
                    {"channel": channel, "resolution": resolution, "t": t0},
                    [
                        {
                            "$set": {
                                "channel": channel,
                                "faraz_symbol": faraz_sym,
                                "field": field,
                                "resolution": resolution,
                                "t": t0,
                                "o": {"$ifNull": ["$o", price]},
                                "h": {"$max": [{"$ifNull": ["$h", price]}, price]},
                                "l": {"$min": [{"$ifNull": ["$l", price]}, price]},
                                "c": price,
                                "v": {"$add": [{"$ifNull": ["$v", 0]}, 1]},
                                "updated_at": now,
                                "src": {
                                    "$cond": [
                                        {
                                            "$in": [
                                                {"$ifNull": ["$src", ""]},
                                                [
                                                    "faraz-bootstrap",
                                                    "faraz-tail",
                                                    "faraz-customer",
                                                    "faraz-live",
                                                ],
                                            ]
                                        },
                                        "$src",
                                        tick_src,
                                    ]
                                },
                            }
                        }
                    ],
                    upsert=True,
                )
    except Exception as exc:
        # Must be visible — silent failure here means 10S/1S never persist.
        LOG.warning("append realtime ohlc: %s", exc)


async def fetch_faraz_customer_history(
    session: aiohttp.ClientSession,
    channel: str,
    resolution: str,
    *,
    countback: int | None = None,
    to_ts: int | None = None,
    from_ts: int | None = None,
    first: bool = True,
) -> list[dict[str, float]]:
    """Faraz `/api/customer/trading-view/history` with max countback (via Germany proxy)."""
    global _FARAZ_CUSTOMER_AUTH_OK, _FARAZ_AUTH_RETRY_AT
    if _FARAZ_CUSTOMER_AUTH_OK is False:
        if time.monotonic() < _FARAZ_AUTH_RETRY_AT:
            return []
        # Cookie may have been refreshed — allow another attempt.
        _FARAZ_CUSTOMER_AUTH_OK = None
    faraz_sym = IRAN_FARAZ_HISTORY_SYMBOL.get(channel)
    if not faraz_sym:
        return []
    now = int(time.time())
    to_val = int(to_ts if to_ts is not None else now + 86_400)
    # Wide window; Faraz uses countback as the real limiter.
    from_val = int(from_ts if from_ts is not None else max(0, to_val - 20 * 365 * 86_400))
    cap = _faraz_countback_cap(resolution)
    cb = min(cap, max(1, int(countback if countback is not None else cap)))
    params = {
        "symbolName": faraz_sym,
        "symbol": faraz_sym,
        "resolution": resolution,
        "from": str(from_val),
        "to": str(to_val),
        "countback": str(cb),
        "firstDataRequest": "true" if first else "false",
        "latest": "false",
        "adjustType": str(FARAZ_ADJUST_TYPE),
        "json": "true",
    }
    headers = _faraz_auth_headers(faraz_sym)
    urls = [
        f"{FARAZ_HISTORY_PROXY}/faraz/tv-history",
        f"{FARAZ_BASE}/api/customer/trading-view/history",
    ]
    saw_auth_error = False
    for url in urls:
        try:
            async with session.get(
                url,
                params=params,
                timeout=aiohttp.ClientTimeout(total=60),
                headers=headers,
            ) as resp:
                if resp.status in (401, 403):
                    saw_auth_error = True
                    LOG.debug(
                        "faraz customer history %s %s via %s → %s",
                        channel,
                        resolution,
                        url,
                        resp.status,
                    )
                    continue
                if resp.status != 200:
                    LOG.debug(
                        "faraz customer history %s %s via %s → %s",
                        channel,
                        resolution,
                        url,
                        resp.status,
                    )
                    continue
                data = await resp.json(content_type=None)
            if isinstance(data, dict) and data.get("success") is False:
                saw_auth_error = True
                continue
            bars = _parse_faraz_history_payload(data, faraz_sym, channel)
            if bars:
                _FARAZ_CUSTOMER_AUTH_OK = True
                return bars
        except Exception as exc:
            LOG.debug("faraz customer history %s %s via %s: %s", channel, resolution, url, exc)
    if saw_auth_error and _FARAZ_CUSTOMER_AUTH_OK is not True:
        _FARAZ_CUSTOMER_AUTH_OK = False
        _FARAZ_AUTH_RETRY_AT = time.monotonic() + _FARAZ_AUTH_RETRY_SEC
        LOG.warning(
            "faraz customer history unauthorized — set FARAZ_COOKIE (or FARAZ_TOKEN) "
            "on Germany faraz-history-proxy / market-ticks for deep countback "
            "(retry in %.0fs)",
            _FARAZ_AUTH_RETRY_SEC,
        )
    return []


def _faraz_step_seconds(resolution: str) -> int:
    raw = (resolution or "").strip()
    if raw.endswith("S") and raw[:-1].isdigit():
        return max(1, int(raw[:-1] or 1))
    if raw.upper() in {"1D", "D"}:
        return 86_400
    if raw.upper() in {"1W", "W"}:
        return 604_800
    if raw.upper() == "1M":
        return 30 * 86_400
    if raw.isdigit():
        return max(1, int(raw)) * 60
    return 60


async def fetch_faraz_customer_history_all(
    session: aiohttp.ClientSession,
    channel: str,
    resolution: str,
    *,
    max_pages: int = 8,
) -> list[dict[str, float]]:
    """Page customer history backward with max countback until Faraz has no more."""
    if _FARAZ_CUSTOMER_AUTH_OK is False:
        return []
    cap = _faraz_countback_cap(resolution)
    step = _faraz_step_seconds(resolution)
    merged: dict[int, dict[str, float]] = {}
    to_ts = int(time.time()) + step
    first = True
    for _ in range(max(1, max_pages)):
        from_ts = max(0, to_ts - step * cap - step)
        batch = await fetch_faraz_customer_history(
            session,
            channel,
            resolution,
            countback=cap,
            to_ts=to_ts,
            from_ts=from_ts,
            first=first,
        )
        first = False
        if not batch:
            break
        for bar in batch:
            merged[int(bar["t"])] = bar
        earliest = min(int(b["t"]) for b in batch)
        if len(batch) < max(2, cap // 20):
            break
        new_to = earliest - 1
        if new_to >= to_ts:
            break
        to_ts = new_to
    return [merged[t] for t in sorted(merged)]


async def fetch_faraz_public_tv_history(
    session: aiohttp.ClientSession,
    channel: str,
    resolution: str,
    *,
    countback: int = 500,
) -> list[dict[str, float]]:
    """Faraz public `/api/public/trading-view/history` via Germany proxy (no cookie).

    Note: Faraz often returns daily-spaced bars even for minute resolutions — callers
    should only use this as a fallback when customer auth is unavailable.
    """
    faraz_sym = IRAN_FARAZ_HISTORY_SYMBOL.get(channel)
    if not faraz_sym:
        return []
    now = int(time.time())
    params = {
        "symbolName": faraz_sym,
        "symbol": faraz_sym,
        "resolution": resolution,
        "from": str(max(0, now - 20 * 365 * 86_400)),
        "to": str(now + 86_400),
        "countback": str(min(2_000, max(1, countback))),
        "firstDataRequest": "true",
        "latest": "false",
        "adjustType": str(FARAZ_ADJUST_TYPE),
        "json": "true",
    }
    headers = {
        "Accept": "application/json, text/plain, */*",
        "Origin": FARAZ_BASE,
        "Referer": f"{FARAZ_BASE}/markets/gold-currency",
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        ),
    }
    urls = [
        f"{FARAZ_HISTORY_PROXY}/faraz/public-history",
        f"{FARAZ_BASE}/api/public/trading-view/history",
    ]
    for url in urls:
        try:
            async with session.get(
                url,
                params=params,
                timeout=aiohttp.ClientTimeout(total=30),
                headers=headers,
            ) as resp:
                if resp.status != 200:
                    continue
                data = await resp.json(content_type=None)
            bars = _parse_faraz_history_payload(data, faraz_sym, channel)
            if bars:
                return bars
        except Exception as exc:
            LOG.debug("faraz public tv history %s %s via %s: %s", channel, resolution, url, exc)
    return []


def purge_flat_tick_ohlc() -> int:
    """Remove closed tick-fold bars + daily-as-1m junk that hide real Faraz OHLC.

    Closed `faraz-tick` rows on minute+ TFs leave holes vs Faraz customer candles.
    Sub-minute (1S–45S) tick folds are the only durable history for those TFs and
    for bar replay — never delete them. Also delete resolution=1/5/… bars that sit
    on midnight UTC with day spacing (expired cookie → public TV returned 1D).
    """
    client = mongo_client()
    if client is None:
        return 0
    try:
        base = client["anil_gold"]["faraz_ohlc"]
        now_ts = int(time.time())
        removed = 0
        for resolution, step in _IRAN_LIVE_RES_STEPS:
            # Keep all closed sub-minute faraz-tick/faraz bars (10S history + replay).
            if step < 60:
                continue
            wall_t = _align_iran_bar_time(now_ts, step)
            for channel in IRAN_FARAZ_HISTORY_SYMBOL:
                res = base.delete_many(
                    {
                        "channel": channel,
                        "resolution": resolution,
                        "t": {"$lt": wall_t},
                        "src": {"$in": ["faraz", "faraz-tick"]},
                    }
                )
                removed += int(res.deleted_count or 0)
                # Drop faraz-live rows that are daily stamps stored as intraday
                # (expired cookie → public TV returned 1D under resolution=1).
                if step < 86_400:
                    live = list(
                        base.find(
                            {
                                "channel": channel,
                                "resolution": resolution,
                                "src": "faraz-live",
                            },
                            {"t": 1},
                        )
                        .sort("t", -1)
                        .limit(40)
                    )
                    if len(live) >= 3:
                        ts = sorted(int(d["t"]) for d in live)
                        gaps = [ts[i] - ts[i - 1] for i in range(1, len(ts))]
                        med = sorted(gaps)[len(gaps) // 2] if gaps else 0
                        if med >= max(3_600, step * 8):
                            r2 = base.delete_many(
                                {
                                    "channel": channel,
                                    "resolution": resolution,
                                    "src": "faraz-live",
                                }
                            )
                            removed += int(r2.deleted_count or 0)
        if removed:
            LOG.warning("purged %s polluted faraz_ohlc bars", removed)
        return removed
    except Exception as exc:
        LOG.warning("purge flat tick ohlc: %s", exc)
        return 0


def _price_along_ohlc_path(o: float, h: float, l: float, c: float, t01: float) -> float:
    """Classic O→extreme→extreme→C path (same shape as frontend ohlc-path)."""
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


def _expand_coarser_bar_to_step(
    parent: dict[str, float],
    parent_step: int,
    child_step: int,
) -> list[dict[str, float]]:
    """Expand one coarser OHLC bar into `parent_step/child_step` child bars.

    Used when Faraz 1m is missing for a range (e.g. Apr 2026) but 5m exists.
    """
    if child_step <= 0 or parent_step < child_step or parent_step % child_step != 0:
        return [
            {
                "t": int(parent["t"]),
                "o": float(parent["o"]),
                "h": float(parent["h"]),
                "l": float(parent["l"]),
                "c": float(parent["c"]),
                "v": float(parent.get("v") or 0),
            }
        ]
    n = parent_step // child_step
    o = float(parent["o"])
    h = float(parent["h"])
    l = float(parent["l"])
    c = float(parent["c"])
    v_each = float(parent.get("v") or 0) / n
    t_base = int(parent["t"])
    out: list[dict[str, float]] = []
    prev = o
    bullish = c >= o
    for i in range(n):
        t_end = (i + 1) / n
        px = _price_along_ohlc_path(o, h, l, c, t_end)
        # denser samples inside the slice for H/L
        samples = [prev, px]
        for k in (1, 2, 3):
            samples.append(_price_along_ohlc_path(o, h, l, c, (i + k / 4) / n))
        # Lock parent extremes into the slice that owns them on the path.
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
        out.append(
            {
                "t": t_base + i * child_step,
                "o": prev,
                "h": hi,
                "l": lo,
                "c": px,
                "v": v_each,
            }
        )
        prev = px
    return out


def _fill_iran_from_coarser_faraz(
    client: Any,
    channel: str,
    buckets: dict[int, dict[str, float]],
    step: int,
    *,
    limit: int,
    before: int | None,
    wall_t: int,
) -> int:
    """Fill missing intraday buckets from the next coarser Faraz resolution.

    G18 1m only starts ~Jun 2026 in Mongo; Apr 2026 has dense 5m — expand those
    so scrolling back to April is not an empty hole.
    """
    if client is None or step < 60 or step >= 86_400:
        return 0
    # Prefer the next coarser stored Faraz TF.
    coarser: tuple[str, int] | None = None
    if step == 60:
        coarser = ("5", 300)
    elif step == 300:
        coarser = ("15", 900)
    elif step == 900:
        coarser = ("60", 3600)
    elif step == 1_800:
        coarser = ("60", 3600)
    elif step == 3600:
        coarser = ("240", 14_400)
    if coarser is None:
        return 0
    parent_res, parent_step = coarser
    if parent_step % step != 0:
        return 0

    # Window to cover: either around existing holes, or the full requested page
    # when native bars are scarce.
    if before is not None:
        end_t = before
    else:
        end_t = wall_t + step
    start_t = end_t - max(limit, 500) * step
    if buckets:
        ordered = sorted(t for t in buckets if t < end_t)
        if ordered:
            # Extend back through any leading hole before the first native bar.
            start_t = min(start_t, ordered[0] - max(limit // 2, 100) * step)
            # And cover trailing hole up to wall.
            if ordered[-1] < wall_t:
                start_t = min(start_t, ordered[-1])

    fq: dict[str, Any] = {
        "channel": channel,
        "resolution": parent_res,
        "c": {"$gt": 0},
        "t": {"$gte": start_t - parent_step, "$lt": end_t},
    }
    parents = list(
        client["anil_gold"]["faraz_ohlc"]
        .find(fq, {"t": 1, "o": 1, "h": 1, "l": 1, "c": 1, "v": 1, "src": 1})
        .sort("t", 1)
        .limit(min(max(limit * (parent_step // step) // 2, 2_000), 20_000))
    )
    if not parents:
        return 0
    # Reject wrong-TF parents (daily junk stored as 5m etc.).
    parent_bars = _plausible_intraday_bars(
        [
            {
                "t": int(d["t"]),
                "o": float(d["o"]),
                "h": float(d["h"]),
                "l": float(d["l"]),
                "c": float(d["c"]),
                "v": float(d.get("v") or 0),
            }
            for d in parents
        ],
        parent_step,
    )
    filled = 0
    for parent in parent_bars:
        # Skip closed tick-fold parents.
        # (src already stripped above when missing)
        for child in _expand_coarser_bar_to_step(parent, parent_step, step):
            t0 = int(child["t"])
            if t0 >= end_t or t0 > wall_t:
                continue
            if t0 < start_t:
                continue
            if t0 in buckets:
                continue
            buckets[t0] = child
            filled += 1
    return filled


def _fill_iran_session_gaps(
    buckets: dict[int, dict[str, float]],
    step: int,
    *,
    wall_t: int,
    max_gap_steps: int = 45,
) -> int:
    """Insert carry-forward bars so intraday Iran charts stay continuous like Faraz.

    Fills holes smaller than `max_gap_steps` up to (but not past) the forming bucket.
    Overnight / multi-hour breaks are left alone.
    """
    if step <= 0 or len(buckets) < 1:
        return 0
    ordered = sorted(t for t in buckets if t <= wall_t)
    if not ordered:
        return 0
    filled = 0
    max_gap = max(1, int(max_gap_steps)) * step
    for i in range(1, len(ordered)):
        prev_t = ordered[i - 1]
        next_t = ordered[i]
        gap = next_t - prev_t
        if gap <= step or gap > max_gap:
            continue
        prev = buckets[prev_t]
        px = float(prev["c"])
        t = prev_t + step
        while t < next_t:
            if t not in buckets:
                buckets[t] = {"t": t, "o": px, "h": px, "l": px, "c": px, "v": 0}
                filled += 1
            t += step
    # Extend to the forming wall bucket when the tip is only a few steps behind.
    tip = max(ordered)
    if 0 < wall_t - tip <= max_gap and tip < wall_t:
        px = float(buckets[tip]["c"])
        t = tip + step
        while t <= wall_t:
            if t not in buckets:
                buckets[t] = {"t": t, "o": px, "h": px, "l": px, "c": px, "v": 0}
                filled += 1
            t += step
    return filled


def _clamp_iran_tick_wicks(bar: dict[str, float], max_range: float) -> dict[str, float]:
    """Keep open/close; shrink wild tick H/L toward a Faraz-like envelope."""
    o = float(bar["o"])
    c = float(bar["c"])
    h = float(bar["h"])
    l = float(bar["l"])
    body_hi = max(o, c)
    body_lo = min(o, c)
    # Always keep the body; allow at most max_range total span.
    span = max(float(max_range), abs(c - o), 1e-6)
    mid = (body_hi + body_lo) / 2.0
    half = span / 2.0
    h2 = min(h, max(body_hi, mid + half))
    l2 = max(l, min(body_lo, mid - half))
    if h2 < body_hi:
        h2 = body_hi
    if l2 > body_lo:
        l2 = body_lo
    return {
        "t": int(bar["t"]),
        "o": o,
        "h": h2,
        "l": l2,
        "c": c,
        "v": float(bar.get("v") or 0),
    }


async def fetch_faraz_chart_history(
    session: aiohttp.ClientSession,
    channel: str,
    resolution: str,
) -> list[dict[str, float]]:
    """OHLC from Faraz — prefer customer history (max countback), else public chart-history.

    Prefer Germany relay (`FARAZ_HISTORY_PROXY`) — Iran VPS is CF-blocked from faraz.io.
    """
    faraz_sym = IRAN_FARAZ_HISTORY_SYMBOL.get(channel)
    if not faraz_sym:
        return []

    # 1) Customer trading-view history — one max-countback page (proxy may hold session).
    customer = await fetch_faraz_customer_history(
        session,
        channel,
        resolution,
        countback=_faraz_countback_cap(resolution),
        first=True,
    )
    if customer:
        return customer

    # 2) Public chart-history (D/W/M only, ~200 bars).
    if resolution not in {"1D", "1W", "1M"}:
        return []
    params = {
        "symbolNames": json.dumps([faraz_sym], separators=(",", ":")),
        "symbol": faraz_sym,
        "resolution": resolution,
        "cache": "true",
    }
    headers = {
        "Accept": "application/json",
        "Origin": FARAZ_BASE,
        "Referer": f"{FARAZ_BASE}/markets/gold-currency/{faraz_sym}",
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        ),
    }
    urls = [
        f"{FARAZ_HISTORY_PROXY}/faraz/chart-history",
        f"{FARAZ_BASE}/api/public/trading-view/chart-history",
    ]
    for url in urls:
        try:
            async with session.get(
                url,
                params=params,
                timeout=aiohttp.ClientTimeout(total=25),
                headers=headers,
            ) as resp:
                if resp.status != 200:
                    continue
                data = await resp.json(content_type=None)
            bars = _parse_faraz_history_payload(data, faraz_sym, channel)
            if bars:
                return bars
        except Exception as exc:
            LOG.debug("faraz chart-history %s %s via %s: %s", channel, resolution, url, exc)
    return []


def materialize_iran_1m_from_5m(*, channels: list[str] | None = None) -> int:
    """Persist derived 1m bars from stored 5m Faraz OHLC where 1m is missing.

    Heals ranges like G18 Apr 1–26 2026 (dense 5m, empty 1m) so chart scrollback
    does not show a blank hole.
    """
    client = mongo_client()
    if client is None:
        return 0
    try:
        from datetime import datetime, timezone

        from pymongo import UpdateOne

        base = client["anil_gold"]["faraz_ohlc"]
        now = datetime.now(tz=timezone.utc)
        targets = channels or list(IRAN_FARAZ_HISTORY_SYMBOL.keys())
        written = 0
        for channel in targets:
            # Find 5m span; derive 1m only where no native 1m exists.
            # Page through ALL 5m history (oldest→newest). A single 50k cap skipped
            # Apr 2026 when older months already filled the batch.
            faraz_sym = IRAN_FARAZ_HISTORY_SYMBOL.get(channel, "")
            field = IRAN_FIELD_BY_CHANNEL.get(channel, "")
            channel_written = 0
            cursor_t = 0
            while True:
                parents = list(
                    base.find(
                        {
                            "channel": channel,
                            "resolution": "5",
                            "c": {"$gt": 0},
                            "t": {"$gt": cursor_t},
                        },
                        {"t": 1, "o": 1, "h": 1, "l": 1, "c": 1, "v": 1},
                    )
                    .sort("t", 1)
                    .limit(5_000)
                )
                if not parents:
                    break
                cursor_t = int(parents[-1]["t"])
                parent_bars = _plausible_intraday_bars(
                    [
                        {
                            "t": int(d["t"]),
                            "o": float(d["o"]),
                            "h": float(d["h"]),
                            "l": float(d["l"]),
                            "c": float(d["c"]),
                            "v": float(d.get("v") or 0),
                        }
                        for d in parents
                    ],
                    300,
                )
                if not parent_bars:
                    continue
                t_min = int(parent_bars[0]["t"])
                t_max = int(parent_bars[-1]["t"]) + 300
                existing = {
                    int(d["t"])
                    for d in base.find(
                        {
                            "channel": channel,
                            "resolution": "1",
                            "t": {"$gte": t_min, "$lt": t_max},
                        },
                        {"t": 1},
                    )
                }
                ops: list[UpdateOne] = []
                for parent in parent_bars:
                    for child in _expand_coarser_bar_to_step(parent, 300, 60):
                        t0 = int(child["t"])
                        if t0 in existing:
                            continue
                        ops.append(
                            UpdateOne(
                                {"channel": channel, "resolution": "1", "t": t0},
                                {
                                    "$set": {
                                        "channel": channel,
                                        "faraz_symbol": faraz_sym,
                                        "field": field,
                                        "resolution": "1",
                                        "t": t0,
                                        "o": child["o"],
                                        "h": child["h"],
                                        "l": child["l"],
                                        "c": child["c"],
                                        "v": child["v"],
                                        "src": "derived-5m",
                                        "updated_at": now,
                                    }
                                },
                                upsert=True,
                            )
                        )
                        existing.add(t0)
                for i in range(0, len(ops), 1_000):
                    base.bulk_write(ops[i : i + 1_000], ordered=False)
                channel_written += len(ops)
            written += channel_written
            if channel_written:
                LOG.warning(
                    "materialized %s derived 1m bars from 5m for %s",
                    channel_written,
                    channel,
                )
        return written
    except Exception as exc:
        LOG.warning("materialize 1m from 5m: %s", exc)
        return 0


async def bootstrap_faraz_history(session: aiohttp.ClientSession) -> None:
    """Fetch max-countback history once per symbol/resolution and persist to Mongo."""
    if not IRAN_HISTORY_BOOTSTRAP:
        return
    LOG.info(
        "faraz bootstrap start symbols=%s resolutions=%s cookie=%s",
        len(IRAN_FARAZ_HISTORY_SYMBOL),
        len(IRAN_BOOTSTRAP_RESOLUTIONS),
        bool(FARAZ_COOKIE or FARAZ_TOKEN),
    )
    for channel in IRAN_FARAZ_HISTORY_SYMBOL:
        for resolution in IRAN_BOOTSTRAP_RESOLUTIONS:
            key = f"{channel}|{resolution}"
            if key in _IRAN_BOOTSTRAP_DONE:
                continue
            try:
                # Prefer full paged customer history; fall back to public D/W/M.
                bars = await fetch_faraz_customer_history_all(session, channel, resolution)
                if not bars:
                    bars = await fetch_faraz_chart_history(session, channel, resolution)
                if not bars:
                    if resolution in {"1D", "1W", "1M"}:
                        _IRAN_BOOTSTRAP_DONE.add(key)
                    continue
                n = await asyncio.to_thread(
                    persist_faraz_bars,
                    channel,
                    resolution,
                    bars,
                    src="faraz-bootstrap",
                )
                _IRAN_BOOTSTRAP_DONE.add(key)
                LOG.info(
                    "faraz bootstrap %s %s bars=%s persisted=%s symbol=%s",
                    channel,
                    resolution,
                    len(bars),
                    n,
                    IRAN_FARAZ_HISTORY_SYMBOL.get(channel),
                )
            except Exception as exc:
                LOG.warning("faraz bootstrap %s %s: %s", channel, resolution, exc)
            await asyncio.sleep(0.15)


async def poll_iran_bootstrap(session: aiohttp.ClientSession) -> None:
    """Run history bootstrap shortly after start, then daily refresh."""
    await asyncio.sleep(2.0)
    while True:
        try:
            await bootstrap_faraz_history(session)
        except Exception as exc:
            LOG.warning("iran bootstrap loop: %s", exc)
        await asyncio.sleep(86_400.0)


async def refresh_faraz_recent_tail(session: aiohttp.ClientSession) -> None:
    """Pull recent customer history so 1m/5m/… stay aligned with Faraz OHLC."""
    # Prioritize liquid gold symbols + 1m (largest visual impact when store lags).
    channels = (
        "iran:g18",
        "iran:abshode",
        "iran:g24",
        "iran:sekke",
        "iran:nim",
        "iran:rob",
        "iran:ons",
    )
    specs: tuple[tuple[str, int], ...] = (
        ("1", 3_000),
        ("5", 1_500),
        ("15", 1_000),
        ("60", 500),
        ("240", 500),
    )
    for resolution, countback in specs:
        for channel in channels:
            if channel not in IRAN_FARAZ_HISTORY_SYMBOL:
                continue
            try:
                bars = await fetch_faraz_customer_history(
                    session,
                    channel,
                    resolution,
                    countback=countback,
                )
                if not bars:
                    continue
                n = await asyncio.to_thread(
                    persist_faraz_bars,
                    channel,
                    resolution,
                    bars,
                    src="faraz-tail",
                )
                LOG.info(
                    "faraz tail %s %s bars=%s persisted=%s",
                    channel,
                    resolution,
                    len(bars),
                    n,
                )
            except Exception as exc:
                LOG.warning("faraz tail %s %s: %s", channel, resolution, exc)
            await asyncio.sleep(0.15)


async def poll_iran_faraz_tail(session: aiohttp.ClientSession) -> None:
    """Keep the recent Faraz OHLC tail fresh (fixes 1m freeze after bootstrap)."""
    await asyncio.sleep(3.0)
    while True:
        try:
            await refresh_faraz_recent_tail(session)
        except Exception as exc:
            LOG.warning("iran faraz tail loop: %s", exc)
        await asyncio.sleep(90.0)


def _bucket_price_rows(rows: list[dict[str, Any]], field: str, step: int) -> dict[int, dict[str, float]]:
    buckets: dict[int, dict[str, float]] = {}
    for doc in reversed(rows):
        ts_raw = doc.get("ts_unix") or doc.get("ts")
        if ts_raw is None:
            continue
        if hasattr(ts_raw, "timestamp"):
            ts = int(ts_raw.timestamp())
        else:
            ts = parse_updated_at(ts_raw)
        try:
            price = float(doc.get(field))
        except (TypeError, ValueError):
            continue
        if price <= 0:
            continue
        t0 = _align_iran_bar_time(ts, step)
        bar = buckets.get(t0)
        if bar is None:
            buckets[t0] = {"t": t0, "o": price, "h": price, "l": price, "c": price, "v": 1}
        else:
            bar["h"] = max(bar["h"], price)
            bar["l"] = min(bar["l"], price)
            bar["c"] = price
            bar["v"] += 1
    return buckets


def materialize_iran_ohlc_bases() -> None:
    """Bucket recent tick_1s into 1m/1h/1d + sub-minute faraz_ohlc (10S/1S…)."""
    client = mongo_client()
    if client is None:
        return
    try:
        from datetime import datetime, timezone

        from pymongo import UpdateOne

        tick_coll = client["anil_gold"]["tick_1s"]
        now = int(time.time())
        # Keep ~3 days of dense ticks for 1m materialization each pass.
        since = datetime.fromtimestamp(now - 3 * 86_400, tz=timezone.utc)
        rows = list(tick_coll.find({"ts": {"$gte": since}}).sort("ts", 1).limit(200_000))
        if not rows:
            return
        now_dt = datetime.now(tz=timezone.utc)
        for step, coll_name in ((60, "ohlc_1m"), (3600, "ohlc_1h"), (86_400, "ohlc_1d")):
            coll = client["anil_gold"][coll_name]
            ops: list[UpdateOne] = []
            for field, channel in IRAN_FIELDS.items():
                buckets = _bucket_price_rows(rows, field, step)
                for t0, bar in buckets.items():
                    ops.append(
                        UpdateOne(
                            {"channel": channel, "t": int(t0)},
                            {
                                "$set": {
                                    "channel": channel,
                                    "field": field,
                                    "t": int(t0),
                                    "o": bar["o"],
                                    "h": bar["h"],
                                    "l": bar["l"],
                                    "c": bar["c"],
                                    "v": bar["v"],
                                    "src": "faraz",
                                    "updated_at": now_dt,
                                }
                            },
                            upsert=True,
                        )
                    )
            for i in range(0, len(ops), 1000):
                coll.bulk_write(ops[i : i + 1000], ordered=False)
            coll.create_index([("channel", 1), ("t", -1)], background=True)

        # Persist 10S+ sub-minute OHLC from ticks (skip 1S/5S bulk — too heavy on
        # 2GB VPS; those still fold live via append_realtime_ohlc).
        base = client["anil_gold"]["faraz_ohlc"]
        sub_since = datetime.fromtimestamp(now - 36 * 3_600, tz=timezone.utc)
        sub_rows = list(
            tick_coll.find({"ts": {"$gte": sub_since}}).sort("ts", 1).limit(100_000)
        )
        written = 0
        for resolution, step in _IRAN_LIVE_RES_STEPS:
            if step < 10 or step >= 60:
                continue
            for field, channel in IRAN_FIELDS.items():
                buckets = _bucket_price_rows(sub_rows, field, step)
                ops = [
                    UpdateOne(
                        {"channel": channel, "resolution": resolution, "t": int(t0)},
                        {
                            "$set": {
                                "channel": channel,
                                "field": field,
                                "resolution": resolution,
                                "t": int(t0),
                                "o": bar["o"],
                                "h": bar["h"],
                                "l": bar["l"],
                                "c": bar["c"],
                                "v": bar["v"],
                                "src": "faraz-tick",
                                "updated_at": now_dt,
                            }
                        },
                        upsert=True,
                    )
                    for t0, bar in buckets.items()
                ]
                for i in range(0, len(ops), 500):
                    base.bulk_write(ops[i : i + 500], ordered=False)
                written += len(ops)
        if written:
            LOG.info("iran sub-minute materialize ops=%s", written)
        base.create_index([("channel", 1), ("resolution", 1), ("t", -1)], background=True)
    except Exception as exc:
        LOG.warning("iran ohlc materialize: %s", exc)


async def poll_iran_materialize() -> None:
    while True:
        try:
            await asyncio.to_thread(materialize_iran_ohlc_bases)
        except Exception as exc:
            LOG.warning("iran materialize loop: %s", exc)
        await asyncio.sleep(30.0)


def _load_iran_history_mongo(
    channel: str,
    field: str,
    step: int,
    limit: int,
    before: int | None,
    faraz_res: str | None,
) -> tuple[dict[int, dict[str, float]], list[str]]:
    """Sync Mongo reads for iran history (run via asyncio.to_thread)."""
    client = mongo_client()
    sources: list[str] = []
    buckets: dict[int, dict[str, float]] = {}
    if client is None:
        return buckets, sources

    exact_faraz = bool(
        faraz_res
        and (
            step == _parse_step_seconds(faraz_res)
            or (faraz_res == "1M" and step >= 30 * 86_400)
            or (faraz_res == "1W" and step == 604_800)
            or (faraz_res == "1D" and step == 86_400)
        )
    )

    def ingest(bar: dict[str, float], *, exact: bool) -> None:
        # Exact Faraz rows keep native session timestamps (Tehran 1h/4h grid).
        t0 = int(bar["t"]) if exact else _align_iran_bar_time(int(bar["t"]), step)
        if exact:
            buckets[t0] = {
                "t": t0,
                "o": bar["o"],
                "h": bar["h"],
                "l": bar["l"],
                "c": bar["c"],
                "v": bar.get("v", 0),
            }
            return
        # Aggregate lower-TF / tick closes into OHLC for the target step.
        existing = buckets.get(t0)
        o = float(bar.get("o", bar["c"]))
        h = float(bar.get("h", bar["c"]))
        l = float(bar.get("l", bar["c"]))
        c = float(bar["c"])
        v = float(bar.get("v") or 1)
        if existing is None:
            buckets[t0] = {"t": t0, "o": o, "h": h, "l": l, "c": c, "v": v}
        else:
            existing["h"] = max(existing["h"], h)
            existing["l"] = min(existing["l"], l)
            existing["c"] = c
            existing["v"] += v

    def _merge_tick_into_forming(rows: list[dict[str, Any]]) -> None:
        """Update only the wall-clock forming bar — never invent a long tick-only tail."""
        if not rows:
            return
        wall_t = _align_iran_bar_time(int(time.time()), step)
        prices: list[float] = []
        # Allow at most the current bucket (and keep existing Faraz bars untouched).
        for doc in reversed(rows):
            ts_raw = doc.get("ts_unix") or doc.get("ts")
            if ts_raw is None:
                continue
            if hasattr(ts_raw, "timestamp"):
                ts = int(ts_raw.timestamp())
            else:
                ts = parse_updated_at(ts_raw)
            try:
                price = float(doc.get(field))
            except (TypeError, ValueError):
                continue
            if price <= 0:
                continue
            t0 = _align_iran_bar_time(ts, step)
            if t0 != wall_t:
                continue
            prices.append(price)
            existing = buckets.get(t0)
            if existing is None:
                buckets[t0] = {"t": t0, "o": price, "h": price, "l": price, "c": price, "v": 1}
            else:
                existing["h"] = max(existing["h"], price)
                existing["l"] = min(existing["l"], price)
                existing["c"] = price
                existing["v"] += 1
        # Clamp forming-bar wicks when only tick folds exist (no Faraz OHLC yet).
        forming = buckets.get(wall_t)
        if forming is not None and len(prices) >= 2:
            moves = sorted(abs(prices[i] - prices[i - 1]) for i in range(1, len(prices)))
            med = moves[len(moves) // 2] if moves else 0.0
            max_range = max(med * 8.0, abs(prices[-1]) * 2e-4, 1.0)
            buckets[wall_t] = _clamp_iran_tick_wicks(forming, max_range)

    try:
        if faraz_res:
            fq: dict[str, Any] = {"channel": channel, "c": {"$gt": 0}, "resolution": faraz_res}
            if before is not None:
                fq["t"] = {"$lt": before}
            # Pull extra — we drop closed flat tick-folds that pollute the tip.
            stored = list(
                client["anil_gold"]["faraz_ohlc"]
                .find(fq, {"t": 1, "o": 1, "h": 1, "l": 1, "c": 1, "v": 1, "src": 1})
                .sort("t", -1)
                .limit(min(max(limit * 4, limit), 50_000))
            )
            wall_t = _align_iran_bar_time(int(time.time()), step)
            kept = 0
            if stored:
                sources.append("anil_gold.faraz_ohlc")
                # First pass — collect candidate bars, then drop wrong-TF junk
                # (daily stamps persisted as resolution=1 when Faraz auth was 401).
                candidates: list[dict[str, float]] = []
                for doc in reversed(stored):
                    try:
                        t0 = int(doc["t"])
                        o = float(doc["o"])
                        h = float(doc["h"])
                        l = float(doc["l"])
                        c = float(doc["c"])
                        src = str(doc.get("src") or "")
                        is_tick_fold = src in {"faraz", "faraz-tick"} or src.startswith(
                            "faraz-tick"
                        )
                        # Minute+: closed tick folds hide real Faraz OHLC — drop them.
                        # Sub-minute: Faraz has no archive; closed faraz-tick bars ARE
                        # the history (and the only feed for 10S replay densify).
                        if step >= 60 and is_tick_fold and t0 < wall_t:
                            continue
                        candidates.append(
                            {
                                "t": t0,
                                "o": o,
                                "h": h,
                                "l": l,
                                "c": c,
                                "v": float(doc.get("v") or 0),
                            }
                        )
                    except (KeyError, TypeError, ValueError):
                        continue
                if step < 86_400:
                    candidates = _plausible_intraday_bars(candidates, step)
                for bar in candidates:
                    ingest(bar, exact=exact_faraz)
                    kept += 1
                # Trim to newest `limit` after filter.
                if len(buckets) > limit:
                    keep_ts = sorted(buckets)[-limit:]
                    buckets = {t: buckets[t] for t in keep_ts}
                LOG.debug(
                    "iran history %s %s kept=%s raw=%s",
                    channel,
                    faraz_res,
                    kept,
                    len(stored),
                )

        # When native Faraz history is present for this exact resolution, do NOT
        # overlay ohlc_1h/1m parents (they used UTC buckets and smash 1h/4h OHLC).
        # Only fold recent ticks into the forming bar.
        faraz_exact_ready = exact_faraz and len(buckets) >= min(limit, 50)

        docs_per_bar = max(2, step // 5) if step >= 60 else 2
        pull = min(20_000, max(limit * docs_per_bar, limit * 2, 500))
        query: dict[str, Any] = {field: {"$gt": 0}}
        if before is not None:
            from datetime import datetime, timezone

            query["ts"] = {"$lt": datetime.fromtimestamp(before, tz=timezone.utc)}
        tick_coll = client["anil_gold"]["tick_1s"]
        hist_coll = client["anil_gold"]["price_history"]
        rows: list[dict[str, Any]] = []
        wall_t = _align_iran_bar_time(int(time.time()), step)

        def _bucket_ticks_fill_missing(
            tick_rows: list[dict[str, Any]],
            *,
            overwrite_from: int | None = None,
        ) -> None:
            """Build/fill step buckets from ticks without widening good Faraz bars.

            When `overwrite_from` is set, tick bars replace anything at/after that
            timestamp (used to heal multi-hour holes left by daily-as-1m junk).
            """
            if not tick_rows:
                return
            # Typical Faraz 1m body on G18 is a few thousand toman — clamp outliers.
            closes: list[float] = []
            built: dict[int, dict[str, float]] = {}
            for doc in reversed(tick_rows):
                ts_raw = doc.get("ts_unix") or doc.get("ts")
                if ts_raw is None:
                    continue
                if hasattr(ts_raw, "timestamp"):
                    ts = int(ts_raw.timestamp())
                else:
                    ts = parse_updated_at(ts_raw)
                try:
                    price = float(doc.get(field))
                except (TypeError, ValueError):
                    continue
                if price <= 0:
                    continue
                t0 = _align_iran_bar_time(ts, step)
                if before is not None and t0 >= before:
                    continue
                if t0 > wall_t:
                    continue
                existing = built.get(t0)
                if existing is None:
                    built[t0] = {"t": t0, "o": price, "h": price, "l": price, "c": price, "v": 1}
                else:
                    existing["h"] = max(existing["h"], price)
                    existing["l"] = min(existing["l"], price)
                    existing["c"] = price
                    existing["v"] += 1
                closes.append(price)
            if not built:
                return
            # Median adjacent move → wick cap (stops single bad ticks from huge shadows).
            moves = [abs(closes[i] - closes[i - 1]) for i in range(1, len(closes))]
            moves.sort()
            med_move = moves[len(moves) // 2] if moves else 0.0
            max_range = max(med_move * 8.0, abs(closes[-1]) * 2e-4, 1.0)
            for t0, bar in built.items():
                clamped = _clamp_iran_tick_wicks(bar, max_range)
                existing = buckets.get(t0)
                replace = overwrite_from is not None and t0 >= overwrite_from
                if existing is None or replace:
                    buckets[t0] = clamped
                elif t0 == wall_t:
                    # Forming bar: merge live ticks into whatever we already have.
                    existing["h"] = max(float(existing["h"]), float(clamped["h"]))
                    existing["l"] = min(float(existing["l"]), float(clamped["l"]))
                    existing["c"] = float(clamped["c"])
                    existing["v"] = float(existing.get("v") or 0) + float(clamped.get("v") or 0)
                # Older closed Faraz bars stay untouched.

        # If stored Faraz OHLC left a multi-hour hole before now (daily-as-1m junk
        # or expired cookie), rebuild the recent window from tick_1s.
        tip_rebuild_from: int | None = None
        if step <= 1_800 and before is None and buckets:
            ordered_t = sorted(buckets)
            latest = ordered_t[-1]
            hole = wall_t - latest
            if hole > max(step * 5, 600):
                tip_rebuild_from = max(0, wall_t - max(limit, 500) * step)
            else:
                # Also heal internal multi-hour holes near the tip.
                scan = ordered_t[-min(len(ordered_t), 200) :]
                for i in range(1, len(scan)):
                    if scan[i] - scan[i - 1] > max(step * 30, 3_600):
                        tip_rebuild_from = max(0, wall_t - max(limit, 500) * step)
                        break

        tick_pull = min(50_000, max(pull, 20_000 if tip_rebuild_from is not None else pull))

        if step < 60:
            # Sub-minute: prefer stored faraz_ohlc; fill holes + forming from ticks.
            # Pull deep tick_1s so 10S/1S charts and replay keep dense history.
            recent = list(
                tick_coll.find(query, {field: 1, "ts": 1, "ts_unix": 1})
                .sort("ts", -1)
                .limit(min(IRAN_HISTORY_DEPTH["seconds"], max(tick_pull, 40_000)))
            )
            if recent:
                sources.append("anil_gold.tick_1s")
                _bucket_ticks_fill_missing(recent, overwrite_from=tip_rebuild_from)
        elif faraz_exact_ready or tip_rebuild_from is not None:
            recent = list(
                tick_coll.find(query, {field: 1, "ts": 1, "ts_unix": 1})
                .sort("ts", -1)
                .limit(min(tick_pull, 40_000))
            )
            if recent:
                sources.append("anil_gold.tick_1s")
                if tip_rebuild_from is None:
                    _merge_tick_into_forming(recent)
                # Patch / rebuild holes behind the tip when Faraz customer auth is stale.
                _bucket_ticks_fill_missing(recent, overwrite_from=tip_rebuild_from)
                if tip_rebuild_from is not None:
                    sources.append("tick-rebuild")
        else:
            parent_coll = None
            if step >= 86_400:
                parent_coll = client["anil_gold"]["ohlc_1d"]
            elif step >= 3600 and step % 3600 == 0:
                parent_coll = client["anil_gold"]["ohlc_1h"]
            elif step >= 60 and step % 60 == 0:
                parent_coll = client["anil_gold"]["ohlc_1m"]
            if parent_coll is not None:
                pq: dict[str, Any] = {"channel": channel, "c": {"$gt": 0}}
                if before is not None:
                    pq["t"] = {"$lt": before}
                parents = list(
                    parent_coll.find(pq, {"t": 1, "o": 1, "h": 1, "l": 1, "c": 1, "v": 1})
                    .sort("t", -1)
                    .limit(min(limit, 20_000))
                )
                if parents:
                    sources.append(parent_coll.name)
                    parent_bars = _plausible_intraday_bars(
                        [
                            {
                                "t": int(doc["t"]),
                                "o": float(doc["o"]),
                                "h": float(doc["h"]),
                                "l": float(doc["l"]),
                                "c": float(doc["c"]),
                                "v": float(doc.get("v") or 0),
                            }
                            for doc in reversed(parents)
                            if doc.get("t") is not None
                        ],
                        step if step >= 60 else 60,
                    )
                    for bar in parent_bars:
                        try:
                            ingest(bar, exact=(step <= 60))
                        except (KeyError, TypeError, ValueError):
                            continue
            recent = list(
                tick_coll.find(query, {field: 1, "ts": 1, "ts_unix": 1})
                .sort("ts", -1)
                .limit(min(8_000, pull))
            )
            if recent:
                rows.extend(recent)
                sources.append("anil_gold.tick_1s")
            if len(buckets) < min(limit, 200):
                hist_rows = list(hist_coll.find(query, {field: 1, "ts": 1}).sort("ts", -1).limit(pull))
                if hist_rows:
                    rows.extend(hist_rows)
                    sources.append("anil_gold.price_history")

        if rows:
            _bucket_ticks_fill_missing(rows)

        # Historical holes (e.g. G18 Apr 2026 has 5m but no 1m): expand coarser Faraz.
        if step >= 60 and step < 86_400:
            derived = _fill_iran_from_coarser_faraz(
                client,
                channel,
                buckets,
                step,
                limit=limit,
                before=before,
                wall_t=wall_t if before is None else (before - step),
            )
            if derived:
                sources.append(f"derived-{derived}")

        # Faraz-like continuity: fill short intraday holes (missed poll minutes).
        if step <= 1_800:
            gap_wall = wall_t if before is None else min(wall_t, before - step)
            filled = _fill_iran_session_gaps(
                buckets,
                step,
                wall_t=gap_wall,
                max_gap_steps=90 if step <= 60 else 45,
            )
            if filled:
                sources.append(f"gapfill:{filled}")
    except Exception as exc:
        LOG.warning("iran history mongo: %s", exc)
    return buckets, sources


async def iran_gold_history(request: web.Request) -> web.Response:
    """OHLC for iran:* — Mongo faraz_ohlc first, optional Faraz fill-in.

    Query: symbol=ABSHODE|G18|…, interval=1S|1|5|15|60|1D|1W|1M, limit, before.
    """
    session: aiohttp.ClientSession = request.app["session"]

    raw_symbol = str(request.query.get("symbol") or request.query.get("channel") or "G18").strip()
    channel = normalize_channel(raw_symbol if ":" in raw_symbol else f"iran:{raw_symbol.lower()}")
    if not channel:
        ticker_map = {
            "ABSHODE": "iran:abshode",
            "MESGHAL17": "iran:abshode",
            "G18": "iran:g18",
            "G24": "iran:g24",
            "SEKKE": "iran:sekke",
            "SEKKE_EMAMI": "iran:sekke",
            "NIM": "iran:nim",
            "ROB": "iran:rob",
            "ONS": "iran:ons",
        }
        channel = ticker_map.get(raw_symbol.upper())
    if not channel or channel not in IRAN_FIELD_BY_CHANNEL:
        return web.json_response({"detail": f"unknown iran symbol {raw_symbol}"}, status=400)

    field = IRAN_FIELD_BY_CHANNEL[channel]
    interval_raw = str(request.query.get("interval") or "1")
    step = _parse_step_seconds(interval_raw)
    limit = _iran_history_limit(step, int(request.query.get("limit") or 500))
    before_raw = request.query.get("before")
    before = int(float(before_raw)) if before_raw not in (None, "") else None
    faraz_res = _faraz_resolution_for_step(step)

    buckets, sources = await asyncio.to_thread(
        _load_iran_history_mongo,
        channel,
        field,
        step,
        limit,
        before,
        faraz_res,
    )

    exact = bool(
        faraz_res
        and (
            step == _parse_step_seconds(faraz_res)
            or (faraz_res == "1M" and step >= 30 * 86_400)
            or (faraz_res == "1W" and step == 604_800)
            or (faraz_res == "1D" and step == 86_400)
        )
    )
    # Refresh from Faraz when store is empty, tip is stale, OR a lone realtime
    # tick sits after a multi-hour hole (append_realtime makes tip look "fresh").
    # Faraz customer history has no sub-minute — those come from our live folds.
    faraz_remote_ok = bool(faraz_res) and step >= 60
    need_live = False
    if faraz_remote_ok and len(buckets) < min(limit, 50):
        need_live = True
    elif faraz_remote_ok and exact and buckets and before is None:
        ordered_t = sorted(buckets)
        latest = ordered_t[-1]
        now_i = int(time.time())
        if now_i - latest > max(step * 3, 180):
            need_live = True
        else:
            # A continuous realtime tip can hide holes behind it (tick folds skip
            # quiet minutes). Faraz customer history is continuous — refresh when
            # any gap is larger than ~2 steps.
            gap_lim = max(step * 2, step + 1)
            scan = ordered_t[-min(len(ordered_t), max(80, 7200 // max(step, 1))) :]
            for i in range(1, len(scan)):
                if scan[i] - scan[i - 1] > gap_lim:
                    need_live = True
                    break
            # Flat / near-flat tip (tick pollution) — force Faraz rewrite.
            if not need_live:
                recent = ordered_t[-min(len(ordered_t), 120) :]
                closes = {
                    round(float(buckets[t]["c"]), 2)
                    for t in recent
                    if float(buckets[t].get("c") or 0) > 0
                }
                ranged = sum(
                    1
                    for t in recent
                    if float(buckets[t].get("h") or 0) - float(buckets[t].get("l") or 0) > 1e-6
                )
                if len(recent) >= 20 and (
                    len(closes) <= max(2, len(recent) // 20) or ranged < max(3, len(recent) // 10)
                ):
                    need_live = True
        # Sub-15m: refresh from Faraz at least every ~45s so OHLC matches Faraz
        # (tick-formed opens/highs drift within a minute).
        if not need_live and step <= 900:
            live_key = f"{channel}|{faraz_res}"
            if time.monotonic() - _FARAZ_HISTORY_LIVE_AT.get(live_key, 0.0) > 45.0:
                need_live = True

    if faraz_remote_ok and need_live:
        # Prefer a recent customer page for intraday; chart-history for D/W/M fallback.
        # Keep countback modest so /iran-gold/history stays snappy; tail poll fills depth.
        faraz_bars: list[dict[str, float]] = []
        if exact and step < 86_400:
            cb = 500 if step <= 60 else 400 if step <= 900 else 300
            faraz_bars = await fetch_faraz_customer_history(
                session,
                channel,
                faraz_res,
                countback=min(_faraz_countback_cap(faraz_res), cb),
            )
            if not faraz_bars:
                # Public TV history is often *daily* regardless of resolution —
                # only accept it when it looks like real intraday spacing.
                public = await fetch_faraz_public_tv_history(
                    session, channel, faraz_res, countback=min(1_000, cb)
                )
                faraz_bars = _plausible_intraday_bars(public, step)
        else:
            faraz_bars = await fetch_faraz_chart_history(session, channel, faraz_res)
        if faraz_bars and step < 86_400:
            faraz_bars = _plausible_intraday_bars(faraz_bars, step)
        if faraz_bars:
            sources.append(f"faraz:{faraz_res}")
            _FARAZ_HISTORY_LIVE_AT[f"{channel}|{faraz_res}"] = time.monotonic()
            for bar in faraz_bars:
                t0 = int(bar["t"]) if exact else _align_iran_bar_time(int(bar["t"]), step)
                if exact:
                    buckets[t0] = {
                        "t": t0,
                        "o": bar["o"],
                        "h": bar["h"],
                        "l": bar["l"],
                        "c": bar["c"],
                        "v": bar.get("v", 0),
                    }
                else:
                    price = float(bar["c"])
                    existing = buckets.get(t0)
                    if existing is None:
                        buckets[t0] = {"t": t0, "o": price, "h": price, "l": price, "c": price, "v": 1}
                    else:
                        existing["h"] = max(existing["h"], price)
                        existing["l"] = min(existing["l"], price)
                        existing["c"] = price
                        existing["v"] += 1
            # Persist off the request path so charts are not blocked by Mongo bulk writes.
            asyncio.create_task(
                asyncio.to_thread(
                    persist_faraz_bars,
                    channel,
                    faraz_res,
                    faraz_bars,
                    src="faraz-live",
                )
            )

    if not buckets and mongo_client() is None:
        return web.json_response({"detail": "pymongo unavailable"}, status=503)

    ordered = sorted(buckets.values(), key=lambda b: b["t"])
    if before is not None:
        ordered = [b for b in ordered if b["t"] < before]
    ordered = ordered[-limit:]
    bars = [[int(b["t"]), b["o"], b["h"], b["l"], b["c"], b["v"]] for b in ordered]
    return web.json_response(
        {
            "symbol": channel,
            "field": field,
            "interval": interval_raw,
            "step": step,
            "count": len(bars),
            "bars": bars,
            "source": "+".join(dict.fromkeys(sources)) or "empty",
        }
    )


async def iran_gold_quote(request: web.Request) -> web.Response:
    """Latest Iran gold quote snapshot (Faraz only)."""
    session: aiohttp.ClientSession = request.app["session"]
    quote_src = await fetch_iran_quote(session)
    if not quote_src:
        return web.json_response({"detail": "faraz gold unavailable"}, status=503)
    quote, src = quote_src
    return web.json_response(
        {
            "source": src,
            "ts": int(time.time()),
            "prices": quote,
            "channels": {IRAN_FIELDS[k]: quote[k] for k in IRAN_FIELDS if quote.get(k)},
        }
    )


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


async def fetch_tv_history_bars(
    symbol: str,
    resolution: str,
    count: int,
    before: float | None = None,
) -> list[list[float]]:
    """Pull OHLC from TradingView’s chart socket for an EX:SYMBOL broker book.

    Pages backward with `request_more_data` so replay cutoffs and deep countBack
    are real history — not only the latest window filtered empty by `before`.
    """
    from cp_fetcher.config import load_settings
    from cp_fetcher.protocol import is_heartbeat, iter_json_messages
    from cp_fetcher.tvws import (
        authorize,
        connect_with_retry,
        generate_chart_session,
        reply_heartbeat,
        resolve_symbol_arg,
        send,
    )
    from cp_fetcher.protocol import candle_values

    settings = load_settings()
    want = max(50, min(int(count), 10_000))
    # TV create_series pages are most reliable under ~3k; we merge pages ourselves.
    page_n = max(100, min(want, 3_000))
    tv_res = str(resolution or "1")
    # Map Forge-style ids onto TV series resolutions.
    res_map = {
        "1m": "1",
        "5m": "5",
        "15m": "15",
        "30m": "30",
        "60": "60",
        "1h": "60",
        "240": "240",
        "4h": "240",
        "1d": "1D",
        "d": "1D",
        "1w": "1W",
        "w": "1W",
        "1M": "1M",
        "m": "1M",
    }
    tv_res = res_map.get(tv_res, tv_res)
    before_t = float(before) if before is not None and before > 0 else None

    ws = await connect_with_retry(settings)
    try:
        await authorize(ws)
        chart = generate_chart_session()
        await send(ws, "chart_create_session", [chart, ""])
        await send(ws, "resolve_symbol", [chart, "symbol_1", resolve_symbol_arg(symbol)])
        await send(ws, "create_series", [chart, "s1", "s1", "symbol_1", tv_res, page_n])

        by_t: dict[float, list[float]] = {}
        pending_more = False
        stagnant = 0
        oldest_seen: float | None = None
        # Deep replay windows need more wall time than a live quote pull.
        deadline = time.monotonic() + (90.0 if before_t is not None or want > 1_000 else 35.0)

        def merge_candles(candles: list) -> None:
            for c in candles:
                try:
                    t = float(c[0])
                    by_t[t] = [
                        t,
                        float(c[1]),
                        float(c[2]),
                        float(c[3]),
                        float(c[4]),
                        float(c[5] if len(c) > 5 else 0),
                    ]
                except (TypeError, ValueError, IndexError):
                    continue

        def need_more() -> bool:
            if not by_t:
                return False
            times = sorted(by_t)
            if before_t is not None and times[0] >= before_t:
                return True
            usable = [t for t in times if before_t is None or t < before_t]
            return len(usable) < want

        while time.monotonic() < deadline:
            raw = await asyncio.wait_for(ws.recv(), timeout=10.0)
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
                if not data:
                    continue
                kind = data.get("m")
                params = data.get("p") or []
                if kind == "symbol_error" and params and params[0] == chart:
                    raise RuntimeError(f"invalid symbol: {symbol}")
                if kind in {"du", "timescale_update"} and params and params[0] == chart:
                    candles, _ = candle_values(data)
                    if candles:
                        merge_candles(candles)
                if kind == "series_completed" and params and params[0] == chart:
                    if not by_t:
                        return []
                    cur_oldest = min(by_t)
                    if oldest_seen is not None and cur_oldest >= oldest_seen - 1e-9:
                        stagnant += 1
                    else:
                        stagnant = 0
                    oldest_seen = cur_oldest if oldest_seen is None else min(oldest_seen, cur_oldest)

                    if need_more() and stagnant < 3:
                        pending_more = True
                        await send(ws, "request_more_data", [chart, "s1", page_n])
                        continue
                    # Done paging.
                    pending_more = False
                    out = [by_t[t] for t in sorted(by_t)]
                    if before_t is not None:
                        out = [b for b in out if b[0] < before_t]
                    return out[-want:]
            if pending_more:
                continue
        out = [by_t[t] for t in sorted(by_t)]
        if before_t is not None:
            out = [b for b in out if b[0] < before_t]
        return out[-want:]
    finally:
        try:
            await ws.close()
        except Exception:
            pass


async def tv_history(request: web.Request) -> web.Response:
    """HTTP history for TradingView broker books used by Forge charts.

    Query:
      symbol=FOREXCOM:NAS100|CAPITALCOM:US30|OANDA:NAS100USD|…
      resolution=1|5|15|30|60|240|1D|1W|1M
      count=500
      before=<unix sec exclusive> (optional)
    """
    raw_symbol = str(request.query.get("symbol") or "").strip()
    if not raw_symbol or ":" not in raw_symbol:
        return web.json_response({"detail": "symbol must be EXCHANGE:TICKER"}, status=400)
    # Allow Forge-style exchange/ticker with aliases (FXCM → FOREXCOM, OANDA NAS100 → NAS100USD).
    ex, ticker = raw_symbol.split(":", 1)
    symbol = resolve_tv_broker_symbol(ex, ticker)
    resolution = str(request.query.get("resolution") or "1")
    try:
        count = int(request.query.get("count") or 500)
    except ValueError:
        count = 500
    before_raw = request.query.get("before")
    before = float(before_raw) if before_raw not in (None, "") else None

    try:
        bars = await fetch_tv_history_bars(symbol, resolution, count, before=before)
    except Exception as exc:
        LOG.warning("tv-history %s %s: %s", symbol, resolution, exc)
        return web.json_response({"detail": str(exc), "symbol": symbol, "bars": []}, status=502)

    return web.json_response(
        {
            "symbol": symbol,
            "resolution": resolution,
            "count": len(bars),
            "bars": bars,
        }
    )


async def health(_request: web.Request) -> web.Response:
    return web.json_response(
        {
            "status": "ok",
            "channels": {k: len(v) for k, v in SUBS.items()},
            "tv_wanted": sorted(TV_WANTED),
            "tv_enabled": TV_ENABLED,
            "iran_poll": IRAN_POLL,
            "last_tick_age_ms": {
                k: int(time.monotonic() * 1000 - LAST_TICK_MS[k]) for k in LAST_TICK_MS
            },
        }
    )


async def poll_purge_flat_ticks() -> None:
    """Periodically drop closed flat tick-fold OHLC so charts show real Faraz bars."""
    while True:
        try:
            await asyncio.to_thread(purge_flat_tick_ohlc)
        except Exception as exc:
            LOG.debug("purge flat ticks: %s", exc)
        await asyncio.sleep(3600.0)


async def start_background(app: web.Application) -> None:
    headers = {"X-API-Key": API_KEY} if API_KEY else {}
    session = aiohttp.ClientSession(headers=headers)
    app["session"] = session

    async def _startup_purge() -> None:
        try:
            removed = await asyncio.to_thread(purge_flat_tick_ohlc)
            if removed:
                LOG.warning("startup purged %s closed tick-fold bars", removed)
        except Exception as exc:
            LOG.warning("startup purge flat ticks: %s", exc)
        try:
            derived = await asyncio.to_thread(materialize_iran_1m_from_5m)
            if derived:
                LOG.warning("startup materialized %s derived 1m bars from 5m", derived)
        except Exception as exc:
            LOG.warning("startup materialize 1m from 5m: %s", exc)

    # Do not block HTTP bind on a large Mongo purge — run it in the background.
    app["tasks"] = [
        asyncio.create_task(_startup_purge()),
        asyncio.create_task(tv_quote_feeder()),
        asyncio.create_task(poll_mongo()),
        asyncio.create_task(poll_crypto(session)),
        asyncio.create_task(poll_forex(session)),
        asyncio.create_task(poll_iran_gold(session)),
        asyncio.create_task(poll_iran_materialize()),
        asyncio.create_task(poll_iran_bootstrap(session)),
        asyncio.create_task(poll_iran_faraz_tail(session)),
        asyncio.create_task(poll_purge_flat_ticks()),
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
    app.router.add_get("/iran-gold/history", iran_gold_history)
    app.router.add_get("/iran-gold/quote", iran_gold_quote)
    app.router.add_get("/tv-history", tv_history)
    app.router.add_get("/health", health)
    app.on_startup.append(start_background)
    app.on_cleanup.append(cleanup)
    LOG.info(
        "market-ticks on %s:%s tv=%s crypto_poll=%.2f forex_poll=%.2f mongo_poll=%.2f iran_poll=%.2f → %s",
        HOST,
        PORT,
        TV_ENABLED,
        CRYPTO_POLL,
        FOREX_POLL,
        MONGO_POLL,
        IRAN_POLL,
        API_BASE,
    )
    web.run_app(app, host=HOST, port=PORT, print=None)


if __name__ == "__main__":
    main()
