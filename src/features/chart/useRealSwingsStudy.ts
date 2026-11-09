/**
 * Watches Indicators “Real Swing High/Low” and paints styleable H/L markers.
 * Colors / visibility / size come from the Style tab (getStyleValues).
 *
 * Refresh guard: paint-then-swap + mute study events while painting.
 */

import { useEffect, useRef } from "react";
import type { ChartController } from "./chart-controller";
import { useBoundChartState } from "./study-controller-bind";
import type { EntityId } from "@/infrastructure/tradingview";

import {
  computeRealSwings,
  paintRealSwings,
  REAL_SWING_DEFAULTS,
  type RealSwingInputs,
  type SwingDisplayMode,
  type SwingDrawCmd,
} from "@/features/real-swings/runtime";
import {
  REAL_SWINGS_STUDY_DEFAULTS,
  REAL_SWING_STYLE_HIGH,
  REAL_SWING_STYLE_LOW,
} from "./real-swings-indicator";
import {
  applyTransparency,
  linewidthToFontSize,
  readStylePlot,
} from "./study-style-plots";
import { studyIsVisible, markChartPaintBusy } from "./study-paint-gate";
import {
  exportChartBarsCached,
  STUDY_DEBOUNCE_MS,
  STUDY_LIVE_REFRESH_MS,
  STUDY_MAX_BARS,
  STUDY_PAINT_MUTE_MS,
  STUDY_PRESENCE_POLL_MS,
} from "./chart-export-cache";

const MAX_BARS = STUDY_MAX_BARS;
// STUDY_DEBOUNCE_MS from chart-export-cache
const PRESENCE_POLL_MS = STUDY_PRESENCE_POLL_MS;
const LIVE_REFRESH_MS = STUDY_LIVE_REFRESH_MS;
const PAINT_MUTE_MS = STUDY_PAINT_MUTE_MS;

function fingerprint(cmds: readonly SwingDrawCmd[]): string {
  if (cmds.length === 0) return "empty";
  const head = cmds.slice(0, 4);
  const tail = cmds.length > 4 ? cmds.slice(-4) : [];
  const part = (c: SwingDrawCmd) => {
    if (c.kind === "arrow") return `a:${c.dir}:${c.t1}:${c.p1}:${c.color}`;
    if (c.kind === "dot") return `d:${c.t1}:${c.p1}:${c.color}`;
    return `l:${c.t1}:${c.p1}:${c.text}:${c.color}`;
  };
  return `${cmds.length}|${[...head, ...tail].map(part).join(";")}`;
}

export function useRealSwingsStudy(chart: ChartController | null): void {
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
            return (
              /real\s*swing\s*high\s*\/?\s*low/i.test(name) ||
              /RealSwingHighLow@/i.test(name) ||
              /real\s*swings/i.test(name)
            );
          })
          .map((s: { id?: string | EntityId }) => s.id as EntityId);
      } catch {
        return [];
      }
    };

    const readOptions = (studyId: EntityId): RealSwingInputs => {
      try {
        const api = widget.activeChart()?.getStudyById(studyId);
        if (!api) return { ...REAL_SWING_DEFAULTS };
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
        const modeRaw = Math.floor(num("displayMode", REAL_SWINGS_STUDY_DEFAULTS.displayMode));
        const displayMode = (
          modeRaw >= 0 && modeRaw <= 5 ? modeRaw : REAL_SWINGS_STUDY_DEFAULTS.displayMode
        ) as SwingDisplayMode;

        const highStyle = readStylePlot(api, REAL_SWING_STYLE_HIGH, {
          color: REAL_SWING_DEFAULTS.highColor,
          visible: REAL_SWING_DEFAULTS.showHighs,
          transparency: 0,
          linewidth: 2,
          linestyle: 0,
        });
        const lowStyle = readStylePlot(api, REAL_SWING_STYLE_LOW, {
          color: REAL_SWING_DEFAULTS.lowColor,
          visible: REAL_SWING_DEFAULTS.showLows,
          transparency: 0,
          linewidth: 2,
          linestyle: 0,
        });
        const fontSize = linewidthToFontSize(
          Math.max(highStyle.linewidth, lowStyle.linewidth),
          REAL_SWING_DEFAULTS.fontSize,
        );

        return {
          leftBars: Math.max(
            1,
            Math.min(50, Math.floor(num("leftBars", REAL_SWINGS_STUDY_DEFAULTS.leftBars))),
          ),
          rightBars: Math.max(
            1,
            Math.min(50, Math.floor(num("rightBars", REAL_SWINGS_STUDY_DEFAULTS.rightBars))),
          ),
          smartScales: bool("smartScales", REAL_SWINGS_STUDY_DEFAULTS.smartScales),
          scalesText: str("scalesText", REAL_SWINGS_STUDY_DEFAULTS.scalesText),
          alternateOnly: bool("alternateOnly", REAL_SWINGS_STUDY_DEFAULTS.alternateOnly),
          minSwingAtr: Math.max(
            0,
            Math.min(10, num("minSwingAtr", REAL_SWINGS_STUDY_DEFAULTS.minSwingAtr)),
          ),
          atrLen: Math.max(
            2,
            Math.min(100, Math.floor(num("atrLen", REAL_SWINGS_STUDY_DEFAULTS.atrLen))),
          ),
          showHighs: highStyle.visible,
          showLows: lowStyle.visible,
          displayMode,
          highLabel: str("highLabel", REAL_SWINGS_STUDY_DEFAULTS.highLabel).slice(0, 8),
          lowLabel: str("lowLabel", REAL_SWINGS_STUDY_DEFAULTS.lowLabel).slice(0, 8),
          highColor: applyTransparency(highStyle.color, highStyle.transparency),
          lowColor: applyTransparency(lowStyle.color, lowStyle.transparency),
          fontSize,
          offsetAtr: Math.max(
            0,
            Math.min(5, num("offsetAtr", REAL_SWINGS_STUDY_DEFAULTS.offsetAtr)),
          ),
          maxMarkers: Math.max(
            20,
            Math.min(500, Math.floor(num("maxMarkers", REAL_SWINGS_STUDY_DEFAULTS.maxMarkers))),
          ),
        };
      } catch {
        return { ...REAL_SWING_DEFAULTS };
      }
    };

    const repaint = async (_force = false) => {
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
        let bars = await exportChartBarsCached(active, MAX_BARS);
        if (cancelled || gen !== genRef.current) return;
        if (bars.length < inputs.leftBars + inputs.rightBars + 1) return;

        const cmds = computeRealSwings(bars, inputs);
        const fp = fingerprint(cmds);
        if (key === lastKeyRef.current && fp === lastFpRef.current) return;

        mutePaintEvents();
        const ids = await paintRealSwings(active, cmds, { ownerStudyId: studyId });
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
        console.warn("[real-swings] paint failed", err);
        lastKeyRef.current = "";
      } finally {
        busyRef.current = false;
        if (!cancelled && pendingRef.current) {
          pendingRef.current = false;
          window.setTimeout(() => {
            void repaint(false);
          }, 200);
        }
      }
    };

    const scheduleRepaint = () => {
      window.clearTimeout(studyTimer);
      studyTimer = window.setTimeout(() => {
        void repaint(false);
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
      if (/^(create|remove|price_scale|properties|visibility|toggle|hide|show)/i.test(eventType)) scheduleRepaint();
    };

    const onStudyProperties = (...args: unknown[]) => {
      if (isMuted()) return;
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
      try {
        const api = widget.activeChart()?.getStudyById(ids[0]!);
        if (!studyIsVisible(api)) {
          if (entityIdsRef.current.length > 0 || (lastKeyRef.current && !String(lastKeyRef.current).startsWith("hidden:"))) {
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
      if (lastKeyRef.current === "" || String(lastKeyRef.current).startsWith("hidden:")) void repaint(false);
    }, PRESENCE_POLL_MS);

    const livePoll = window.setInterval(() => {
      if (cancelled || busyRef.current || isMuted()) return;
      if (findStudyIds().length === 0) return;
      void repaint(false);
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
  }, [chart, ready, symbol, interval]);
}
