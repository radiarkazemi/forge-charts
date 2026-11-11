/**
 * Tehran candles sit on the real clock, so a missing minute or a holiday
 * leaves a hole. Pack only the bars that exist, oldest to newest, one slot
 * apart. Nothing is invented for the hole.
 *
 * The newest bar keeps its real timestamp. Older bars shift toward it.
 * Bars already on the chart keep their packed time when older history arrives.
 */

import type { Bar } from "@/domain";

export interface TsePackedSeries {
  readonly step: number;
  readonly realTimes: readonly number[];
  readonly packed: readonly Bar[];
}

function dedupe(bars: readonly Bar[]): Bar[] {
  const byTime = new Map<number, Bar>();
  for (const bar of bars) {
    const time = Math.floor(bar.time);
    if (!Number.isFinite(time) || time <= 0) continue;
    if (![bar.open, bar.high, bar.low, bar.close].every(Number.isFinite)) continue;
    if (bar.close <= 0) continue;
    const prev = byTime.get(time);
    if (!prev) {
      byTime.set(time, { ...bar, time });
      continue;
    }
    byTime.set(time, {
      time,
      open: prev.open,
      high: Math.max(prev.high, bar.high),
      low: Math.min(prev.low, bar.low),
      close: bar.close,
      volume: Math.max(prev.volume, bar.volume),
    });
  }
  return [...byTime.values()].sort((a, b) => a.time - b.time);
}

export function emptyTseSeries(step: number): TsePackedSeries {
  return { step: Math.max(1, step), realTimes: [], packed: [] };
}

/**
 * Where the newest bar sits on the packed scale.
 * Daily and higher resolutions must be 00:00 UTC — the charting library
 * otherwise snaps them onto the cash session and opens the holes again.
 * Intraday keeps the real timestamp so the live candle stays put.
 */
function slotAnchor(last: number, step: number): number {
  if (step >= 86_400 && step % 86_400 === 0) return Math.floor(last / 86_400) * 86_400;
  return last;
}

/** First page. Gaps before the newest bar close; nothing is invented. */
export function packNewestWindow(bars: readonly Bar[], step: number): TsePackedSeries {
  const real = dedupe(bars);
  const slot = Math.max(1, Math.floor(step));
  if (real.length === 0) return emptyTseSeries(slot);
  const last = slotAnchor(real[real.length - 1]!.time, slot);
  const packed = real.map((bar, i) => ({
    ...bar,
    time: last - (real.length - 1 - i) * slot,
  }));
  return { step: slot, realTimes: real.map((bar) => bar.time), packed };
}

/** Older real bars go to the left. Packed times already on the chart do not move. */
export function prependOlder(series: TsePackedSeries, older: readonly Bar[]): TsePackedSeries {
  if (series.packed.length === 0) return packNewestWindow(older, series.step);
  const firstReal = series.realTimes[0]!;
  const fresh = dedupe(older).filter((bar) => bar.time < firstReal);
  if (fresh.length === 0) return series;
  const firstPacked = series.packed[0]!.time;
  const slot = series.step;
  const added = fresh.map((bar, i) => ({
    ...bar,
    time: firstPacked - (fresh.length - i) * slot,
  }));
  return {
    step: slot,
    realTimes: [...fresh.map((bar) => bar.time), ...series.realTimes],
    packed: [...added, ...series.packed],
  };
}

/** A live bar updates the last slot, or opens the next slot. Missing minutes are skipped. */
export function appendLive(series: TsePackedSeries, bar: Bar): { series: TsePackedSeries; packed: Bar } {
  if (series.packed.length === 0) {
    const next = packNewestWindow([bar], series.step);
    return { series: next, packed: next.packed[0]! };
  }
  const lastReal = series.realTimes[series.realTimes.length - 1]!;
  const lastPacked = series.packed[series.packed.length - 1]!;
  if (bar.time <= lastReal) {
    if (bar.time !== lastReal) return { series, packed: lastPacked };
    const updated: Bar = { ...bar, time: lastPacked.time };
    const packed = series.packed.slice();
    packed[packed.length - 1] = updated;
    return { series: { ...series, packed }, packed: updated };
  }
  const packedBar: Bar = { ...bar, time: lastPacked.time + series.step };
  return {
    series: {
      step: series.step,
      realTimes: [...series.realTimes, bar.time],
      packed: [...series.packed, packedBar],
    },
    packed: packedBar,
  };
}

/** Real bars newer than the packed tail (a refetch) extend the series in order. */
export function appendNewer(series: TsePackedSeries, bars: readonly Bar[]): TsePackedSeries {
  if (series.packed.length === 0) return packNewestWindow(bars, series.step);
  const lastReal = series.realTimes[series.realTimes.length - 1]!;
  let next = series;
  for (const bar of dedupe(bars)) {
    if (bar.time <= lastReal && bar.time !== lastReal) continue;
    next = appendLive(next, bar).series;
  }
  return next;
}

export function slicePacked(
  series: TsePackedSeries,
  to: number,
  countBack: number,
  firstPage: boolean,
): Bar[] {
  const n = Math.max(1, Math.floor(countBack) || 1);
  if (series.packed.length === 0) return [];
  if (firstPage) return series.packed.slice(-n);
  let end = series.packed.findIndex((bar) => bar.time >= to);
  if (end < 0) end = series.packed.length;
  if (end === 0) return [];
  return series.packed.slice(Math.max(0, end - n), end);
}
