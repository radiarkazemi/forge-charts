import { isMarketSessionOpen, type Bar, type SymbolInfo } from "@/domain";

/**
 * Insert a candle for every in-session step between the first and last print.
 * Weekend, Friday close, and the 17:00–18:00 New York FX break stay empty.
 * Missing session minutes copy the previous close so the chart never drops a
 * traded slot when Mongo or the price API skipped a writer cycle.
 */
export function densifySessionBars(symbol: SymbolInfo, bars: readonly Bar[], stepSec: number): Bar[] {
  if (bars.length < 2 || stepSec < 1 || stepSec >= 86_400) return [...bars];
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
