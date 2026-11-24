/**
 * First-paint bar counts by timeframe. 4H/1H/1D viewports are months wide;
 * capping them at ~240 bars left weeks of empty time on the axis (gold 4H
 * looked like a missing October).
 */

/** Typical Charting Library first `getBars` for sub-hour charts. */
export const FIRST_HISTORY_PAGE = 240;
/** Extra bars when the user scrolls left. */
export const SCROLL_HISTORY_PAGE = 2_400;

/** How many bars the first 4H/1H/1D page must include to fill a 6M-style viewport. */
export function firstHistoryPage(stepSec: number): number {
  if (stepSec >= 86_400) return 600;
  if (stepSec >= 14_400) return 1_200;
  if (stepSec >= 3_600) return 1_500;
  if (stepSec >= 900) return 600;
  return FIRST_HISTORY_PAGE;
}

export function historyFetchLimit(countBack: number | undefined, stepSec = 60): number {
  const asked = Math.max(1, Math.floor(Number(countBack) || 300));
  if (asked <= 24) return asked;
  const first = firstHistoryPage(stepSec);
  const want = Math.max(asked, first);
  if (want >= 3_000) return Math.min(want, 5_000);
  return Math.min(want, SCROLL_HISTORY_PAGE);
}

export function historyTimeoutMs(limit: number): number {
  if (limit <= 300) return 2_500;
  if (limit <= 1_000) return 5_000;
  return 14_000;
}

/** Latest visible page (TF switch / first paint) — do not run hole-repair fetches. */
export function isLiveHistoryPage(range: { to: number; countBack: number }): boolean {
  const now = Math.floor(Date.now() / 1000);
  const to = range.to > 0 ? range.to : now;
  return range.countBack <= 2_000 && now - to < 4 * 3_600;
}

let tfSwitchUntil = 0;
export function markTfSwitch(): void {
  tfSwitchUntil = Date.now() + 1_200;
}
export function isTfSwitching(): boolean {
  return Date.now() < tfSwitchUntil;
}
