import type { Bar } from "@/domain";

/**
 * Keep every real candle. Missing minutes stay missing.
 * A print that is a few seconds off its candle open is moved onto that
 * open, and two prints that share a candle become one: first open,
 * highest high, lowest low, last close. No extra candles are created,
 * and no price is invented for a time the feed did not send.
 */
export function fillSingleHourGaps(
  bars: readonly Bar[],
  stepSec = 0,
  _maxHoleSec = 0,
): Bar[] {
  if (bars.length === 0) return [];
  const bucket = stepSec > 0 && stepSec < 86_400 ? stepSec : 0;
  const ordered = [...bars].sort((a, b) => a.time - b.time);
  const out: Bar[] = [];
  for (const bar of ordered) {
    const time = bucket > 0 ? Math.floor(bar.time / bucket) * bucket : bar.time;
    const placed = time === bar.time ? bar : { ...bar, time };
    const prev = out[out.length - 1];
    if (prev && prev.time === placed.time) {
      out[out.length - 1] = {
        time: placed.time,
        open: prev.open,
        high: Math.max(prev.high, bar.high),
        low: Math.min(prev.low, bar.low),
        close: placed.close,
        volume: Math.max(prev.volume || 0, placed.volume || 0),
      };
      continue;
    }
    out.push({
      time: placed.time,
      open: placed.open,
      high: placed.high,
      low: placed.low,
      close: placed.close,
      volume: placed.volume,
    });
  }
  return out;
}
