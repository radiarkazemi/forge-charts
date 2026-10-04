/**
 * Watches the Indicators “Dealing Ranges” study and paints ICT dealing-range
 * boxes (HH→LL + BOS after LL / LL→HH + BOS after HH). CL custom studies
 * cannot draw rectangles as plots, so shapes are created here.
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
const STUDY_DEBOUNCE_MS = 400;
/** Cheap presence check only (no export) while a study is active. */
const PRESENCE_POLL_MS = 6_000;

function fingerprintCmds(cmds: readonly DrawCmd[]): string {
  if (cmds.length === 0) return "empty";
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
          .filter((s: { name?: string; id?: string | EntityId }) => {
            const name = `${s.name ?? ""} ${s.id ?? ""}`;
            return /dealing\s*ranges/i.test(name) || /DealingRanges@/i.test(name);
          })
          .map((s: { id?: string | EntityId }) => s.id as EntityId);
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
        genRef.current += 1;
        clearDrawings();
        lastKeyRef.current = "";
        lastFpRef.current = "";
        return;
      }

      const studyId = studyIds[0]!;
      const opts = readOptions(studyId) ?? defaultOpts();
      const key = JSON.stringify({ symbol, interval, opts, studies: studyIds });
      if (!force && key === lastKeyRef.current && entityIdsRef.current.length > 0) {
        return;
      }

      const myGen = ++genRef.current;
      busyRef.current = true;
      try {
        const api = widget.activeChart();
        if (!api) return;

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
            lastKeyRef.current = "";
          }
          return;
        }

        const cmds = computeDealingRanges(bars, opts);
        const fp = fingerprintCmds(cmds);
        if (!force && fp === lastFpRef.current && lastKeyRef.current === key) {
          return;
        }
        if (cancelled || myGen !== genRef.current) return;

        const ids =
          cmds.length === 0
            ? ([] as EntityId[])
            : await paintOrcaOnChart(api, cmds, { ownerStudyId: studyId });
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
        console.info(
          `[forge-dr] painted ${ids.length} shapes from ${bars.length} bars (cmds=${cmds.length})`,
          cmds[0]
            ? `first=${cmds[0].kind}@${cmds[0].t1}/${cmds[0].p1}->${cmds[0].t2}/${cmds[0].p2}`
            : "none",
          `bars=${bars[0]?.time}..${bars[bars.length - 1]?.time}`,
        );
      } catch (err) {
        console.warn("[forge-dr] paint failed", err);
      } finally {
        busyRef.current = false;
        if (!cancelled && pendingRef.current) {
          pendingRef.current = false;
          window.setTimeout(() => {
            void repaint(false);
          }, 0);
        }
      }
    };

    const scheduleRepaint = () => {
      window.clearTimeout(studyTimer);
      studyTimer = window.setTimeout(() => {
        void repaint(true);
      }, STUDY_DEBOUNCE_MS);
    };

    /** Only react to create/remove/property edits — ignore noise that would loop. */
    const onStudyEvent = (...args: unknown[]) => {
      const eventType = String(args[1] ?? args[0] ?? "");
      // TV passes (entityId, eventType). eventType: create | remove | ...
      if (/remove/i.test(eventType)) {
        // Study gone — clear immediately (ownerStudyId may already drop shapes).
        window.clearTimeout(studyTimer);
        const still = findStudyIds();
        if (still.length === 0) {
          genRef.current += 1;
          clearDrawings();
          lastKeyRef.current = "";
          lastFpRef.current = "";
          return;
        }
      }
      if (/create|remove|price_scale|properties/i.test(eventType) || eventType === "") {
        scheduleRepaint();
      }
    };

    const onStudyProperties = (...args: unknown[]) => {
      const id = String(args[0] ?? "");
      const ours = findStudyIds().some((s) => String(s) === id);
      if (ours || !id) scheduleRepaint();
    };

    void repaint(true);

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
      if (lastKeyRef.current === "") {
        void repaint(false);
      }
    }, PRESENCE_POLL_MS);

    try {
      widget.subscribe("study_event", onStudyEvent as never);
      widget.subscribe("study_properties_changed", onStudyProperties as never);
    } catch {
      /* ignore */
    }

    return () => {
      cancelled = true;
      genRef.current += 1;
      window.clearTimeout(studyTimer);
      window.clearInterval(poll);
      try {
        widget.unsubscribe("study_event", onStudyEvent as never);
        widget.unsubscribe("study_properties_changed", onStudyProperties as never);
      } catch {
        /* ignore */
      }
      clearDrawings();
      lastKeyRef.current = "";
      lastFpRef.current = "";
    };
  }, [chart, enabled, ready, symbol, interval]);
}
