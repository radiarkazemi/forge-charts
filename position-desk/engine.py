"""Location math for a position you already intend to take.

The chart shows structure. This module keeps the running numbers a glance
does not: session volume profile, close-location delta, Kaufman efficiency,
realized-volatility rank, and how deep completed swings usually travel
against the trade before they work. The verdict checks whether the current
price and your stop sit in a sensible place relative to those numbers.

It does not invent an entry and it does not predict the next candle.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Literal

Side = Literal["long", "short", "flat"]
Verdict = Literal[
    "SEAT_OK",
    "REVIEW_STOP",
    "DO_NOT_CHASE",
    "THESIS_BROKEN",
    "WEAK_LOCATION",
    "LOCATION_VALID",
    "STAND_ASIDE",
    "SPREAD_STRESS",
    "WARMING",
]

TF_SECONDS = {"M1": 60, "M5": 300, "M15": 900, "H1": 3600}


@dataclass(frozen=True)
class Bar:
    time: int
    open: float
    high: float
    low: float
    close: float
    volume: float


@dataclass(frozen=True)
class Quote:
    time: int
    bid: float
    ask: float

    @property
    def mid(self) -> float:
        if self.bid <= 0 or self.ask <= 0:
            return max(self.bid, self.ask)
        return (self.bid + self.ask) / 2.0

    @property
    def spread(self) -> float:
        if self.bid <= 0 or self.ask <= 0:
            return 0.0
        return max(0.0, self.ask - self.bid)


@dataclass(frozen=True)
class Position:
    side: Side
    entry: float | None = None
    stop: float | None = None
    target: float | None = None


def clean_bars(bars: list[Bar]) -> list[Bar]:
    ordered = sorted(bars, key=lambda b: b.time)
    deduped: list[Bar] = []
    for bar in ordered:
        if deduped and deduped[-1].time == bar.time:
            deduped[-1] = bar
        else:
            deduped.append(bar)
    return deduped


def resample(bars: list[Bar], seconds: int) -> list[Bar]:
    buckets: dict[int, Bar] = {}
    order: list[int] = []
    for bar in clean_bars(bars):
        key = bar.time - (bar.time % seconds)
        existing = buckets.get(key)
        if existing is None:
            buckets[key] = Bar(key, bar.open, bar.high, bar.low, bar.close, bar.volume)
            order.append(key)
            continue
        buckets[key] = Bar(
            key,
            existing.open,
            max(existing.high, bar.high),
            min(existing.low, bar.low),
            bar.close,
            existing.volume + bar.volume,
        )
    return [buckets[key] for key in order]


def fill_timeframes(raw: dict[str, list[Bar]]) -> dict[str, list[Bar]]:
    cleaned = {tf: clean_bars(bars) for tf, bars in raw.items()}
    finest: list[Bar] = []
    finest_sec = 0
    for tf, sec in TF_SECONDS.items():
        series = cleaned.get(tf) or []
        if len(series) >= 10:
            finest = series
            finest_sec = sec
            break
    filled: dict[str, list[Bar]] = {}
    for tf, sec in TF_SECONDS.items():
        series = cleaned.get(tf) or []
        if len(series) >= 30:
            filled[tf] = series[-800:]
        elif finest and sec >= finest_sec and sec % finest_sec == 0:
            filled[tf] = resample(finest, sec)[-800:]
        else:
            filled[tf] = series[-800:]
    return filled


def true_ranges(bars: list[Bar]) -> list[float]:
    out: list[float] = []
    for i, bar in enumerate(bars):
        if i == 0:
            out.append(bar.high - bar.low)
        else:
            prev = bars[i - 1].close
            out.append(max(bar.high - bar.low, abs(bar.high - prev), abs(bar.low - prev)))
    return out


def atr(bars: list[Bar], n: int = 14) -> float | None:
    ranges = true_ranges(bars)
    if not ranges:
        return None
    if len(ranges) < n:
        return sum(ranges) / len(ranges)
    value = sum(ranges[:n]) / n
    for tr in ranges[n:]:
        value = (value * (n - 1) + tr) / n
    return value


def efficiency_ratio(closes: list[float], n: int = 10) -> float | None:
    if len(closes) < n + 1:
        return None
    change = abs(closes[-1] - closes[-1 - n])
    noise = sum(abs(closes[i] - closes[i - 1]) for i in range(len(closes) - n, len(closes)))
    if noise == 0:
        return 1.0
    return change / noise


def bar_delta(bar: Bar) -> float:
    rng = bar.high - bar.low
    if rng <= 0:
        return 0.0
    close_location = ((bar.close - bar.low) - (bar.high - bar.close)) / rng
    volume = bar.volume if bar.volume > 0 else 1.0
    return close_location * volume


def cvd(bars: list[Bar]) -> list[float]:
    total = 0.0
    out: list[float] = []
    for bar in bars:
        total += bar_delta(bar)
        out.append(total)
    return out


def buy_pressure(bars: list[Bar], n: int = 12) -> float | None:
    sample = bars[-n:]
    if not sample:
        return None
    positive = 0.0
    negative = 0.0
    for bar in sample:
        delta = bar_delta(bar)
        if delta > 0:
            positive += delta
        elif delta < 0:
            negative -= delta
    total = positive + negative
    if total <= 0:
        return 0.5
    return positive / total


def pivots(bars: list[Bar], k: int) -> tuple[list[int], list[int]]:
    highs: list[int] = []
    lows: list[int] = []
    if k < 1 or len(bars) < (k * 2 + 1):
        return highs, lows
    for i in range(k, len(bars) - k):
        high = bars[i].high
        low = bars[i].low
        left_right = [j for j in range(i - k, i + k + 1) if j != i]
        if all(high > bars[j].high for j in left_right):
            highs.append(i)
        if all(low < bars[j].low for j in left_right):
            lows.append(i)
    return highs, lows


def structure_bias(bars: list[Bar], k: int) -> tuple[int, str]:
    """Return +1 bullish, -1 bearish, 0 mixed, from the last two swings each side."""
    highs, lows = pivots(bars, k)
    if len(highs) < 2 or len(lows) < 2:
        return 0, "not enough confirmed swings"
    hh = bars[highs[-1]].high > bars[highs[-2]].high
    hl = bars[lows[-1]].low > bars[lows[-2]].low
    lh = bars[highs[-1]].high < bars[highs[-2]].high
    ll = bars[lows[-1]].low < bars[lows[-2]].low
    if hh and hl:
        return 1, "higher high and higher low"
    if lh and ll:
        return -1, "lower high and lower low"
    if hh and ll:
        return 0, "expanded range, no clean trend"
    if lh and hl:
        return 0, "compressed range, no clean trend"
    return 0, "mixed swings"


def last_dealing_range(bars: list[Bar], k: int) -> dict[str, float] | None:
    highs, lows = pivots(bars, k)
    if not highs or not lows:
        return None
    hi_i = highs[-1]
    lo_i = lows[-1]
    hi = bars[hi_i].high
    lo = bars[lo_i].low
    if hi <= lo:
        return None
    return {
        "low": lo,
        "high": hi,
        "eq": (hi + lo) / 2.0,
        "low_time": bars[lo_i].time,
        "high_time": bars[hi_i].time,
    }


def session_bars(bars: list[Bar]) -> list[Bar]:
    if not bars:
        return []
    day = bars[-1].time - (bars[-1].time % 86400)
    scoped = [bar for bar in bars if bar.time >= day]
    return scoped or bars[-min(len(bars), 48) :]


def anchored_vwap(bars: list[Bar]) -> tuple[float | None, float | None]:
    if not bars:
        return None, None
    pv = 0.0
    volume = 0.0
    typicals: list[tuple[float, float]] = []
    for bar in bars:
        typical = (bar.high + bar.low + bar.close) / 3.0
        vol = bar.volume if bar.volume > 0 else 1.0
        pv += typical * vol
        volume += vol
        typicals.append((typical, vol))
    if volume <= 0:
        return None, None
    vwap = pv / volume
    variance = sum(vol * (typical - vwap) ** 2 for typical, vol in typicals) / volume
    return vwap, math.sqrt(variance)


def volume_profile(bars: list[Bar], bins: int = 42) -> dict[str, float | str] | None:
    if len(bars) < 8:
        return None
    lo = min(bar.low for bar in bars)
    hi = max(bar.high for bar in bars)
    if hi <= lo:
        return {"poc": lo, "val": lo, "vah": hi, "where": "fair"}
    width = (hi - lo) / bins
    hist = [0.0] * bins
    for bar in bars:
        i0 = max(0, min(bins - 1, int((bar.low - lo) / width)))
        i1 = max(0, min(bins - 1, int((min(bar.high, hi - 1e-12) - lo) / width)))
        if i1 < i0:
            i0, i1 = i1, i0
        share = (bar.volume if bar.volume > 0 else 1.0) / (i1 - i0 + 1)
        for i in range(i0, i1 + 1):
            hist[i] += share
    total = sum(hist)
    if total <= 0:
        return None
    poc_i = max(range(bins), key=lambda i: hist[i])
    covered = hist[poc_i]
    left = right = poc_i
    while covered / total < 0.70 and (left > 0 or right < bins - 1):
        left_vol = hist[left - 1] if left > 0 else -1.0
        right_vol = hist[right + 1] if right < bins - 1 else -1.0
        if right_vol >= left_vol:
            right += 1
            covered += hist[right]
        else:
            left -= 1
            covered += hist[left]

    def mid(index: int) -> float:
        return lo + (index + 0.5) * width

    return {
        "poc": mid(poc_i),
        "val": lo + left * width,
        "vah": lo + (right + 1) * width,
    }


def profile_where(price: float, profile: dict[str, float | str] | None) -> str:
    if profile is None:
        return "unknown"
    val = float(profile["val"])
    vah = float(profile["vah"])
    if price < val:
        return "discount"
    if price > vah:
        return "premium"
    return "value"


def open_fvgs(bars: list[Bar], direction: int) -> list[tuple[float, float]]:
    zones: list[tuple[float, float]] = []
    for i in range(2, len(bars)):
        if direction > 0 and bars[i].low > bars[i - 2].high:
            bot = bars[i - 2].high
            top = bars[i].low
            if any(bars[j].low <= bot for j in range(i + 1, len(bars))):
                continue
            zones.append((bot, top))
        elif direction < 0 and bars[i].high < bars[i - 2].low:
            bot = bars[i].high
            top = bars[i - 2].low
            if any(bars[j].high >= top for j in range(i + 1, len(bars))):
                continue
            zones.append((bot, top))
    return zones[-6:]


def open_order_blocks(bars: list[Bar], direction: int) -> list[tuple[float, float]]:
    zones: list[tuple[float, float]] = []
    for i in range(2, len(bars)):
        bullish_gap = direction > 0 and bars[i].low > bars[i - 2].high
        bearish_gap = direction < 0 and bars[i].high < bars[i - 2].low
        if not bullish_gap and not bearish_gap:
            continue
        for j in range(i - 1, max(-1, i - 8), -1):
            bearish_candle = bars[j].close < bars[j].open
            bullish_candle = bars[j].close > bars[j].open
            if direction > 0 and bearish_candle:
                bot, top = bars[j].low, bars[j].high
                if any(bar.low < bot for bar in bars[i + 1 :]):
                    break
                zones.append((bot, top))
                break
            if direction < 0 and bullish_candle:
                bot, top = bars[j].low, bars[j].high
                if any(bar.high > top for bar in bars[i + 1 :]):
                    break
                zones.append((bot, top))
                break
    return zones[-6:]


def touches(price: float, zones: list[tuple[float, float]], pad: float) -> tuple[float, float] | None:
    for bot, top in reversed(zones):
        if (bot - pad) <= price <= (top + pad):
            return bot, top
    return None


def realized_vol_percentile(bars: list[Bar], short: int = 20, sample: int = 120) -> float | None:
    if len(bars) < short + 5:
        return None
    returns: list[float] = []
    for i in range(1, len(bars)):
        prev = bars[i - 1].close
        if prev <= 0 or bars[i].close <= 0:
            returns.append(0.0)
        else:
            returns.append(math.log(bars[i].close / prev))

    def deviation(values: list[float]) -> float:
        if len(values) < 2:
            return 0.0
        mean = sum(values) / len(values)
        return math.sqrt(sum((value - mean) ** 2 for value in values) / (len(values) - 1))

    window = [deviation(returns[end - short : end]) for end in range(short, len(returns) + 1)]
    if not window:
        return None
    recent = window[-sample:]
    current = window[-1]
    return sum(1 for value in recent if value <= current) / len(recent)


def percentile(values: list[float], p: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    if len(ordered) == 1:
        return ordered[0]
    rank = (len(ordered) - 1) * p
    lo = math.floor(rank)
    hi = math.ceil(rank)
    if lo == hi:
        return ordered[lo]
    weight = rank - lo
    return ordered[lo] * (1 - weight) + ordered[hi] * weight


def adverse_excursions(bars: list[Bar], direction: int, k: int = 2, horizon: int = 36) -> list[float]:
    """How many ATRs price ran against a swing before it made +1 ATR.

    The pivot is only used once it is confirmed (k bars later), so the path
    measured is the part a trader could already have seen.
    """
    unit = atr(bars, 14)
    if unit is None or unit <= 0:
        return []
    highs, lows = pivots(bars, k)
    anchors = lows if direction > 0 else highs
    excursions: list[float] = []
    for index in anchors:
        start = index + k
        if start >= len(bars) - 1:
            continue
        anchor = bars[index].low if direction > 0 else bars[index].high
        worst = 0.0
        reached = False
        last = min(len(bars), start + horizon)
        for j in range(start, last):
            if direction > 0:
                worst = max(worst, (anchor - bars[j].low) / unit)
                if bars[j].high >= anchor + unit:
                    reached = True
                    break
            else:
                worst = max(worst, (bars[j].high - anchor) / unit)
                if bars[j].low <= anchor - unit:
                    reached = True
                    break
        if reached:
            excursions.append(worst)
    return excursions[-40:]


def cvd_divergence(bars: list[Bar], k: int = 2) -> int:
    """+1 bullish divergence, -1 bearish divergence, 0 none."""
    series = cvd(bars)
    highs, lows = pivots(bars, k)
    if len(highs) >= 2:
        a, b = highs[-2], highs[-1]
        if bars[b].high > bars[a].high and series[b] < series[a]:
            return -1
    if len(lows) >= 2:
        a, b = lows[-2], lows[-1]
        if bars[b].low < bars[a].low and series[b] > series[a]:
            return 1
    return 0


def _fmt(price: float, digits: int) -> str:
    return f"{price:.{max(0, min(digits, 8))}f}"


def _score_side(
    *,
    side: Literal["long", "short"],
    price: float,
    atr_value: float,
    structure: int,
    dealing: dict[str, float] | None,
    zone: tuple[float, float] | None,
    pressure: float | None,
    divergence: int,
    er_h1: float | None,
    rv_pct: float | None,
    vwap_z: float | None,
    stop_distance_atr: float | None,
    heat_p70: float | None,
    heat_known: bool,
    stop_valid: bool | None,
) -> dict:
    direction = 1 if side == "long" else -1
    score = 42
    reasons: list[dict[str, str]] = []
    in_correct_half = False

    if structure == direction:
        score += 24
        reasons.append({"tone": "good", "text": "Confirmed swings agree with this side."})
    elif structure == -direction:
        score -= 24
        reasons.append({"tone": "bad", "text": "Confirmed swings point the other way."})
    else:
        reasons.append({"tone": "neutral", "text": "Swings are mixed or not confirmed yet, so structure is not backing the trade."})

    if dealing is not None and dealing["high"] > dealing["low"]:
        span = dealing["high"] - dealing["low"]
        # 0 at the low, 1 at the high
        location = (price - dealing["low"]) / span
        in_discount = location <= 0.48
        in_premium = location >= 0.52
        if side == "long" and in_discount:
            in_correct_half = True
            score += 16
            reasons.append({"tone": "good", "text": "Price is in the discount half of the latest swing."})
        elif side == "short" and in_premium:
            in_correct_half = True
            score += 16
            reasons.append({"tone": "good", "text": "Price is in the premium half of the latest swing."})
        elif abs(location - 0.5) <= 0.08:
            score += 4
            reasons.append({"tone": "neutral", "text": "Price is sitting on equilibrium, not clearly in the better half."})
        else:
            score -= 12
            half = "premium" if location > 0.5 else "discount"
            reasons.append({"tone": "bad", "text": f"Price is in the {half} half, which is the expensive side for a {side}."})
    else:
        reasons.append({"tone": "neutral", "text": "No confirmed swing range yet, so discount and premium are unknown."})

    if zone is not None:
        score += 18
        reasons.append({
            "tone": "good",
            "text": f"Price is inside an unfilled {side} imbalance or the order block that created it.",
        })
    else:
        reasons.append({"tone": "neutral", "text": "Price is not inside an unfilled imbalance in this direction."})

    against = divergence == -direction
    with_flow = pressure is not None and ((side == "long" and pressure >= 0.56) or (side == "short" and pressure <= 0.44))
    if against:
        score -= 14
        reasons.append({"tone": "bad", "text": "Close-location delta diverges against this side at the last two swings."})
    elif with_flow:
        score += 12
        reasons.append({"tone": "good", "text": "Recent bar delta, from where the close sat in each bar, agrees with this side."})
    else:
        reasons.append({"tone": "neutral", "text": "Recent bar delta is balanced, so flow is not confirming."})

    if er_h1 is not None and er_h1 >= 0.35 and structure == direction:
        score += 10
        reasons.append({"tone": "good", "text": f"Hourly efficiency is {er_h1:.2f}, so the trend is covering ground rather than chopping."})
    elif er_h1 is not None and er_h1 < 0.18:
        score -= 8
        reasons.append({"tone": "bad", "text": f"Hourly efficiency is {er_h1:.2f}. Price is rotating more than it is travelling."})

    if rv_pct is not None and rv_pct >= 0.92:
        score -= 8
        rank = int(round(rv_pct * 100))
        suffix = "th"
        if rank % 100 not in (11, 12, 13):
            suffix = {1: "st", 2: "nd", 3: "rd"}.get(rank % 10, "th")
        reasons.append({"tone": "bad", "text": f"Realized volatility is in the {rank}{suffix} percentile of its own history. The tape is unusually wild."})

    if vwap_z is not None and ((side == "long" and vwap_z > 1.75) or (side == "short" and vwap_z < -1.75)):
        score -= 20
        reasons.append({"tone": "bad", "text": f"Session VWAP z-score is {vwap_z:+.2f}. This side is extended away from value."})

    stop_inside_heat = False
    if stop_valid is False:
        score -= 30
        reasons.append({"tone": "bad", "text": "The stop is on the wrong side of the entry."})
    elif stop_distance_atr is not None and heat_known and heat_p70 is not None:
        if stop_distance_atr + 1e-9 < heat_p70:
            stop_inside_heat = True
            score -= 18
            reasons.append({
                "tone": "bad",
                "text": (
                    f"Stop is {stop_distance_atr:.2f} ATR away. Completed swings on this feed "
                    f"usually ran {heat_p70:.2f} ATR against the trade before making +1 ATR."
                ),
            })
        elif stop_distance_atr <= 3.5:
            score += 12
            reasons.append({
                "tone": "good",
                "text": (
                    f"Stop is {stop_distance_atr:.2f} ATR away, beyond the {heat_p70:.2f} ATR heat "
                    "seen on completed swings, and still inside 3.5 ATR."
                ),
            })
        else:
            score -= 6
            reasons.append({
                "tone": "neutral",
                "text": f"Stop is {stop_distance_atr:.2f} ATR away. It clears the noise, but the risk is wide.",
            })
    elif stop_distance_atr is not None:
        if stop_distance_atr < 0.8:
            stop_inside_heat = True
            score -= 16
            reasons.append({
                "tone": "bad",
                "text": (
                    f"Stop is only {stop_distance_atr:.2f} ATR away, and there are not enough "
                    "completed swings yet to justify anything tighter than 0.8 ATR."
                ),
            })
        elif stop_distance_atr <= 3.2:
            score += 6
            reasons.append({
                "tone": "neutral",
                "text": f"Stop is {stop_distance_atr:.2f} ATR away. Swing-heat history is still short, so this is only a working range.",
            })

    capped = max(0, min(100, int(round(score))))
    if any(reason["tone"] != "good" for reason in reasons):
        capped = min(capped, 88)
    return {
        "score": capped,
        "reasons": reasons,
        "structure_agrees": structure == direction,
        "in_correct_half": in_correct_half,
        "at_zone": zone is not None,
        "stop_inside_heat": stop_inside_heat,
    }


def analyze(
    raw_bars: dict[str, list[Bar]],
    quote: Quote | None,
    position: Position | None,
    *,
    digits: int = 5,
    median_spread: float | None = None,
    feed_age_sec: float | None = None,
) -> dict:
    frames = fill_timeframes(raw_bars)
    execution = frames.get("M5") or frames.get("M15") or frames.get("M1") or frames.get("H1") or []
    higher = execution
    structure_k = 2
    for timeframe, pivot_k in (("H1", 3), ("M15", 2), ("M5", 2)):
        candidate = frames.get(timeframe) or []
        if len(candidate) >= 40:
            higher = candidate
            structure_k = pivot_k
            break
    if len(execution) < 40 or feed_age_sec is None:
        return {
            "verdict": "WARMING",
            "headline": "Waiting for bars",
            "summary": "The desk needs a live quote and at least 40 execution bars before it will score a location.",
            "score": 0,
            "side": position.side if position else "flat",
            "reasons": [],
            "metrics": {"bars": len(execution), "feed_age_sec": feed_age_sec},
            "spark": [{"t": bar.time, "c": bar.close} for bar in execution[-80:]],
        }

    price = quote.mid if quote and quote.mid > 0 else execution[-1].close
    atr_value = atr(execution, 14) or 0.0
    structure, structure_text = structure_bias(higher, structure_k)
    dealing = last_dealing_range(higher, structure_k)
    divergence = cvd_divergence(execution, 2)
    pressure = buy_pressure(execution, 12)
    er_h1 = efficiency_ratio([bar.close for bar in higher], 10)
    er_m15 = efficiency_ratio([bar.close for bar in (frames.get("M15") or execution)], 10)
    rv_pct = realized_vol_percentile(execution)
    day = session_bars(frames.get("M1") or execution)
    vwap, vwap_std = anchored_vwap(day)
    vwap_z = None
    if vwap is not None and vwap_std is not None and vwap_std > 0:
        vwap_z = (price - vwap) / vwap_std
    profile = volume_profile(execution[-120:])
    where = profile_where(price, profile)
    pad = (atr_value or 0.0) * 0.15
    long_zone = touches(price, open_fvgs(execution, 1) + open_order_blocks(execution, 1), pad)
    short_zone = touches(price, open_fvgs(execution, -1) + open_order_blocks(execution, -1), pad)
    long_excursions = adverse_excursions(execution, 1)
    short_excursions = adverse_excursions(execution, -1)
    long_heat = percentile(long_excursions, 0.70)
    short_heat = percentile(short_excursions, 0.70)
    long_heat_known = len(long_excursions) >= 5 and long_heat is not None and long_heat >= 0.2
    short_heat_known = len(short_excursions) >= 5 and short_heat is not None and short_heat >= 0.2

    spread = quote.spread if quote else 0.0
    spread_ratio = None
    if median_spread is not None and median_spread > 0 and spread > 0:
        spread_ratio = spread / median_spread
    spread_stressed = spread_ratio is not None and spread_ratio >= 2.5

    pos = position or Position("flat")
    side: Side = pos.side
    entry = pos.entry
    stop = pos.stop
    target = pos.target

    def geometry(for_side: Literal["long", "short"]) -> tuple[float | None, bool | None, bool]:
        if side != for_side or entry is None or stop is None or atr_value <= 0:
            return None, None, False
        direction = 1 if for_side == "long" else -1
        risk = (entry - stop) * direction
        valid = risk > 0
        distance = abs(entry - stop) / atr_value
        favorable = (price - entry) * direction
        banked = favorable > atr_value
        return distance, valid, banked

    long_dist, long_valid, long_banked = geometry("long")
    short_dist, short_valid, short_banked = geometry("short")

    long_read = _score_side(
        side="long",
        price=price,
        atr_value=atr_value,
        structure=structure,
        dealing=dealing,
        zone=long_zone,
        pressure=pressure,
        divergence=divergence,
        er_h1=er_h1,
        rv_pct=rv_pct,
        vwap_z=vwap_z,
        stop_distance_atr=None if long_banked else long_dist,
        heat_p70=None if long_banked else long_heat,
        heat_known=long_heat_known and not long_banked,
        stop_valid=long_valid,
    )
    short_read = _score_side(
        side="short",
        price=price,
        atr_value=atr_value,
        structure=structure,
        dealing=dealing,
        zone=short_zone,
        pressure=pressure,
        divergence=divergence,
        er_h1=er_h1,
        rv_pct=rv_pct,
        vwap_z=vwap_z,
        stop_distance_atr=None if short_banked else short_dist,
        heat_p70=None if short_banked else short_heat,
        heat_known=short_heat_known and not short_banked,
        stop_valid=short_valid,
    )
    long_score, long_reasons = long_read["score"], long_read["reasons"]
    short_score, short_reasons = short_read["score"], short_read["reasons"]

    checked: Literal["long", "short"]
    if side in ("long", "short"):
        checked = side
    elif long_score >= short_score + 8:
        checked = "long"
    elif short_score >= long_score + 8:
        checked = "short"
    else:
        checked = "long" if long_score >= short_score else "short"

    score = long_score if checked == "long" else short_score
    reasons = long_reasons if checked == "long" else short_reasons
    read = long_read if checked == "long" else short_read
    zone = long_zone if checked == "long" else short_zone
    heat = long_heat if checked == "long" else short_heat
    dist = long_dist if checked == "long" else short_dist
    valid = long_valid if checked == "long" else short_valid
    banked = long_banked if checked == "long" else short_banked
    located = read["in_correct_half"] or read["at_zone"]

    chased = False
    if vwap_z is not None:
        chased = (checked == "long" and vwap_z > 1.75) or (checked == "short" and vwap_z < -1.75)

    through_stop = False
    lost_swing = False
    if side == "long" and stop is not None and price < stop:
        through_stop = True
    if side == "short" and stop is not None and price > stop:
        through_stop = True
    if side == "long" and dealing is not None and price < dealing["low"]:
        lost_swing = True
    if side == "short" and dealing is not None and price > dealing["high"]:
        lost_swing = True

    stop_inside_heat = side in ("long", "short") and read["stop_inside_heat"] and not banked
    missing_stop = side in ("long", "short") and (entry is None or stop is None)

    verdict: Verdict
    if spread_stressed and not through_stop:
        verdict = "SPREAD_STRESS"
    elif side in ("long", "short") and (through_stop or lost_swing or valid is False):
        verdict = "THESIS_BROKEN"
    elif stop_inside_heat:
        verdict = "REVIEW_STOP"
    elif chased and (side == checked or side == "flat"):
        verdict = "DO_NOT_CHASE"
    elif side in ("long", "short") and missing_stop:
        verdict = "WEAK_LOCATION"
    elif side in ("long", "short") and score >= 70 and valid and read["structure_agrees"] and located:
        verdict = "SEAT_OK"
    elif side in ("long", "short"):
        verdict = "WEAK_LOCATION"
    elif score >= 70 and read["structure_agrees"] and located and not chased:
        verdict = "LOCATION_VALID"
    else:
        verdict = "STAND_ASIDE"

    headlines = {
        "SEAT_OK": "Seat is clean",
        "REVIEW_STOP": "Stop sits inside normal heat",
        "DO_NOT_CHASE": "Location is extended",
        "THESIS_BROKEN": "The level that held this idea is gone",
        "WEAK_LOCATION": "Position is on, location is thin",
        "LOCATION_VALID": "A location is available",
        "STAND_ASIDE": "No clean location",
        "SPREAD_STRESS": "Spread is too wide to trust the price",
        "WARMING": "Waiting for bars",
    }

    rr = None
    if entry is not None and stop is not None and target is not None and abs(entry - stop) > 0:
        rr = abs(target - entry) / abs(entry - stop)
        if side in ("long", "short") and rr < 1.2:
            reasons = [*reasons, {"tone": "neutral", "text": f"Reward to risk against your target is {rr:.2f}." }]

    if through_stop:
        reasons = [{"tone": "bad", "text": "Live price is already through your stop."}, *reasons]
    elif lost_swing and side in ("long", "short"):
        reasons = [{"tone": "bad", "text": "Price has left the swing that defined this side."}, *reasons]
    if missing_stop:
        reasons = [{"tone": "neutral", "text": "Add entry and stop so the desk can compare them with typical heat."}, *reasons]
    if spread_stressed and spread_ratio is not None:
        reasons = [{"tone": "bad", "text": f"Spread is {spread_ratio:.1f}× its recent median."}, *reasons]

    zone_text = None
    if zone is not None:
        zone_text = f"{_fmt(zone[0], digits)} – {_fmt(zone[1], digits)}"

    heat_known = long_heat_known if checked == "long" else short_heat_known
    summary = _summary(
        verdict=verdict,
        side=side,
        checked=checked,
        price=price,
        digits=digits,
        structure_text=structure_text,
        where=where,
        vwap_z=vwap_z,
        heat=heat if heat_known else None,
        dist=dist,
        zone_text=zone_text,
    )

    metrics = {
        "price": price,
        "atr": atr_value,
        "structure": structure,
        "structure_text": structure_text,
        "dealing_low": None if dealing is None else dealing["low"],
        "dealing_high": None if dealing is None else dealing["high"],
        "dealing_eq": None if dealing is None else dealing["eq"],
        "efficiency_h1": er_h1,
        "efficiency_m15": er_m15,
        "vwap": vwap,
        "vwap_z": vwap_z,
        "rv_percentile": rv_pct,
        "profile_where": where,
        "poc": None if profile is None else profile["poc"],
        "val": None if profile is None else profile["val"],
        "vah": None if profile is None else profile["vah"],
        "buy_pressure": pressure,
        "divergence": divergence,
        "heat_p70_atr": heat if heat_known else None,
        "heat_samples": len(long_excursions if checked == "long" else short_excursions),
        "stop_atr": dist,
        "spread": spread,
        "spread_ratio": spread_ratio,
        "rr": rr,
        "long_score": long_score,
        "short_score": short_score,
        "zone": zone_text,
        "bars_m5": len(frames.get("M5") or []),
        "bars_h1": len(frames.get("H1") or []),
        "feed_age_sec": feed_age_sec,
    }
    return {
        "verdict": verdict,
        "headline": headlines[verdict],
        "summary": summary,
        "score": score,
        "side": side,
        "checked_side": checked,
        "reasons": reasons,
        "metrics": metrics,
        "spark": [{"t": bar.time, "c": bar.close} for bar in execution[-80:]],
    }


def _summary(
    *,
    verdict: Verdict,
    side: Side,
    checked: str,
    price: float,
    digits: int,
    structure_text: str,
    where: str,
    vwap_z: float | None,
    heat: float,
    dist: float | None,
    zone_text: str | None,
) -> str:
    z_text = "unknown" if vwap_z is None else f"{vwap_z:+.2f}"
    heat_text = "not enough completed swings yet" if heat is None else f"{heat:.2f} ATR"
    focus = side if side in ("long", "short") else checked
    bits = [
        f"Swings: {structure_text}.",
        f"Price {_fmt(price, digits)} is {where} on the recent volume profile.",
        f"Session VWAP z-score is {z_text}.",
        f"Typical heat before a swing made +1 ATR is {heat_text}.",
    ]
    if zone_text:
        bits.append(f"Active zone {zone_text}.")
    if dist is not None:
        bits.append(f"Your stop distance is {dist:.2f} ATR.")
    tail = {
        "SEAT_OK": f"The {focus} location clears structure, the better half or an open imbalance, and stop distance.",
        "REVIEW_STOP": "The idea may be fine, but this stop is tighter than the market's usual counter-move.",
        "DO_NOT_CHASE": f"A {focus} from here is late relative to session value. Wait for price to come back.",
        "THESIS_BROKEN": "Do not add. The swing or the stop that justified the position has failed.",
        "WEAK_LOCATION": "The position is open, and the live numbers do not agree with it strongly enough.",
        "LOCATION_VALID": f"If your own read is a {focus}, the live numbers currently agree with that location.",
        "STAND_ASIDE": "Nothing in the live feed is offering a clean seat. Stand aside until it does.",
        "SPREAD_STRESS": "The quote is too wide for the location math to be trusted.",
        "WARMING": "Waiting for bars.",
    }[verdict]
    return " ".join(bits + [tail])
