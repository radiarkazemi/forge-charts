import { isMarketSessionOpen, type Bar, type SymbolInfo } from "@/domain";

/**
 * Carry last close across every in-session slot up to `toBucket` (exclusive
 * unless `includeTarget`). Live subscribe used to jump the forming candle to
 * "now", which left 5m/15m holes until the next refresh.
 */
export function liveCarryBars(
  symbol: SymbolInfo,
  fromBar: Bar,
  toBucket: number,
  stepSec: number,
  includeTarget = false,
): Bar[] {
  if (stepSec < 1 || !Number.isFinite(toBucket) || toBucket <= fromBar.time) return [];
  const px = fromBar.close;
  const out: Bar[] = [];
  const maxSteps = Math.min(2_000, Math.max(8, Math.floor((36 * 3_600) / stepSec) + 2));
  let cursor = fromBar.time + stepSec;
  let steps = 0;
  while (cursor < toBucket && steps < maxSteps) {
    if (isMarketSessionOpen(symbol, cursor * 1000)) {
      out.push({ time: cursor, open: px, high: px, low: px, close: px, volume: 0 });
    }
    cursor += stepSec;
    steps += 1;
  }
  if (
    includeTarget &&
    toBucket > fromBar.time &&
    isMarketSessionOpen(symbol, toBucket * 1000) &&
    (out.length === 0 || out[out.length - 1]!.time < toBucket)
  ) {
    out.push({ time: toBucket, open: px, high: px, low: px, close: px, volume: 0 });
  }
  return out;
}

/**
 * Insert a candle for every in-session step between the first and last print.
 * Weekend, Friday close, and the 17:00–18:00 New York FX break stay empty.
 * Missing session minutes copy the previous close so the chart never drops a
 * traded slot when Mongo or the price API skipped a writer cycle.
 */
export function densifySessionBars(symbol: SymbolInfo, bars: readonly Bar[], stepSec: number): Bar[] {
  if (bars.length < 2 || stepSec < 1) return [...bars];
  // Daily+: only fill weekday session days (never invent Saturday/Sunday).
  if (stepSec >= 86_400) {
    const ordered = [...bars].sort((a, b) => a.time - b.time);
    const out: Bar[] = [];
    for (const bar of ordered) {
      const prev = out[out.length - 1];
      if (prev) {
        let cursor = prev.time + stepSec;
        while (cursor < bar.time) {
          if (isMarketSessionOpen(symbol, cursor * 1000)) {
            const px = prev.close;
            out.push({ time: cursor, open: px, high: px, low: px, close: px, volume: 0 });
          }
          cursor += stepSec;
        }
      }
      out.push(bar);
    }
    return out;
  }
  const ordered = [...bars].sort((a, b) => a.time - b.time);
  const out: Bar[] = [];
  const nowSec = Math.floor(Date.now() / 1000);
  const lastAllowed = Math.min(ordered[ordered.length - 1]!.time, Math.floor(nowSec / stepSec) * stepSec);

  for (let i = 0; i < ordered.length; i += 1) {
    const bar = ordered[i]!;
    const prev = out[out.length - 1];
    if (prev && bar.time <= prev.time) {
      out[out.length - 1] = {
        time: prev.time,
        open: prev.open,
        high: Math.max(prev.high, bar.high),
        low: Math.min(prev.low, bar.low),
        close: bar.close,
        volume: Math.max(prev.volume, bar.volume),
      };
      continue;
    }
    if (prev) {
      let cursor = prev.time + stepSec;
      const stop = Math.min(bar.time, lastAllowed + stepSec);
      while (cursor < stop) {
        if (isMarketSessionOpen(symbol, cursor * 1000)) {
          const px = prev.close;
          out.push({ time: cursor, open: px, high: px, low: px, close: px, volume: 0 });
        }
        cursor += stepSec;
      }
    }
    out.push(bar);
  }
  return out;
}

/** Union of two series: extra timestamps from `fill` land in `primary` holes. */
export function unionFillBars(primary: readonly Bar[], fill: readonly Bar[], stepSec: number): Bar[] {
  if (!fill.length) return [...primary];
  if (!primary.length) return [...fill];
  const byTime = new Map<number, Bar>();
  const bucket = (time: number) => (stepSec > 0 ? Math.floor(time / stepSec) * stepSec : time);
  for (const bar of fill) byTime.set(bucket(bar.time), { ...bar, time: bucket(bar.time) });
  for (const bar of primary) byTime.set(bucket(bar.time), { ...bar, time: bucket(bar.time) });
  return [...byTime.values()].sort((a, b) => a.time - b.time);
}
