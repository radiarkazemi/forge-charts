"""TSETMC (Tehran Stock Exchange) history + live quotes for Forge.

Fetched on the Iran VPS — cdn.tsetmc.com is not reliably reachable from abroad.
The browser never talks to TSETMC. It uses the existing `/market-ticks` WebSocket
and `/iran-gold/tsetmc/*` HTTP routes (one cached upstream call, pushed only when
price or volume changes).

History defaults to قیمت تعدیل‌شده (backward-adjusted OHLC). Volume stays raw.
"""

from __future__ import annotations

import asyncio
import logging
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Awaitable, Callable
from urllib.parse import quote

import aiohttp

LOG = logging.getLogger("forge.tsetmc")

CDN = "https://cdn.tsetmc.com/api"
# Iran Standard Time, no DST.
TEHRAN = timezone(timedelta(hours=3, minutes=30))
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json,text/plain,*/*",
    "Referer": "https://www.tsetmc.com/",
    "Origin": "https://www.tsetmc.com",
}

# symbol (as typed) -> insCode
_INS: dict[str, str] = {}
# (insCode, adjust) -> (monotonic, daily bars as dicts)
_DAILY: dict[tuple[str, int], tuple[float, list[dict[str, float]]]] = {}
_DAILY_TTL = 20 * 60
# (insCode, date) -> (monotonic, trades)
_TAPE: dict[tuple[str, int], tuple[float, list[dict[str, float]]]] = {}
_TAPE_TTL = 20.0
_LAST_SENT: dict[str, tuple[float, float]] = {}

Broadcast = Callable[..., Awaitable[None]]


def _num(value: Any) -> float:
    try:
        n = float(value)
    except (TypeError, ValueError):
        return 0.0
    return n if n == n else 0.0


def _lists(payload: Any) -> list[Any]:
    if isinstance(payload, list):
        return payload
    if not isinstance(payload, dict):
        return []
    out: list[Any] = []
    for value in payload.values():
        if isinstance(value, list):
            out.extend(value)
        elif isinstance(value, dict):
            out.extend(_lists(value))
    return out


async def _get_json(session: aiohttp.ClientSession, url: str) -> Any:
    timeout = aiohttp.ClientTimeout(total=12)
    async with session.get(url, headers=HEADERS, timeout=timeout) as resp:
        if resp.status != 200:
            raise RuntimeError(f"tsetmc {resp.status} {url}")
        return await resp.json(content_type=None)


def _symbol_key(symbol: str) -> str:
    raw = symbol.strip()
    if raw.upper().startswith("TSE:"):
        raw = raw.split(":", 1)[1].strip()
    if raw.endswith(".U") or raw.endswith(".u"):
        raw = raw[:-2]
    return raw


def _adjust_flag(symbol: str, requested: int | None) -> int:
    if requested is not None:
        return 1 if int(requested) else 0
    raw = symbol.strip()
    if raw.endswith(".U") or raw.endswith(".u"):
        return 0
    return 1


async def search_hits(session: aiohttp.ClientSession, query: str) -> list[dict[str, str]]:
    key = query.strip()
    if not key:
        return []
    try:
        payload = await _get_json(session, f"{CDN}/Instrument/GetInstrumentSearch/{quote(key)}")
    except Exception as exc:
        LOG.warning("tsetmc search %s: %s", key, exc)
        return []
    hits: list[dict[str, str]] = []
    seen: set[str] = set()
    for row in _lists(payload):
        if not isinstance(row, dict):
            continue
        ins = str(row.get("insCode") or row.get("InsCode") or "").strip()
        name = str(row.get("lVal18AFC") or row.get("lVal18") or "").strip()
        title = str(row.get("lVal30") or row.get("lVal18AFC") or name).strip()
        if not ins or not name or name in seen:
            continue
        seen.add(name)
        _INS[name] = ins
        hits.append({"symbol": name, "name": title, "insCode": ins})
        if len(hits) >= 20:
            break
    return hits


async def resolve_ins(session: aiohttp.ClientSession, symbol: str) -> str | None:
    key = _symbol_key(symbol)
    if not key:
        return None
    cached = _INS.get(key)
    if cached:
        return cached
    url = f"{CDN}/Instrument/GetInstrumentSearch/{quote(key)}"
    try:
        payload = await _get_json(session, url)
    except Exception as exc:
        LOG.warning("tsetmc search %s: %s", key, exc)
        return None
    best: str | None = None
    best_score = -1
    for row in _lists(payload):
        if not isinstance(row, dict):
            continue
        ins = str(row.get("insCode") or row.get("InsCode") or "").strip()
        name = str(row.get("lVal18AFC") or row.get("lVal18") or row.get("symbol") or "").strip()
        if not ins or not name:
            continue
        flow = int(_num(row.get("flow") or row.get("Flow") or 0))
        score = 0
        if name == key:
            score += 10
        elif key in name:
            score += 4
        if flow in {0, 1, 2, 4}:
            score += 2
        if score > best_score:
            best_score = score
            best = ins
            _INS[name] = ins
    if best:
        _INS[key] = best
    return best


def _tehran_open(year: int, month: int, day: int) -> int:
    """09:00 Asia/Tehran as unix seconds."""
    local = datetime(year, month, day, 9, 0, tzinfo=TEHRAN)
    return int(local.timestamp())


def _parse_deven(value: Any) -> tuple[int, int, int] | None:
    text = str(int(_num(value))) if _num(value) else str(value or "").strip()
    if len(text) != 8 or not text.isdigit():
        return None
    return int(text[0:4]), int(text[4:6]), int(text[6:8])


def _daily_row(row: dict[str, Any]) -> dict[str, float] | None:
    date = _parse_deven(row.get("dEven") or row.get("DEven") or row.get("date"))
    if not date:
        return None
    high = _num(row.get("priceMax") or row.get("pMax") or row.get("high"))
    low = _num(row.get("priceMin") or row.get("pMin") or row.get("low"))
    open_ = _num(row.get("priceFirst") or row.get("pFirst") or row.get("open"))
    close = _num(row.get("pClosing") or row.get("pDrCotVal") or row.get("close"))
    if close <= 0 and open_ <= 0:
        return None
    if open_ <= 0:
        open_ = close
    if high <= 0:
        high = max(open_, close)
    if low <= 0:
        low = min(open_, close)
    high = max(high, open_, close)
    low = min(low, open_, close)
    y, m, d = date
    return {
        "t": float(_tehran_open(y, m, d)),
        "d": float(y * 10000 + m * 100 + d),
        "o": open_,
        "h": high,
        "l": low,
        "c": close,
        "v": _num(row.get("qTotTran5J") or row.get("qTotTran") or row.get("volume")),
    }


def _apply_adjustments(bars: list[dict[str, float]], events: list[dict[str, Any]]) -> None:
    """Backward-adjust OHLC. Each event is the price jump on that date."""
    parsed: list[tuple[int, float]] = []
    for row in events:
        if not isinstance(row, dict):
            continue
        date = _parse_deven(row.get("dEven") or row.get("DEven"))
        if not date:
            continue
        y, m, d = date
        day = y * 10000 + m * 100 + d
        adj = _num(row.get("pClosing") or row.get("adjPClosing") or row.get("pClosingAdjusted"))
        raw = _num(
            row.get("pClosingNotAdjusted")
            or row.get("pClosingNotAdj")
            or row.get("priceNotAdjusted")
        )
        if adj <= 0 or raw <= 0 or abs(adj - raw) < 1e-6:
            continue
        parsed.append((day, adj / raw))
    parsed.sort(key=lambda item: item[0], reverse=True)
    for day, factor in parsed:
        for bar in bars:
            if bar["d"] < day:
                bar["o"] *= factor
                bar["h"] *= factor
                bar["l"] *= factor
                bar["c"] *= factor


def _csv_daily(text: str) -> list[dict[str, float]]:
    """TSETMC chart export: `date,high,low,open,last,volume,close;` per day.

    `a=1` on that export is قیمت تعدیل‌شده. `a=0` is the raw print.
    """
    bars: list[dict[str, float]] = []
    for chunk in text.replace("\n", ";").split(";"):
        parts = [part.strip() for part in chunk.split(",") if part.strip()]
        if len(parts) < 7:
            continue
        date = _parse_deven(parts[0])
        if not date:
            continue
        high, low, open_, _last, volume, close = (_num(parts[i]) for i in (1, 2, 3, 4, 5, 6))
        if close <= 0 and open_ <= 0:
            continue
        if open_ <= 0:
            open_ = close
        if high <= 0:
            high = max(open_, close)
        if low <= 0:
            low = min(open_, close)
        y, m, d = date
        bars.append(
            {
                "t": float(_tehran_open(y, m, d)),
                "d": float(y * 10000 + m * 100 + d),
                "o": open_,
                "h": max(high, open_, close),
                "l": min(low, open_, close),
                "c": close,
                "v": volume,
            }
        )
    bars.sort(key=lambda bar: bar["t"])
    return bars


async def _text(session: aiohttp.ClientSession, url: str) -> str:
    timeout = aiohttp.ClientTimeout(total=12)
    async with session.get(url, headers=HEADERS, timeout=timeout) as resp:
        if resp.status != 200:
            raise RuntimeError(f"tsetmc {resp.status} {url}")
        return await resp.text()


async def _daily_bars(
    session: aiohttp.ClientSession, ins: str, adjust: int
) -> list[dict[str, float]]:
    key = (ins, adjust)
    now = time.monotonic()
    cached = _DAILY.get(key)
    if cached and now - cached[0] < _DAILY_TTL:
        return cached[1]
    flag = 1 if adjust else 0
    # One cached download. The chart export is already OHLC, adjusted or raw.
    chart_urls = [
        f"https://cdn.tsetmc.com/tsev2/chart/data/Financial.aspx?i={ins}&t=ph&a={flag}",
        f"https://members.tsetmc.com/tsev2/chart/data/Financial.aspx?i={ins}&t=ph&a={flag}",
    ]
    bars: list[dict[str, float]] = []
    for url in chart_urls:
        try:
            bars = _csv_daily(await _text(session, url))
        except Exception as exc:
            LOG.info("tsetmc chart %s: %s", ins, exc)
            bars = []
        if bars:
            break
    if not bars:
        payload = await _get_json(session, f"{CDN}/ClosingPrice/GetClosingPriceDailyList/{ins}/0")
        bars = [row for row in (_daily_row(item) for item in _lists(payload) if isinstance(item, dict)) if row]
        bars.sort(key=lambda bar: bar["t"])
        if adjust:
            try:
                adj_payload = await _get_json(session, f"{CDN}/ClosingPrice/GetPriceAdjustList/{ins}")
                events = adj_payload.get("priceAdjust") if isinstance(adj_payload, dict) else None
                _apply_adjustments(bars, events if isinstance(events, list) else [row for row in _lists(adj_payload) if isinstance(row, dict)])
            except Exception as exc:
                LOG.warning("tsetmc adjust %s: %s", ins, exc)
    by_t: dict[float, dict[str, float]] = {}
    for bar in bars:
        by_t[bar["t"]] = bar
    bars = [by_t[t] for t in sorted(by_t)]
    _DAILY[key] = (now, bars)
    return bars


def _aggregate(bars: list[dict[str, float]], interval: str) -> list[list[float]]:
    key = interval.upper()
    if key in {"1D", "D", "1"}:
        # "1" here is only used when the caller asked for daily. Intraday "1" is minutes.
        return [[b["t"], b["o"], b["h"], b["l"], b["c"], b["v"]] for b in bars]

    def bucket(bar: dict[str, float]) -> int:
        local = datetime.fromtimestamp(bar["t"], tz=TEHRAN)
        if key in {"1W", "W"}:
            monday = local.date() - timedelta(days=local.weekday())
            return _tehran_open(monday.year, monday.month, monday.day)
        # month
        return _tehran_open(local.year, local.month, 1)

    out: list[list[float]] = []
    cur: list[float] | None = None
    cur_key = -1
    for bar in bars:
        start = bucket(bar)
        if cur is None or start != cur_key:
            if cur is not None:
                out.append(cur)
            cur_key = start
            cur = [float(start), bar["o"], bar["h"], bar["l"], bar["c"], bar["v"]]
        else:
            cur[2] = max(cur[2], bar["h"])
            cur[3] = min(cur[3], bar["l"])
            cur[4] = bar["c"]
            cur[5] += bar["v"]
    if cur is not None:
        out.append(cur)
    return out


def _step_seconds(interval: str) -> int:
    raw = interval.strip()
    upper = raw.upper()
    if upper in {"1D", "D"}:
        return 86_400
    if upper in {"1W", "W"}:
        return 7 * 86_400
    if upper in {"1M", "M"}:
        return 30 * 86_400
    try:
        minutes = int(float(raw))
    except ValueError:
        return 86_400
    if minutes <= 0:
        return 60
    return minutes * 60


async def _tape(
    session: aiohttp.ClientSession, ins: str, deven: int
) -> list[dict[str, float]]:
    key = (ins, deven)
    now = time.monotonic()
    cached = _TAPE.get(key)
    if cached and now - cached[0] < _TAPE_TTL:
        return cached[1]
    url = f"{CDN}/Trade/GetTradeHistory/{ins}/{deven}/false"
    try:
        payload = await _get_json(session, url)
    except Exception as exc:
        LOG.info("tsetmc tape %s %s: %s", ins, deven, exc)
        return []
    trades: list[dict[str, float]] = []
    y, m, d = int(str(deven)[0:4]), int(str(deven)[4:6]), int(str(deven)[6:8])
    for row in _lists(payload):
        if not isinstance(row, dict):
            continue
        price = _num(row.get("pTran") or row.get("price") or row.get("pClosing"))
        qty = _num(row.get("qTitTran") or row.get("qTotTran5J") or row.get("volume") or 0)
        heven = int(_num(row.get("hEven") or row.get("HEven") or 0))
        if price <= 0 or heven <= 0:
            continue
        hh, mm, ss = heven // 10000, (heven // 100) % 100, heven % 100
        local = datetime(y, m, d, hh, mm, ss, tzinfo=TEHRAN)
        trades.append({"t": float(int(local.timestamp())), "p": price, "v": max(0.0, qty)})
    trades.sort(key=lambda t: t["t"])
    _TAPE[key] = (now, trades)
    return trades


def _bucket_trades(trades: list[dict[str, float]], step: int) -> list[list[float]]:
    out: list[list[float]] = []
    cur: list[float] | None = None
    cur_t = -1
    for trade in trades:
        start = int(trade["t"] // step) * step
        price = trade["p"]
        vol = trade["v"]
        if cur is None or start != cur_t:
            if cur is not None:
                out.append(cur)
            cur_t = start
            cur = [float(start), price, price, price, price, vol]
        else:
            cur[2] = max(cur[2], price)
            cur[3] = min(cur[3], price)
            cur[4] = price
            cur[5] += vol
    if cur is not None:
        out.append(cur)
    return out


def _recent_tehran_dates(n: int = 2) -> list[int]:
    now = datetime.now(TEHRAN)
    days: list[int] = []
    cursor = now
    while len(days) < n and (now - cursor).days < 8:
        if cursor.weekday() not in {3, 4}:  # Thu, Fri closed
            days.append(cursor.year * 10000 + cursor.month * 100 + cursor.day)
        cursor -= timedelta(days=1)
    return days


async def build_history(
    session: aiohttp.ClientSession,
    symbol: str,
    interval: str,
    adjust: int,
    limit: int,
    before: int | None,
) -> list[list[float]]:
    ins = await resolve_ins(session, symbol)
    if not ins:
        return []
    step = _step_seconds(interval)
    cap = max(1, min(int(limit or 500), 5000))
    if step >= 86_400:
        daily = await _daily_bars(session, ins, adjust)
        if before:
            daily = [bar for bar in daily if bar["t"] < before]
        packed = _aggregate(daily, "1D" if step < 7 * 86_400 else ("1W" if step < 28 * 86_400 else "1M"))
        return packed[-cap:]

    # Intraday: only the last two cash sessions (trade tape). Full daily history
    # stays on 1D/1W/1M so a 1m chart does not download every tick since 2006.
    dates = _recent_tehran_dates(2)
    trades: list[dict[str, float]] = []
    for deven in dates:
        trades.extend(await _tape(session, ins, deven))
    trades.sort(key=lambda t: t["t"])
    if before:
        trades = [t for t in trades if t["t"] < before]
    return _bucket_trades(trades, step)[-cap:]


async def _closing_info(session: aiohttp.ClientSession, ins: str) -> dict[str, float] | None:
    payload = await _get_json(session, f"{CDN}/ClosingPrice/GetClosingPriceInfo/{ins}")
    rows = [row for row in _lists(payload) if isinstance(row, dict)]
    row = rows[0] if rows else (payload if isinstance(payload, dict) else None)
    if not isinstance(row, dict):
        return None
    # Nested closingPriceInfo
    nested = row.get("closingPriceInfo")
    if isinstance(nested, dict):
        row = nested
    price = _num(row.get("pDrCotVal") or row.get("last") or row.get("pClosing"))
    if price <= 0:
        return None
    volume = _num(row.get("qTotTran5J") or row.get("qTotCap") or 0)
    heven = int(_num(row.get("hEven") or 0))
    deven = _parse_deven(row.get("dEven") or 0)
    if deven and heven > 0:
        y, m, d = deven
        hh, mm, ss = heven // 10000, (heven // 100) % 100, heven % 100
        ts = int(datetime(y, m, d, hh, mm, ss, tzinfo=TEHRAN).timestamp())
    else:
        ts = int(time.time())
    return {"price": price, "volume": volume, "ts": float(ts)}


async def poll_tsetmc(
    session: aiohttp.ClientSession,
    channels_fn: Callable[[], list[str]],
    broadcast: Broadcast,
) -> None:
    """Push live last-trade only for channels a chart is actually watching."""
    while True:
        try:
            channels = [c for c in channels_fn() if c.startswith("tse:")]
            if not channels:
                await asyncio.sleep(1.5)
                continue
            # One symbol per chart is the common case. Cap so a bug that
            # subscribes the whole board cannot stampede cdn.tsetmc.com.
            for channel in channels[:8]:
                symbol = channel.split(":", 1)[1]
                try:
                    ins = await resolve_ins(session, symbol)
                    if not ins:
                        continue
                    info = await _closing_info(session, ins)
                except Exception as exc:
                    LOG.debug("tsetmc live %s: %s", symbol, exc)
                    continue
                if not info:
                    continue
                prev = _LAST_SENT.get(channel)
                signature = (info["price"], info["volume"])
                if prev == signature:
                    continue
                _LAST_SENT[channel] = signature
                await broadcast(
                    channel,
                    info["price"],
                    int(info["ts"]),
                    info["volume"],
                    "tse",
                    force=True,
                )
        except asyncio.CancelledError:
            raise
        except Exception:
            LOG.exception("tsetmc poll")
        await asyncio.sleep(1.0)
