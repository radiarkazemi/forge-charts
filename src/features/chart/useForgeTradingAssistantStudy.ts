/**
 * Watches Indicators “Forge Trading Assistant” and paints Buy/Sell + TP/SL
 * from the Phase 1 confluence runtime (MSS/BOS · OB/FVG · rejection).
 */

import { useEffect, useRef } from "react";
import { useServices } from "@/app/use-services";
import { useStore } from "@/shared/hooks/useStore";
import type { EntityId } from "@/infrastructure/tradingview";

import { computeTradingAssistant, FTA_DEFAULTS, paintTradingAssistant, tradingAssistantDrawCmds, type FtaInputs } from "@/features/trading-assistant/runtime";
import {
  FTA_STUDY_DEFAULTS,
  FTA_STYLE_BEAR,
  FTA_STYLE_BULL,
  FTA_STYLE_SL,
  FTA_STYLE_TP,
} from "./forge-trading-assistant-indicator";
import { applyTransparency, readStylePlot } from "./study-style-plots";
import { studyIsVisible, markChartPaintBusy } from "./study-paint-gate";

import { exportChartBarsCached, STUDY_DEBOUNCE_MS, STUDY_LIVE_REFRESH_MS, STUDY_MAX_BARS, STUDY_PRESENCE_POLL_MS, STUDY_PAINT_MUTE_MS } from "./chart-export-cache";

/** Keep light — Orca DR + paint shapes on large histories freezes the chart. */
const MAX_BARS = STUDY_MAX_BARS;
// STUDY_DEBOUNCE_MS from chart-export-cache
const PRESENCE_POLL_MS = STUDY_PRESENCE_POLL_MS;
/** Refresh BUY/SELL as new bars form (fingerprint skips no-op paints). */
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

export function useForgeTradingAssistantStudy(enabled = true): void {
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
              /forge\s*trading\s*assistant/i.test(name) ||
              /ForgeTradingAssistant@/i.test(name) ||
              /Forge TA/i.test(name)
            );
          })
          .map((s: { id?: string | EntityId }) => s.id as EntityId);
      } catch {
        return [];
      }
    };

    const readOptions = (studyId: EntityId): Partial<FtaInputs> => {
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
        const biasRaw = Math.floor(num("biasMode", FTA_STUDY_DEFAULTS.biasMode));
        const biasMode = (biasRaw === 1 ? 1 : biasRaw === 2 ? 2 : 0) as 0 | 1 | 2;
        return {
          biasMode,
          swingLeft: Math.max(1, Math.floor(num("swingLeft", FTA_STUDY_DEFAULTS.swingLeft))),
          swingRight: Math.max(1, Math.floor(num("swingRight", FTA_STUDY_DEFAULTS.swingRight))),
          tp1R: Math.max(0.5, num("tp1R", FTA_STUDY_DEFAULTS.tp1R)),
          tp2R: Math.max(1, num("tp2R", FTA_STUDY_DEFAULTS.tp2R)),
          atrLength: Math.max(5, Math.floor(num("atrLength", FTA_STUDY_DEFAULTS.atrLength))),
          atrSlPad: Math.max(0, num("atrSlPad", FTA_STUDY_DEFAULTS.atrSlPad)),
          preferMss: bool("preferMss", FTA_STUDY_DEFAULTS.preferMss),
          useOrderBlock: bool("useOrderBlock", FTA_STUDY_DEFAULTS.useOrderBlock),
          useFvg: bool("useFvg", FTA_STUDY_DEFAULTS.useFvg),
          requireRejection: bool("requireRejection", FTA_STUDY_DEFAULTS.requireRejection),
          requireDealingRange: bool(
            "requireDealingRange",
            FTA_STUDY_DEFAULTS.requireDealingRange,
          ),
          requireTrendAlign: bool("requireTrendAlign", FTA_STUDY_DEFAULTS.requireTrendAlign),
          requireDrOte: bool("requireDrOte", FTA_STUDY_DEFAULTS.requireDrOte),
          maxSignals: Math.min(
            24,
            Math.max(1, Math.floor(num("maxSignals", FTA_STUDY_DEFAULTS.maxSignals))),
          ),
          maxSignalsPerDay: Math.min(
            20,
            Math.max(1, Math.floor(num("maxSignalsPerDay", FTA_STUDY_DEFAULTS.maxSignalsPerDay))),
          ),
          cooldownBars: Math.min(
            60,
            Math.max(1, Math.floor(num("cooldownBars", FTA_STUDY_DEFAULTS.cooldownBars))),
          ),
          showZones: bool("showZones", FTA_STUDY_DEFAULTS.showZones),
          showDealingRange: bool("showDealingRange", FTA_STUDY_DEFAULTS.showDealingRange),
          showStructure: bool("showStructure", FTA_STUDY_DEFAULTS.showStructure),
          showHistory: bool("showHistory", FTA_STUDY_DEFAULTS.showHistory),
          ...(() => {
            const bull = readStylePlot(api, FTA_STYLE_BULL, {
              color: FTA_DEFAULTS.bullColor,
              visible: true,
              transparency: 0,
              linewidth: 2,
              linestyle: 0,
            });
            const bear = readStylePlot(api, FTA_STYLE_BEAR, {
              color: FTA_DEFAULTS.bearColor,
              visible: true,
              transparency: 0,
              linewidth: 2,
              linestyle: 0,
            });
            const tp = readStylePlot(api, FTA_STYLE_TP, {
              color: FTA_DEFAULTS.longBoxColor,
              visible: true,
              transparency: 100 - FTA_DEFAULTS.boxOpacity,
              linewidth: 1,
              linestyle: 0,
            });
            const sl = readStylePlot(api, FTA_STYLE_SL, {
              color: FTA_DEFAULTS.shortBoxColor,
              visible: true,
              transparency: 100 - FTA_DEFAULTS.boxOpacity,
              linewidth: 1,
              linestyle: 0,
            });
            const fillFromTransparency = (t: number) =>
              Math.max(4, Math.min(40, Math.round(100 - Math.max(0, Math.min(100, t)))));
            const boxOpacity = Math.round(
              (fillFromTransparency(tp.transparency) + fillFromTransparency(sl.transparency)) / 2,
            );
            return {
              bullColor: applyTransparency(bull.color, bull.transparency),
              bearColor: applyTransparency(bear.color, bear.transparency),
              longBoxColor: applyTransparency(tp.color, 0),
              shortBoxColor: applyTransparency(sl.color, 0),
              boxOpacity,
              showTradeBox: bool("showTradeBox", FTA_STUDY_DEFAULTS.showTradeBox) && (tp.visible || sl.visible),
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
        if (bars.length < 40) {
          if (entityIdsRef.current.length === 0) lastKeyRef.current = "";
          return;
        }
        const result = computeTradingAssistant(bars, opts);
        // Cap painted history so createShape storms don't freeze the chart.
        const lean = {
          ...result,
          signals: result.signals.slice(-6),
        };
        const cmds = tradingAssistantDrawCmds(lean, opts, bars[bars.length - 1]!.time);
        const fp = fingerprint(cmds);
        // Skip identical paints even on forced live refresh (avoids createShape storms).
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
            : await paintTradingAssistant(api, cmds, { ownerStudyId: studyId });
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
        const trend =
          result.trendDir === 1 ? "up" : result.trendDir === -1 ? "down" : "flat";
        console.info(
          `[forge-ta] ${result.biasLabel} · trend=${trend} · dr=${dr ? (dr.bullish ? "bull" : "bear") : "none"} · painted ${ids.length} · signals=${result.signals.length} live=${live} bars=${bars.length}`,
        );
      } catch (err) {
        console.warn("[forge-ta] paint failed", err);
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
      if (/^(create|remove|price_scale|properties|visibility|toggle|hide|show)/i.test(eventType)) scheduleRepaint();
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
