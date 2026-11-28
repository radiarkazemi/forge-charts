import type { Bar } from "@/domain";

function alignTime(tsSec: number, step: number): number {
  return Math.floor(tsSec / step) * step;
}

/** Aggregate lower-TF bars into `stepSec` candles (standard OHLCV rollup). */
export function aggregateBars(bars: readonly Bar[], stepSec: number): Bar[] {
  if (stepSec <= 1 || bars.length === 0) return [...bars];
  const out: Bar[] = [];
  let cur: Bar | null = null;
  let bucket = -1;
  for (const bar of bars) {
    const start = alignTime(bar.time, stepSec);
    if (!cur || start !== bucket) {
      if (cur) out.push(cur);
      bucket = start;
      cur = { time: start, open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: bar.volume };
    } else {
      cur = {
        time: start,
        open: cur.open,
        high: Math.max(cur.high, bar.high),
        low: Math.min(cur.low, bar.low),
        close: bar.close,
        volume: cur.volume + bar.volume,
      };
    }
  }
  if (cur) out.push(cur);
  return out;
}

/**
 * Reconstruct second bars from a 1m OHLC parent using the standard path:
 * bullish: O → L → H → C ; bearish: O → H → L → C
 * (avoids the linear open→close staircase that looks fake on charts).
 */
export function synthesizeSecondsFromMinute(parent: Bar): Bar[] {
  const slots = 60;
  const bullish = parent.close >= parent.open;
  const p1 = parent.open;
  const p2 = bullish ? parent.low : parent.high;
  const p3 = bullish ? parent.high : parent.low;
  const p4 = parent.close;
  const out: Bar[] = [];
  let hiIdx = 0;
  let loIdx = 0;
  for (let i = 0; i < slots; i += 1) {
    const t = parent.time + i;
    let frac: number;
    let a: number;
    let b: number;
    if (i < 20) {
      frac = i / 20;
      a = p1;
      b = p2;
    } else if (i < 40) {
      frac = (i - 20) / 20;
      a = p2;
      b = p3;
    } else {
      frac = (i - 40) / 20;
      a = p3;
      b = p4;
    }
    const px = a + (b - a) * Math.min(1, Math.max(0, frac));
    const prev = i === 0 ? parent.open : out[i - 1]!.close;
    // The last second is snapped to the 1m close. That close can sit outside
    // the interpolated print, which left a wick that did not cover the close.
    const close = i === slots - 1 ? parent.close : px;
    const bar: Bar = {
      time: t,
      open: prev,
      high: Math.max(prev, px, close),
      low: Math.min(prev, px, close),
      close,
      volume: parent.volume / slots,
    };
    out.push(bar);
    if (bar.high >= out[hiIdx]!.high) hiIdx = i;
    if (bar.low <= out[loIdx]!.low) loIdx = i;
  }
  const hi = out[hiIdx]!;
  out[hiIdx] = { ...hi, high: Math.max(hi.high, parent.high, hi.open, hi.close) };
  const lo = out[loIdx]!;
  out[loIdx] = { ...lo, low: Math.min(lo.low, parent.low, lo.open, lo.close) };
  return out;
}

/** Expand 1m parents into `stepSec` second candles (1S…45S). */
export function synthesizeFromMinuteBars(parents: readonly Bar[], stepSec: number): Bar[] {
  const ones: Bar[] = [];
  for (const parent of parents) {
    // Yahoo (and some brokers) stamp 1m bars off the :00 grid — snap before synth
    // so 5S buckets align with TradingView’s seconds timeline.
    const aligned =
      parent.time % 60 === 0 ? parent : { ...parent, time: Math.floor(parent.time / 60) * 60 };
    ones.push(...synthesizeSecondsFromMinute(aligned));
  }
  return stepSec <= 1 ? ones : aggregateBars(ones, stepSec);
}

/** Seconds resolutions we can always synthesize from 1m parents. */
export const SYNTH_SECONDS_INTERVALS = ["1S", "5S", "10S", "15S", "30S", "45S"] as const;

/**
 * Seconds history the chart is allowed to load.
 * The raw path draws the whole minute, including seconds that have not
 * happened yet. Those future bars freeze the live candle, so they are removed
 * and the open bucket uses the 1m close.
 */
export function presentSecondBars(parents: readonly Bar[], stepSec: number, nowSec: number): Bar[] {
  const step = Math.max(1, Math.floor(stepSec));
  const wall = nowSec - (nowSec % step);
  const bars = synthesizeFromMinuteBars(parents, step).filter((bar) => bar.time <= wall);
  const parent = parents[parents.length - 1];
  const last = bars[bars.length - 1];
  if (parent && last && last.time === wall) {
    bars[bars.length - 1] = {
      ...last,
      high: Math.max(last.high, parent.close),
      low: Math.min(last.low, parent.close),
      close: parent.close,
    };
  }
  return bars;
}

/**
 * Live seconds bars for one forming minute.
 * History draws these from the closed 1m candle. Realtime must push the same
 * slices: the bucket under `nowSec`, and — when that bucket just opened — the
 * previous slice one last time so its wick is the minute path, not the raw tick.
 */
export function liveSecondUpdate(
  parent: Bar,
  stepSec: number,
  nowSec: number,
  lastEmittedTime: number,
): Bar[] {
  const step = Math.max(1, Math.floor(stepSec));
  const slices = synthesizeFromMinuteBars([parent], step);
  const bucket = alignTime(nowSec, step);
  let current: Bar | null = null;
  for (const slice of slices) {
    if (slice.time <= bucket) current = slice;
  }
  if (!current) return [];
  // The 1m candle already shows parent.close. The reconstructed path only
  // reaches that price in the last third of the minute, so 15s/30s looked late.
  // The bucket on screen uses the live close immediately.
  if (current.time === bucket) {
    current = {
      ...current,
      high: Math.max(current.high, parent.close),
      low: Math.min(current.low, parent.close),
      close: parent.close,
    };
  }
  const out: Bar[] = [];
  if (lastEmittedTime >= 0 && current.time > lastEmittedTime) {
    const prev = slices.find((slice) => slice.time === lastEmittedTime);
    if (prev) out.push(prev);
  }
  out.push(current);
  return out;
}
