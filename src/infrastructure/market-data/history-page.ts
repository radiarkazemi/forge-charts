/**
 * TradingView / Chartix / Faraz first-paint rule:
 * honor `countBack` (visible window ~300 bars). Do not round a first page up
 * to thousands of candles — left-scroll pages more later.
 */

/** Typical Charting Library first `getBars` (viewport + indicator warmup). */
export const FIRST_HISTORY_PAGE = 360;
/** Extra bars when the user scrolls left. */
export const SCROLL_HISTORY_PAGE = 1_200;

export function historyFetchLimit(countBack: number | undefined): number {
  const asked = Math.max(1, Math.floor(Number(countBack) || 300));
  // Quotes / live seed — never inflate to a full chart page.
  if (asked <= 24) return asked;
  if (asked <= FIRST_HISTORY_PAGE + 120) {
    return Math.min(FIRST_HISTORY_PAGE, Math.max(asked, 160));
  }
  if (asked >= 3_000) return Math.min(asked, 5_000);
  return Math.min(asked, SCROLL_HISTORY_PAGE);
}

export function historyTimeoutMs(limit: number): number {
  return limit <= FIRST_HISTORY_PAGE + 40 ? 8_000 : 22_000;
}
