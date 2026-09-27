import type { Bar } from "./bar";

/**
 * Standard OHLC path used to reconstruct intra-bar motion from a closed candle:
 * bullish: O → L → H → C ; bearish: O → H → L → C
 */
export function priceAlongOhlcPath(parent: Pick<Bar, "open" | "high" | "low" | "close">, t01: number): number {
  const t = Math.min(1, Math.max(0, t01));
  const bullish = parent.close >= parent.open;
  const p1 = parent.open;
  const p2 = bullish ? parent.low : parent.high;
  const p3 = bullish ? parent.high : parent.low;
  const p4 = parent.close;
  if (t < 1 / 3) {
    const f = t / (1 / 3);
    return p1 + (p2 - p1) * f;
  }
  if (t < 2 / 3) {
    const f = (t - 1 / 3) / (1 / 3);
    return p2 + (p3 - p2) * f;
  }
  const f = (t - 2 / 3) / (1 / 3);
  return p3 + (p4 - p3) * f;
}

/**
 * Build the forming (partial) OHLC for `parent` at progress ∈ [0,1].
 * High/low expand only over the extremes visited so far on the path.
 */
export function formingBarFromOhlc(parent: Bar, progress01: number): Bar {
  const progress = Math.min(1, Math.max(0, progress01));
  const samples = Math.max(2, Math.ceil(progress * 48));
  let high = parent.open;
  let low = parent.open;
  let close = parent.open;
  for (let i = 0; i <= samples; i += 1) {
    const t = (i / samples) * progress;
    const px = priceAlongOhlcPath(parent, t);
    high = Math.max(high, px);
    low = Math.min(low, px);
    close = px;
  }
  if (progress >= 1) {
    return {
      time: parent.time,
      open: parent.open,
      high: parent.high,
      low: parent.low,
      close: parent.close,
      volume: parent.volume,
    };
  }
  // Ensure visited extremes match parent once the path has reached them.
  const bullish = parent.close >= parent.open;
  if (progress >= 1 / 3) {
    if (bullish) low = Math.min(low, parent.low);
    else high = Math.max(high, parent.high);
  }
  if (progress >= 2 / 3) {
    if (bullish) high = Math.max(high, parent.high);
    else low = Math.min(low, parent.low);
  }
  return {
    time: parent.time,
    open: parent.open,
    high,
    low,
    close,
    volume: parent.volume * progress,
  };
}
