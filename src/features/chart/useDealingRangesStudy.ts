/**
 * Watches the Indicators “Dealing Ranges” study and paints Orca-detected
 * dealing-range boxes/lines onto the chart (CL custom studies cannot draw
 * rectangles as plots).
 *
 * Critical: do NOT subscribe to onAutoSaveNeeded — creating shapes fires
 * autosave, which would force-repaint forever and freeze the chart.
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
  type DrawCmd,
} from "@/features/pine/orca-runtime";
import { DEALING_RANGES_DEFAULTS } from "./dealing-ranges-indicator";

/** Cap bars fed into Orca so 1m/seconds charts stay responsive. */
const MAX_BARS = 5_000;
/** Debounce study add/remove/input changes before expensive export+paint. */
const STUDY_DEBOUNCE_MS = 350;
/** Cheap presence check only (no export) while a study is active. */
const PRESENCE_POLL_MS = 5_000;

function fingerprintCmds(cmds: readonly DrawCmd[]): string {
  if (cmds.length === 0) return "";
  // Sample ends + length — enough to skip identical repaints without huge strings.
  const head = cmds.slice(0, 6);
  const tail = cmds.length > 6 ? cmds.slice(-6) : [];
  const part = (c: DrawCmd) =>
    `${c.kind}:${c.t1}:${c.p1}:${c.t2 ?? ""}:${c.p2 ?? ""}:${c.color}`;
  return `${cmds.length}|${[...head, ...tail].map(part).join(";")}`;
}

function defaultOpts(): DealingRangesOptions {
  return {
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
}

export function useDealingRangesStudy(enabled = true): void {
  const { chart } = useServices();
  const ready = useStore(chart.state, (s) => s.ready);
  const symbol = useStore(chart.state, (s) => s.symbol);
  const interval = useStore(chart.state, (s) => s.interval);
  const entityIdsRef = useRef<EntityId[]>([]);
  const busyRef = useRef(false);
  const lastKeyRef = useRef("");
  const lastFpRef = useRef("");
  const genRef = useRef(0);
  const pendingRef = useRef(false);

  useEffect(() => {
    if (!enabled || !ready) return;
    const widget = chart.getWidget();
    if (!widget) return;

    let cancelled = false;
    let studyTimer: number | undefined;

    const clearDrawings = () => {
      const ids = entityIdsRef.current;
      entityIdsRef.current = [];
      for (const id of ids) {
        try {
          chart.removeEntity(id);
        } catch {
          /* ignore */
        }
      }
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
      if (cancelled) return;
      if (busyRef.current) {
        pendingRef.current = true;
        return;
      }

      const studyIds = findStudyIds();
      if (studyIds.length === 0) {
        // Invalidate any in-flight paint via generation bump.
        genRef.current += 1;
        clearDrawings();
        lastKeyRef.current = "";
        lastFpRef.current = "";
        return;
      }

      const opts = readOptions(studyIds[0]!) ?? defaultOpts();
      const key = JSON.stringify({ symbol, interval, opts, studies: studyIds });
      if (!force && key === lastKeyRef.current && entityIdsRef.current.length > 0) {
        return;
      }

      const myGen = ++genRef.current;
      busyRef.current = true;
      try {
        const api = widget.activeChart();
        if (!api) return;

        // Single export of currently loaded series — avoid double exportData.
        const exported = await api.exportData({
          includeTime: true,
          includeSeries: true,
          includedStudies: [],
        });
        if (cancelled || myGen !== genRef.current) return;

        let bars = barsFromChartExport(exported);
        if (bars.length > MAX_BARS) {
          bars = bars.slice(bars.length - MAX_BARS);
        }
        if (bars.length < 20) {
          if (entityIdsRef.current.length === 0) {
            // Keep waiting — history may still be loading; don't thrash.
            lastKeyRef.current = "";
          }
          return;
        }

        const cmds = computeDealingRanges(bars, opts);
        const fp = fingerprintCmds(cmds) || "empty";
        if (!force && fp === lastFpRef.current && lastKeyRef.current === key) {
          return;
        }
        if (cancelled || myGen !== genRef.current) return;

        // Paint new shapes first, then remove old — avoids blank flash.
        const ids =
          cmds.length === 0 ? ([] as EntityId[]) : await paintOrcaOnChart(api, cmds);
        if (cancelled || myGen !== genRef.current) {
          for (const id of ids) {
            try {
              chart.removeEntity(id);
            } catch {
              /* ignore */
            }
          }
          return;
        }

        const prev = entityIdsRef.current;
        entityIdsRef.current = ids;
        lastKeyRef.current = key;
        lastFpRef.current = fp;
        for (const id of prev) {
          try {
            chart.removeEntity(id);
          } catch {
            /* ignore */
          }
        }
        if (ids.length > 0) {
          console.info(`[forge-dr] painted ${ids.length} shapes from ${bars.length} bars`);
        }
      } catch (err) {
        console.warn("[forge-dr] paint failed", err);
      } finally {
        busyRef.current = false;
        if (!cancelled && pendingRef.current) {
          pendingRef.current = false;
          window.setTimeout(() => {
            void repaint(true);
          }, 0);
        }
      }
    };

    const scheduleRepaint = () => {
      window.clearTimeout(studyTimer);
      studyTimer = window.setTimeout(() => {
        lastKeyRef.current = "";
        void repaint(true);
      }, STUDY_DEBOUNCE_MS);
    };

    void repaint(true);

    // Cheap presence poll: clear if study gone; paint once if study present but empty.
    const poll = window.setInterval(() => {
      if (cancelled || busyRef.current) return;
      const ids = findStudyIds();
      if (ids.length === 0) {
        if (entityIdsRef.current.length > 0 || lastKeyRef.current) {
          genRef.current += 1;
          clearDrawings();
          lastKeyRef.current = "";
          lastFpRef.current = "";
        }
        return;
      }
      if (entityIdsRef.current.length === 0 && lastKeyRef.current === "") {
        void repaint(false);
      }
    }, PRESENCE_POLL_MS);

    try {
      widget.subscribe("study_event", scheduleRepaint);
      widget.subscribe("study_properties_changed", scheduleRepaint);
      // Intentionally NOT subscribed to onAutoSaveNeeded — shape create ↔ autosave loops.
    } catch {
      /* ignore */
    }

    return () => {
      cancelled = true;
      genRef.current += 1;
      window.clearTimeout(studyTimer);
      window.clearInterval(poll);
      try {
        widget.unsubscribe("study_event", scheduleRepaint);
        widget.unsubscribe("study_properties_changed", scheduleRepaint);
      } catch {
        /* ignore */
      }
      clearDrawings();
      lastKeyRef.current = "";
      lastFpRef.current = "";
    };
  }, [chart, enabled, ready, symbol, interval]);
}
