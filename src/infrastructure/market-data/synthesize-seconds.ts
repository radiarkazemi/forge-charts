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
    const bar: Bar = {
      time: t,
      open: prev,
      high: Math.max(prev, px),
      low: Math.min(prev, px),
      close: i === slots - 1 ? parent.close : px,
      volume: parent.volume / slots,
    };
    out.push(bar);
    if (bar.high >= out[hiIdx]!.high) hiIdx = i;
    if (bar.low <= out[loIdx]!.low) loIdx = i;
  }
  out[hiIdx] = { ...out[hiIdx]!, high: parent.high };
  out[loIdx] = { ...out[loIdx]!, low: parent.low };
  return out;
}

/** Expand 1m parents into `stepSec` second candles (1S…45S). */
export function synthesizeFromMinuteBars(parents: readonly Bar[], stepSec: number): Bar[] {
  const ones: Bar[] = [];
  for (const parent of parents) ones.push(...synthesizeSecondsFromMinute(parent));
  return stepSec <= 1 ? ones : aggregateBars(ones, stepSec);
}

/** Seconds resolutions we can always synthesize from 1m parents. */
export const SYNTH_SECONDS_INTERVALS = ["1S", "5S", "10S", "15S", "30S", "45S"] as const;
