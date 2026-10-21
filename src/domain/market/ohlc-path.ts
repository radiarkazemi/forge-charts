import type { Bar } from "./bar";

/** Deterministic 0..1 hash from bar time + sample index (stable noise). */
function hash01(seed: number, i: number): number {
  const x = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function easeInOut(x: number): number {
  const u = Math.min(1, Math.max(0, x));
  return u * u * (3 - 2 * u);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Natural intra-bar path through a closed candle’s OHLC.
 *
 * Real tape rarely walks O→extreme→extreme→C in three straight lines. We model:
 *   open → early drift → first extreme → pullback → second extreme → settle to close
 * with light, dampened noise so replay looks like live ticks without overshooting
 * the parent envelope at the end.
 */
export function priceAlongOhlcPath(
  parent: Pick<Bar, "time" | "open" | "high" | "low" | "close">,
  t01: number,
): number {
  const t = Math.min(1, Math.max(0, t01));
  const bullish = parent.close >= parent.open;
  const o = parent.open;
  const hi = parent.high;
  const lo = parent.low;
  const c = parent.close;
  const span = Math.max(hi - lo, Math.abs(c) * 1e-6, 1e-6);
  const first = bullish ? lo : hi;
  const second = bullish ? hi : lo;
  // Soft mid between open and close — markets often hover before probing.
  const drift = lerp(o, c, 0.35);

  // Unequal legs: probe → reject → opposite probe → settle.
  const knots: readonly { at: number; px: number }[] = [
    { at: 0, px: o },
    { at: 0.14, px: lerp(o, drift, 0.55) },
    { at: 0.32, px: first },
    { at: 0.48, px: lerp(first, second, 0.28) },
    { at: 0.68, px: second },
    { at: 0.86, px: lerp(second, c, 0.55) },
    { at: 1, px: c },
  ];

  let base = c;
  for (let i = 1; i < knots.length; i += 1) {
    const a = knots[i - 1]!;
    const b = knots[i]!;
    if (t <= b.at || i === knots.length - 1) {
      const spanT = Math.max(1e-6, b.at - a.at);
      const f = easeInOut((t - a.at) / spanT);
      base = lerp(a.px, b.px, f);
      break;
    }
  }

  // Micro pullback / noise that fades into the close so we land exactly on C.
  const damp = (1 - t) * (1 - t);
  const n1 = (hash01(parent.time, Math.floor(t * 96)) - 0.5) * 2;
  const n2 = Math.sin(t * 23.3 + parent.time * 0.017) * 0.45;
  const n3 = Math.sin(t * 71.1 + parent.time * 0.003) * 0.2;
  const noise = (n1 * 0.5 + n2 * 0.35 + n3 * 0.15) * span * 0.038 * damp;
  const raw = base + noise;
  // Soft clamp inside the envelope while forming (hard clamp is applied in formingBar).
  return Math.min(hi, Math.max(lo, raw));
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

  const samples = Math.max(6, Math.ceil(progress * 128));
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

  // Reveal parent extremes gradually once the path has approached them —
  // avoids a sudden full wick snap at a fixed progress gate.
  const bullish = parent.close >= parent.open;
  const firstExtreme = bullish ? parent.low : parent.high;
  const secondExtreme = bullish ? parent.high : parent.low;
  if (progress >= 0.28) {
    const reveal = Math.min(1, (progress - 0.28) / 0.12);
    if (bullish) low = Math.min(low, lerp(close, firstExtreme, reveal));
    else high = Math.max(high, lerp(close, firstExtreme, reveal));
  }
  if (progress >= 0.62) {
    const reveal = Math.min(1, (progress - 0.62) / 0.12);
    if (bullish) high = Math.max(high, lerp(close, secondExtreme, reveal));
    else low = Math.min(low, lerp(close, secondExtreme, reveal));
  }
  if (progress >= 0.92) {
    high = Math.max(high, parent.high);
    low = Math.min(low, parent.low);
    close = lerp(close, parent.close, (progress - 0.92) / 0.08);
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

/**
 * Form a parent candle from real lower-TF bars when available.
 * `progress01` selects how far into the parent period we have “seen”.
 * Falls back to the synthetic OHLC path when `subs` is empty.
 */
export function formingBarFromSubBars(
  parent: Bar,
  subs: readonly Bar[],
  progress01: number,
  barSec: number,
): Bar {
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
  if (!subs.length || barSec <= 0) {
    return formingBarFromOhlc(parent, progress);
  }

  const cutoff = parent.time + Math.max(0, Math.floor(progress * barSec));
  const seen = subs.filter((b) => {
    const t = Number(b.time);
    return t >= parent.time && t <= cutoff;
  });
  if (seen.length === 0) {
    return formingBarFromOhlc(parent, Math.max(progress, 0.02));
  }

  let open = seen[0]!.open;
  let high = seen[0]!.high;
  let low = seen[0]!.low;
  let close = seen[0]!.close;
  let volume = 0;
  for (const b of seen) {
    high = Math.max(high, b.high);
    low = Math.min(low, b.low);
    close = b.close;
    volume += b.volume || 0;
  }
  // Stay inside the known parent envelope when we already have the closed bar.
  high = Math.min(Math.max(high, open, close), parent.high);
  low = Math.max(Math.min(low, open, close), parent.low);
  open = parent.open;

  // When sub-bars are sparse, blend the synthetic path so the candle still
  // breathes between ticks instead of stair-stepping.
  if (seen.length < Math.max(3, Math.floor(barSec / 20))) {
    const synth = formingBarFromOhlc(parent, progress);
    high = Math.max(high, synth.high);
    low = Math.min(low, synth.low);
    // Prefer last real close, but ease toward synth when only one sub printed.
    if (seen.length === 1) {
      close = synth.close;
    }
    high = Math.min(high, parent.high);
    low = Math.max(low, parent.low);
  }

  return {
    time: parent.time,
    open,
    high,
    low,
    close,
    volume: volume || parent.volume * progress,
  };
}
