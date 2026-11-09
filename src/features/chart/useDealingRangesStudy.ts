/**
 * Watches the Indicators “Dealing Ranges” study and paints multi-TF
 * Orca dealing ranges with ICT halves (0–0.5 green · 0.5–1 red · EQ mid).
 *
 * Critical: do NOT subscribe to onAutoSaveNeeded — creating shapes fires
 * autosave, which would force-repaint forever and freeze the chart.
 */

import { useEffect, useRef } from "react";
import type { ChartController } from "./chart-controller";
import { useBoundChartState } from "./study-controller-bind";
import type { EntityId } from "@/infrastructure/tradingview";
import { paintOrcaOnChart, type DrawCmd } from "@/features/pine/orca-runtime";
import { computeMultiTfDealingRanges, MULTI_TF_DR_DEFAULTS, type MultiTfDealingRangesOptions } from "@/features/dealing-ranges/runtime";
import {
  DEALING_RANGES_DEFAULTS,
  DR_STYLE_DISCOUNT,
  DR_STYLE_EDGES,
  DR_STYLE_FIB618,
  DR_STYLE_FIB786,
  DR_STYLE_MID,
  DR_STYLE_PREMIUM,
  dealingRangesOptionsFromMap,
} from "./dealing-ranges-indicator";
import { applyTransparency, readStylePlot } from "./study-style-plots";
import { studyIsVisible, markChartPaintBusy } from "./study-paint-gate";
import { exportChartBarsCached, STUDY_DEBOUNCE_MS, STUDY_MAX_BARS, STUDY_PAINT_MUTE_MS, STUDY_PRESENCE_POLL_MS } from "./chart-export-cache";

const DR_STYLE_FALLBACK = MULTI_TF_DR_DEFAULTS;

/** Cap bars fed into Orca so 1m/seconds charts stay responsive. */
const MAX_BARS = STUDY_MAX_BARS;
/** Debounce study add/remove/input changes before expensive export+paint. */
// STUDY_DEBOUNCE_MS from chart-export-cache
/** Cheap presence check only (no export) while a study is active. */
const PRESENCE_POLL_MS = STUDY_PRESENCE_POLL_MS;
/** Multi-TF + multi-scale halves need more shapes than the default Orca cap. */
const MAX_PAINT_CMDS = 220;
/** Ignore study_event feedback while shapes are created/removed. */
const PAINT_MUTE_MS = STUDY_PAINT_MUTE_MS;

function fingerprintCmds(cmds: readonly DrawCmd[]): string {
  if (cmds.length === 0) return "empty";
  const head = cmds.slice(0, 6);
  const tail = cmds.length > 6 ? cmds.slice(-6) : [];
  const part = (c: DrawCmd) =>
    `${c.kind}:${c.t1}:${c.p1}:${c.t2 ?? ""}:${c.p2 ?? ""}:${c.color}`;
  return `${cmds.length}|${[...head, ...tail].map(part).join(";")}`;
}

function defaultOpts(): MultiTfDealingRangesOptions {
  return { ...MULTI_TF_DR_DEFAULTS };
}

export function useDealingRangesStudy(chart: ChartController | null): void {
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

    const readOptions = (studyId: EntityId): MultiTfDealingRangesOptions | null => {
      try {
        const api = widget.activeChart()?.getStudyById(studyId);
        if (!api) return null;
        const values = api.getInputValues() ?? [];
        const map = new Map<string, unknown>();
        for (const item of values) {
          map.set(String(item.id), item.value);
        }
        // Legacy studies may lack new keys — merge with defaults via map reader.
        for (const [k, v] of Object.entries(DEALING_RANGES_DEFAULTS)) {
          if (!map.has(k)) map.set(k, v);
        }
        const base = dealingRangesOptionsFromMap(map);

        const premium = readStylePlot(api, DR_STYLE_PREMIUM, {
          color: DR_STYLE_FALLBACK.premiumColor,
          visible: true,
          transparency: 100 - DR_STYLE_FALLBACK.fillOpacity,
          linewidth: 1,
          linestyle: 0,
        });
        const discount = readStylePlot(api, DR_STYLE_DISCOUNT, {
          color: DR_STYLE_FALLBACK.discountColor,
          visible: true,
          transparency: 100 - DR_STYLE_FALLBACK.fillOpacity,
          linewidth: 1,
          linestyle: 0,
        });
        const mid = readStylePlot(api, DR_STYLE_MID, {
          color: DR_STYLE_FALLBACK.midColor,
          visible: DR_STYLE_FALLBACK.showMid,
          transparency: 0,
          linewidth: DR_STYLE_FALLBACK.midWidth,
          linestyle: 2,
        });
        const edges = readStylePlot(api, DR_STYLE_EDGES, {
          color: DR_STYLE_FALLBACK.zeroOneColor,
          visible: DR_STYLE_FALLBACK.showZeroOne,
          transparency: 0,
          linewidth: 1,
          linestyle: 0,
        });
        const fib618 = readStylePlot(api, DR_STYLE_FIB618, {
          color: DR_STYLE_FALLBACK.fib618Color,
          visible: DR_STYLE_FALLBACK.showFibs,
          transparency: 0,
          linewidth: 1,
          linestyle: 1,
        });
        const fib786 = readStylePlot(api, DR_STYLE_FIB786, {
          color: DR_STYLE_FALLBACK.fib786Color,
          visible: DR_STYLE_FALLBACK.showFibs,
          transparency: 0,
          linewidth: 1,
          linestyle: 1,
        });

        const fillFromTransparency = (t: number) =>
          Math.max(4, Math.min(40, Math.round(100 - Math.max(0, Math.min(100, t)))));
        const fillOpacity = Math.round(
          (fillFromTransparency(premium.transparency) + fillFromTransparency(discount.transparency)) /
            2,
        );

        return {
          ...base,
          premiumColor: applyTransparency(premium.color, 0),
          discountColor: applyTransparency(discount.color, 0),
          midColor: applyTransparency(mid.color, mid.transparency),
          zeroOneColor: applyTransparency(edges.color, edges.transparency),
          fib618Color: applyTransparency(fib618.color, fib618.transparency),
          fib786Color: applyTransparency(fib786.color, fib786.transparency),
          midWidth: Math.max(1, Math.min(4, Math.round(mid.linewidth || base.midWidth))),
          fillOpacity,
          showPremium: premium.visible,
          showDiscount: discount.visible,
          showMid: mid.visible,
          showZeroOne: edges.visible,
          showFibs: fib618.visible || fib786.visible,
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
      const studyApi = widget.activeChart()?.getStudyById(studyId);
      if (!studyIsVisible(studyApi)) {
        genRef.current += 1;
        clearDrawings();
        lastKeyRef.current = `hidden:${symbol}:${interval}`;
        lastFpRef.current = "";
        return;
      }
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

        let bars = await exportChartBarsCached(api, MAX_BARS);
        if (cancelled || myGen !== genRef.current) return;
        if (bars.length < 20) {
          if (entityIdsRef.current.length === 0) {
            lastKeyRef.current = "";
          }
          return;
        }

        const cmds = computeMultiTfDealingRanges(bars, String(interval), opts);
        const fp = fingerprintCmds(cmds);
        if (!force && fp === lastFpRef.current && lastKeyRef.current === key) {
          return;
        }
        if (cancelled || myGen !== genRef.current) return;

        mutePaintEvents();
        const ids =
          cmds.length === 0
            ? ([] as EntityId[])
            : await paintOrcaOnChart(api, cmds, {
                ownerStudyId: studyId,
                maxCmds: MAX_PAINT_CMDS,
              });
        if (cancelled || myGen !== genRef.current) {
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
        void repaint(false);
      }, STUDY_DEBOUNCE_MS);
    };

    /** Only react to create/remove/property edits — ignore noise that would loop. */
    const onStudyEvent = (...args: unknown[]) => {
      if (isMuted()) return;
      const eventType = String(args[1] ?? args[0] ?? "");
      if (/remove/i.test(eventType)) {
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
      if (/^(create|remove|price_scale|properties|visibility|toggle|hide|show)/i.test(eventType)) {
        scheduleRepaint();
      }
    };

    const onStudyProperties = (...args: unknown[]) => {
      if (isMuted()) return;
      const id = String(args[0] ?? "");
      if (!id) return;
      const ours = findStudyIds().some((s) => String(s) === id);
      if (ours) scheduleRepaint();
    };

    const kickoff = () => {
      void repaint(true);
    };
    try {
      widget.activeChart()?.dataReady(kickoff);
    } catch {
      kickoff();
    }
    const kickoffTimer = window.setTimeout(kickoff, 1_200);

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
      if (lastKeyRef.current === "" || String(lastKeyRef.current).startsWith("hidden:")) {
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
      window.clearTimeout(kickoffTimer);
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
  }, [chart, ready, symbol, interval]);
}
