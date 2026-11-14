import type { Bar } from "@/domain";

/**
 * Keep every real candle. Missing minutes stay missing.
 * Two prints that share a timestamp become one candle: first open,
 * highest high, lowest low, last close. No extra candles are created,
 * and no price is invented for a time the feed did not send.
 */
export function fillSingleHourGaps(
  bars: readonly Bar[],
  _stepSec = 0,
  _maxHoleSec = 0,
): Bar[] {
  if (bars.length === 0) return [];
  const ordered = [...bars].sort((a, b) => a.time - b.time);
  const out: Bar[] = [];
  for (const bar of ordered) {
    const prev = out[out.length - 1];
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
    out.push({
      time: bar.time,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.volume,
    });
  }
  return out;
}
