/**
 * Watches the Indicators “Dealing Ranges” study and paints Orca-detected
 * dealing-range boxes/lines onto the chart (CL custom studies cannot draw
 * rectangles as plots).
 */

import { useEffect, useRef } from "react";
import { useServices } from "@/app/use-services";
import { useStore } from "@/shared/hooks/useStore";
import type { EntityId } from "@/infrastructure/tradingview";
import {
  barsFromChartExport,
  computeDealingRanges,
  paintOrcaOnChart,
  type DealingRangesOptions,
} from "@/features/pine/orca-runtime";
import {
  DEALING_RANGES_DEFAULTS,
  DEALING_RANGES_STUDY_NAME,
} from "./dealing-ranges-indicator";

export function useDealingRangesStudy(enabled = true): void {
  const { chart } = useServices();
  const ready = useStore(chart.state, (s) => s.ready);
  const symbol = useStore(chart.state, (s) => s.symbol);
  const interval = useStore(chart.state, (s) => s.interval);
  const entityIdsRef = useRef<EntityId[]>([]);
  const busyRef = useRef(false);
  const lastKeyRef = useRef("");

  useEffect(() => {
    if (!enabled || !ready) return;
    const widget = chart.getWidget();
    if (!widget) return;

    let cancelled = false;

    const clearDrawings = () => {
      for (const id of entityIdsRef.current) {
        try {
          chart.removeEntity(id);
        } catch {
          /* ignore */
        }
      }
      entityIdsRef.current = [];
    };

    const readOptions = (studyId: EntityId): DealingRangesOptions | null => {
      try {
        const api = widget.activeChart()?.getStudyById(studyId);
        if (!api) return null;
        const values = api.getInputValues() ?? [];
        const map = new Map<string, unknown>();
        for (const item of values) {
          map.set(String(item.id), item.value);
        }
        const num = (id: string, fallback: number) => {
          const v = Number(map.get(id));
          return Number.isFinite(v) ? v : fallback;
        };
        const str = (id: string, fallback: string) => {
          const v = map.get(id);
          return typeof v === "string" ? v : fallback;
        };
        const bool = (id: string, fallback: boolean) => {
          const v = map.get(id);
          return typeof v === "boolean" ? v : fallback;
        };
        return {
          maxRanges: Math.max(1, Math.floor(num("maxRanges", DEALING_RANGES_DEFAULTS.maxRanges))),
          lookbackDays: Math.max(1, Math.floor(num("lookbackDays", DEALING_RANGES_DEFAULTS.lookbackDays))),
          fromDate: str("fromDate", DEALING_RANGES_DEFAULTS.fromDate),
          toDate: str("toDate", DEALING_RANGES_DEFAULTS.toDate),
          showFibs: bool("showFibs", DEALING_RANGES_DEFAULTS.showFibs),
          pivotLeft: Math.max(1, Math.floor(num("pivotLeft", DEALING_RANGES_DEFAULTS.pivotLeft))),
          pivotRight: Math.max(1, Math.floor(num("pivotRight", DEALING_RANGES_DEFAULTS.pivotRight))),
          extendBars: Math.max(1, Math.floor(num("extendBars", DEALING_RANGES_DEFAULTS.extendBars))),
          breakOnWick: bool("breakOnWick", DEALING_RANGES_DEFAULTS.breakOnWick),
        };
      } catch {
        return null;
      }
    };

    const findStudyIds = (): EntityId[] => {
      try {
        const studies = widget.activeChart()?.getAllStudies() ?? [];
        return studies
          .filter((s) => /dealing\s*ranges/i.test(s.name ?? ""))
          .map((s) => s.id as EntityId);
      } catch {
        return [];
      }
    };

    const repaint = async () => {
      if (cancelled || busyRef.current) return;
      const studyIds = findStudyIds();
      if (studyIds.length === 0) {
        clearDrawings();
        lastKeyRef.current = "";
        return;
      }
      // Use the first Dealing Ranges study’s inputs (multi-instance rare).
      const opts = readOptions(studyIds[0]!);
      if (!opts) return;
      const key = JSON.stringify({ symbol, interval, opts, studies: studyIds });
      if (key === lastKeyRef.current && entityIdsRef.current.length > 0) return;

      busyRef.current = true;
      try {
        const api = widget.activeChart();
        if (!api) return;
        const exported = await api.exportData({
          includeTime: true,
          includeSeries: true,
          includedStudies: [],
        });
        if (cancelled) return;
        const bars = barsFromChartExport(exported);
        if (bars.length < 20) {
          clearDrawings();
          return;
        }
        const cmds = computeDealingRanges(bars, opts);
        clearDrawings();
        const ids = await paintOrcaOnChart(api, cmds);
        if (cancelled) {
          for (const id of ids) chart.removeEntity(id);
          return;
        }
        entityIdsRef.current = ids;
        lastKeyRef.current = key;
      } catch {
        /* ignore transient export errors */
      } finally {
        busyRef.current = false;
      }
    };

    void repaint();
    const poll = window.setInterval(() => {
      void repaint();
    }, 2500);

    const onStudy = () => {
      lastKeyRef.current = "";
      void repaint();
    };
    try {
      widget.subscribe("study_event", onStudy);
      widget.subscribe("study_properties_changed", onStudy);
    } catch {
      /* ignore */
    }

    return () => {
      cancelled = true;
      window.clearInterval(poll);
      try {
        widget.unsubscribe("study_event", onStudy);
        widget.unsubscribe("study_properties_changed", onStudy);
      } catch {
        /* ignore */
      }
      clearDrawings();
    };
  }, [chart, enabled, ready, symbol, interval]);
}
