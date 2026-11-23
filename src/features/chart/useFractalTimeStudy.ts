/**
 * Watches Indicators “Fractal Time Alignment” and paints ICT fractal time overlays.
 */

import { useEffect, useRef } from "react";
import { useServices } from "@/app/use-services";
import type { EntityId } from "@/infrastructure/tradingview";
import { clColor, paintSessionsOnChart } from "@/features/sessions/runtime";
import {
  FRACTAL_TIME_DEFAULTS,
  computeFractalTimeDraws,
  formatTehran,
  publishFractalTimeDashboard,
  type FractalTimeOptions,
} from "@/features/fractal-time/runtime";
import type { DrawCmd } from "@/features/pine/orca-runtime";
import {
  FRACTAL_TIME_STUDY_DEFAULTS,
  FT_STYLE_ALIGN,
  FT_STYLE_C,
  FT_STYLE_MACRO,
  FT_STYLE_OPEN,
  FT_STYLE_Q,
} from "./fractal-time-indicator";
import {
  chartIntervalSeconds,
  liveChartResolution,
  markChartPaintBusy,
  studyIsVisible,
} from "./study-paint-gate";
import { readStylePlot } from "./study-style-plots";
import type { ChartController } from "./chart-controller";
import { useBoundChartState } from "./study-controller-bind";
import {
  exportChartBarsCached,
  STUDY_DEBOUNCE_MS,
  STUDY_LIVE_REFRESH_MS,
  STUDY_MAX_BARS,
  STUDY_PAINT_MUTE_MS,
  STUDY_PRESENCE_POLL_MS,
} from "./chart-export-cache";

const MAX_BARS = STUDY_MAX_BARS;

function hashCmds(cmds: readonly DrawCmd[]): string {
  let h = 2166136261;
  const mix = (s: string) => {
    for (let i = 0; i < s.length; i += 1) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
  };
  mix(String(cmds.length));
  for (const c of cmds) {
    mix(`${c.kind}:${c.t1}:${c.p1}:${c.t2 ?? ""}:${c.p2 ?? ""}:${c.color}:${c.text ?? ""}`);
  }
  return cmds.length === 0 ? "empty" : (h >>> 0).toString(36);
}

function parseList(raw: unknown, fallback: readonly string[]): string[] {
  if (typeof raw !== "string") return [...fallback];
  const parts = raw
    .split(/[,/|]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length ? parts : [...fallback];
}

export function useFractalTimeStudy(chart: ChartController | null): void {
  const { chart: primaryChart } = useServices();
  const { ready, symbol } = useBoundChartState(chart);
  const isPrimaryPane = chart != null && chart === primaryChart;
  const idsRef = useRef<EntityId[]>([]);
  const busyRef = useRef(false);
  const lastKeyRef = useRef("");
  const lastFpRef = useRef("");
  const genRef = useRef(0);
  const pendingRef = useRef(false);
  const muteUntilRef = useRef(0);

  useEffect(() => {
    if (!chart || !ready) return;
    const widget = chart.getWidget();
    const paneChart = chart;
    if (!widget) return;

    let cancelled = false;
    let studyTimer: number | undefined;
    lastKeyRef.current = "";
    lastFpRef.current = "";

    const mutePaintEvents = () => {
      muteUntilRef.current = Date.now() + STUDY_PAINT_MUTE_MS;
      markChartPaintBusy(STUDY_PAINT_MUTE_MS);
    };
    const isMuted = () => Date.now() < muteUntilRef.current;

    function clearDrawings(): void {
      const ids = idsRef.current;
      idsRef.current = [];
      for (const id of ids) {
        try {
          paneChart.removeEntity(id);
        } catch {
          /* ignore */
        }
      }
      if (isPrimaryPane) publishFractalTimeDashboard(null);
    }

    const findStudyIds = (): EntityId[] => {
      try {
        const studies = widget.activeChart()?.getAllStudies() ?? [];
        return studies
          .filter((s: { name?: string; id?: string | EntityId }) => {
            const name = `${s.name ?? ""} ${s.id ?? ""}`;
            return /fractal\s*(&|and)?\s*time|ForgeFractalTime@/i.test(name);
          })
          .map((s: { id?: string | EntityId }) => s.id as EntityId);
      } catch {
        return [];
      }
    };

    const readOptions = (studyId: EntityId): FractalTimeOptions | null => {
      try {
        const api = widget.activeChart()?.getStudyById(studyId);
        if (!api) return null;
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
        const style = (id: string, color: string, transparency: number) =>
          readStylePlot(api, id, {
            color,
            visible: true,
            transparency,
            linewidth: 1,
            linestyle: 0,
          });
        const cSt = style(FT_STYLE_C, FRACTAL_TIME_DEFAULTS.cColor, 0);
        const qSt = style(FT_STYLE_Q, FRACTAL_TIME_DEFAULTS.qColor, 20);
        const mSt = style(FT_STYLE_MACRO, FRACTAL_TIME_DEFAULTS.macroColor, 70);
        const oSt = style(FT_STYLE_OPEN, FRACTAL_TIME_DEFAULTS.openColor, 0);
        const aSt = style(FT_STYLE_ALIGN, FRACTAL_TIME_DEFAULTS.alignColor, 60);

        return {
          mode: num("mode", FRACTAL_TIME_STUDY_DEFAULTS.mode) === 1 ? "sameQ" : "phase",
          enableYear: bool("enableYear", FRACTAL_TIME_STUDY_DEFAULTS.enableYear),
          enableMonth: bool("enableMonth", FRACTAL_TIME_STUDY_DEFAULTS.enableMonth),
          enableWeek: bool("enableWeek", FRACTAL_TIME_STUDY_DEFAULTS.enableWeek),
          enableH4: bool("enableH4", FRACTAL_TIME_STUDY_DEFAULTS.enableH4),
          enableMacro: bool("enableMacro", FRACTAL_TIME_STUDY_DEFAULTS.enableMacro),
          monthAllow: parseList(map.get("monthAllow"), FRACTAL_TIME_DEFAULTS.monthAllow),
          weekAllow: parseList(map.get("weekAllow"), FRACTAL_TIME_DEFAULTS.weekAllow),
          h4Allow: parseList(map.get("h4Allow"), FRACTAL_TIME_DEFAULTS.h4Allow),
          macroAllow: parseList(map.get("macroAllow"), FRACTAL_TIME_DEFAULTS.macroAllow),
          yearAllow: [...FRACTAL_TIME_DEFAULTS.yearAllow],
          foldW5: bool("foldW5", FRACTAL_TIME_STUDY_DEFAULTS.foldW5),
          showCBlocks: bool("showCBlocks", FRACTAL_TIME_STUDY_DEFAULTS.showCBlocks) && cSt.visible,
          showHourQuarters:
            bool("showHourQuarters", FRACTAL_TIME_STUDY_DEFAULTS.showHourQuarters) && qSt.visible,
          showMacros: bool("showMacros", FRACTAL_TIME_STUDY_DEFAULTS.showMacros) && mSt.visible,
          showOpens: bool("showOpens", FRACTAL_TIME_STUDY_DEFAULTS.showOpens) && oSt.visible,
          showAlignment:
            bool("showAlignment", FRACTAL_TIME_STUDY_DEFAULTS.showAlignment) && aSt.visible,
          showDashboard: bool("showDashboard", FRACTAL_TIME_STUDY_DEFAULTS.showDashboard),
          showPhaseLabels: bool("showPhaseLabels", FRACTAL_TIME_STUDY_DEFAULTS.showPhaseLabels),
          cColor: clColor(cSt.color, FRACTAL_TIME_DEFAULTS.cColor),
          qColor: clColor(qSt.color, FRACTAL_TIME_DEFAULTS.qColor),
          macroColor: clColor(mSt.color, FRACTAL_TIME_DEFAULTS.macroColor),
          openColor: clColor(oSt.color, FRACTAL_TIME_DEFAULTS.openColor),
          alignColor: clColor(aSt.color, FRACTAL_TIME_DEFAULTS.alignColor),
        };
      } catch (err) {
        console.warn("[fractal-time] readOptions failed", err);
        return null;
      }
    };

    const repaint = async () => {
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
      const studyApi = widget.activeChart()?.getStudyById(studyId);
      const opts = readOptions(studyId);
      if (!opts) return;
      const res = liveChartResolution(widget) || "";
      if (!studyIsVisible(studyApi)) {
        if (idsRef.current.length || lastKeyRef.current) {
          genRef.current += 1;
          clearDrawings();
        }
        lastKeyRef.current = `hidden:${symbol}:${res}`;
        lastFpRef.current = "";
        return;
      }

      busyRef.current = true;
      let myGen = genRef.current;
      try {
        const api = widget.activeChart();
        if (!api) return;
        const bars = await exportChartBarsCached(api, MAX_BARS);
        if (cancelled || myGen !== genRef.current) return;
        let lo = Infinity;
        let hi = -Infinity;
        const times: number[] = [];
        for (const b of bars) {
          times.push(b.time);
          if (b.low < lo) lo = b.low;
          if (b.high > hi) hi = b.high;
        }
        if (times.length < 2) {
          const now = Math.floor(Date.now() / 1000);
          times.push(now - 86_400 * 3, now);
        }
        const chartSec = chartIntervalSeconds(res);
        const { cmds, result } = computeFractalTimeDraws(times, opts, chartSec, lo, hi);
        const fp = hashCmds(cmds);
        const key = JSON.stringify({ symbol, res, opts, studies: studyIds });
        if (fp === lastFpRef.current && key === lastKeyRef.current) {
          if (isPrimaryPane && opts.showDashboard) {
            publishFractalTimeDashboard({
              title: result.aligned ? "ALIGNED" : "Fractal & Time",
              mode: opts.mode,
              aligned: result.aligned,
              reason: result.reason,
              tehran: formatTehran(result.snap.timeSec),
              rows: result.rows,
              matched: result.matched,
              enabled: result.enabled,
            });
          }
          return;
        }
        myGen = ++genRef.current;
        mutePaintEvents();
        const next = cmds.length === 0 ? [] : await paintSessionsOnChart(api, cmds, { ownerStudyId: studyId });
        if (cancelled || myGen !== genRef.current) {
          for (const id of next) {
            try {
              paneChart.removeEntity(id);
            } catch {
              /* ignore */
            }
          }
          return;
        }
        const prev = idsRef.current;
        idsRef.current = next;
        lastFpRef.current = fp;
        lastKeyRef.current = key;
        if (isPrimaryPane) {
          publishFractalTimeDashboard(
            opts.showDashboard
              ? {
                  title: result.aligned ? "ALIGNED" : "Fractal & Time",
                  mode: opts.mode,
                  aligned: result.aligned,
                  reason: result.reason,
                  tehran: formatTehran(result.snap.timeSec),
                  rows: result.rows,
                  matched: result.matched,
                  enabled: result.enabled,
                }
              : null,
          );
        }
        mutePaintEvents();
        for (const id of prev) {
          try {
            paneChart.removeEntity(id);
          } catch {
            /* ignore */
          }
        }
      } catch (err) {
        console.warn("[fractal-time] paint failed", err);
        lastKeyRef.current = "";
        lastFpRef.current = "";
      } finally {
        busyRef.current = false;
        if (!cancelled && pendingRef.current) {
          pendingRef.current = false;
          window.setTimeout(() => {
            void repaint();
          }, 150);
        }
      }
    };

    const schedule = () => {
      if (isMuted()) return;
      window.clearTimeout(studyTimer);
      studyTimer = window.setTimeout(() => {
        void repaint();
      }, STUDY_DEBOUNCE_MS);
    };

    const unStudy = paneChart.onStudyEvent(() => schedule());
    const onIntervalChanged = () => {
      lastKeyRef.current = "";
      lastFpRef.current = "";
      window.clearTimeout(studyTimer);
      studyTimer = window.setTimeout(() => {
        void repaint();
      }, 40);
    };
    const onDataLoaded = () => {
      if (findStudyIds().length === 0) return;
      schedule();
    };
    try {
      widget.activeChart()?.onIntervalChanged()?.subscribe(null, onIntervalChanged);
    } catch {
      /* ignore */
    }
    try {
      widget.activeChart()?.onDataLoaded()?.subscribe(null, onDataLoaded);
    } catch {
      /* ignore */
    }
    void repaint();
    const live = window.setInterval(() => {
      void repaint();
    }, STUDY_LIVE_REFRESH_MS);
    const presence = window.setInterval(() => {
      const ids = findStudyIds();
      if (ids.length === 0 && (idsRef.current.length > 0 || lastKeyRef.current)) {
        void repaint();
      }
    }, STUDY_PRESENCE_POLL_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(studyTimer);
      window.clearInterval(live);
      window.clearInterval(presence);
      unStudy();
      try {
        widget.activeChart()?.onIntervalChanged()?.unsubscribe(null, onIntervalChanged);
      } catch {
        /* ignore */
      }
      try {
        widget.activeChart()?.onDataLoaded()?.unsubscribe(null, onDataLoaded);
      } catch {
        /* ignore */
      }
      clearDrawings();
    };
  }, [chart, ready, symbol, isPrimaryPane]);
}
