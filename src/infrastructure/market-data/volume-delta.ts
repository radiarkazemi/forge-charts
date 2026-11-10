/**
 * TradingView quote `volume` (and TSETMC `qTotTran5J`) is the session total,
 * not the last trade. Adding that total onto every timeframe paints the same
 * giant bar on 5m and on 4h. Convert it to the increment since the previous
 * quote so each candle only keeps the volume that printed inside it.
 */

export interface VolumeCursor {
  last: number | null;
}

export function volumeDelta(cursor: VolumeCursor, reported: number): number {
  if (!Number.isFinite(reported) || reported <= 0) return 0;
  const prev = cursor.last;
  if (prev == null) {
    cursor.last = reported;
    // First sample is the day-so-far total — don't dump it into the forming bar.
    return 0;
  }
  if (reported + 1e-9 < prev) {
    // Session reset, or a feed that sends per-trade size.
    if (prev > 1 && reported < prev * 0.25) {
      cursor.last = reported;
      return 0;
    }
    return reported;
  }
  cursor.last = reported;
  const delta = reported - prev;
  return delta > 0 ? delta : 0;
}
