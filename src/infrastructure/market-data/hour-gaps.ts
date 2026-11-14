import type { Bar } from "@/domain";

/** Do not invent more than this many candles for one hole. */
const MAX_INSERTS = 8_000;

/**
 * Blank space on the chart is a missing candle, not a price jump.
 *
 * Gold drops the 17:00 New York hour (about 65 minutes) every weekday.
 * The same feed drops 10–55 minutes on other symbols, and one longer
 * crypto outage. Insert a candle on each missing step so the series
 * stays continuous. A weekend (or any hole longer than `maxHoleSec`)
 * stays empty. Daily and weekly bars are left alone.
 *
 * One missing bar keeps the old shape: it opens at the previous close
 * and closes at the next open. A longer hole is flat at the previous
 * close until the last inserted bar, which joins the next open.
 */
export function fillSingleHourGaps(
  bars: readonly Bar[],
  stepSec: number,
  maxHoleSec = 12 * 60 * 60,
): Bar[] {
  if (stepSec <= 0 || stepSec >= 86_400 || bars.length < 2) return [...bars];
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
    if (prev) {
      const gap = bar.time - prev.time;
      const missing = gap / stepSec - 1;
      if (
        gap > stepSec &&
        gap <= maxHoleSec &&
        Number.isInteger(missing) &&
        missing > 0 &&
        missing <= MAX_INSERTS
      ) {
        for (let i = 1; i <= missing; i += 1) {
          const time = prev.time + stepSec * i;
          const open = prev.close;
          const close = i === missing ? bar.open : prev.close;
          out.push({
            time,
            open,
            close,
            high: Math.max(open, close),
            low: Math.min(open, close),
            volume: 0,
          });
        }
      }
    }
    out.push(bar);
  }
  return out;
}
