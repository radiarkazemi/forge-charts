/**
 * Paints Order Block boxes and the dashed CISD line when the study is on the chart.
 * Paint-then-swap so a live candle does not flash the zones off.
 */

import { useEffect, useRef } from "react";
import type { ChartController } from "./chart-controller";
import { useBoundChartState } from "./study-controller-bind";
import type { EntityId } from "@/infrastructure/tradingview";
import {
  computeOrderBlockCisd,
  OB_CISD_DEFAULTS,
  paintOrderBlockCisd,
  type ObCisdDrawCmd,
  type ObCisdInputs,
} from "@/features/order-block-cisd/runtime";
import { OB_CISD_STUDY_DEFAULTS, OB_STYLE_BEAR, OB_STYLE_BULL } from "./order-block-cisd-indicator";
import { readStylePlot } from "./study-style-plots";
import { studyIsVisible, markChartPaintBusy } from "./study-paint-gate";
import {
  exportChartBarsCached,
  STUDY_DEBOUNCE_MS,
  STUDY_LIVE_REFRESH_MS,
  STUDY_MAX_BARS,
  STUDY_PAINT_MUTE_MS,
  STUDY_PRESENCE_POLL_MS,
} from "./chart-export-cache";

const PAINT_MUTE_MS = STUDY_PAINT_MUTE_MS;

function fingerprint(cmds: readonly ObCisdDrawCmd[]): string {
  if (cmds.length === 0) return "empty";
  const part = (c: ObCisdDrawCmd) =>
    c.kind === "rect"
      ? `r:${c.t1}:${c.t2}:${c.p1}:${c.p2}:${c.color}:${c.transparency}`
      : `l:${c.t1}:${c.t2}:${c.p1}:${c.width}`;
  return `${cmds.length}|${cmds.map(part).join(";")}`;
}

export function useOrderBlockCisdStudy(chart: ChartController | null): void {
  const { ready, symbol, interval } = useBoundChartState(chart);
  const entityIdsRef = useRef<EntityId[]>([]);
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

    const mutePaintEvents = () => {
      muteUntilRef.current = Date.now() + PAINT_MUTE_MS;
      markChartPaintBusy(PAINT_MUTE_MS);
    };
    const isMuted = () => Date.now() < muteUntilRef.current;

    const clearDrawings = () => {
      const ids = entityIdsRef.current;
      entityIdsRef.current = [];
      if (ids.length === 0) return;
      mutePaintEvents();
      for (const id of ids) {
        try {
          paneChart.removeEntity(id);
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
            return /order block \+ cisd/i.test(name) || /OrderBlockCisd@/i.test(name);
          })
          .map((s: { id?: string | EntityId }) => s.id as EntityId);
      } catch {
        return [];
      }
    };

    const readOptions = (studyId: EntityId): ObCisdInputs => {
      try {
        const api = widget.activeChart()?.getStudyById(studyId);
        if (!api) return { ...OB_CISD_DEFAULTS };
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
        const bull = readStylePlot(api, OB_STYLE_BULL, {
          color: OB_CISD_DEFAULTS.bullColor,
          visible: true,
          transparency: 0,
          linewidth: 1,
          linestyle: 2,
        });
        const bear = readStylePlot(api, OB_STYLE_BEAR, {
          color: OB_CISD_DEFAULTS.bearColor,
          visible: true,
          transparency: 0,
          linewidth: 1,
          linestyle: 2,
        });
        return {
          minSeries: Math.max(1, Math.min(8, Math.floor(num("minSeries", OB_CISD_STUDY_DEFAULTS.minSeries)))),
          displacement: Math.max(0.05, Math.min(2, num("displacement", OB_CISD_STUDY_DEFAULTS.displacement))),
          seriesAtr: Math.max(0.1, Math.min(3, num("seriesAtr", OB_CISD_STUDY_DEFAULTS.seriesAtr))),
          showBull: bull.visible,
          showBear: bear.visible,
          showMitigated: bool("showMitigated", OB_CISD_STUDY_DEFAULTS.showMitigated),
          projectBars: Math.max(1, Math.min(40, Math.floor(num("projectBars", OB_CISD_STUDY_DEFAULTS.projectBars)))),
          maxZones: Math.max(1, Math.min(20, Math.floor(num("maxZones", OB_CISD_STUDY_DEFAULTS.maxZones)))),
          bullColor: bull.color,
          bearColor: bear.color,
          lineWidth: Math.max(1, Math.min(4, Math.round(Math.max(bull.linewidth, bear.linewidth)))),
        };
      } catch {
        return { ...OB_CISD_DEFAULTS };
      }
    };

    const repaint = async () => {
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
        const key = JSON.stringify({ symbol, interval, inputs });
        const active = widget.activeChart();
        if (!active) return;
        const bars = await exportChartBarsCached(active, STUDY_MAX_BARS);
        if (cancelled || gen !== genRef.current) return;
        if (bars.length < 8) return;

        const cmds = computeOrderBlockCisd(bars, inputs);
        const fp = fingerprint(cmds);
        if (key === lastKeyRef.current && fp === lastFpRef.current) return;

        mutePaintEvents();
        const ids = await paintOrderBlockCisd(active, cmds, { ownerStudyId: studyId });
        if (cancelled || gen !== genRef.current) {
          mutePaintEvents();
          for (const id of ids) {
            try {
              paneChart.removeEntity(id);
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
        mutePaintEvents();
        for (const id of prev) {
          try {
            paneChart.removeEntity(id);
          } catch {
            /* ignore */
          }
        }
      } catch (err) {
        console.warn("[order-block-cisd] paint failed", err);
        lastKeyRef.current = "";
      } finally {
        busyRef.current = false;
        if (!cancelled && pendingRef.current) {
          pendingRef.current = false;
          window.setTimeout(() => {
            void repaint();
          }, 200);
        }
      }
    };

    const scheduleRepaint = () => {
      window.clearTimeout(studyTimer);
      studyTimer = window.setTimeout(() => {
        void repaint();
      }, STUDY_DEBOUNCE_MS);
    };

    const onStudyEvent = (...args: unknown[]) => {
      if (isMuted()) return;
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
      if (/^(create|remove|price_scale|properties|visibility|toggle|hide|show)/i.test(eventType)) {
        scheduleRepaint();
      }
    };

    const onStudyProperties = (...args: unknown[]) => {
      if (isMuted()) return;
      const id = String(args[0] ?? "");
      if (!id) return;
      if (findStudyIds().some((s) => String(s) === id)) scheduleRepaint();
    };

    const kickoff = () => {
      void repaint();
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
      try {
        const api = widget.activeChart()?.getStudyById(ids[0]!);
        if (!studyIsVisible(api)) {
          if (entityIdsRef.current.length > 0) {
            genRef.current += 1;
            clearDrawings();
            lastKeyRef.current = "hidden:presence";
            lastFpRef.current = "";
          }
          return;
        }
      } catch {
        /* ignore */
      }
      if (lastKeyRef.current === "" || String(lastKeyRef.current).startsWith("hidden:")) void repaint();
    }, STUDY_PRESENCE_POLL_MS);

    const livePoll = window.setInterval(() => {
      if (cancelled || busyRef.current || isMuted()) return;
      if (findStudyIds().length === 0) return;
      void repaint();
    }, STUDY_LIVE_REFRESH_MS);

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
  }, [chart, ready, symbol, interval]);
}
