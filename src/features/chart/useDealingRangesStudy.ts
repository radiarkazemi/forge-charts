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
          .filter((s) => {
            const name = `${s.name ?? ""} ${s.id ?? ""}`;
            return /dealing\s*ranges/i.test(name) || /DealingRanges@/i.test(name);
          })
          .map((s) => s.id as EntityId);
      } catch {
        return [];
      }
    };

    const repaint = async (force = false) => {
      if (cancelled || busyRef.current) return;
      const studyIds = findStudyIds();
      if (studyIds.length === 0) {
        clearDrawings();
        lastKeyRef.current = "";
        return;
      }
      const opts = readOptions(studyIds[0]!) ?? {
        maxRanges: DEALING_RANGES_DEFAULTS.maxRanges,
        lookbackDays: DEALING_RANGES_DEFAULTS.lookbackDays,
        fromDate: DEALING_RANGES_DEFAULTS.fromDate,
        toDate: DEALING_RANGES_DEFAULTS.toDate,
        showFibs: DEALING_RANGES_DEFAULTS.showFibs,
        pivotLeft: DEALING_RANGES_DEFAULTS.pivotLeft,
        pivotRight: DEALING_RANGES_DEFAULTS.pivotRight,
        extendBars: DEALING_RANGES_DEFAULTS.extendBars,
        breakOnWick: DEALING_RANGES_DEFAULTS.breakOnWick,
      };
      const key = JSON.stringify({ symbol, interval, opts, studies: studyIds });
      if (!force && key === lastKeyRef.current && entityIdsRef.current.length > 0) return;

      busyRef.current = true;
      try {
        const api = widget.activeChart();
        if (!api) return;
        const nowSec = Math.floor(Date.now() / 1000);
        const fromSec = nowSec - Math.max(opts.lookbackDays, 7) * 86_400;
        const exported = await api.exportData({
          includeTime: true,
          includeSeries: true,
          includedStudies: [],
          from: fromSec,
          to: nowSec + 86_400,
        });
        if (cancelled) return;
        let bars = barsFromChartExport(exported);
        // Fallback: export whatever is loaded if ranged export is empty.
        if (bars.length < 20) {
          const all = await api.exportData({
            includeTime: true,
            includeSeries: true,
            includedStudies: [],
          });
          bars = barsFromChartExport(all);
        }
        if (bars.length < 20) {
          clearDrawings();
          return;
        }
        const cmds = computeDealingRanges(bars, opts);
        clearDrawings();
        if (cmds.length === 0) {
          lastKeyRef.current = key;
          return;
        }
        const ids = await paintOrcaOnChart(api, cmds);
        if (cancelled) {
          for (const id of ids) chart.removeEntity(id);
          return;
        }
        entityIdsRef.current = ids;
        lastKeyRef.current = key;
      } catch (err) {
        console.warn("[forge-dr] paint failed", err);
      } finally {
        busyRef.current = false;
      }
    };

    void repaint(true);
    const poll = window.setInterval(() => {
      void repaint(false);
    }, 1500);

    const onStudy = () => {
      lastKeyRef.current = "";
      window.setTimeout(() => {
        void repaint(true);
      }, 200);
    };
    try {
      widget.subscribe("study_event", onStudy);
      widget.subscribe("study_properties_changed", onStudy);
      widget.subscribe("onAutoSaveNeeded", onStudy);
    } catch {
      /* ignore */
    }

    return () => {
      cancelled = true;
      window.clearInterval(poll);
      try {
        widget.unsubscribe("study_event", onStudy);
        widget.unsubscribe("study_properties_changed", onStudy);
        widget.unsubscribe("onAutoSaveNeeded", onStudy);
      } catch {
        /* ignore */
      }
      clearDrawings();
    };
  }, [chart, enabled, ready, symbol, interval]);
}
