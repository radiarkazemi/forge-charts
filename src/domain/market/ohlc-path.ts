import type { Bar } from "./bar";

/** Deterministic 0..1 hash from bar time + sample index (stable noise). */
function hash01(seed: number, i: number): number {
  const x = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Natural intra-bar path through a closed candle’s OHLC.
 * Waypoints: bullish O→L→H→C, bearish O→H→L→C, with micro-wiggle so
 * the forming candle does not slide in three straight lines.
 */
export function priceAlongOhlcPath(
  parent: Pick<Bar, "time" | "open" | "high" | "low" | "close">,
  t01: number,
): number {
  const t = Math.min(1, Math.max(0, t01));
  const bullish = parent.close >= parent.open;
  const p1 = parent.open;
  const p2 = bullish ? parent.low : parent.high;
  const p3 = bullish ? parent.high : parent.low;
  const p4 = parent.close;
  const span = Math.max(parent.high - parent.low, Math.abs(parent.close) * 1e-6, 1e-6);

  // Ease between the three classic legs with unequal time weights
  // (markets often probe one extreme, reverse, then drift to close).
  let base: number;
  if (t < 0.28) {
    const f = easeInOut(t / 0.28);
    base = p1 + (p2 - p1) * f;
  } else if (t < 0.62) {
    const f = easeInOut((t - 0.28) / 0.34);
    base = p2 + (p3 - p2) * f;
  } else {
    const f = easeInOut((t - 0.62) / 0.38);
    base = p3 + (p4 - p3) * f;
  }

  // Micro noise that shrinks near the end so we land on close.
  const damp = (1 - t) * (1 - t);
  const n1 = (hash01(parent.time, Math.floor(t * 64)) - 0.5) * 2;
  const n2 = Math.sin(t * 41.7 + parent.time * 0.01) * 0.35;
  const noise = (n1 * 0.55 + n2 * 0.45) * span * 0.045 * damp;
  return base + noise;
}

function easeInOut(x: number): number {
  const u = Math.min(1, Math.max(0, x));
  return u * u * (3 - 2 * u);
}

/**
 * Build the forming (partial) OHLC for `parent` at progress ∈ [0,1].
 * High/low expand only over extremes visited so far on the path.
 */
export function formingBarFromOhlc(parent: Bar, progress01: number): Bar {
  const progress = Math.min(1, Math.max(0, progress01));
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

  const samples = Math.max(4, Math.ceil(progress * 96));
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

  // Lock extremes once the path has visited them.
  const bullish = parent.close >= parent.open;
  if (progress >= 0.28) {
    if (bullish) low = Math.min(low, parent.low);
    else high = Math.max(high, parent.high);
  }
  if (progress >= 0.62) {
    if (bullish) high = Math.max(high, parent.high);
    else low = Math.min(low, parent.low);
  }

  // Never exceed the parent envelope.
  high = Math.min(Math.max(high, parent.open, close), parent.high);
  low = Math.max(Math.min(low, parent.open, close), parent.low);

  return {
    time: parent.time,
    open: parent.open,
    high,
    low,
    close,
    volume: parent.volume * progress,
  };
}
