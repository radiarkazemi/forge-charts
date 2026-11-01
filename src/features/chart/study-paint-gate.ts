/**
 * Shared gates for Forge custom studies that paint via createShape
 * (CL Visibility / interval filters do not hide those drawings by themselves).
 */

import { intervalSeconds, type Interval } from "@/domain";

export function chartIntervalSeconds(interval: string): number {
  try {
    return Math.max(1, intervalSeconds(String(interval) as Interval));
  } catch {
    return 60;
  }
}

/**
 * `maxMinutes <= 0` → allow any chart TF.
 * Otherwise allow only when candle length ≤ maxMinutes (includes seconds charts).
 */
export function chartAllowedByMaxMinutes(interval: string, maxMinutes: number): boolean {
  if (!Number.isFinite(maxMinutes) || maxMinutes <= 0) return true;
  return chartIntervalSeconds(interval) <= maxMinutes * 60;
}

/** Honor study eye / Visibility-tab hide for the active resolution. */
export function studyIsVisible(api: { isVisible?: () => boolean } | null | undefined): boolean {
  try {
    if (!api || typeof api.isVisible !== "function") return true;
    return api.isVisible() !== false;
  } catch {
    return true;
  }
}
