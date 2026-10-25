/**
 * Watches Indicators “ICT HTF Candles” and paints Fadi-style side HTF candles.
 */

import { useEffect, useRef } from "react";
import { useServices } from "@/app/use-services";
import { useStore } from "@/shared/hooks/useStore";
import type { EntityId } from "@/infrastructure/tradingview";
import { barsFromChartExport } from "@/features/pine/orca-runtime";
import {
  computeHtfCandles,
  HTF_CANDLES_DEFAULTS,
  paintHtfCandlesOnChart,
  type DailyOpenMode,
  type HtfCandlesOptions,
  type HtfPreset,
} from "@/features/htf-candles/runtime";
import { HTF_CANDLES_STUDY_DEFAULTS, HTF_CANDLES_STUDY_NAME } from "./htf-candles-indicator";

const MAX_BARS = 12_000;
const STUDY_DEBOUNCE_MS = 280;
const LIVE_REFRESH_MS = 2_000;
const PRESENCE_POLL_MS = 4_000;

const HTF_SET = new Set<string>(["5", "15", "30", "60", "240", "1D", "1W", "1M"]);
const DAILY_SET = new Set<string>(["midnight", "830", "930", "exchange"]);

function fingerprintCmds(
  cmds: readonly { kind: string; t1: number; p1: number; color?: string; fill?: string; text?: string }[],
): string {
  if (cmds.length === 0) return "empty";
  const head = cmds.slice(0, 8);
  const tail = cmds.length > 8 ? cmds.slice(-8) : [];
  const part = (c: (typeof cmds)[number]) =>
    `${c.kind}:${c.t1}:${c.p1}:${c.color ?? ""}:${c.fill ?? ""}:${c.text ?? ""}`;
  return `${cmds.length}|${[...head, ...tail].map(part).join(";")}`;
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

function parseHex(v: unknown, fallback: string): string {
  if (typeof v !== "string") return fallback;
  const t = v.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(t)) return t;
  if (/^[0-9a-fA-F]{6}$/.test(t)) return `#${t}`;
  return fallback;
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
        const htfRaw = str("htf", HTF_CANDLES_STUDY_DEFAULTS.htf);
        const htf = (HTF_SET.has(htfRaw) ? htfRaw : HTF_CANDLES_DEFAULTS.htf) as HtfPreset;
        const dailyRaw = str("dailyOpenMode", HTF_CANDLES_STUDY_DEFAULTS.dailyOpenMode);
        const dailyOpenMode = (
          DAILY_SET.has(dailyRaw) ? dailyRaw : HTF_CANDLES_DEFAULTS.dailyOpenMode
        ) as DailyOpenMode;
        return {
          htf,
          candleCount: Math.max(1, Math.min(20, Math.floor(num("candleCount", 5)))),
          paddingBars: Math.max(1, Math.min(80, Math.floor(num("paddingBars", 8)))),
          spacingBars: Math.max(0, Math.min(20, Math.floor(num("spacingBars", 2)))),
          widthBars: Math.max(1, Math.min(20, Math.floor(num("widthBars", 3)))),
          bullBody: parseHex(map.get("bullBody"), HTF_CANDLES_DEFAULTS.bullBody),
          bearBody: parseHex(map.get("bearBody"), HTF_CANDLES_DEFAULTS.bearBody),
          border: parseHex(map.get("border"), HTF_CANDLES_DEFAULTS.border),
          bullWick: parseHex(map.get("bullWick"), HTF_CANDLES_DEFAULTS.bullWick),
          bearWick: parseHex(map.get("bearWick"), HTF_CANDLES_DEFAULTS.bearWick),
          showFvg: bool("showFvg", true),
          showVi: bool("showVi", true),
          showTrace: bool("showTrace", true),
          showLabels: bool("showLabels", false),
          showTimer: bool("showTimer", true),
          showHtfName: bool("showHtfName", true),
          dailyOpenMode,
          timezoneOffset: Math.max(-12, Math.min(14, Math.floor(num("timezoneOffset", -4)))),
          bodyTransparency: Math.max(0, Math.min(100, Math.floor(num("bodyTransparency", 30)))),
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
      const opts = readOptions(studyId) ?? { ...HTF_CANDLES_DEFAULTS };
      const optsKey = JSON.stringify({ symbol, interval, opts, studies: studyIds });
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
        let bars = barsFromChartExport(exported).map((b) => ({
          time: b.time,
          open: b.open,
          high: b.high,
          low: b.low,
          close: b.close,
          volume: b.volume ?? 0,
        }));
        if (bars.length > MAX_BARS) bars = bars.slice(bars.length - MAX_BARS);
        if (bars.length < 5) {
          if (entityIdsRef.current.length === 0) lastKeyRef.current = "";
          return;
        }
        const tip = bars[bars.length - 1]!;
        const key = `${optsKey}|${tip.time}:${tip.close}:${tip.high}:${tip.low}`;
        const chartIntervalSec = intervalToSeconds(interval);
        const { cmds } = computeHtfCandles(bars, chartIntervalSec, opts);
        const fp = fingerprintCmds(cmds);
        if (!force && fp === lastFpRef.current && lastKeyRef.current === key) return;
        if (cancelled || myGen !== genRef.current) return;
        const ids =
          cmds.length === 0
            ? ([] as EntityId[])
            : await paintHtfCandlesOnChart(api, cmds, { ownerStudyId: studyId });
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
      if (lastKeyRef.current === "") void repaint(false);
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
