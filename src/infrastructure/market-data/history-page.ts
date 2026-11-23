/**
 * TradingView / Chartix / Faraz first-paint rule:
 * honor `countBack` (visible window ~300 bars). Do not round a first page up
 * to thousands of candles — left-scroll pages more later.
 */

/** Typical Charting Library first `getBars` (viewport + indicator warmup). */
export const FIRST_HISTORY_PAGE = 240;
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
  return limit <= FIRST_HISTORY_PAGE + 40 ? 2_500 : 14_000;
}

/** Latest visible page (TF switch / first paint) — do not run hole-repair fetches. */
export function isLiveHistoryPage(range: { to: number; countBack: number }): boolean {
  const now = Math.floor(Date.now() / 1000);
  const to = range.to > 0 ? range.to : now;
  return range.countBack <= 600 && now - to < 4 * 3_600;
}

let tfSwitchUntil = 0;
export function markTfSwitch(): void {
  tfSwitchUntil = Date.now() + 1_200;
}
export function isTfSwitching(): boolean {
  return Date.now() < tfSwitchUntil;
}
