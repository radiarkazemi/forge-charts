/**
 * Watches Indicators “Forge Replay Mentor” and paints beginner ICT overlays
 * only while Bar Replay is active.
 *
 * Updates on closed candles only (cursor advance) — never on forming ticks —
 * so prior BOS/FVG/OB stay put and only new/invalidated structures change.
 */

import { useEffect, useRef } from "react";
import { useServices } from "@/app/use-services";
import { useStore } from "@/shared/hooks/useStore";
import type { EntityId } from "@/infrastructure/tradingview";

import { computeReplayMentor, paintReplayMentor, type MentorInputs, MENTOR_DEFAULTS } from "@/features/replay-mentor/runtime";
import { REPLAY_MENTOR_DEFAULTS } from "./replay-mentor-indicator";
import { studyIsVisible, markChartPaintBusy } from "./study-paint-gate";

import { exportChartBarsCached, STUDY_DEBOUNCE_MS, STUDY_MAX_BARS, STUDY_PRESENCE_POLL_MS, STUDY_PAINT_MUTE_MS } from "./chart-export-cache";

const MAX_BARS = STUDY_MAX_BARS;
// STUDY_DEBOUNCE_MS from chart-export-cache
const PRESENCE_POLL_MS = STUDY_PRESENCE_POLL_MS;

function fingerprint(
  cmds: readonly { kind: string; t1: number; p1: number; t2?: number; p2?: number; text?: string }[],
): string {
  if (cmds.length === 0) return "empty";
  return cmds
    .map(
      (c) =>
        `${c.kind}:${c.t1}:${c.p1}:${c.t2 ?? ""}:${c.p2 ?? ""}:${c.text ?? ""}`,
    )
    .join("|");
}

export function useReplayMentorStudy(enabled = true): void {
  const { chart, barReplay } = useServices();
  const ready = useStore(chart.state, (s) => s.ready);
  const symbol = useStore(chart.state, (s) => s.symbol);
  const interval = useStore(chart.state, (s) => s.interval);
  // Only coarse replay presence in React deps — cursor ticks use store.subscribe
  // so we do NOT tear down / clear drawings on every forming candle update.
  const replayActive = useStore(barReplay.state, (s) => s.active);

  const entityIdsRef = useRef<EntityId[]>([]);
  const busyRef = useRef(false);
  const lastFpRef = useRef("");
  const lastClosedCursorRef = useRef(-1);
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
      lastFpRef.current = "";
    };

    const findStudyIds = (): EntityId[] => {
      try {
        const studies = widget.activeChart()?.getAllStudies() ?? [];
        return studies
          .filter((s: { name?: string; id?: string | EntityId }) => {
            const name = `${s.name ?? ""} ${s.id ?? ""}`;
            return (
              /forge\s*replay\s*mentor/i.test(name) ||
              /ForgeReplayMentor@/i.test(name) ||
              /Replay Mentor/i.test(name)
            );
          })
          .map((s: { id?: string | EntityId }) => s.id as EntityId);
      } catch {
        return [];
      }
    };

    const readOptions = (studyId: EntityId): Partial<MentorInputs> => {
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
          return typeof v === "boolean" ? v : fallback;
        };
        return {
          swingLeft: Math.max(1, Math.floor(num("swingLeft", REPLAY_MENTOR_DEFAULTS.swingLeft))),
          swingRight: Math.max(1, Math.floor(num("swingRight", REPLAY_MENTOR_DEFAULTS.swingRight))),
          maxItems: Math.max(2, Math.floor(num("maxItems", REPLAY_MENTOR_DEFAULTS.maxItems))),
          showStructure: bool("showStructure", REPLAY_MENTOR_DEFAULTS.showStructure),
          showFvg: bool("showFvg", REPLAY_MENTOR_DEFAULTS.showFvg),
          showOrderBlocks: bool("showOrderBlocks", REPLAY_MENTOR_DEFAULTS.showOrderBlocks),
          showLiquidity: bool("showLiquidity", REPLAY_MENTOR_DEFAULTS.showLiquidity),
          showBpr: bool("showBpr", REPLAY_MENTOR_DEFAULTS.showBpr),
          showIof: bool("showIof", REPLAY_MENTOR_DEFAULTS.showIof),
          showIfvg: bool("showIfvg", REPLAY_MENTOR_DEFAULTS.showIfvg),
          bullColor: MENTOR_DEFAULTS.bullColor,
          bearColor: MENTOR_DEFAULTS.bearColor,
          fvgBull: MENTOR_DEFAULTS.fvgBull,
          fvgBear: MENTOR_DEFAULTS.fvgBear,
          obBull: MENTOR_DEFAULTS.obBull,
          obBear: MENTOR_DEFAULTS.obBear,
          liqColor: MENTOR_DEFAULTS.liqColor,
          bprColor: MENTOR_DEFAULTS.bprColor,
          iofColor: MENTOR_DEFAULTS.iofColor,
          ifvgColor: MENTOR_DEFAULTS.ifvgColor,
        };
      } catch {
        return {};
      }
    };

    const repaint = async (reason: "close" | "study" | "kickoff") => {
      if (cancelled) return;
      if (busyRef.current) {
        pendingRef.current = true;
        return;
      }

      const replay = barReplay.state.get();
      const replayLive =
        replay.active && (replay.phase === "ready" || replay.phase === "playing");
      const studyIds = findStudyIds();

      if (studyIds.length === 0 || !replayLive) {
        genRef.current += 1;
        clearDrawings();
        lastClosedCursorRef.current = -1;
        return;
      }

      // Forming ticks must not recompute — wait for the next closed candle.
      if (reason === "close" && replay.formProgress > 0 && replay.phase === "playing") {
        // Still mid-candle; ignore (cursor may have moved at form start — wait commit).
        if (replay.cursorIndex === lastClosedCursorRef.current) return;
      }

      const studyId = studyIds[0]!;
      const studyApi = widget.activeChart()?.getStudyById(studyId);
      if (!studyIsVisible(studyApi)) {
        genRef.current += 1;
        clearDrawings();
        lastFpRef.current = `hidden:${symbol}:${interval}`;
        lastClosedCursorRef.current = -1;
        return;
      }
      const opts = readOptions(studyId);
      const myGen = ++genRef.current;
      busyRef.current = true;
      try {
        const api = widget.activeChart();
        if (!api) return;
        let bars = await exportChartBarsCached(api, MAX_BARS);
        if (cancelled || myGen !== genRef.current) return;
        // Drop the live forming candle so ICT only reacts to closes.
        const live = barReplay.state.get();
        if (live.phase === "playing" && live.formProgress > 0 && bars.length > 0) {
          bars = bars.slice(0, -1);
        }
        if (bars.length < 30) return;

        const cmds = computeReplayMentor(bars, opts);
        const fp = fingerprint(cmds);
        // Nothing new / removed — keep existing drawings (no flicker).
        if (fp === lastFpRef.current && entityIdsRef.current.length > 0) {
          lastClosedCursorRef.current = live.cursorIndex;
          return;
        }
        if (cancelled || myGen !== genRef.current) return;

        markChartPaintBusy(STUDY_PAINT_MUTE_MS);
        const ids =
          cmds.length === 0
            ? ([] as EntityId[])
            : await paintReplayMentor(api, cmds, { ownerStudyId: studyId });
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
        lastFpRef.current = fp;
        lastClosedCursorRef.current = barReplay.state.get().cursorIndex;
        for (const id of prev) {
          try {
            chart.removeEntity(id);
          } catch {
            /* ignore */
          }
        }
      } catch (err) {
        console.warn("[forge-replay-mentor] paint failed", err);
      } finally {
        busyRef.current = false;
        if (!cancelled && pendingRef.current) {
          pendingRef.current = false;
          window.setTimeout(() => {
            void repaint("close");
          }, 0);
        }
      }
    };

    const scheduleRepaint = (reason: "close" | "study" | "kickoff", ms = STUDY_DEBOUNCE_MS) => {
      window.clearTimeout(studyTimer);
      studyTimer = window.setTimeout(() => {
        void repaint(reason);
      }, ms);
    };

    const onStudyEvent = (...args: unknown[]) => {
      const eventType = String(args[1] ?? args[0] ?? "");
      if (/remove/i.test(eventType)) {
        window.clearTimeout(studyTimer);
        if (findStudyIds().length === 0) {
          genRef.current += 1;
          clearDrawings();
          lastClosedCursorRef.current = -1;
          return;
        }
      }
      if (/^(create|remove|price_scale|properties|visibility|toggle|hide|show)/i.test(eventType)) {
        scheduleRepaint("study");
      }
    };

    const onStudyProperties = (...args: unknown[]) => {
      const id = String(args[0] ?? "");
      if (!id) return;
      if (findStudyIds().some((s) => String(s) === id)) scheduleRepaint("study");
    };

    // Closed-candle updates only: cursorIndex advances when a bar commits.
    let prevCursor = barReplay.state.get().cursorIndex;
    let prevActive = barReplay.state.get().active;
    let prevPhase = barReplay.state.get().phase;
    const unsubReplay = barReplay.state.subscribe(() => {
      if (cancelled) return;
      const s = barReplay.state.get();
      if (!s.active) {
        if (prevActive) {
          clearDrawings();
          lastClosedCursorRef.current = -1;
        }
        prevActive = s.active;
        prevPhase = s.phase;
        prevCursor = s.cursorIndex;
        return;
      }
      const activated = !prevActive && s.active;
      const cursorMoved = s.cursorIndex !== prevCursor;
      const becameReady =
        (prevPhase === "selecting" || prevPhase === "idle") &&
        (s.phase === "ready" || s.phase === "playing");
      prevActive = s.active;
      prevPhase = s.phase;
      prevCursor = s.cursorIndex;

      // Ignore formProgress-only ticks — no scheduleRepaint here.
      if (activated || becameReady) {
        scheduleRepaint("kickoff", 200);
        return;
      }
      if (cursorMoved && (s.phase === "ready" || s.phase === "playing")) {
        // Bar closed / stepped — recompute once.
        scheduleRepaint("close", 80);
      }
    });

    const kickoff = () => {
      void repaint("kickoff");
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
      const live = barReplay.state.get().active;
      if (ids.length === 0 || !live) {
        if (entityIdsRef.current.length > 0) clearDrawings();
        return;
      }
      try {
        const api = widget.activeChart()?.getStudyById(ids[0]!);
        if (!studyIsVisible(api)) {
          if (entityIdsRef.current.length > 0 || !String(lastFpRef.current).startsWith("hidden:")) {
            clearDrawings();
            lastFpRef.current = "hidden:presence";
            lastClosedCursorRef.current = -1;
          }
          return;
        }
      } catch {
        /* ignore */
      }
      if (
        (entityIdsRef.current.length === 0 && lastFpRef.current === "") ||
        String(lastFpRef.current).startsWith("hidden:")
      ) {
        void repaint("kickoff");
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
      unsubReplay();
      try {
        widget.unsubscribe("study_event", onStudyEvent as never);
        widget.unsubscribe("study_properties_changed", onStudyProperties as never);
      } catch {
        /* ignore */
      }
      clearDrawings();
      lastClosedCursorRef.current = -1;
    };
  }, [chart, barReplay, enabled, ready, symbol, interval, replayActive]);
}
