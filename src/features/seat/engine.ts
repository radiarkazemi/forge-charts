/**
 * Location math for a ticket on the Forge chart.
 * Mirrors position-desk/engine.py so the dev app and the desk agree.
 * It checks where price sits. It does not place an order.
 */

import type { Bar } from "@/domain";

export type SeatSide = "long" | "short" | "flat";
export type SeatVerdict =
  | "SEAT_OK"
  | "REVIEW_STOP"
  | "DO_NOT_CHASE"
  | "THESIS_BROKEN"
  | "WEAK_LOCATION"
  | "LOCATION_VALID"
  | "STAND_ASIDE"
  | "SPREAD_STRESS"
  | "WARMING";

export interface SeatQuote {
  readonly time: number;
  readonly bid: number;
  readonly ask: number;
}

export interface SeatPosition {
  readonly side: SeatSide;
  readonly entry: number | null;
  readonly stop: number | null;
  readonly target: number | null;
  readonly placedAt?: number | null;
}

export interface SeatReason {
  readonly tone: "good" | "bad" | "neutral";
  readonly text: string;
}

export interface SeatMetrics {
  readonly price?: number;
  readonly atr?: number;
  readonly structure?: number;
  readonly structureText?: string;
  readonly dealingLow?: number | null;
  readonly dealingHigh?: number | null;
  readonly dealingEq?: number | null;
  readonly efficiencyH1?: number | null;
  readonly efficiencyM15?: number | null;
  readonly vwap?: number | null;
  readonly vwapZ?: number | null;
  readonly rvPercentile?: number | null;
  readonly profileWhere?: string;
  readonly poc?: number | null;
  readonly val?: number | null;
  readonly vah?: number | null;
  readonly buyPressure?: number | null;
  readonly divergence?: number;
  readonly heatP70Atr?: number | null;
  readonly stopAtr?: number | null;
  readonly spread?: number;
  readonly rr?: number | null;
  readonly longScore?: number;
  readonly shortScore?: number;
  readonly zone?: string | null;
  readonly bars?: number;
  readonly feedAgeSec?: number | null;
}

export interface SeatDesk {
  readonly verdict: SeatVerdict;
  readonly headline: string;
  readonly summary: string;
  readonly score: number;
  readonly side: SeatSide;
  readonly checkedSide?: SeatSide;
  readonly reasons: readonly SeatReason[];
  readonly metrics: SeatMetrics;
  readonly spark: readonly { t: number; c: number }[];
}

const TF_SECONDS = { M1: 60, M5: 300, M15: 900, H1: 3600 } as const;
type Tf = keyof typeof TF_SECONDS;

interface DealingRange {
  readonly low: number;
  readonly high: number;
  readonly eq: number;
}

interface VolumeBinProfile {
  readonly poc: number;
  readonly val: number;
  readonly vah: number;
}

interface SideRead {
  readonly score: number;
  readonly reasons: SeatReason[];
  readonly structureAgrees: boolean;
  readonly inCorrectHalf: boolean;
  readonly atZone: boolean;
  readonly stopInsideHeat: boolean;
}

function cleanBars(bars: readonly Bar[]): Bar[] {
  const ordered = [...bars].sort((a, b) => a.time - b.time);
  const deduped: Bar[] = [];
  for (const bar of ordered) {
    const last = deduped.at(-1);
    if (last && last.time === bar.time) deduped[deduped.length - 1] = bar;
    else deduped.push(bar);
  }
  return deduped;
}

function resample(bars: readonly Bar[], seconds: number): Bar[] {
  const buckets = new Map<number, Bar>();
  const order: number[] = [];
  for (const bar of cleanBars(bars)) {
    const key = bar.time - (bar.time % seconds);
    const existing = buckets.get(key);
    if (!existing) {
      buckets.set(key, { time: key, open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: bar.volume });
      order.push(key);
      continue;
    }
    buckets.set(key, {
      time: key,
      open: existing.open,
      high: Math.max(existing.high, bar.high),
      low: Math.min(existing.low, bar.low),
      close: bar.close,
      volume: existing.volume + bar.volume,
    });
  }
  return order.map((key) => buckets.get(key)!);
}

function fillTimeframes(raw: Partial<Record<Tf, readonly Bar[]>>): Record<Tf, Bar[]> {
  const cleaned = {
    M1: cleanBars(raw.M1 ?? []),
    M5: cleanBars(raw.M5 ?? []),
    M15: cleanBars(raw.M15 ?? []),
    H1: cleanBars(raw.H1 ?? []),
  };
  let finest: Bar[] = [];
  let finestSec = 0;
  for (const tf of Object.keys(TF_SECONDS) as Tf[]) {
    const series = cleaned[tf];
    if (series.length >= 10) {
      finest = series;
      finestSec = TF_SECONDS[tf];
      break;
    }
  }
  const filled = {} as Record<Tf, Bar[]>;
  for (const tf of Object.keys(TF_SECONDS) as Tf[]) {
    const sec = TF_SECONDS[tf];
    const series = cleaned[tf];
    if (series.length >= 30) filled[tf] = series.slice(-800);
    else if (finest.length && sec >= finestSec && sec % finestSec === 0) filled[tf] = resample(finest, sec).slice(-800);
    else filled[tf] = series.slice(-800);
  }
  return filled;
}

function atr(bars: readonly Bar[], n = 14): number | null {
  if (!bars.length) return null;
  const ranges: number[] = [];
  for (let i = 0; i < bars.length; i += 1) {
    const bar = bars[i]!;
    if (i === 0) ranges.push(bar.high - bar.low);
    else {
      const prev = bars[i - 1]!.close;
      ranges.push(Math.max(bar.high - bar.low, Math.abs(bar.high - prev), Math.abs(bar.low - prev)));
    }
  }
  if (ranges.length < n) return ranges.reduce((sum, value) => sum + value, 0) / ranges.length;
  let value = ranges.slice(0, n).reduce((sum, item) => sum + item, 0) / n;
  for (const tr of ranges.slice(n)) value = (value * (n - 1) + tr) / n;
  return value;
}

function scanProgress(
  bars: readonly Bar[],
  side: "long" | "short",
  entry: number,
  stop: number,
  target: number,
): "target" | "stop" | "open" {
  let start = -1;
  for (let index = bars.length - 1; index >= 0; index -= 1) {
    const bar = bars[index];
    if (bar.low <= entry && bar.high >= entry) {
      start = index;
      break;
    }
  }
  if (start < 0) return "open";
  for (const bar of bars.slice(start)) {
    const hitStop = side === "short" ? bar.high >= stop : bar.low <= stop;
    const hitTarget = side === "short" ? bar.low <= target : bar.high >= target;
    if (hitStop && hitTarget) continue;
    if (hitStop) return "stop";
    if (hitTarget) return "target";
  }
  return "open";
}

function tradeProgress(
  bars: readonly Bar[],
  side: "long" | "short",
  entry: number,
  stop: number,
  target: number,
  fromTime: number | null,
): "target" | "stop" | "open" {
  if (fromTime == null) return scanProgress(bars, side, entry, stop, target);
  const scoped = bars.filter((bar) => bar.time >= fromTime - 300);
  const scopedResult = scanProgress(scoped, side, entry, stop, target);
  if (scopedResult !== "open") return scopedResult;
  const sawEntry = scoped.some((bar) => bar.low <= entry && bar.high >= entry);
  if (sawEntry) return "open";
  return scanProgress(bars, side, entry, stop, target);
}

function efficiencyRatio(closes: readonly number[], n = 10): number | null {
  if (closes.length < n + 1) return null;
  const change = Math.abs(closes.at(-1)! - closes.at(-1 - n)!);
  let noise = 0;
  for (let i = closes.length - n; i < closes.length; i += 1) noise += Math.abs(closes[i]! - closes[i - 1]!);
  if (noise === 0) return 1;
  return change / noise;
}

function barDelta(bar: Bar): number {
  const span = bar.high - bar.low;
  if (span <= 0) return 0;
  const closeLocation = ((bar.close - bar.low) - (bar.high - bar.close)) / span;
  return closeLocation * (bar.volume > 0 ? bar.volume : 1);
}

function cvd(bars: readonly Bar[]): number[] {
  let total = 0;
  return bars.map((bar) => {
    total += barDelta(bar);
    return total;
  });
}

function buyPressure(bars: readonly Bar[], n = 12): number | null {
  const sample = bars.slice(-n);
  if (!sample.length) return null;
  let positive = 0;
  let negative = 0;
  for (const bar of sample) {
    const delta = barDelta(bar);
    if (delta > 0) positive += delta;
    else if (delta < 0) negative -= delta;
  }
  const total = positive + negative;
  if (total <= 0) return 0.5;
  return positive / total;
}

function pivots(bars: readonly Bar[], k: number): { highs: number[]; lows: number[] } {
  const highs: number[] = [];
  const lows: number[] = [];
  if (k < 1 || bars.length < k * 2 + 1) return { highs, lows };
  for (let i = k; i < bars.length - k; i += 1) {
    const high = bars[i]!.high;
    const low = bars[i]!.low;
    let highPivot = true;
    let lowPivot = true;
    for (let j = i - k; j <= i + k; j += 1) {
      if (j === i) continue;
      if (!(high > bars[j]!.high)) highPivot = false;
      if (!(low < bars[j]!.low)) lowPivot = false;
    }
    if (highPivot) highs.push(i);
    if (lowPivot) lows.push(i);
  }
  return { highs, lows };
}

function structureBias(bars: readonly Bar[], k: number): { bias: number; text: string } {
  const { highs, lows } = pivots(bars, k);
  if (highs.length < 2 || lows.length < 2) return { bias: 0, text: "not enough confirmed swings" };
  const hh = bars[highs.at(-1)!]!.high > bars[highs.at(-2)!]!.high;
  const hl = bars[lows.at(-1)!]!.low > bars[lows.at(-2)!]!.low;
  const lh = bars[highs.at(-1)!]!.high < bars[highs.at(-2)!]!.high;
  const ll = bars[lows.at(-1)!]!.low < bars[lows.at(-2)!]!.low;
  if (hh && hl) return { bias: 1, text: "higher high and higher low" };
  if (lh && ll) return { bias: -1, text: "lower high and lower low" };
  if (hh && ll) return { bias: 0, text: "expanded range, no clean trend" };
  if (lh && hl) return { bias: 0, text: "compressed range, no clean trend" };
  return { bias: 0, text: "mixed swings" };
}

function lastDealingRange(bars: readonly Bar[], k: number): DealingRange | null {
  const { highs, lows } = pivots(bars, k);
  if (!highs.length || !lows.length) return null;
  const lastHigh = highs.at(-1)!;
  const lastLow = lows.at(-1)!;
  if (lastHigh > lastLow) {
    let low = bars[lastHigh]!.low;
    for (let index = lastHigh; index < bars.length; index += 1) low = Math.min(low, bars[index]!.low);
    const high = bars[lastHigh]!.high;
    if (!(high > low)) return null;
    return { low, high, eq: (high + low) / 2 };
  }
  let low = bars[lastLow]!.low;
  for (let index = lastLow; index < bars.length; index += 1) low = Math.min(low, bars[index]!.low);
  const earlierHigh = [...highs].reverse().find((index) => index < lastLow);
  const high = earlierHigh == null ? bars[lastLow]!.high : bars[earlierHigh]!.high;
  if (!(high > low)) return null;
  return { low, high, eq: (high + low) / 2 };
}

function sessionBars(bars: readonly Bar[]): Bar[] {
  if (!bars.length) return [];
  const day = bars.at(-1)!.time - (bars.at(-1)!.time % 86400);
  const scoped = bars.filter((bar) => bar.time >= day);
  return scoped.length ? scoped : bars.slice(-Math.min(bars.length, 48));
}

function anchoredVwap(bars: readonly Bar[]): { vwap: number | null; std: number | null } {
  if (!bars.length) return { vwap: null, std: null };
  let pv = 0;
  let volume = 0;
  const typicals: { typical: number; vol: number }[] = [];
  for (const bar of bars) {
    const typical = (bar.high + bar.low + bar.close) / 3;
    const vol = bar.volume > 0 ? bar.volume : 1;
    pv += typical * vol;
    volume += vol;
    typicals.push({ typical, vol });
  }
  if (volume <= 0) return { vwap: null, std: null };
  const vwap = pv / volume;
  const variance = typicals.reduce((sum, item) => sum + item.vol * (item.typical - vwap) ** 2, 0) / volume;
  return { vwap, std: Math.sqrt(variance) };
}

function volumeProfile(bars: readonly Bar[], bins = 42): VolumeBinProfile | null {
  if (bars.length < 8) return null;
  const lo = Math.min(...bars.map((bar) => bar.low));
  const hi = Math.max(...bars.map((bar) => bar.high));
  if (hi <= lo) return { poc: lo, val: lo, vah: hi };
  const width = (hi - lo) / bins;
  const hist = Array.from({ length: bins }, () => 0);
  for (const bar of bars) {
    let i0 = Math.max(0, Math.min(bins - 1, Math.floor((bar.low - lo) / width)));
    let i1 = Math.max(0, Math.min(bins - 1, Math.floor((Math.min(bar.high, hi - 1e-12) - lo) / width)));
    if (i1 < i0) [i0, i1] = [i1, i0];
    const share = (bar.volume > 0 ? bar.volume : 1) / (i1 - i0 + 1);
    for (let i = i0; i <= i1; i += 1) hist[i] = (hist[i] ?? 0) + share;
  }
  const total = hist.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return null;
  let poc = 0;
  hist.forEach((value, index) => {
    if (value > (hist[poc] ?? 0)) poc = index;
  });
  let covered = hist[poc] ?? 0;
  let left = poc;
  let right = poc;
  while (covered / total < 0.7 && (left > 0 || right < bins - 1)) {
    const leftVol = left > 0 ? (hist[left - 1] ?? -1) : -1;
    const rightVol = right < bins - 1 ? (hist[right + 1] ?? -1) : -1;
    if (rightVol >= leftVol) {
      right += 1;
      covered += hist[right] ?? 0;
    } else {
      left -= 1;
      covered += hist[left] ?? 0;
    }
  }
  const mid = (index: number) => lo + (index + 0.5) * width;
  return { poc: mid(poc), val: lo + left * width, vah: lo + (right + 1) * width };
}

function profileWhere(price: number, profile: VolumeBinProfile | null): string {
  if (!profile) return "unknown";
  if (price < profile.val) return "discount";
  if (price > profile.vah) return "premium";
  return "value";
}

function openFvgs(bars: readonly Bar[], direction: number): [number, number][] {
  const zones: [number, number][] = [];
  for (let i = 2; i < bars.length; i += 1) {
    if (direction > 0 && bars[i]!.low > bars[i - 2]!.high) {
      const bot = bars[i - 2]!.high;
      const top = bars[i]!.low;
      if (bars.slice(i + 1).some((bar) => bar.low <= bot)) continue;
      zones.push([bot, top]);
    } else if (direction < 0 && bars[i]!.high < bars[i - 2]!.low) {
      const bot = bars[i]!.high;
      const top = bars[i - 2]!.low;
      if (bars.slice(i + 1).some((bar) => bar.high >= top)) continue;
      zones.push([bot, top]);
    }
  }
  return zones.slice(-6);
}

function openOrderBlocks(bars: readonly Bar[], direction: number): [number, number][] {
  const zones: [number, number][] = [];
  for (let i = 2; i < bars.length; i += 1) {
    const bullishGap = direction > 0 && bars[i]!.low > bars[i - 2]!.high;
    const bearishGap = direction < 0 && bars[i]!.high < bars[i - 2]!.low;
    if (!bullishGap && !bearishGap) continue;
    for (let j = i - 1; j > Math.max(-1, i - 8); j -= 1) {
      const bearishCandle = bars[j]!.close < bars[j]!.open;
      const bullishCandle = bars[j]!.close > bars[j]!.open;
      if (direction > 0 && bearishCandle) {
        const bot = bars[j]!.low;
        const top = bars[j]!.high;
        if (bars.slice(i + 1).some((bar) => bar.low < bot)) break;
        zones.push([bot, top]);
        break;
      }
      if (direction < 0 && bullishCandle) {
        const bot = bars[j]!.low;
        const top = bars[j]!.high;
        if (bars.slice(i + 1).some((bar) => bar.high > top)) break;
        zones.push([bot, top]);
        break;
      }
    }
  }
  return zones.slice(-6);
}

function touches(price: number, zones: readonly [number, number][], pad: number): [number, number] | null {
  for (let i = zones.length - 1; i >= 0; i -= 1) {
    const zone = zones[i]!;
    if (zone[0] - pad <= price && price <= zone[1] + pad) return zone;
  }
  return null;
}

function realizedVolPercentile(bars: readonly Bar[], short = 20, sample = 120): number | null {
  if (bars.length < short + 5) return null;
  const returns: number[] = [];
  for (let i = 1; i < bars.length; i += 1) {
    const prev = bars[i - 1]!.close;
    const close = bars[i]!.close;
    returns.push(prev <= 0 || close <= 0 ? 0 : Math.log(close / prev));
  }
  const deviation = (values: readonly number[]) => {
    if (values.length < 2) return 0;
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1));
  };
  const window: number[] = [];
  for (let end = short; end <= returns.length; end += 1) window.push(deviation(returns.slice(end - short, end)));
  if (!window.length) return null;
  const recent = window.slice(-sample);
  const current = window.at(-1)!;
  return recent.filter((value) => value <= current).length / recent.length;
}

function percentile(values: readonly number[], p: number): number | null {
  if (!values.length) return null;
  const ordered = [...values].sort((a, b) => a - b);
  if (ordered.length === 1) return ordered[0]!;
  const rank = (ordered.length - 1) * p;
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return ordered[lo]!;
  const weight = rank - lo;
  return ordered[lo]! * (1 - weight) + ordered[hi]! * weight;
}

function adverseExcursions(bars: readonly Bar[], direction: number, k = 2, horizon = 36): number[] {
  const unit = atr(bars, 14);
  if (unit == null || unit <= 0) return [];
  const { highs, lows } = pivots(bars, k);
  const anchors = direction > 0 ? lows : highs;
  const excursions: number[] = [];
  for (const index of anchors) {
    const start = index + k;
    if (start >= bars.length - 1) continue;
    const anchor = direction > 0 ? bars[index]!.low : bars[index]!.high;
    let worst = 0;
    let reached = false;
    const last = Math.min(bars.length, start + horizon);
    for (let j = start; j < last; j += 1) {
      if (direction > 0) {
        worst = Math.max(worst, (anchor - bars[j]!.low) / unit);
        if (bars[j]!.high >= anchor + unit) {
          reached = true;
          break;
        }
      } else {
        worst = Math.max(worst, (bars[j]!.high - anchor) / unit);
        if (bars[j]!.low <= anchor - unit) {
          reached = true;
          break;
        }
      }
    }
    if (reached) excursions.push(worst);
  }
  return excursions.slice(-40);
}

function cvdDivergence(bars: readonly Bar[], k = 2): number {
  const series = cvd(bars);
  const { highs, lows } = pivots(bars, k);
  if (highs.length >= 2) {
    const a = highs.at(-2)!;
    const b = highs.at(-1)!;
    if (bars[b]!.high > bars[a]!.high && series[b]! < series[a]!) return -1;
  }
  if (lows.length >= 2) {
    const a = lows.at(-2)!;
    const b = lows.at(-1)!;
    if (bars[b]!.low < bars[a]!.low && series[b]! > series[a]!) return 1;
  }
  return 0;
}

function fmt(price: number, digits: number): string {
  return price.toFixed(Math.max(0, Math.min(digits, 8)));
}

function signed(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
}

function ordinal(rank: number): string {
  const suffix = rank % 100 >= 11 && rank % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[rank % 10] ?? "th";
  return `${rank}${suffix}`;
}

function scoreSide(input: {
  side: "long" | "short";
  price: number;
  structure: number;
  dealing: DealingRange | null;
  zone: [number, number] | null;
  pressure: number | null;
  divergence: number;
  erH1: number | null;
  rvPct: number | null;
  vwapZ: number | null;
  stopDistanceAtr: number | null;
  heatP70: number | null;
  heatKnown: boolean;
  stopValid: boolean | null;
}): SideRead {
  const direction = input.side === "long" ? 1 : -1;
  let score = 20;
  const reasons: SeatReason[] = [];
  let inCorrectHalf = false;
  if (input.structure === direction) {
    score += 25;
    reasons.push({ tone: "good", text: "Confirmed swings agree with this side." });
  } else if (input.structure === -direction) {
    score -= 25;
    reasons.push({ tone: "bad", text: "Confirmed swings point the other way." });
  } else {
    reasons.push({ tone: "neutral", text: "Swings are mixed or not confirmed yet, so structure is not backing the trade." });
  }
  if (input.dealing && input.dealing.high > input.dealing.low) {
    const location = (input.price - input.dealing.low) / (input.dealing.high - input.dealing.low);
    const ote = input.side === "short" ? location >= 0.62 && location <= 0.79 : location >= 0.21 && location <= 0.38;
    if (input.side === "long" && location < 0.5) {
      inCorrectHalf = true;
      score += 25;
      reasons.push({
        tone: "good",
        text: ote
          ? "Entry is in the 0.62 to 0.79 optimal trade entry band, in discount."
          : "Price is in the discount half of the latest swing.",
      });
      if (ote) score += 10;
    } else if (input.side === "short" && location > 0.5) {
      inCorrectHalf = true;
      score += 25;
      reasons.push({
        tone: "good",
        text: ote
          ? "Entry is in the 0.62 to 0.79 optimal trade entry band, in premium."
          : "Price is in the premium half of the latest swing.",
      });
      if (ote) score += 10;
    } else if (location === 0.5) {
      reasons.push({ tone: "neutral", text: "Entry is on the 0.50 equilibrium of the latest swing." });
    } else {
      const half = location > 0.5 ? "premium" : "discount";
      reasons.push({ tone: "bad", text: `Price is in the ${half} half, which is the expensive side for a ${input.side}.` });
    }
  } else {
    reasons.push({ tone: "neutral", text: "No confirmed swing range yet, so discount and premium are unknown." });
  }
  if (input.zone) {
    score += 10;
    reasons.push({ tone: "good", text: `Price is inside an unfilled ${input.side} imbalance or the order block that created it.` });
  } else {
    reasons.push({ tone: "neutral", text: "Price is not inside an unfilled imbalance in this direction." });
  }
  const against = input.divergence === -direction;
  const withFlow =
    input.pressure != null &&
    ((input.side === "long" && input.pressure > 0.5) || (input.side === "short" && input.pressure < 0.5));
  if (against) {
    reasons.push({ tone: "neutral", text: "Close-location delta diverges against this side at the last two swings." });
  } else if (withFlow) {
    reasons.push({ tone: "good", text: "Recent bar delta, from where the close sat in each bar, agrees with this side." });
  } else {
    reasons.push({ tone: "neutral", text: "Recent bar delta is balanced, so flow is not confirming." });
  }
  if (input.erH1 != null && input.erH1 >= 0.6 && input.structure === direction) {
    reasons.push({ tone: "good", text: `15-minute efficiency is ${input.erH1.toFixed(2)}, so the trend is covering ground rather than chopping.` });
  } else if (input.erH1 != null && input.erH1 < 0.3) {
    reasons.push({ tone: "neutral", text: `15-minute efficiency is ${input.erH1.toFixed(2)}. Price is rotating more than it is travelling.` });
  }
  if (input.rvPct != null && input.rvPct >= 0.9) {
    reasons.push({
      tone: "neutral",
      text: `Realized volatility is in the ${ordinal(Math.round(input.rvPct * 100))} percentile of its own history. The tape is unusually wild.`,
    });
  }
  if (input.vwapZ != null && ((input.side === "long" && input.vwapZ >= 2) || (input.side === "short" && input.vwapZ <= -2))) {
    reasons.push({ tone: "bad", text: `Session VWAP z-score is ${signed(input.vwapZ)}. This side is extended away from value.` });
  }
  let stopInsideHeat = false;
  const dist = input.stopDistanceAtr;
  if (input.stopValid === false) {
    score -= 30;
    reasons.push({ tone: "bad", text: "The stop is on the wrong side of the entry." });
  } else if (dist != null) {
    const heatFloor = input.heatKnown && input.heatP70 != null ? Math.max(1, input.heatP70) : 1;
    if (dist < heatFloor) {
      stopInsideHeat = true;
      reasons.push({
        tone: "bad",
        text:
          input.heatKnown && input.heatP70 != null
            ? `Stop is ${dist.toFixed(2)} ATR away, inside the ${input.heatP70.toFixed(2)} ATR already seen against this side.`
            : `Stop is only ${dist.toFixed(2)} ATR away, inside one average true range.`,
      });
    } else if (dist <= 3) {
      score += 10;
      reasons.push({
        tone: "good",
        text: `Stop is ${dist.toFixed(2)} ATR away, inside the 1 to 3 ATR band.`,
      });
    } else {
      reasons.push({
        tone: "neutral",
        text: `Stop is ${dist.toFixed(2)} ATR away, beyond the 3 ATR buffer.`,
      });
    }
  }
  const capped = Math.max(0, Math.min(100, Math.round(score)));
  return {
    score: capped,
    reasons,
    structureAgrees: input.structure === direction,
    inCorrectHalf,
    atZone: input.zone != null,
    stopInsideHeat,
  };
}

function summary(input: {
  verdict: SeatVerdict;
  side: SeatSide;
  checked: string;
  price: number;
  digits: number;
  structureText: string;
  where: string;
  vwapZ: number | null;
  heat: number | null;
  dist: number | null;
  zoneText: string | null;
}): string {
  const focus = input.side === "long" || input.side === "short" ? input.side : input.checked;
  const bits = [
    `Swings: ${input.structureText}.`,
    `Price ${fmt(input.price, input.digits)} is ${input.where} on the recent volume profile.`,
    `Session VWAP z-score is ${input.vwapZ == null ? "unknown" : signed(input.vwapZ)}.`,
    `Typical heat before a swing made +1 ATR is ${input.heat == null ? "not enough completed swings yet" : `${input.heat.toFixed(2)} ATR`}.`,
  ];
  if (input.zoneText) bits.push(`Active zone ${input.zoneText}.`);
  if (input.dist != null) bits.push(`Your stop distance is ${input.dist.toFixed(2)} ATR.`);
  const tail: Record<SeatVerdict, string> = {
    SEAT_OK: `The ${focus} location clears structure, the better half or an open imbalance, and stop distance.`,
    REVIEW_STOP: "The idea may be fine, but this stop is tighter than the market's usual counter-move.",
    DO_NOT_CHASE: `A ${focus} from here is late relative to session value. Wait for price to come back.`,
    THESIS_BROKEN: "Do not add. The swing or the stop that justified the position has failed.",
    WEAK_LOCATION: "The position is open, and the live numbers do not agree with it strongly enough.",
    LOCATION_VALID: `If your own read is a ${focus}, the live numbers currently agree with that location.`,
    STAND_ASIDE: "Nothing in the live feed is offering a clean seat. Stand aside until it does.",
    SPREAD_STRESS: "The quote is too wide for the location math to be trusted.",
    WARMING: "Waiting for bars.",
  };
  return [...bits, tail[input.verdict]].join(" ");
}

const HEADLINES: Record<SeatVerdict, string> = {
  SEAT_OK: "Seat is clean",
  REVIEW_STOP: "Stop sits inside normal heat",
  DO_NOT_CHASE: "Location is extended",
  THESIS_BROKEN: "The level that held this idea is gone",
  WEAK_LOCATION: "Position is on, location is thin",
  LOCATION_VALID: "A location is available",
  STAND_ASIDE: "No clean location",
  SPREAD_STRESS: "Spread is too wide to trust the price",
  WARMING: "Waiting for bars",
};

export function analyzeSeat(
  rawBars: Partial<Record<Tf, readonly Bar[]>>,
  quote: SeatQuote | null,
  position: SeatPosition | null,
  options: { digits?: number; medianSpread?: number | null; feedAgeSec?: number | null } = {},
): SeatDesk {
  const digits = options.digits ?? 5;
  const frames = fillTimeframes(rawBars);
  const execution = frames.M5.length ? frames.M5 : frames.M15.length ? frames.M15 : frames.M1.length ? frames.M1 : frames.H1;
  let higher = execution;
  let structureK = 2;
  for (const [timeframe, pivotK] of [
    ["M15", 2],
    ["M5", 2],
  ] as const) {
    const candidate = frames[timeframe];
    if (candidate.length >= 40) {
      higher = candidate;
      structureK = pivotK;
      break;
    }
  }
  const feedAge = options.feedAgeSec;
  if (execution.length < 40 || feedAge == null) {
    return {
      verdict: "WARMING",
      headline: HEADLINES.WARMING,
      summary: "The desk needs a live quote and at least 40 execution bars before it will score a location.",
      score: 0,
      side: position?.side ?? "flat",
      reasons: [],
      metrics: { bars: execution.length, feedAgeSec: feedAge },
      spark: execution.slice(-80).map((bar) => ({ t: bar.time, c: bar.close })),
    };
  }

  const mid = quote && quote.bid > 0 && quote.ask > 0 ? (quote.bid + quote.ask) / 2 : quote ? Math.max(quote.bid, quote.ask) : 0;
  const price = mid > 0 ? mid : execution.at(-1)!.close;
  const atrValue = atr(execution, 14) ?? 0;
  const structure = structureBias(higher, structureK);
  const dealing = lastDealingRange(higher, structureK);
  const divergence = cvdDivergence(execution, 2);
  const pressure = buyPressure(execution, 12);
  const erH1 = efficiencyRatio(higher.map((bar) => bar.close), 10);
  const erM15 = efficiencyRatio((frames.M15.length ? frames.M15 : execution).map((bar) => bar.close), 10);
  const erTrade = erM15 ?? efficiencyRatio(execution.map((bar) => bar.close), 10);
  const rvPct = realizedVolPercentile(execution);
  const day = sessionBars(frames.M1.length ? frames.M1 : execution);
  const { vwap, std } = anchoredVwap(day);
  const vwapZ = vwap != null && std != null && std > 0 ? (price - vwap) / std : null;
  const profile = volumeProfile(execution.slice(-120));
  const where = profileWhere(price, profile);
  const pad = atrValue * 0.15;
  const longExcursions = adverseExcursions(execution, 1);
  const shortExcursions = adverseExcursions(execution, -1);
  const longHeat = percentile(longExcursions, 0.7);
  const shortHeat = percentile(shortExcursions, 0.7);
  const longHeatKnown = longExcursions.length >= 5 && longHeat != null && longHeat >= 0.2;
  const shortHeatKnown = shortExcursions.length >= 5 && shortHeat != null && shortHeat >= 0.2;
  const spread = quote && quote.bid > 0 && quote.ask > 0 ? Math.max(0, quote.ask - quote.bid) : 0;
  const medianSpread = options.medianSpread;
  const spreadRatio = medianSpread != null && medianSpread > 0 && spread > 0 ? spread / medianSpread : null;
  const spreadStressed = spreadRatio != null && spreadRatio >= 2.5;
  const side = position?.side ?? "flat";
  const entry = position?.entry ?? null;
  const stop = position?.stop ?? null;
  const target = position?.target ?? null;
  const placedAt = position?.placedAt ?? null;
  const longAnchor = side === "long" && entry != null ? entry : price;
  const shortAnchor = side === "short" && entry != null ? entry : price;
  const longZone = touches(longAnchor, [...openFvgs(execution, 1), ...openOrderBlocks(execution, 1)], pad);
  const shortZone = touches(shortAnchor, [...openFvgs(execution, -1), ...openOrderBlocks(execution, -1)], pad);

  const geometry = (forSide: "long" | "short") => {
    if (side !== forSide || entry == null || stop == null || atrValue <= 0) return { dist: null as number | null, valid: null as boolean | null, banked: false };
    const direction = forSide === "long" ? 1 : -1;
    const valid = (entry - stop) * direction > 0;
    const dist = Math.abs(entry - stop) / atrValue;
    const banked = (price - entry) * direction > atrValue;
    return { dist, valid, banked };
  };
  const longGeo = geometry("long");
  const shortGeo = geometry("short");
  const shared = {
    price,
    structure: structure.bias,
    dealing,
    pressure,
    divergence,
    erH1: erTrade,
    rvPct,
    vwapZ,
  };
  const longRead = scoreSide({
    ...shared,
    price: longAnchor,
    side: "long",
    zone: longZone,
    stopDistanceAtr: longGeo.banked ? null : longGeo.dist,
    heatP70: longGeo.banked ? null : longHeat,
    heatKnown: longHeatKnown && !longGeo.banked,
    stopValid: longGeo.valid,
  });
  const shortRead = scoreSide({
    ...shared,
    price: shortAnchor,
    side: "short",
    zone: shortZone,
    stopDistanceAtr: shortGeo.banked ? null : shortGeo.dist,
    heatP70: shortGeo.banked ? null : shortHeat,
    heatKnown: shortHeatKnown && !shortGeo.banked,
    stopValid: shortGeo.valid,
  });
  const checked: "long" | "short" =
    side === "long" || side === "short"
      ? side
      : longRead.score >= shortRead.score + 8
        ? "long"
        : shortRead.score >= longRead.score + 8
          ? "short"
          : longRead.score >= shortRead.score
            ? "long"
            : "short";
  const read = checked === "long" ? longRead : shortRead;
  const zone = checked === "long" ? longZone : shortZone;
  const heat = checked === "long" ? longHeat : shortHeat;
  const dist = checked === "long" ? longGeo.dist : shortGeo.dist;
  const valid = checked === "long" ? longGeo.valid : shortGeo.valid;
  const banked = checked === "long" ? longGeo.banked : shortGeo.banked;
  const heatKnown = checked === "long" ? longHeatKnown : shortHeatKnown;
  const located = read.inCorrectHalf || read.atZone;
  const chased = vwapZ != null && ((checked === "long" && vwapZ >= 2) || (checked === "short" && vwapZ <= -2));
  const throughStop = (side === "long" && stop != null && price < stop) || (side === "short" && stop != null && price > stop);
  const lostSwing =
    (side === "long" && dealing != null && price < dealing.low) || (side === "short" && dealing != null && price > dealing.high);
  const stopInsideHeat = (side === "long" || side === "short") && read.stopInsideHeat && !banked;
  const missingStop = (side === "long" || side === "short") && (entry == null || stop == null);
  const reward =
    entry != null && target != null ? (side === "short" ? entry - target : side === "long" ? target - entry : Math.abs(target - entry)) : null;
  const risk =
    entry != null && stop != null ? (side === "short" ? stop - entry : side === "long" ? entry - stop : Math.abs(entry - stop)) : null;
  const targetWrong = (side === "long" || side === "short") && reward != null && reward <= 0;
  let verdict: SeatVerdict = "STAND_ASIDE";
  if (spreadStressed && !throughStop) verdict = "SPREAD_STRESS";
  else if ((side === "long" || side === "short") && (throughStop || lostSwing || valid === false)) verdict = "THESIS_BROKEN";
  else if (stopInsideHeat) verdict = "REVIEW_STOP";
  else if (chased && (side === checked || side === "flat")) verdict = "DO_NOT_CHASE";
  else if (missingStop) verdict = "WEAK_LOCATION";
  else if (
    (side === "long" || side === "short") &&
    read.score >= 70 &&
    valid &&
    read.structureAgrees &&
    located &&
    !targetWrong
  ) verdict = "SEAT_OK";
  else if (side === "long" || side === "short") verdict = "WEAK_LOCATION";
  else if (read.score >= 70 && read.structureAgrees && located && !chased) verdict = "LOCATION_VALID";

  let progress: "target" | "stop" | "open" = "open";
  if ((side === "long" || side === "short") && entry != null && stop != null && target != null && valid !== false && !targetWrong) {
    progress = tradeProgress(execution, side, entry, stop, target, placedAt);
    if (progress === "open") {
      for (const frame of [frames.H1, frames.M15, frames.M5, frames.M1]) {
        if (!frame.length) continue;
        const next = tradeProgress(frame, side, entry, stop, target, null);
        if (next !== "open") {
          progress = next;
          break;
        }
      }
    }
    if (progress === "open") {
      if (side === "short" && price >= stop) progress = "stop";
      else if (side === "long" && price <= stop) progress = "stop";
      else if (side === "short" && price <= target) progress = "target";
      else if (side === "long" && price >= target) progress = "target";
    }
  }
  if (progress === "stop") verdict = "THESIS_BROKEN";
  else if (progress === "target") verdict = "SEAT_OK";

  let reasons = [...read.reasons];
  if (progress === "target") {
    reasons = [{ tone: "good", text: "Price traded the take profit after the entry." }, ...reasons];
  } else if (progress === "stop") {
    reasons = [{ tone: "bad", text: "Price traded the stop after the entry." }, ...reasons];
  } else if (banked && (side === "long" || side === "short")) {
    reasons = [{ tone: "good", text: "Open profit is past 1 ATR, so this location is working." }, ...reasons];
  }
  let rr: number | null = null;
  if (targetWrong) {
    reasons = [...reasons, { tone: "bad", text: "Take profit is on the wrong side of the entry." }];
  } else if (reward != null && risk != null && risk > 0) {
    rr = reward / risk;
    if ((side === "long" || side === "short") && rr < 1.63) {
      reasons = [...reasons, { tone: "neutral", text: `Reward to risk against your target is ${rr.toFixed(2)}, below 1.63 at the 0.62 retracement.` }];
    }
  }
  if (throughStop) reasons = [{ tone: "bad", text: "Live price is already through your stop." }, ...reasons];
  else if (lostSwing && (side === "long" || side === "short")) {
    reasons = [{ tone: "bad", text: "Price has left the swing that defined this side." }, ...reasons];
  }
  if (missingStop) reasons = [{ tone: "neutral", text: "Add entry and stop so the desk can compare them with typical heat." }, ...reasons];
  if (spreadStressed && spreadRatio != null) {
    reasons = [{ tone: "bad", text: `Spread is ${spreadRatio.toFixed(1)}× its recent median.` }, ...reasons];
  }
  const zoneText = zone ? `${fmt(zone[0], digits)} – ${fmt(zone[1], digits)}` : null;
  return {
    verdict,
    headline: HEADLINES[verdict],
    summary: summary({
      verdict,
      side,
      checked,
      price,
      digits,
      structureText: structure.text,
      where,
      vwapZ,
      heat: heatKnown ? heat : null,
      dist,
      zoneText,
    }),
    score: read.score,
    side,
    checkedSide: checked,
    reasons,
    metrics: {
      price,
      atr: atrValue,
      structure: structure.bias,
      structureText: structure.text,
      dealingLow: dealing?.low ?? null,
      dealingHigh: dealing?.high ?? null,
      dealingEq: dealing?.eq ?? null,
      efficiencyH1: erH1,
      efficiencyM15: erM15,
      vwap,
      vwapZ,
      rvPercentile: rvPct,
      profileWhere: where,
      poc: profile?.poc ?? null,
      val: profile?.val ?? null,
      vah: profile?.vah ?? null,
      buyPressure: pressure,
      divergence,
      heatP70Atr: heatKnown ? heat : null,
      stopAtr: dist,
      spread,
      rr,
      longScore: longRead.score,
      shortScore: shortRead.score,
      zone: zoneText,
      bars: execution.length,
      feedAgeSec: feedAge,
    },
    spark: execution.slice(-80).map((bar) => ({ t: bar.time, c: bar.close })),
  };
}
