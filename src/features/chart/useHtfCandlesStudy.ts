/**
 * Watches Indicators “ICT HTF Candles” and paints Fadi-style side HTF candles.
 */

import { useEffect, useRef } from "react";
import { useServices } from "@/app/use-services";
import { useStore } from "@/shared/hooks/useStore";
import type { EntityId } from "@/infrastructure/tradingview";
import { computeHtfCandles, HTF_CANDLES_DEFAULTS, paintHtfCandlesOnChart, type DailyOpenMode, type HtfCandlesOptions } from "@/features/htf-candles/runtime";
import {
  HTF_CANDLES_STUDY_DEFAULTS,
  HTF_CANDLES_STUDY_NAME,
  HTF_STYLE_BEAR,
  HTF_STYLE_BEAR_WICK,
  HTF_STYLE_BORDER,
  HTF_STYLE_BULL,
  HTF_STYLE_BULL_WICK,
  readHtfSlotsFromMap,
} from "./htf-candles-indicator";
import { applyTransparency, readStylePlot } from "./study-style-plots";
import { studyIsVisible, markChartPaintBusy } from "./study-paint-gate";

import { exportChartBarsCached, STUDY_DEBOUNCE_MS, STUDY_LIVE_REFRESH_MS, STUDY_MAX_BARS, STUDY_PRESENCE_POLL_MS, STUDY_PAINT_MUTE_MS } from "./chart-export-cache";

const MAX_BARS = STUDY_MAX_BARS;
// STUDY_DEBOUNCE_MS from chart-export-cache
/** Live tip refresh — keep light; timers alone must not force a full redraw. */
const LIVE_REFRESH_MS = STUDY_LIVE_REFRESH_MS;
const PRESENCE_POLL_MS = STUDY_PRESENCE_POLL_MS;

const DAILY_SET = new Set<string>(["midnight", "830", "930", "exchange"]);

/** HH:MM / HH:MM:SS countdown labels change every second — exclude from fingerprint. */
function isVolatileTimerLabel(text: string | undefined): boolean {
  if (!text) return false;
  return /^\d{1,2}:\d{2}(:\d{2})?$/.test(text.trim()) || /^\d+D\s+\d{2}:\d{2}:\d{2}$/.test(text.trim());
}

function fingerprintCmds(
  cmds: readonly { kind: string; t1: number; p1: number; color?: string; fill?: string; text?: string }[],
): string {
  if (cmds.length === 0) return "empty";
  const stable = cmds.filter((c) => !(c.kind === "label" && isVolatileTimerLabel(c.text)));
  if (stable.length === 0) return "empty";
  const head = stable.slice(0, 8);
  const tail = stable.length > 8 ? stable.slice(-8) : [];
  const part = (c: (typeof stable)[number]) =>
    `${c.kind}:${c.t1}:${c.p1}:${c.color ?? ""}:${c.fill ?? ""}:${c.text ?? ""}`;
  return `${stable.length}|${[...head, ...tail].map(part).join(";")}`;
}

function intervalToSeconds(interval: string): number {
  const raw = interval.trim().toUpperCase();
  if (raw === "1D" || raw === "D") return 86_400;
  if (raw === "1W" || raw === "W") return 7 * 86_400;
  if (raw === "1M" || raw === "M") return 30 * 86_400;
  if (raw.endsWith("S")) {
    const n = Number(raw.slice(0, -1));
    return Number.isFinite(n) && n > 0 ? n : 60;
  }
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n * 60 : 60;
}

export function useHtfCandlesStudy(enabled = true): void {
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
    genRef.current += 1;
    clearDrawings();
    lastKeyRef.current = "";
    lastFpRef.current = "";

    function clearDrawings(): void {
      const ids = entityIdsRef.current;
      entityIdsRef.current = [];
      for (const id of ids) {
        try {
          chart.removeEntity(id);
        } catch {
          /* ignore */
        }
      }
    }

    const findStudyIds = (): EntityId[] => {
      try {
        const studies = widget.activeChart()?.getAllStudies() ?? [];
        return studies
          .filter((s: { name?: string; id?: string | EntityId }) => {
            const name = `${s.name ?? ""} ${s.id ?? ""}`;
            return (
              /ict\s*htf\s*candles/i.test(name) ||
              /IctHtfCandles@/i.test(name) ||
              new RegExp(HTF_CANDLES_STUDY_NAME.replace(/\s+/g, "\\s*"), "i").test(name)
            );
          })
          .map((s: { id?: string | EntityId }) => s.id as EntityId);
      } catch {
        return [];
      }
    };

    const readOptions = (studyId: EntityId): HtfCandlesOptions | null => {
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
        const str = (id: string, fallback: string) => {
          const v = map.get(id);
          return typeof v === "string" && v.trim() ? v.trim() : fallback;
        };
        const bool = (id: string, fallback: boolean) => {
          const v = map.get(id);
          return typeof v === "boolean" ? v : fallback;
        };
        const dailyRaw = str("dailyOpenMode", HTF_CANDLES_STUDY_DEFAULTS.dailyOpenMode);
        const dailyOpenMode = (
          DAILY_SET.has(dailyRaw) ? dailyRaw : HTF_CANDLES_DEFAULTS.dailyOpenMode
        ) as DailyOpenMode;
        return {
          slots: readHtfSlotsFromMap(map),
          limitHtf: Math.max(1, Math.min(6, Math.floor(num("limitHtf", HTF_CANDLES_DEFAULTS.limitHtf)))),
          paddingBars: Math.max(
            1,
            Math.min(80, Math.floor(num("paddingBars", HTF_CANDLES_DEFAULTS.paddingBars))),
          ),
          spacingBars: Math.max(
            0,
            Math.min(20, Math.floor(num("spacingBars", HTF_CANDLES_DEFAULTS.spacingBars))),
          ),
          groupGapBars: Math.max(
            0,
            Math.min(40, Math.floor(num("groupGapBars", HTF_CANDLES_DEFAULTS.groupGapBars))),
          ),
          widthBars: Math.max(
            1,
            Math.min(20, Math.floor(num("widthBars", HTF_CANDLES_DEFAULTS.widthBars))),
          ),
          showFvg: bool("showFvg", HTF_CANDLES_DEFAULTS.showFvg),
          showVi: bool("showVi", HTF_CANDLES_DEFAULTS.showVi),
          showTrace: bool("showTrace", HTF_CANDLES_DEFAULTS.showTrace),
          showLabels: bool("showLabels", HTF_CANDLES_DEFAULTS.showLabels),
          // Force off — HTF remain labels duplicated the blue price-scale countdown.
          showTimer: false,
          showHtfName: bool("showHtfName", HTF_CANDLES_DEFAULTS.showHtfName),
          showGroupBackdrop: bool("showGroupBackdrop", HTF_CANDLES_DEFAULTS.showGroupBackdrop),
          dailyOpenMode,
          timezoneOffset: Math.max(
            -12,
            Math.min(14, Math.floor(num("timezoneOffset", HTF_CANDLES_DEFAULTS.timezoneOffset))),
          ),
          ...(() => {
            const bull = readStylePlot(api, HTF_STYLE_BULL, {
              color: HTF_CANDLES_DEFAULTS.bullBody,
              visible: true,
              transparency: HTF_CANDLES_DEFAULTS.bodyTransparency,
              linewidth: 1,
              linestyle: 0,
            });
            const bear = readStylePlot(api, HTF_STYLE_BEAR, {
              color: HTF_CANDLES_DEFAULTS.bearBody,
              visible: true,
              transparency: HTF_CANDLES_DEFAULTS.bodyTransparency,
              linewidth: 1,
              linestyle: 0,
            });
            const border = readStylePlot(api, HTF_STYLE_BORDER, {
              color: HTF_CANDLES_DEFAULTS.border,
              visible: true,
              transparency: 0,
              linewidth: 1,
              linestyle: 0,
            });
            const bullWick = readStylePlot(api, HTF_STYLE_BULL_WICK, {
              color: HTF_CANDLES_DEFAULTS.bullWick,
              visible: true,
              transparency: 0,
              linewidth: 1,
              linestyle: 0,
            });
            const bearWick = readStylePlot(api, HTF_STYLE_BEAR_WICK, {
              color: HTF_CANDLES_DEFAULTS.bearWick,
              visible: true,
              transparency: 0,
              linewidth: 1,
              linestyle: 0,
            });
            const bodyTransparency = Math.round(
              (bull.transparency + bear.transparency) / 2,
            );
            return {
              bullBody: applyTransparency(bull.color, 0),
              bearBody: applyTransparency(bear.color, 0),
              border: applyTransparency(border.color, border.transparency),
              bullWick: applyTransparency(bullWick.color, bullWick.transparency),
              bearWick: applyTransparency(bearWick.color, bearWick.transparency),
              bodyTransparency: Math.max(0, Math.min(100, bodyTransparency)),
            };
          })(),
        };
      } catch (err) {
        console.warn("[forge-htf-candles] readOptions failed", err);
        return null;
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
      const opts = readOptions(studyId) ?? { ...HTF_CANDLES_DEFAULTS };
      const optsKey = JSON.stringify({ symbol, interval, opts, studies: studyIds });
      const myGen = ++genRef.current;
      busyRef.current = true;
      try {
        const api = widget.activeChart();
        if (!api) return;
        const rawBars = await exportChartBarsCached(api, MAX_BARS);
        if (cancelled || myGen !== genRef.current) return;
        const bars = rawBars.map((b) => ({
          time: b.time,
          open: b.open,
          high: b.high,
          low: b.low,
          close: b.close,
          volume: b.volume ?? 0,
        }));
        if (bars.length < 5) {
          if (entityIdsRef.current.length === 0) lastKeyRef.current = "";
          return;
        }
        const tip = bars[bars.length - 1]!;
        // Tip key ignores sub-tick noise; OHLC tip changes drive redraws.
        const key = `${optsKey}|${tip.time}:${tip.close.toFixed(5)}:${tip.high.toFixed(5)}:${tip.low.toFixed(5)}`;
        if (!force && lastKeyRef.current === key && lastFpRef.current) return;
        const chartIntervalSec = intervalToSeconds(interval);
        const { cmds } = computeHtfCandles(bars, chartIntervalSec, opts);
        const fp = fingerprintCmds(cmds);
        if (!force && fp === lastFpRef.current && lastKeyRef.current === key) return;
        if (cancelled || myGen !== genRef.current) return;
        markChartPaintBusy(STUDY_PAINT_MUTE_MS);
        const ids =
          cmds.length === 0
            ? ([] as EntityId[])
            : await paintHtfCandlesOnChart(api, cmds, {
                ownerStudyId: studyId,
                maxDrawings: 900,
              });
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
      } catch (err) {
        console.warn("[forge-htf-candles] paint failed", err);
        lastKeyRef.current = "";
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

    const onStudyEvent = (...args: unknown[]) => {
      const eventType = String(args[1] ?? args[0] ?? "");
      if (/remove/i.test(eventType) && findStudyIds().length === 0) {
        genRef.current += 1;
        clearDrawings();
        lastKeyRef.current = "";
        lastFpRef.current = "";
        return;
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
    const kickoffTimer = window.setTimeout(kickoff, 900);
    const presencePoll = window.setInterval(() => {
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
      void repaint(false);
    }, LIVE_REFRESH_MS);

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
      window.clearInterval(presencePoll);
      window.clearInterval(livePoll);
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
