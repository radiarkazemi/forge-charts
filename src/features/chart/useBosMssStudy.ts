/**
 * Watches Indicators “BOS / MSS” and paints BOS+/BOS-/MSS+/MSS- segments.
 * Colors / visibility / linewidth come from the Style tab (getStyleValues).
 *
 * Refresh guard: paint-then-swap, mute study events while painting, and never
 * force-clear when the fingerprint is unchanged (stops the flicker loop).
 */

import { useEffect, useRef } from "react";
import type { ChartController } from "./chart-controller";
import { useBoundChartState } from "./study-controller-bind";
import type { EntityId } from "@/infrastructure/tradingview";

import {
  BOS_MSS_DEFAULTS,
  computeBosMss,
  paintBosMss,
  type BosMssDrawCmd,
  type BosMssInputs,
} from "@/features/bos-mss/runtime";
import {
  BOS_MSS_STUDY_DEFAULTS,
  BOS_STYLE_MINUS,
  BOS_STYLE_PLUS,
  MSS_STYLE_MINUS,
  MSS_STYLE_PLUS,
} from "./bos-mss-indicator";
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
/** Ignore study_event / properties while shapes are created/removed. */
const PAINT_MUTE_MS = STUDY_PAINT_MUTE_MS;

function fingerprint(cmds: readonly BosMssDrawCmd[]): string {
  if (cmds.length === 0) return "empty";
  const head = cmds.slice(0, 4);
  const tail = cmds.length > 4 ? cmds.slice(-4) : [];
  const part = (c: BosMssDrawCmd) =>
    `sg:${c.t1}:${c.t2}:${c.p1}:${c.text ?? ""}:${c.color}:${c.width}:${c.style}:${c.scale}`;
  return `${cmds.length}|${[...head, ...tail].map(part).join(";")}`;
}

export function useBosMssStudy(chart: ChartController | null): void {
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
              /^bos\s*\/\s*mss/i.test(name.trim()) ||
              /BosMssStructure@/i.test(name) ||
              /BOS\+\s*·\s*BOS-/i.test(name)
            );
          })
          .map((s: { id?: string | EntityId }) => s.id as EntityId);
      } catch {
        return [];
      }
    };

    const readOptions = (studyId: EntityId): BosMssInputs => {
      try {
        const api = widget.activeChart()?.getStudyById(studyId);
        if (!api) return { ...BOS_MSS_DEFAULTS };
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

        const bosPlus = readStylePlot(api, BOS_STYLE_PLUS, {
          color: BOS_MSS_DEFAULTS.bosPlusColor,
          visible: BOS_MSS_DEFAULTS.showBosPlus,
          transparency: 0,
          linewidth: BOS_MSS_DEFAULTS.lineWidth,
          linestyle: BOS_MSS_DEFAULTS.bosLineStyle,
        });
        const bosMinus = readStylePlot(api, BOS_STYLE_MINUS, {
          color: BOS_MSS_DEFAULTS.bosMinusColor,
          visible: BOS_MSS_DEFAULTS.showBosMinus,
          transparency: 0,
          linewidth: BOS_MSS_DEFAULTS.lineWidth,
          linestyle: BOS_MSS_DEFAULTS.bosLineStyle,
        });
        const mssPlus = readStylePlot(api, MSS_STYLE_PLUS, {
          color: BOS_MSS_DEFAULTS.mssPlusColor,
          visible: BOS_MSS_DEFAULTS.showMssPlus,
          transparency: 0,
          linewidth: BOS_MSS_DEFAULTS.lineWidth,
          linestyle: BOS_MSS_DEFAULTS.mssLineStyle,
        });
        const mssMinus = readStylePlot(api, MSS_STYLE_MINUS, {
          color: BOS_MSS_DEFAULTS.mssMinusColor,
          visible: BOS_MSS_DEFAULTS.showMssMinus,
          transparency: 0,
          linewidth: BOS_MSS_DEFAULTS.lineWidth,
          linestyle: BOS_MSS_DEFAULTS.mssLineStyle,
        });

        const lineWidth = Math.max(
          1,
          Math.min(
            4,
            Math.round(
              Math.max(bosPlus.linewidth, bosMinus.linewidth, mssPlus.linewidth, mssMinus.linewidth),
            ),
          ),
        );
        const fontSize = linewidthToFontSize(lineWidth, BOS_MSS_DEFAULTS.fontSize);
        const bosLineStyleInput = Math.max(
          0,
          Math.min(2, Math.floor(num("bosLineStyle", BOS_MSS_STUDY_DEFAULTS.bosLineStyle))),
        );
        const mssLineStyleInput = Math.max(
          0,
          Math.min(2, Math.floor(num("mssLineStyle", BOS_MSS_STUDY_DEFAULTS.mssLineStyle))),
        );

        return {
          leftBars: Math.max(
            1,
            Math.min(50, Math.floor(num("leftBars", BOS_MSS_STUDY_DEFAULTS.leftBars))),
          ),
          rightBars: Math.max(
            1,
            Math.min(50, Math.floor(num("rightBars", BOS_MSS_STUDY_DEFAULTS.rightBars))),
          ),
          breakOnWick: bool("breakOnWick", BOS_MSS_STUDY_DEFAULTS.breakOnWick),
          smartScales: bool("smartScales", BOS_MSS_STUDY_DEFAULTS.smartScales),
          scalesText: str("scalesText", BOS_MSS_STUDY_DEFAULTS.scalesText),
          showBosPlus: bosPlus.visible,
          showBosMinus: bosMinus.visible,
          showMssPlus: mssPlus.visible,
          showMssMinus: mssMinus.visible,
          showLines: bool("showLines", BOS_MSS_STUDY_DEFAULTS.showLines),
          showLabels: bool("showLabels", BOS_MSS_STUDY_DEFAULTS.showLabels),
          bosPlusLabel: str("bosPlusLabel", BOS_MSS_STUDY_DEFAULTS.bosPlusLabel).slice(0, 12),
          bosMinusLabel: str("bosMinusLabel", BOS_MSS_STUDY_DEFAULTS.bosMinusLabel).slice(0, 12),
          mssPlusLabel: str("mssPlusLabel", BOS_MSS_STUDY_DEFAULTS.mssPlusLabel).slice(0, 12),
          mssMinusLabel: str("mssMinusLabel", BOS_MSS_STUDY_DEFAULTS.mssMinusLabel).slice(0, 12),
          bosPlusColor: applyTransparency(bosPlus.color, bosPlus.transparency),
          bosMinusColor: applyTransparency(bosMinus.color, bosMinus.transparency),
          mssPlusColor: applyTransparency(mssPlus.color, mssPlus.transparency),
          mssMinusColor: applyTransparency(mssMinus.color, mssMinus.transparency),
          lineWidth,
          bosLineStyle: bosPlus.linestyle ?? bosLineStyleInput,
          mssLineStyle: mssPlus.linestyle ?? mssLineStyleInput,
          fontSize,
          maxEvents: Math.max(
            10,
            Math.min(400, Math.floor(num("maxEvents", BOS_MSS_STUDY_DEFAULTS.maxEvents))),
          ),
        };
      } catch {
        return { ...BOS_MSS_DEFAULTS };
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
        if (bars.length < inputs.leftBars + inputs.rightBars + 3) return;

        const cmds = computeBosMss(bars, inputs);
        const fp = fingerprint(cmds);
        // Never clear+redraw when nothing changed — force only used on first kickoff.
        if (key === lastKeyRef.current && fp === lastFpRef.current) return;

        mutePaintEvents();
        const ids = await paintBosMss(active, cmds, { ownerStudyId: studyId });
        if (cancelled || gen !== genRef.current) {
          mutePaintEvents();
          for (const id of ids) {
            try {
              chart.removeEntity(id);
            } catch {
              /* ignore */
            }
          }
          return;
        }
        // Paint-then-swap: remove previous shapes after new ones are up (no blank flash).
        const prev = entityIdsRef.current;
        entityIdsRef.current = ids;
        lastKeyRef.current = key;
        lastFpRef.current = fp;
        mutePaintEvents();
        for (const id of prev) {
          try {
            chart.removeEntity(id);
          } catch {
            /* ignore */
          }
        }
      } catch (err) {
        console.warn("[bos-mss] paint failed", err);
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
