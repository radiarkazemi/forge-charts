import type { Bar } from "@/domain";

/**
 * The 1H feed drops the 17:00 New York candle (the daily session roll).
 * That one missing hour is a blank gap on the chart. A weekend hole is much
 * larger and stays empty.
 *
 * Insert one connecting candle only when the neighbors are exactly two hours
 * apart, so the hour exists and the price joins the next open.
 */
export function fillSingleHourGaps(bars: readonly Bar[], stepSec: number): Bar[] {
  if (stepSec !== 3600 || bars.length < 2) return [...bars];
  const ordered = [...bars].sort((a, b) => a.time - b.time);
  const out: Bar[] = [];
  for (const bar of ordered) {
    const prev = out[out.length - 1];
    if (prev && bar.time - prev.time === stepSec * 2) {
      const open = prev.close;
      const close = bar.open;
      out.push({
        time: prev.time + stepSec,
        open,
        close,
        high: Math.max(open, close),
        low: Math.min(open, close),
        volume: 0,
      });
    }
    if (prev && prev.time === bar.time) {
      out[out.length - 1] = {
        time: bar.time,
        open: prev.open,
        high: Math.max(prev.high, bar.high),
        low: Math.min(prev.low, bar.low),
        close: bar.close,
        volume: Math.max(prev.volume || 0, bar.volume || 0),
      };
      continue;
    }
    out.push(bar);
  }
  return out;
}
