/**
 * Shared OHLC export for Forge study painters.
 * Many hooks used to call chart.exportData() in parallel (indicators / live
 * refresh / presence) — that stalls CL. One in-flight export + short TTL
 * keeps the chart responsive without remounting.
 */

import type { IChartWidgetApi } from "@/infrastructure/tradingview";
import { barsFromChartExport, type OrcaBar } from "@/features/pine/orca-runtime";

/** Soft cap for structure painters — enough history, far less main-thread work. */
export const STUDY_MAX_BARS = 1_800;
export const STUDY_DEBOUNCE_MS = 750;
export const STUDY_PRESENCE_POLL_MS = 12_000;
export const STUDY_LIVE_REFRESH_MS = 45_000;
export const STUDY_PAINT_MUTE_MS = 2_000;

const EXPORT_TTL_MS = 900;

let inflight: Promise<OrcaBar[]> | null = null;
let cached: { readonly bars: readonly OrcaBar[]; readonly at: number } | null = null;

export function invalidateChartExportCache(): void {
  cached = null;
}

/**
 * Export series OHLC once; concurrent callers share the same promise.
 * Result is sliced to `maxBars` (newest).
 */
export async function exportChartBarsCached(
  chart: IChartWidgetApi,
  maxBars: number = STUDY_MAX_BARS,
): Promise<OrcaBar[]> {
  const limit = Math.max(200, Math.min(5_000, Math.floor(maxBars)));
  const now = Date.now();
  if (cached && now - cached.at < EXPORT_TTL_MS) {
    const bars = cached.bars;
    return bars.length > limit ? bars.slice(bars.length - limit) : [...bars];
  }

  if (!inflight) {
    inflight = (async () => {
      try {
        const exported = await chart.exportData({
          includeTime: true,
          includeSeries: true,
          includedStudies: [],
        });
        const bars = barsFromChartExport(exported);
        cached = { bars, at: Date.now() };
        return bars;
      } finally {
        inflight = null;
      }
    })();
  }

  const bars = await inflight;
  return bars.length > limit ? bars.slice(bars.length - limit) : [...bars];
}
