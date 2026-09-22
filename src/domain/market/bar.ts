/** A single OHLCV candle. `time` is a UNIX timestamp in seconds (UTC). */
export interface Bar {
  readonly time: number;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
}

/** Half-open time window `[from, to)` plus the number of bars the caller wants. */
export interface BarRange {
  readonly from: number;
  readonly to: number;
  readonly countBack: number;
}

export function isValidBar(bar: Bar): boolean {
  return (
    Number.isFinite(bar.time) &&
    Number.isFinite(bar.open) &&
    Number.isFinite(bar.high) &&
    Number.isFinite(bar.low) &&
    Number.isFinite(bar.close) &&
    bar.high >= bar.low
  );
}

/** Sort ascending by time and drop duplicates, keeping the last occurrence. */
export function normalizeBars(bars: readonly Bar[]): Bar[] {
  const byTime = new Map<number, Bar>();
  for (const bar of bars) {
    if (isValidBar(bar)) byTime.set(bar.time, bar);
  }
  return [...byTime.values()].sort((a, b) => a.time - b.time);
}

/** Merge a streaming update into the tail of a bar series (mutation-free). */
export function upsertBar(bars: readonly Bar[], incoming: Bar): Bar[] {
  const last = bars.at(-1);
  if (!last || incoming.time > last.time) return [...bars, incoming];
  if (incoming.time === last.time) return [...bars.slice(0, -1), incoming];
  return [...bars];
}
