/**
 * Watches Indicators “Forge Sessions” and paints LuxAlgo-style session zones.
 */

import { useEffect, useRef } from "react";
import { useServices } from "@/app/use-services";
import type { EntityId } from "@/infrastructure/tradingview";
import { clColor, computeSessions, mergeSessionDefs, paintSessionsOnChart, publishSessionsDashboard, SESSION_COLOR_PALETTE, SESSIONS_DEFAULTS, type SessionsOptions } from "@/features/sessions/runtime";
import type { DrawCmd } from "@/features/pine/orca-runtime";
import { readSessionSlotsFromMap, stylePlotIdForIndex, SESSIONS_STUDY_DEFAULTS, SESSIONS_MAX_COUNT } from "./sessions-indicator";
import { chartAllowedByMaxMinutes, liveChartResolution, studyIsVisible, markChartPaintBusy } from "./study-paint-gate";
import { readStylePlot } from "./study-style-plots";
import type { ChartController } from "./chart-controller";
import { useBoundChartState } from "./study-controller-bind";

import { exportChartBarsCached, STUDY_DEBOUNCE_MS, STUDY_LIVE_REFRESH_MS, STUDY_MAX_BARS, STUDY_PRESENCE_POLL_MS, STUDY_PAINT_MUTE_MS } from "./chart-export-cache";

const MAX_BARS = STUDY_MAX_BARS;
// STUDY_DEBOUNCE_MS from chart-export-cache
/** Presence / cleanup when study removed. */
const PRESENCE_POLL_MS = STUDY_PRESENCE_POLL_MS;
/** Soft refresh so forming session boxes track live bars — keep light for chart FPS. */
const LIVE_REFRESH_MS = STUDY_LIVE_REFRESH_MS;
/** Style-tab color changes sometimes skip study_properties_changed — poll lightly. */
const STYLE_POLL_MS = 1_200;

/** Full geometry hash. A partial head/tail check missed live-box edits and redrew everything. */
function hashCmds(cmds: readonly DrawCmd[]): string {
  let h = 2166136261;
  const mix = (s: string) => {
    for (let i = 0; i < s.length; i += 1) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    h ^= 0x1f;
  };
  mix(String(cmds.length));
  for (const c of cmds) {
    mix(c.kind);
    mix(String(c.t1));
    mix(String(c.p1));
    mix(String(c.t2 ?? ""));
    mix(String(c.p2 ?? ""));
    mix(c.color);
    mix(c.fill ?? "");
    mix(c.text ?? "");
    mix(c.style ?? "");
    mix(String(c.width ?? ""));
  }
  return cmds.length === 0 ? "empty" : (h >>> 0).toString(36);
}

function samePaintStyle(a: DrawCmd, b: DrawCmd): boolean {
  return (
    a.kind === b.kind &&
    a.color === b.color &&
    (a.fill ?? "") === (b.fill ?? "") &&
    (a.text ?? "") === (b.text ?? "") &&
    (a.style ?? "") === (b.style ?? "") &&
    (a.width ?? 0) === (b.width ?? 0)
  );
}

function pointsOf(cmd: DrawCmd): { time: number; price: number }[] {
  if ((cmd.kind === "line" || cmd.kind === "rect") && cmd.t2 != null && cmd.p2 != null) {
    return [
      { time: cmd.t1, price: cmd.p1 },
      { time: cmd.t2, price: cmd.p2 },
    ];
  }
  return [{ time: cmd.t1, price: cmd.p1 }];
}

/** Pull Style-tab plot color + transparency for session slots (boxes + labels). */
function readStyleColors(
  api: { getStyleValues?: () => unknown },
  count: number,
): { color: string; transparency: number }[] {
  const out: { color: string; transparency: number }[] = [];
  for (let i = 0; i < count; i += 1) {
    const plotId = stylePlotIdForIndex(i);
    const fallbackHex = SESSION_COLOR_PALETTE[i % SESSION_COLOR_PALETTE.length] ?? "#ff5d00";
    const st = readStylePlot(api, plotId, {
      color: fallbackHex,
      visible: true,
      transparency: SESSIONS_DEFAULTS.rangeTransparency,
      linewidth: 1,
      linestyle: 0,
    });
    out.push({
      color: clColor(st.color, fallbackHex) || fallbackHex,
      transparency: Math.max(0, Math.min(100, st.transparency)),
    });
  }
  return out;
}

function styleFingerprint(api: { getStyleValues?: () => unknown } | null | undefined): string {
  if (!api) return "";
  return readStyleColors(api, SESSIONS_MAX_COUNT)
    .map((c) => `${c.color}:${c.transparency}`)
    .join("|");
}

function defaultOpts(): SessionsOptions {
  const map = new Map<string, unknown>([["sessionCount", 8]]);
  return {
    sessions: mergeSessionDefs(readSessionSlotsFromMap(map), 8, ""),
    historyLimit: 0,
    maxMinutes: SESSIONS_STUDY_DEFAULTS.maxMinutes,
    timezoneOffset: SESSIONS_STUDY_DEFAULTS.timezoneOffset,
    useExchangeTimezone: SESSIONS_STUDY_DEFAULTS.useExchangeTimezone,
    exchangeTimezone: SESSIONS_STUDY_DEFAULTS.exchangeTimezone,
    rangeTransparency: SESSIONS_DEFAULTS.rangeTransparency,
    showRangeOutline: SESSIONS_STUDY_DEFAULTS.showRangeOutline,
    showRangeLabel: SESSIONS_STUDY_DEFAULTS.showRangeLabel,
    showMidnightLine: SESSIONS_STUDY_DEFAULTS.showMidnightLine,
    dashboard: false,
    advancedDashboard: false,
    dashboardPosition: 0,
    dashboardSize: 1,
    showSessionDivider: false,
    showDayDivider: false,
  };
}

export function useSessionsStudy(chart: ChartController | null): void {
  const { chart: primaryChart } = useServices();
  const { ready, symbol, interval } = useBoundChartState(chart);
  const isPrimaryPane = chart != null && chart === primaryChart;
  const stableIdsRef = useRef<EntityId[]>([]);
  const liveIdsRef = useRef<EntityId[]>([]);
  const stableCmdsRef = useRef<DrawCmd[]>([]);
  const liveCmdsRef = useRef<DrawCmd[]>([]);
  const busyRef = useRef(false);
  const lastKeyRef = useRef("");
  const lastStableFpRef = useRef("");
  const lastLiveFpRef = useRef("");
  const lastStyleFpRef = useRef("");
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
    // Symbol/interval change must not reuse stale boxes from the previous series.
    genRef.current += 1;
    clearDrawingsSafe();
    lastKeyRef.current = "";
    lastStableFpRef.current = "";
    lastLiveFpRef.current = "";

    const mutePaintEvents = () => {
      muteUntilRef.current = Date.now() + STUDY_PAINT_MUTE_MS;
      markChartPaintBusy(STUDY_PAINT_MUTE_MS);
    };
    const isMuted = () => Date.now() < muteUntilRef.current;

    function clearDrawingsSafe(): void {
      const ids = [...stableIdsRef.current, ...liveIdsRef.current];
      stableIdsRef.current = [];
      liveIdsRef.current = [];
      stableCmdsRef.current = [];
      liveCmdsRef.current = [];
      for (const id of ids) {
        try {
          paneChart.removeEntity(id);
        } catch {
          /* ignore */
        }
      }
      if (isPrimaryPane) publishSessionsDashboard(null);
    }

    const clearDrawings = clearDrawingsSafe;

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
          if (typeof v === "boolean") return v;
          if (typeof v === "number") return v !== 0;
          if (typeof v === "string") {
            const s = v.trim().toLowerCase();
            if (s === "true" || s === "1") return true;
            if (s === "false" || s === "0") return false;
          }
          return fallback;
        };

        // Inputs “+ Add session” / “− Remove” checkboxes (CL has no real + button).
        let sessionCount = Math.max(
          1,
          Math.min(SESSIONS_MAX_COUNT, Math.floor(num("sessionCount", 8))),
        );
        if (bool("addSession", false) && sessionCount < SESSIONS_MAX_COUNT) {
          sessionCount += 1;
          const labels = "ABCDEFGHIJKL";
          const L = labels[sessionCount - 1]!;
          try {
            api.setInputValues([
              { id: "sessionCount" as never, value: sessionCount },
              { id: "addSession" as never, value: false },
              { id: `s${L}Enable` as never, value: true },
            ]);
          } catch {
            /* ignore */
          }
        } else if (bool("removeSession", false) && sessionCount > 1) {
          sessionCount -= 1;
          try {
            api.setInputValues([
              { id: "sessionCount" as never, value: sessionCount },
              { id: "removeSession" as never, value: false },
            ]);
          } catch {
            /* ignore */
          }
        } else if (bool("addSession", false) || bool("removeSession", false)) {
          try {
            api.setInputValues([
              { id: "addSession" as never, value: false },
              { id: "removeSession" as never, value: false },
            ]);
          } catch {
            /* ignore */
          }
        }

        map.set("sessionCount", sessionCount);
        const slots = readSessionSlotsFromMap(map);
        const extra = str("extraSessions", str("sessionsText", ""));

        const styleColors = readStyleColors(api, slots.length);
        const coloredSlots = slots.map((slot, i) => ({
          ...slot,
          color: styleColors[i]?.color ?? slot.color,
          transparency: styleColors[i]?.transparency ?? SESSIONS_DEFAULTS.rangeTransparency,
        }));

        const sessions = mergeSessionDefs(coloredSlots, sessionCount, extra);

        return {
          sessions,
          historyLimit: 0,
          maxMinutes: Math.max(
            0,
            Math.min(240, Math.floor(num("maxMinutes", SESSIONS_STUDY_DEFAULTS.maxMinutes))),
          ),
          timezoneOffset: (() => {
            // Migrate stale default UTC−4 → UTC−5 (NY standard) when still on old value.
            const raw = Math.floor(num("timezoneOffset", SESSIONS_STUDY_DEFAULTS.timezoneOffset));
            const offset = raw === -4 ? -5 : raw;
            return Math.max(-12, Math.min(14, offset));
          })(),
          useExchangeTimezone: bool(
            "useExchangeTimezone",
            SESSIONS_STUDY_DEFAULTS.useExchangeTimezone,
          ),
          exchangeTimezone: str("exchangeTimezone", SESSIONS_STUDY_DEFAULTS.exchangeTimezone) ||
            "America/New_York",
          rangeTransparency: SESSIONS_DEFAULTS.rangeTransparency,
          showRangeOutline: bool("showRangeOutline", SESSIONS_STUDY_DEFAULTS.showRangeOutline),
          showRangeLabel: bool("showRangeLabel", SESSIONS_STUDY_DEFAULTS.showRangeLabel),
          showMidnightLine: bool("showMidnightLine", SESSIONS_STUDY_DEFAULTS.showMidnightLine),
          dashboard: false,
          advancedDashboard: false,
          dashboardPosition: 0,
          dashboardSize: 1,
          showSessionDivider: false,
          showDayDivider: false,
        };
      } catch (err) {
        console.warn("[forge-sessions] readOptions failed", err);
        return null;
      }
    };

    const hasDrawings = () => stableIdsRef.current.length + liveIdsRef.current.length > 0;

    const dropIds = (ids: readonly EntityId[]) => {
      mutePaintEvents();
      for (const id of ids) {
        try {
          paneChart.removeEntity(id);
        } catch {
          /* ignore */
        }
      }
    };

    /** Move existing shapes when only the box edge changed. Returns false if they must be recreated. */
    const tryMoveShapes = (
      chartApi: NonNullable<ReturnType<typeof widget.activeChart>>,
      ids: readonly EntityId[],
      prev: readonly DrawCmd[],
      next: readonly DrawCmd[],
    ): boolean => {
      if (ids.length === 0 || ids.length !== next.length || prev.length !== next.length) return false;
      for (let i = 0; i < next.length; i += 1) {
        if (!samePaintStyle(prev[i]!, next[i]!)) return false;
      }
      try {
        for (let i = 0; i < next.length; i += 1) {
          chartApi.getShapeById(ids[i]!).setPoints(pointsOf(next[i]!));
        }
        return true;
      } catch {
        return false;
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
        lastStableFpRef.current = "";
        lastLiveFpRef.current = "";
        return;
      }

      const studyId = studyIds[0]!;
      const studyApi = widget.activeChart()?.getStudyById(studyId);
      const opts = readOptions(studyId) ?? defaultOpts();
      const maxMinutes = Math.max(
        0,
        Math.min(
          240,
          Math.floor(
            Number(
              (opts as { maxMinutes?: number }).maxMinutes ??
                SESSIONS_STUDY_DEFAULTS.maxMinutes,
            ) || SESSIONS_STUDY_DEFAULTS.maxMinutes,
          ),
        ),
      );
      // Always read LIVE resolution — React store can lag behind TF switches.
      const res = liveChartResolution(widget) || String(interval || "");
      const allowedTf = chartAllowedByMaxMinutes(res, maxMinutes);
      const visible = studyIsVisible(studyApi);
      // Honor Visibility eye + “≤ N minute” gate (drawings ignore CL Visibility alone).
      if (!visible || !allowedTf) {
        if (hasDrawings() || lastKeyRef.current) {
          genRef.current += 1;
          clearDrawings();
        }
        lastKeyRef.current = `hidden:${symbol}:${res}:max${maxMinutes}`;
        lastStableFpRef.current = "";
        lastLiveFpRef.current = "";
        return;
      }
      const optsKey = JSON.stringify({ symbol, res, maxMinutes, opts, studies: studyIds });

      busyRef.current = true;
      let myGen = genRef.current;
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
          if (!hasDrawings()) lastKeyRef.current = "";
          return;
        }

        const { stable, live, dashboard } = computeSessions(bars, opts);
        const stableFp = hashCmds(stable);
        const liveFp = hashCmds(live);
        const styleFp = styleFingerprint(studyApi);
        if (
          stableFp === lastStableFpRef.current &&
          liveFp === lastLiveFpRef.current &&
          optsKey === lastKeyRef.current
        ) {
          lastStyleFpRef.current = styleFp;
          if (isPrimaryPane) publishSessionsDashboard(dashboard);
          return;
        }
        if (cancelled || myGen !== genRef.current) return;

        // Closed boxes stay put. Only the forming session is moved, so the chart does not flash.
        const stableMoved =
          stableFp === lastStableFpRef.current ||
          tryMoveShapes(api, stableIdsRef.current, stableCmdsRef.current, stable);
        const liveMoved =
          liveFp === lastLiveFpRef.current ||
          tryMoveShapes(api, liveIdsRef.current, liveCmdsRef.current, live);

        if (stableMoved && liveMoved) {
          stableCmdsRef.current = stable;
          liveCmdsRef.current = live;
          lastStableFpRef.current = stableFp;
          lastLiveFpRef.current = liveFp;
          lastStyleFpRef.current = styleFp;
          lastKeyRef.current = optsKey;
          if (isPrimaryPane) publishSessionsDashboard(dashboard);
          return;
        }

        myGen = ++genRef.current;
        mutePaintEvents();
        const paintGroup = async (cmds: readonly DrawCmd[]): Promise<EntityId[]> =>
          cmds.length === 0 ? [] : paintSessionsOnChart(api, cmds, { ownerStudyId: studyId });

        const nextStable = stableMoved ? stableIdsRef.current : await paintGroup(stable);
        if (cancelled || myGen !== genRef.current) {
          if (!stableMoved) dropIds(nextStable);
          return;
        }
        const nextLive = liveMoved ? liveIdsRef.current : await paintGroup(live);
        if (cancelled || myGen !== genRef.current) {
          if (!stableMoved) dropIds(nextStable);
          if (!liveMoved) dropIds(nextLive);
          return;
        }

        const prevStable = stableMoved ? [] : stableIdsRef.current;
        const prevLive = liveMoved ? [] : liveIdsRef.current;
        if (!stableMoved) stableIdsRef.current = nextStable;
        if (!liveMoved) liveIdsRef.current = nextLive;
        stableCmdsRef.current = stable;
        liveCmdsRef.current = live;
        lastStableFpRef.current = stableFp;
        lastLiveFpRef.current = liveFp;
        lastStyleFpRef.current = styleFp;
        lastKeyRef.current = optsKey;
        if (isPrimaryPane) publishSessionsDashboard(dashboard);
        dropIds([...prevStable, ...prevLive]);
      } catch (err) {
        console.warn("[forge-sessions] paint failed", err);
        // Allow the next poll to retry instead of looking permanently stuck.
        lastKeyRef.current = "";
        lastStableFpRef.current = "";
        lastLiveFpRef.current = "";
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
          lastStableFpRef.current = "";
          lastLiveFpRef.current = "";
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
    const kickoffTimer = window.setTimeout(kickoff, 800);
    const kickoffTimer2 = window.setTimeout(kickoff, 2_400);

    const presencePoll = window.setInterval(() => {
      if (cancelled || busyRef.current || isMuted()) return;
      const ids = findStudyIds();
      if (ids.length === 0) {
        if (hasDrawings() || lastKeyRef.current) {
          genRef.current += 1;
          clearDrawings();
          lastKeyRef.current = "";
          lastStableFpRef.current = "";
          lastLiveFpRef.current = "";
        }
        return;
      }
      try {
        const api = widget.activeChart()?.getStudyById(ids[0]!);
        if (!studyIsVisible(api)) {
          if (hasDrawings() || (lastKeyRef.current && !String(lastKeyRef.current).startsWith("hidden:"))) {
            genRef.current += 1;
            clearDrawings();
            lastKeyRef.current = "hidden:presence";
            lastStableFpRef.current = "";
            lastLiveFpRef.current = "";
          }
          return;
        }
      } catch {
        /* ignore */
      }
      if (lastKeyRef.current === "" || String(lastKeyRef.current).startsWith("hidden:")) void repaint();
    }, PRESENCE_POLL_MS);

    // Forming boxes track new highs and lows. Unchanged closed boxes are left alone.
    const livePoll = window.setInterval(() => {
      if (cancelled || busyRef.current || isMuted()) return;
      if (findStudyIds().length === 0) return;
      void repaint();
    }, LIVE_REFRESH_MS);

    // Style-tab color/opacity often skips study_properties_changed on custom studies.
    // Compare the same 12-slot fingerprint the painter stores, or this poll redraws forever.
    const stylePoll = window.setInterval(() => {
      if (cancelled || busyRef.current || isMuted()) return;
      const ids = findStudyIds();
      if (ids.length === 0) return;
      try {
        const api = widget.activeChart()?.getStudyById(ids[0]!);
        if (!api) return;
        const fp = styleFingerprint(api);
        if (fp && fp !== lastStyleFpRef.current) scheduleRepaint();
      } catch {
        /* ignore */
      }
    }, STYLE_POLL_MS);

    // Resolution changes sometimes fire before React store updates — clear ASAP.
    const onIntervalChanged = (_res: string) => {
      // Synchronously clear if the new TF is above maxMinutes.
      try {
        const studyIdsNow = findStudyIds();
        if (studyIdsNow.length === 0) return;
        const optsNow = readOptions(studyIdsNow[0]!) ?? defaultOpts();
        const maxMin = Math.max(
          0,
          Math.floor(
            Number(
              (optsNow as { maxMinutes?: number }).maxMinutes ??
                SESSIONS_STUDY_DEFAULTS.maxMinutes,
            ) || SESSIONS_STUDY_DEFAULTS.maxMinutes,
          ),
        );
        const resNow = liveChartResolution(widget) || String(_res || "");
        if (!chartAllowedByMaxMinutes(resNow, maxMin)) {
          genRef.current += 1;
          clearDrawings();
          lastKeyRef.current = `hidden:${symbol}:${resNow}:max${maxMin}`;
          lastStableFpRef.current = "";
          lastLiveFpRef.current = "";
        }
      } catch {
        /* ignore */
      }
      scheduleRepaint();
    };
    try {
      widget.activeChart()?.onIntervalChanged()?.subscribe(null, onIntervalChanged);
    } catch {
      /* ignore */
    }

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
      window.clearInterval(presencePoll);
      window.clearInterval(livePoll);
      window.clearInterval(stylePoll);
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
      try {
        widget.activeChart()?.onIntervalChanged()?.unsubscribe(null, onIntervalChanged);
      } catch {
        /* ignore */
      }
      clearDrawings();
      lastKeyRef.current = "";
      lastStableFpRef.current = "";
      lastLiveFpRef.current = "";
    };
  }, [chart, ready, symbol, interval, isPrimaryPane]);
}
