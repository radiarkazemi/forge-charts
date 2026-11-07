/**
 * Watches Indicators “Forge Certainty” and paints strict SI+DR signals
 * with Long/Short Position boxes, arrows, and score pills.
 */

import { useEffect, useRef } from "react";
import { useServices } from "@/app/use-services";
import { useStore } from "@/shared/hooks/useStore";
import type { EntityId } from "@/infrastructure/tradingview";

import { CERTAINTY_DEFAULTS, computeCertainty, paintCertainty, certaintyDrawCmds, type CertaintyInputs } from "@/features/certainty/runtime";
import {
  CERTAINTY_STUDY_DEFAULTS,
  CERT_STYLE_ACCENT,
  CERT_STYLE_BEAR,
  CERT_STYLE_BULL,
  CERT_STYLE_SL,
  CERT_STYLE_TP,
} from "./forge-certainty-indicator";
import { applyTransparency, readStylePlot } from "./study-style-plots";
import { studyIsVisible, markChartPaintBusy } from "./study-paint-gate";

import { exportChartBarsCached, STUDY_DEBOUNCE_MS, STUDY_LIVE_REFRESH_MS, STUDY_MAX_BARS, STUDY_PRESENCE_POLL_MS, STUDY_PAINT_MUTE_MS } from "./chart-export-cache";

const MAX_BARS = STUDY_MAX_BARS;
// STUDY_DEBOUNCE_MS from chart-export-cache
const PRESENCE_POLL_MS = STUDY_PRESENCE_POLL_MS;
const LIVE_REFRESH_MS = STUDY_LIVE_REFRESH_MS;

function fingerprint(
  cmds: readonly { kind: string; t1: number; p1: number; t2?: number; p2?: number; text?: string }[],
): string {
  if (cmds.length === 0) return "empty";
  const head = cmds.slice(0, 4);
  const tail = cmds.length > 4 ? cmds.slice(-4) : [];
  const part = (c: (typeof cmds)[number]) =>
    `${c.kind}:${c.t1}:${c.p1}:${c.t2 ?? ""}:${c.p2 ?? ""}:${c.text ?? ""}`;
  return `${cmds.length}|${[...head, ...tail].map(part).join(";")}`;
}

export function useForgeCertaintyStudy(enabled = true): void {
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
              /forge\s*certainty/i.test(name) ||
              /ForgeCertainty@/i.test(name) ||
              /Certainty\s*·/i.test(name)
            );
          })
          .map((s: { id?: string | EntityId }) => s.id as EntityId);
      } catch {
        return [];
      }
    };

    const readOptions = (studyId: EntityId): Partial<CertaintyInputs> => {
      try {
        const api = widget.activeChart()?.getStudyById(studyId);
        if (!api) return {};
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
        const biasRaw = Math.floor(num("biasMode", CERTAINTY_STUDY_DEFAULTS.biasMode));
        const biasMode = biasRaw === 1 ? 1 : biasRaw === 2 ? 2 : 0;
        return {
          biasMode,
          minScore: Math.min(
            100,
            Math.max(50, Math.floor(num("minScore", CERTAINTY_STUDY_DEFAULTS.minScore))),
          ),
          targetR: Math.max(1, num("targetR", CERTAINTY_STUDY_DEFAULTS.targetR)),
          requireDrBias: bool("requireDrBias", CERTAINTY_STUDY_DEFAULTS.requireDrBias),
          requireEntryHalf: bool("requireEntryHalf", CERTAINTY_STUDY_DEFAULTS.requireEntryHalf),
          requireOte: bool("requireOte", CERTAINTY_STUDY_DEFAULTS.requireOte),
          requireFvg: bool("requireFvg", CERTAINTY_STUDY_DEFAULTS.requireFvg),
          firstTouchOnly: bool("firstTouchOnly", CERTAINTY_STUDY_DEFAULTS.firstTouchOnly),
          withTrend: bool("withTrend", CERTAINTY_STUDY_DEFAULTS.withTrend),
          cooldownBars: Math.min(
            40,
            Math.max(0, Math.floor(num("cooldownBars", CERTAINTY_STUDY_DEFAULTS.cooldownBars))),
          ),
          maxSignals: Math.min(
            24,
            Math.max(1, Math.floor(num("maxSignals", CERTAINTY_STUDY_DEFAULTS.maxSignals))),
          ),
          maxSignalsPerDay: Math.min(
            12,
            Math.max(
              1,
              Math.floor(num("maxSignalsPerDay", CERTAINTY_STUDY_DEFAULTS.maxSignalsPerDay)),
            ),
          ),
          showDealingRange: bool("showDealingRange", CERTAINTY_STUDY_DEFAULTS.showDealingRange),
          showZones: bool("showZones", CERTAINTY_STUDY_DEFAULTS.showZones),
          showHistory: bool("showHistory", CERTAINTY_STUDY_DEFAULTS.showHistory),
          showScore: bool("showScore", CERTAINTY_STUDY_DEFAULTS.showScore),
          historyLimit: Math.min(
            24,
            Math.max(2, Math.floor(num("historyLimit", CERTAINTY_STUDY_DEFAULTS.historyLimit))),
          ),
          ...(() => {
            const bull = readStylePlot(api, CERT_STYLE_BULL, {
              color: CERTAINTY_DEFAULTS.bullColor,
              visible: true,
              transparency: 0,
              linewidth: 2,
              linestyle: 0,
            });
            const bear = readStylePlot(api, CERT_STYLE_BEAR, {
              color: CERTAINTY_DEFAULTS.bearColor,
              visible: true,
              transparency: 0,
              linewidth: 2,
              linestyle: 0,
            });
            const accent = readStylePlot(api, CERT_STYLE_ACCENT, {
              color: CERTAINTY_DEFAULTS.accentColor,
              visible: true,
              transparency: 0,
              linewidth: 1,
              linestyle: 0,
            });
            const tp = readStylePlot(api, CERT_STYLE_TP, {
              color: CERTAINTY_DEFAULTS.longBoxColor,
              visible: true,
              transparency: 100 - CERTAINTY_DEFAULTS.boxOpacity,
              linewidth: 1,
              linestyle: 0,
            });
            const sl = readStylePlot(api, CERT_STYLE_SL, {
              color: CERTAINTY_DEFAULTS.shortBoxColor,
              visible: true,
              transparency: 100 - CERTAINTY_DEFAULTS.boxOpacity,
              linewidth: 1,
              linestyle: 0,
            });
            const fillFromTransparency = (t: number) =>
              Math.max(8, Math.min(50, Math.round(100 - Math.max(0, Math.min(100, t)))));
            const boxOpacity = Math.round(
              (fillFromTransparency(tp.transparency) + fillFromTransparency(sl.transparency)) / 2,
            );
            return {
              bullColor: applyTransparency(bull.color, bull.transparency),
              bearColor: applyTransparency(bear.color, bear.transparency),
              accentColor: applyTransparency(accent.color, accent.transparency),
              longBoxColor: applyTransparency(tp.color, 0),
              shortBoxColor: applyTransparency(sl.color, 0),
              boxOpacity,
              showTradeBox:
                bool("showTradeBox", CERTAINTY_STUDY_DEFAULTS.showTradeBox) &&
                (tp.visible || sl.visible),
              showAwaiting:
                bool("showAwaiting", CERTAINTY_STUDY_DEFAULTS.showAwaiting) && accent.visible,
            };
          })(),
        };
      } catch {
        return {};
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
      const opts = readOptions(studyId);
      const key = JSON.stringify({ symbol, interval, opts, studies: studyIds });
      if (!force && key === lastKeyRef.current && entityIdsRef.current.length > 0) return;

      const myGen = ++genRef.current;
      busyRef.current = true;
      try {
        const api = widget.activeChart();
        if (!api) return;
        let bars = await exportChartBarsCached(api, MAX_BARS);
        if (cancelled || myGen !== genRef.current) return;
        if (bars.length < 80) {
          if (entityIdsRef.current.length === 0) lastKeyRef.current = "";
          return;
        }
        const result = computeCertainty(bars, opts);
        const lean = {
          ...result,
          signals: result.signals.slice(-6),
        };
        const cmds = certaintyDrawCmds(lean, opts, bars[bars.length - 1]!.time);
        const fp = fingerprint(cmds);
        if (
          fp === lastFpRef.current &&
          lastKeyRef.current === key &&
          entityIdsRef.current.length > 0
        ) {
          return;
        }
        if (cancelled || myGen !== genRef.current) return;
        markChartPaintBusy(STUDY_PAINT_MUTE_MS);
        const ids =
          cmds.length === 0
            ? ([] as EntityId[])
            : await paintCertainty(api, cmds, { ownerStudyId: studyId });
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
        const live = result.signals.filter((s) => s.active).length;
        const dr = result.lastDealingRange;
        console.info(
          `[forge-certainty] signals=${result.signals.length} live=${live} awaiting=${result.awaiting ? "yes" : "no"} dr=${dr ? (dr.bullish ? "bull" : "bear") : "none"} painted=${ids.length} bars=${bars.length}`,
        );
      } catch (err) {
        console.warn("[forge-certainty] paint failed", err);
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
