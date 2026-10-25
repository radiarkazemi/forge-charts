/**
 * Watches Indicators “Forge Sessions” and paints LuxAlgo-style session zones.
 */

import { useEffect, useRef } from "react";
import { useServices } from "@/app/use-services";
import { useStore } from "@/shared/hooks/useStore";
import type { EntityId } from "@/infrastructure/tradingview";
import { barsFromChartExport } from "@/features/pine/orca-runtime";
import {
  computeSessions,
  mergeSessionDefs,
  paintSessionsOnChart,
  publishSessionsDashboard,
  type SessionsOptions,
} from "@/features/sessions/runtime";
import {
  readSessionSlotsFromMap,
  stylePlotIdForIndex,
  SESSIONS_STUDY_DEFAULTS,
  SESSIONS_MAX_COUNT,
} from "./sessions-indicator";
import { SESSION_COLOR_PALETTE, SESSIONS_DEFAULTS } from "@/features/sessions/runtime";

const MAX_BARS = 8_000;
const STUDY_DEBOUNCE_MS = 450;
const PRESENCE_POLL_MS = 6_000;

function fingerprintCmds(cmds: readonly { kind: string; t1: number; p1: number }[]): string {
  if (cmds.length === 0) return "empty";
  const head = cmds.slice(0, 6);
  const tail = cmds.length > 6 ? cmds.slice(-6) : [];
  return `${cmds.length}|${[...head, ...tail].map((c) => `${c.kind}:${c.t1}:${c.p1}`).join(";")}`;
}

function defaultOpts(): SessionsOptions {
  const map = new Map<string, unknown>([["sessionCount", 4]]);
  return {
    sessions: mergeSessionDefs(readSessionSlotsFromMap(map), 4, ""),
    historyLimit: 0,
    timezoneOffset: SESSIONS_STUDY_DEFAULTS.timezoneOffset,
    useExchangeTimezone: SESSIONS_STUDY_DEFAULTS.useExchangeTimezone,
    exchangeTimezone: SESSIONS_STUDY_DEFAULTS.exchangeTimezone,
    rangeTransparency: SESSIONS_DEFAULTS.rangeTransparency,
    showRangeOutline: SESSIONS_STUDY_DEFAULTS.showRangeOutline,
    showRangeLabel: SESSIONS_STUDY_DEFAULTS.showRangeLabel,
    dashboard: SESSIONS_STUDY_DEFAULTS.dashboard,
    advancedDashboard: SESSIONS_STUDY_DEFAULTS.advancedDashboard,
    dashboardPosition: SESSIONS_STUDY_DEFAULTS.dashboardPosition as 0 | 1 | 2,
    dashboardSize: SESSIONS_STUDY_DEFAULTS.dashboardSize as 0 | 1 | 2 | 3 | 4,
    showSessionDivider: SESSIONS_STUDY_DEFAULTS.showSessionDivider,
    showDayDivider: SESSIONS_STUDY_DEFAULTS.showDayDivider,
  };
}

export function useSessionsStudy(enabled = true): void {
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
      publishSessionsDashboard(null);
    };

    const findStudyIds = (): EntityId[] => {
      try {
        const studies = widget.activeChart()?.getAllStudies() ?? [];
        return studies
          .filter((s: { name?: string; id?: string | EntityId }) => {
            const name = `${s.name ?? ""} ${s.id ?? ""}`;
            return (
              /forge\s*sessions/i.test(name) ||
              /ForgeSessions@/i.test(name) ||
              /sessions\s*\[luxalgo\]/i.test(name) ||
              /luxalgo\s*-\s*sessions/i.test(name)
            );
          })
          .map((s: { id?: string | EntityId }) => s.id as EntityId);
      } catch {
        return [];
      }
    };

    const readOptions = (studyId: EntityId): SessionsOptions | null => {
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
          return typeof v === "string" ? v : fallback;
        };
        const bool = (id: string, fallback: boolean) => {
          const v = map.get(id);
          return typeof v === "boolean" ? v : fallback;
        };

        const sessionCount = Math.max(
          1,
          Math.min(
            SESSIONS_MAX_COUNT,
            Math.floor(num("sessionCount", 4)),
          ),
        );
        map.set("sessionCount", sessionCount);
        const slots = readSessionSlotsFromMap(map);
        const extra = str("extraSessions", str("sessionsText", ""));
        const pos = Math.max(0, Math.min(2, Math.floor(num("dashboardPosition", 0)))) as 0 | 1 | 2;
        const size = Math.max(0, Math.min(4, Math.floor(num("dashboardSize", 1)))) as
          | 0
          | 1
          | 2
          | 3
          | 4;

        // Style tab palette colors + opacity (transparency) per session.
        let styleMap: Record<string, { color?: string; transparency?: number }> = {};
        try {
          const styleValues = api.getStyleValues?.() as
            | { styles?: Record<string, { color?: string; transparency?: number } | undefined> }
            | undefined;
          styleMap = styleValues?.styles ?? {};
        } catch {
          styleMap = {};
        }

        const coloredSlots = slots.map((slot, i) => {
          const plotId = stylePlotIdForIndex(i);
          const st = styleMap[plotId];
          const color =
            typeof st?.color === "string" && st.color.trim()
              ? st.color
              : (SESSION_COLOR_PALETTE[i % SESSION_COLOR_PALETTE.length] ?? slot.color);
          const transparency =
            typeof st?.transparency === "number" && Number.isFinite(st.transparency)
              ? st.transparency
              : SESSIONS_DEFAULTS.rangeTransparency;
          return { ...slot, color, transparency };
        });

        const sessions = mergeSessionDefs(coloredSlots, sessionCount, extra);
        console.info(
          `[forge-sessions] study=${String(studyId)} zones=${sessions.length}`,
          sessions.map((s) => `${s.name}:${s.hours}:${s.color}:t${s.transparency ?? "?"}`).join(", "),
        );

        return {
          sessions,
          historyLimit: 0,
          timezoneOffset: Math.max(
            -12,
            Math.min(14, Math.floor(num("timezoneOffset", SESSIONS_STUDY_DEFAULTS.timezoneOffset))),
          ),
          useExchangeTimezone: bool(
            "useExchangeTimezone",
            SESSIONS_STUDY_DEFAULTS.useExchangeTimezone,
          ),
          exchangeTimezone: str("exchangeTimezone", SESSIONS_STUDY_DEFAULTS.exchangeTimezone),
          rangeTransparency: SESSIONS_DEFAULTS.rangeTransparency,
          showRangeOutline: bool("showRangeOutline", SESSIONS_STUDY_DEFAULTS.showRangeOutline),
          showRangeLabel: bool("showRangeLabel", SESSIONS_STUDY_DEFAULTS.showRangeLabel),
          dashboard: bool("dashboard", SESSIONS_STUDY_DEFAULTS.dashboard),
          advancedDashboard: bool(
            "advancedDashboard",
            SESSIONS_STUDY_DEFAULTS.advancedDashboard,
          ),
          dashboardPosition: pos,
          dashboardSize: size,
          showSessionDivider: bool(
            "showSessionDivider",
            SESSIONS_STUDY_DEFAULTS.showSessionDivider,
          ),
          showDayDivider: bool("showDayDivider", SESSIONS_STUDY_DEFAULTS.showDayDivider),
        };
      } catch (err) {
        console.warn("[forge-sessions] readOptions failed", err);
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
          console.warn("[forge-sessions] not enough bars", bars.length);
          if (entityIdsRef.current.length === 0) lastKeyRef.current = "";
          return;
        }

        const { cmds, dashboard } = computeSessions(bars, opts);
        const rects = cmds.filter((c) => c.kind === "rect").length;
        console.info(
          `[forge-sessions] bars=${bars.length} cmds=${cmds.length} rects=${rects}`,
          `t=${bars[0]?.time}..${bars[bars.length - 1]?.time}`,
        );

        const fp = fingerprintCmds(cmds);
        if (!force && fp === lastFpRef.current && lastKeyRef.current === key) {
          publishSessionsDashboard(dashboard);
          return;
        }
        if (cancelled || myGen !== genRef.current) return;

        const ids =
          cmds.length === 0
            ? ([] as EntityId[])
            : await paintSessionsOnChart(api, cmds, { ownerStudyId: studyId });
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
        publishSessionsDashboard(dashboard);
        console.info(`[forge-sessions] painted ${ids.length} shapes`);
        for (const id of prev) {
          try {
            chart.removeEntity(id);
          } catch {
            /* ignore */
          }
        }
      } catch (err) {
        console.warn("[forge-sessions] paint failed", err);
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
      if (/^(create|remove|price_scale|properties)/i.test(eventType)) {
        scheduleRepaint();
      }
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
      if (lastKeyRef.current === "") void repaint(false);
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
  }, [chart, enabled, ready, symbol, interval]);
}
