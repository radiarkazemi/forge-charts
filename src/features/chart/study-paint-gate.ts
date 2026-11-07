/**
 * Shared gates for Forge custom studies that paint via createShape
 * (CL Visibility / interval filters do not hide those drawings by themselves).
 */

import { intervalSeconds, parseInterval, type Interval } from "@/domain";

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
 * Days/weeks/months are always blocked when maxMinutes > 0.
 */
export function chartAllowedByMaxMinutes(interval: string, maxMinutes: number): boolean {
  if (!Number.isFinite(maxMinutes) || maxMinutes <= 0) return true;
  const raw = String(interval || "").trim();
  if (!raw) return false;
  try {
    const parsed = parseInterval(raw as Interval);
    if (parsed.unit === "days" || parsed.unit === "weeks" || parsed.unit === "months") {
      return false;
    }
    return parsed.seconds <= maxMinutes * 60;
  } catch {
    return false;
  }
}

/** Live resolution from the active chart (avoids stale React store interval). */
export function liveChartResolution(widget: {
  activeChart?: () => { resolution?: () => string } | null;
} | null | undefined): string {
  try {
    const res = widget?.activeChart?.()?.resolution?.();
    return res != null ? String(res) : "";
  } catch {
    return "";
  }
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

/**
 * Global “chart is painting shapes” window — autosave / profile sync should
 * wait so createShape storms do not also trigger full widget.save().
 */
let paintBusyUntilMs = 0;

export function markChartPaintBusy(ms = 2_000): void {
  const until = Date.now() + Math.max(250, ms);
  if (until > paintBusyUntilMs) paintBusyUntilMs = until;
}

export function isChartPaintBusy(): boolean {
  return Date.now() < paintBusyUntilMs;
}
