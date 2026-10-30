import type { Bar } from "../engine/types";

/** Coerce OHLC numbers without flattening real 0-values incorrectly. */
export function finiteOr(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Ensure high/low always envelope open/close (source wicks preserved when present). */
export function normalizeOhlc(bar: {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}): Bar {
  const open = bar.open;
  const close = bar.close;
  const high = Math.max(bar.high, open, close);
  const low = Math.min(bar.low, open, close);
  return {
    time: bar.time,
    open,
    high,
    low,
    close,
    volume: Number.isFinite(bar.volume) ? Number(bar.volume) : 0,
  };
}

/**
 * Merge a live update into the forming candle so incomplete polls (price-only)
 * cannot wipe shadows that the source already delivered.
 */
export function mergeFormingBar(prev: Bar, next: Bar): Bar {
  if (prev.time !== next.time) return normalizeOhlc(next);
  const open = Number.isFinite(prev.open) ? prev.open : next.open;
  const close = Number.isFinite(next.close) ? next.close : prev.close;
  const high = Math.max(prev.high, next.high, open, close);
  const low = Math.min(prev.low, next.low, open, close);
  const volume = Math.max(prev.volume || 0, next.volume || 0);
  return { time: prev.time, open, high, low, close, volume };
}

function priceAlongOhlc(o: number, h: number, l: number, c: number, t: number): number {
  // Piecewise path O→extreme→extreme→C so child bars keep parent shadows.
  const bullish = c >= o;
  const p1 = o;
  const p2 = bullish ? l : h;
  const p3 = bullish ? h : l;
  const p4 = c;
  if (t <= 0.28) {
    const f = t / 0.28;
    return p1 + (p2 - p1) * f;
  }
  if (t <= 0.62) {
    const f = (t - 0.28) / 0.34;
    return p2 + (p3 - p2) * f;
  }
  const f = (t - 0.62) / 0.38;
  return p3 + (p4 - p3) * f;
}

/**
 * Expand coarser bars into a finer step (e.g. 1m → 5s) while preserving
 * parent high/low so candles keep shadows instead of flat bodies.
 */
export function expandBarsToStep(bars: readonly Bar[], parentStep: number, childStep: number): Bar[] {
  if (childStep <= 0 || parentStep < childStep || parentStep % childStep !== 0) {
    return bars.map((b) => normalizeOhlc(b));
  }
  const n = parentStep / childStep;
  const out: Bar[] = [];
  for (const parent of bars) {
    const o = parent.open;
    const h = parent.high;
    const l = parent.low;
    const c = parent.close;
    const vEach = (parent.volume || 0) / n;
    let prev = o;
    const bullish = c >= o;
    for (let i = 0; i < n; i += 1) {
      const tEnd = (i + 1) / n;
      let px = priceAlongOhlc(o, h, l, c, tEnd);
      const samples = [prev, px];
      for (const k of [1, 2, 3]) {
        samples.push(priceAlongOhlc(o, h, l, c, (i + k / 4) / n));
      }
      if (bullish) {
        if (i === 0 || (i / n <= 0.28 && (i + 1) / n > 0.28)) samples.push(l);
        if ((i / n <= 0.62 && (i + 1) / n > 0.62) || i === n - 1) samples.push(h);
      } else {
        if (i === 0 || (i / n <= 0.28 && (i + 1) / n > 0.28)) samples.push(h);
        if ((i / n <= 0.62 && (i + 1) / n > 0.62) || i === n - 1) samples.push(l);
      }
      if (i === n - 1) {
        px = c;
        samples.push(c);
      }
      let hi = Math.min(h, Math.max(...samples));
      let lo = Math.max(l, Math.min(...samples));
      hi = Math.max(hi, prev, px);
      lo = Math.min(lo, prev, px);
      out.push(
        normalizeOhlc({
          time: parent.time + i * childStep,
          open: prev,
          high: hi,
          low: lo,
          close: px,
          volume: vEach,
        }),
      );
      prev = px;
    }
  }
  return out;
}

/** Insert flat bridge bars across short holes so the series does not jump. */
export function fillBarGaps(bars: readonly Bar[], stepSec: number, maxFill = 120): Bar[] {
  if (bars.length < 2 || stepSec <= 0) return bars.map((b) => normalizeOhlc(b));
  const out: Bar[] = [normalizeOhlc(bars[0]!)];
  for (let i = 1; i < bars.length; i += 1) {
    const prev = out[out.length - 1]!;
    const cur = normalizeOhlc(bars[i]!);
    const gap = cur.time - prev.time;
    if (gap > stepSec * 1.5) {
      let t = prev.time + stepSec;
      let n = 0;
      while (t < cur.time - stepSec * 0.25 && n < maxFill) {
        out.push({
          time: t,
          open: prev.close,
          high: prev.close,
          low: prev.close,
          close: prev.close,
          volume: 0,
        });
        t += stepSec;
        n += 1;
      }
    }
    out.push(cur);
  }
  return out;
}
