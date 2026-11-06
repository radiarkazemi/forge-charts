/**
 * Watches Indicators “Fractal (igor-T)” and paints swing high/low arrows.
 */

import { useEffect, useRef } from "react";
import { useServices } from "@/app/use-services";
import { useStore } from "@/shared/hooks/useStore";
import type { EntityId } from "@/infrastructure/tradingview";
import { barsFromChartExport } from "@/features/pine/orca-runtime";
import {
  computeFractal,
  paintFractal,
  type FractalDrawCmd,
  type FractalInputs,
} from "@/features/fractal/runtime";
import { FRACTAL_IGOR_STUDY_DEFAULTS } from "./fractal-igor-indicator";
import { studyIsVisible } from "./study-paint-gate";

const MAX_BARS = 3_000;
const STUDY_DEBOUNCE_MS = 450;
const PRESENCE_POLL_MS = 6_000;
const LIVE_REFRESH_MS = 15_000;

function fingerprint(cmds: readonly FractalDrawCmd[]): string {
  if (cmds.length === 0) return "empty";
  const head = cmds.slice(0, 4);
  const tail = cmds.length > 4 ? cmds.slice(-4) : [];
  return `${cmds.length}|${[...head, ...tail].map((c) => `${c.dir}:${c.t1}:${c.p1}`).join(";")}`;
}

export function useFractalIgorStudy(enabled = true): void {
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

    const findStudyIds = (): EntityId[] => {
      try {
        const studies = widget.activeChart()?.getAllStudies() ?? [];
        return studies
          .filter((s: { name?: string; id?: string | EntityId }) => {
            const name = `${s.name ?? ""} ${s.id ?? ""}`;
            return (
              /fractal\s*\(\s*igor-?t\s*\)/i.test(name) ||
              /FractalIgorT@/i.test(name) ||
              /fractal\s*·\s*igor/i.test(name)
            );
          })
          .map((s: { id?: string | EntityId }) => s.id as EntityId);
      } catch {
        return [];
      }
    };

    const readOptions = (studyId: EntityId): FractalInputs => {
      try {
        const api = widget.activeChart()?.getStudyById(studyId);
        if (!api) return { ...FRACTAL_IGOR_STUDY_DEFAULTS };
        const values = api.getInputValues() ?? [];
        const map = new Map<string, unknown>();
        for (const item of values) map.set(String(item.id), item.value);
        const num = (id: string, fallback: number) => {
          const v = Number(map.get(id));
          return Number.isFinite(v) ? v : fallback;
        };
        const bool = (id: string, fallback: boolean) => {
          const v = map.get(id);
          if (typeof v === "boolean") return v;
          if (typeof v === "number") return v !== 0;
          if (typeof v === "string") {
            const s = v.trim().toLowerCase();
            if (s === "true" || s === "1") return true;
            if (s === "false" || s === "0") return false;
          }
          return fallback;
        };
        const str = (id: string, fallback: string) => {
          const v = map.get(id);
          return typeof v === "string" && v.trim() ? v.trim() : fallback;
        };
        return {
          periods: Math.max(
            1,
            Math.min(10, Math.floor(num("periods", FRACTAL_IGOR_STUDY_DEFAULTS.periods))),
          ),
          showHighs: bool("showHighs", FRACTAL_IGOR_STUDY_DEFAULTS.showHighs),
          showLows: bool("showLows", FRACTAL_IGOR_STUDY_DEFAULTS.showLows),
          highColor: str("highColor", FRACTAL_IGOR_STUDY_DEFAULTS.highColor),
          lowColor: str("lowColor", FRACTAL_IGOR_STUDY_DEFAULTS.lowColor),
          maxMarkers: Math.max(
            20,
            Math.min(500, Math.floor(num("maxMarkers", FRACTAL_IGOR_STUDY_DEFAULTS.maxMarkers))),
          ),
        };
      } catch {
        return { ...FRACTAL_IGOR_STUDY_DEFAULTS };
      }
    };

    const repaint = async (force = false) => {
      if (cancelled) return;
      if (busyRef.current) {
        pendingRef.current = true;
        return;
      }
      busyRef.current = true;
      const gen = ++genRef.current;
      try {
        const studyIds = findStudyIds();
        if (studyIds.length === 0) {
          clearDrawings();
          lastKeyRef.current = "";
          lastFpRef.current = "";
          return;
        }

        const studyId = studyIds[0]!;
        const api = widget.activeChart()?.getStudyById(studyId);
        if (!studyIsVisible(api)) {
          clearDrawings();
          lastFpRef.current = "";
          return;
        }

        const inputs = readOptions(studyId);
        const key = `${symbol}|${interval}|${inputs.periods}|${inputs.showHighs}|${inputs.showLows}|${inputs.highColor}|${inputs.lowColor}|${inputs.maxMarkers}`;
        const active = widget.activeChart();
        if (!active) return;
        const exported = await active.exportData({
          includeTime: true,
          includeSeries: true,
          includedStudies: [],
        });
        if (cancelled || gen !== genRef.current) return;
        let bars = barsFromChartExport(exported);
        if (bars.length > MAX_BARS) bars = bars.slice(bars.length - MAX_BARS);
        if (bars.length < inputs.periods * 2 + 1) return;
        const cmds = computeFractal(bars, inputs);
        const fp = fingerprint(cmds);
        if (!force && key === lastKeyRef.current && fp === lastFpRef.current) return;

        clearDrawings();
        if (cancelled || gen !== genRef.current) return;
        const ids = await paintFractal(active, cmds, { ownerStudyId: studyId });
        if (cancelled || gen !== genRef.current) {
          for (const id of ids) {
            try {
              chart.removeEntity(id);
            } catch {
              /* ignore */
            }
          }
          return;
        }
        entityIdsRef.current = ids;
        lastKeyRef.current = key;
        lastFpRef.current = fp;
      } catch (err) {
        console.warn("[fractal-igor] paint failed", err);
        lastKeyRef.current = "";
      } finally {
        busyRef.current = false;
        if (!cancelled && pendingRef.current) {
          pendingRef.current = false;
          window.setTimeout(() => {
            void repaint(false);
          }, 120);
        }
      }
    };

    const scheduleRepaint = () => {
      window.clearTimeout(studyTimer);
      studyTimer = window.setTimeout(() => {
        void repaint(true);
      }, STUDY_DEBOUNCE_MS);
    };

    const onStudyEvent = (...args: unknown[]) => {
      const eventType = String(args[1] ?? args[0] ?? "");
      if (/remove/i.test(eventType)) {
        window.clearTimeout(studyTimer);
        if (findStudyIds().length === 0) {
          genRef.current += 1;
          clearDrawings();
          lastKeyRef.current = "";
          lastFpRef.current = "";
          return;
        }
      }
      if (/^(create|remove|price_scale|properties)/i.test(eventType)) scheduleRepaint();
    };

    const onStudyProperties = (...args: unknown[]) => {
      const id = String(args[0] ?? "");
      if (!id) return;
      if (findStudyIds().some((s) => String(s) === id)) scheduleRepaint();
    };

    const kickoff = () => {
      void repaint(true);
    };
    try {
      widget.activeChart()?.dataReady(kickoff);
    } catch {
      kickoff();
    }
    const kickoffTimer = window.setTimeout(kickoff, 1_400);
    const kickoffTimer2 = window.setTimeout(kickoff, 2_800);
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
      if (lastKeyRef.current === "") void repaint(false);
    }, PRESENCE_POLL_MS);

    const livePoll = window.setInterval(() => {
      if (cancelled || busyRef.current) return;
      if (findStudyIds().length === 0) return;
      void repaint(true);
    }, LIVE_REFRESH_MS);

    const onDataLoaded = () => {
      if (findStudyIds().length === 0) return;
      scheduleRepaint();
    };

    try {
      widget.subscribe("study_event", onStudyEvent as never);
      widget.subscribe("study_properties_changed", onStudyProperties as never);
    } catch {
      /* ignore */
    }
    try {
      widget.activeChart()?.onDataLoaded()?.subscribe(null, onDataLoaded);
    } catch {
      /* ignore */
    }

    return () => {
      cancelled = true;
      genRef.current += 1;
      window.clearTimeout(studyTimer);
      window.clearTimeout(kickoffTimer);
      window.clearTimeout(kickoffTimer2);
      window.clearInterval(poll);
      window.clearInterval(livePoll);
      try {
        widget.unsubscribe("study_event", onStudyEvent as never);
        widget.unsubscribe("study_properties_changed", onStudyProperties as never);
      } catch {
        /* ignore */
      }
      try {
        widget.activeChart()?.onDataLoaded()?.unsubscribe(null, onDataLoaded);
      } catch {
        /* ignore */
      }
      clearDrawings();
      lastKeyRef.current = "";
      lastFpRef.current = "";
    };
  }, [chart, enabled, ready, symbol, interval]);
}
