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
    "60",
    "240",
    "1D",
    "1W",
    "1M",
)
_IRAN_BOOTSTRAP_DONE: set[str] = set()
_FARAZ_CUSTOMER_AUTH_OK: bool | None = None
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
    if channel.startswith("iran:"):
        return IRAN_ALIASES.get(channel, channel if channel in IRAN_FIELD_BY_CHANNEL else None)
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
        mesghal = _extract_faraz_price(raw.get("abshodeNaghdi"))
        g18 = _extract_faraz_price(raw.get("geramTalaHejdah"))
        g24 = _extract_faraz_price(raw.get("tala24Estjt"))
        # Fallback only if native G18 missing — keep abshode usable.
        if g18 <= 0 and mesghal > 0:
            g18 = float(int(round((mesghal * 750 / 705) / 4.608)))
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
    except Exception as exc:
        LOG.debug("faraz direct: %s", exc)
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
    """Faraz-only quote resolution. Never TGJU."""
    for fetcher in (
        lambda: fetch_iran_quote_faraz_proxy(session),  # Germany → Faraz (reliable from VPS)
        lambda: fetch_iran_quote_faraz_direct(session),  # direct faraz.io when unblocked
        lambda: fetch_iran_quote_anil_faraz(session),
        fetch_iran_quote_mongo_faraz,
    ):
        quote_src = await fetcher()
        if quote_src:
            return quote_src
    return None


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
                persist_iran_tick_1s(quote, src_name, ts)
                append_realtime_ohlc(quote, src_name, ts)
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
    """Best Faraz resolution for a chart step (customer history supports minutes)."""
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
    if step >= 900:
        return "15"
    if step >= 300:
        return "5"
    if step >= 60:
        return "1"
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
    client = mongo_client()
    if client is None:
        return 0
    try:
        from datetime import datetime, timezone

        faraz_sym = IRAN_FARAZ_HISTORY_SYMBOL.get(channel, "")
        field = IRAN_FIELD_BY_CHANNEL.get(channel, "")
        now = datetime.now(tz=timezone.utc)
        written = 0
        # Canonical deep store — every resolution.
        base = client["anil_gold"]["faraz_ohlc"]
        for bar in bars:
            t = int(bar["t"])
            base.update_one(
                {"channel": channel, "resolution": resolution, "t": t},
                {
                    "$set": {
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
                },
                upsert=True,
            )
            written += 1
        base.create_index(
            [("channel", 1), ("resolution", 1), ("t", -1)],
            background=True,
        )
        # Also mirror into cp-style parent collections for 1m/1h/1d.
        parent = _ohlc_coll_for_resolution(resolution)
        if parent:
            coll = client["anil_gold"][parent]
            for bar in bars:
                t = int(bar["t"])
                coll.update_one(
                    {"channel": channel, "t": t},
                    {
                        "$set": {
                            "channel": channel,
                            "field": field,
                            "t": t,
                            "o": float(bar["o"]),
                            "h": float(bar["h"]),
                            "l": float(bar["l"]),
                            "c": float(bar["c"]),
                            "v": float(bar.get("v") or 0),
                            "src": src,
                            "updated_at": now,
                        }
                    },
                    upsert=True,
                )
            coll.create_index([("channel", 1), ("t", -1)], background=True)
        return written
    except Exception as exc:
        LOG.warning("persist faraz bars %s %s: %s", channel, resolution, exc)
        return 0


def append_realtime_ohlc(quote: dict[str, float], src_name: str, ts: int) -> None:
    """Fold each live Faraz tick into forming 1m/1h/1d candles (cp_fetcher-style)."""
    client = mongo_client()
    if client is None:
        return
    try:
        from datetime import datetime, timezone

        now = datetime.now(tz=timezone.utc)
        for field, channel in IRAN_FIELDS.items():
            price = float(quote.get(field) or 0)
            if price <= 0:
                continue
            for step, coll_name in ((60, "ohlc_1m"), (3600, "ohlc_1h"), (86_400, "ohlc_1d")):
                t0 = ts - (ts % step)
                coll = client["anil_gold"][coll_name]
                existing = coll.find_one({"channel": channel, "t": t0})
                if existing is None:
                    coll.update_one(
                        {"channel": channel, "t": t0},
                        {
                            "$set": {
                                "channel": channel,
                                "field": field,
                                "t": t0,
                                "o": price,
                                "h": price,
                                "l": price,
                                "c": price,
                                "v": 1,
                                "src": src_name,
                                "updated_at": now,
                            }
                        },
                        upsert=True,
                    )
                else:
                    coll.update_one(
                        {"channel": channel, "t": t0},
                        {
                            "$set": {
                                "c": price,
                                "src": src_name,
                                "updated_at": now,
                            },
                            "$max": {"h": price},
                            "$min": {"l": price},
                            "$inc": {"v": 1},
                        },
                    )
    except Exception as exc:
        LOG.debug("append realtime ohlc: %s", exc)


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
    global _FARAZ_CUSTOMER_AUTH_OK
    if _FARAZ_CUSTOMER_AUTH_OK is False:
        return []
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
        LOG.warning(
            "faraz customer history unauthorized — set FARAZ_COOKIE (or FARAZ_TOKEN) "
            "on Germany faraz-history-proxy / market-ticks for deep countback"
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


async def bootstrap_faraz_history(session: aiohttp.ClientSession) -> None:
    """Fetch max-countback history once per symbol/resolution and persist to Mongo."""
    if not IRAN_HISTORY_BOOTSTRAP:
        return
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
        t0 = ts - (ts % step)
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
    """Bucket recent tick_1s into 1m/1h/1d collections (cp_fetcher-style parents)."""
    client = mongo_client()
    if client is None:
        return
    try:
        from datetime import datetime, timezone

        tick_coll = client["anil_gold"]["tick_1s"]
        now = int(time.time())
        # Keep ~3 days of dense ticks for 1m materialization each pass.
        since = datetime.fromtimestamp(now - 3 * 86_400, tz=timezone.utc)
        rows = list(tick_coll.find({"ts": {"$gte": since}}).sort("ts", 1).limit(200_000))
        if not rows:
            return
        for step, coll_name in ((60, "ohlc_1m"), (3600, "ohlc_1h"), (86_400, "ohlc_1d")):
            coll = client["anil_gold"][coll_name]
            for field, channel in IRAN_FIELDS.items():
                buckets = _bucket_price_rows(rows, field, step)
                for t0, bar in buckets.items():
                    coll.update_one(
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
                                "updated_at": datetime.now(tz=timezone.utc),
                            }
                        },
                        upsert=True,
                    )
            coll.create_index([("channel", 1), ("t", -1)], background=True)
    except Exception as exc:
        LOG.debug("iran ohlc materialize: %s", exc)


async def poll_iran_materialize() -> None:
    while True:
        try:
            await asyncio.to_thread(materialize_iran_ohlc_bases)
        except Exception as exc:
            LOG.debug("iran materialize loop: %s", exc)
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
        t0 = int(bar["t"]) - (int(bar["t"]) % step)
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
        price = float(bar["c"])
        existing = buckets.get(t0)
        if existing is None:
            buckets[t0] = {"t": t0, "o": price, "h": price, "l": price, "c": price, "v": 1}
        else:
            existing["h"] = max(existing["h"], price)
            existing["l"] = min(existing["l"], price)
            existing["c"] = price
            existing["v"] += 1

    try:
        if faraz_res:
            fq: dict[str, Any] = {"channel": channel, "c": {"$gt": 0}, "resolution": faraz_res}
            if before is not None:
                fq["t"] = {"$lt": before}
            stored = list(
                client["anil_gold"]["faraz_ohlc"]
                .find(fq, {"t": 1, "o": 1, "h": 1, "l": 1, "c": 1, "v": 1})
                .sort("t", -1)
                .limit(min(limit, 50_000))
            )
            if stored:
                sources.append("anil_gold.faraz_ohlc")
                for doc in reversed(stored):
                    try:
                        ingest(
                            {
                                "t": int(doc["t"]),
                                "o": float(doc["o"]),
                                "h": float(doc["h"]),
                                "l": float(doc["l"]),
                                "c": float(doc["c"]),
                                "v": float(doc.get("v") or 0),
                            },
                            exact=exact_faraz,
                        )
                    except (KeyError, TypeError, ValueError):
                        continue

        # Recent forming bars from parents / ticks (keep pull modest).
        docs_per_bar = max(2, step // 5) if step >= 60 else 2
        pull = min(20_000, max(limit * docs_per_bar, limit * 2, 500))
        query: dict[str, Any] = {field: {"$gt": 0}}
        if before is not None:
            from datetime import datetime, timezone

            query["ts"] = {"$lt": datetime.fromtimestamp(before, tz=timezone.utc)}
        tick_coll = client["anil_gold"]["tick_1s"]
        hist_coll = client["anil_gold"]["price_history"]
        rows: list[dict[str, Any]] = []
        if step < 60:
            rows = list(
                tick_coll.find(query, {field: 1, "ts": 1, "ts_unix": 1}).sort("ts", -1).limit(pull)
            )
            if rows:
                sources.append("anil_gold.tick_1s")
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
                    for doc in reversed(parents):
                        try:
                            ingest(
                                {
                                    "t": int(doc["t"]),
                                    "o": float(doc["o"]),
                                    "h": float(doc["h"]),
                                    "l": float(doc["l"]),
                                    "c": float(doc["c"]),
                                    "v": float(doc.get("v") or 0),
                                },
                                exact=(step <= 60) or exact_faraz,
                            )
                        except (KeyError, TypeError, ValueError):
                            continue
            recent = list(
                tick_coll.find(query, {field: 1, "ts": 1, "ts_unix": 1})
                .sort("ts", -1)
                .limit(min(4_000, pull))
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
            mongo_buckets = _bucket_price_rows(rows, field, step)
            for t0, bar in mongo_buckets.items():
                existing = buckets.get(t0)
                if existing is None:
                    buckets[t0] = bar
                else:
                    existing["h"] = max(existing["h"], bar["h"])
                    existing["l"] = min(existing["l"], bar["l"])
                    existing["c"] = bar["c"]
                    existing["v"] += bar["v"]
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

    # Live Faraz only when local store is thin (cold start).
    if faraz_res and len(buckets) < max(50, min(limit, 500) // 2):
        faraz_bars = await fetch_faraz_chart_history(session, channel, faraz_res)
        if faraz_bars:
            sources.append(f"faraz:{faraz_res}")
            await asyncio.to_thread(
                persist_faraz_bars,
                channel,
                faraz_res,
                faraz_bars,
                src="faraz-live",
            )
            exact = step == _parse_step_seconds(faraz_res) or (
                faraz_res == "1M" and step >= 30 * 86_400
            ) or (faraz_res == "1W" and step == 604_800) or (faraz_res == "1D" and step == 86_400)
            for bar in faraz_bars:
                t0 = int(bar["t"]) - (int(bar["t"]) % step)
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


async def start_background(app: web.Application) -> None:
    headers = {"X-API-Key": API_KEY} if API_KEY else {}
    session = aiohttp.ClientSession(headers=headers)
    app["session"] = session
    app["tasks"] = [
        asyncio.create_task(tv_quote_feeder()),
        asyncio.create_task(poll_mongo()),
        asyncio.create_task(poll_crypto(session)),
        asyncio.create_task(poll_forex(session)),
        asyncio.create_task(poll_iran_gold(session)),
        asyncio.create_task(poll_iran_materialize()),
        asyncio.create_task(poll_iran_bootstrap(session)),
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
