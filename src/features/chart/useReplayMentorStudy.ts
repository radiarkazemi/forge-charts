/**
 * Watches Indicators “Forge Replay Mentor” and paints beginner ICT overlays
 * only while Bar Replay is active — drawings advance with the replay cursor.
 */

import { useEffect, useRef } from "react";
import { useServices } from "@/app/use-services";
import { useStore } from "@/shared/hooks/useStore";
import type { EntityId } from "@/infrastructure/tradingview";
import { barsFromChartExport } from "@/features/pine/orca-runtime";
import {
  computeReplayMentor,
  paintReplayMentor,
  type MentorInputs,
  MENTOR_DEFAULTS,
} from "@/features/replay-mentor/runtime";
import { REPLAY_MENTOR_DEFAULTS } from "./replay-mentor-indicator";

const MAX_BARS = 4_000;
const STUDY_DEBOUNCE_MS = 280;
const PLAY_DEBOUNCE_MS = 160;
const PRESENCE_POLL_MS = 5_000;

function fingerprint(cmds: readonly { kind: string; t1: number; p1: number }[]): string {
  if (cmds.length === 0) return "empty";
  const head = cmds.slice(0, 4);
  const tail = cmds.length > 4 ? cmds.slice(-4) : [];
  return `${cmds.length}|${[...head, ...tail].map((c) => `${c.kind}:${c.t1}:${c.p1}`).join(";")}`;
}

export function useReplayMentorStudy(enabled = true): void {
  const { chart, barReplay } = useServices();
  const ready = useStore(chart.state, (s) => s.ready);
  const symbol = useStore(chart.state, (s) => s.symbol);
  const interval = useStore(chart.state, (s) => s.interval);
  const replayActive = useStore(barReplay.state, (s) => s.active);
  const replayPhase = useStore(barReplay.state, (s) => s.phase);
  const cursorIndex = useStore(barReplay.state, (s) => s.cursorIndex);
  const formProgress = useStore(barReplay.state, (s) => Math.floor(s.formProgress * 8));

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

    const replayLive =
      replayActive && (replayPhase === "ready" || replayPhase === "playing");

    const repaint = async (force = false) => {
      if (cancelled) return;
      if (busyRef.current) {
        pendingRef.current = true;
        return;
      }
      const studyIds = findStudyIds();
      if (studyIds.length === 0 || !replayLive) {
        genRef.current += 1;
        clearDrawings();
        lastKeyRef.current = "";
        lastFpRef.current = "";
        return;
      }
      const studyId = studyIds[0]!;
      const opts = readOptions(studyId);
      const key = JSON.stringify({
        symbol,
        interval,
        opts,
        cursorIndex,
        formProgress,
        studies: studyIds,
      });
      if (!force && key === lastKeyRef.current && entityIdsRef.current.length > 0) return;

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
        let bars = barsFromChartExport(exported);
        if (bars.length > MAX_BARS) bars = bars.slice(bars.length - MAX_BARS);
        if (bars.length < 30) {
          if (entityIdsRef.current.length === 0) lastKeyRef.current = "";
          return;
        }
        const cmds = computeReplayMentor(bars, opts);
        const fp = fingerprint(cmds);
        if (!force && fp === lastFpRef.current && lastKeyRef.current === key) return;
        if (cancelled || myGen !== genRef.current) return;
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
        console.warn("[forge-replay-mentor] paint failed", err);
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

    const scheduleRepaint = (ms = STUDY_DEBOUNCE_MS) => {
      window.clearTimeout(studyTimer);
      studyTimer = window.setTimeout(() => {
        void repaint(true);
      }, ms);
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
    const kickoffTimer = window.setTimeout(kickoff, 1_200);
    const poll = window.setInterval(() => {
      if (cancelled || busyRef.current) return;
      const ids = findStudyIds();
      if (ids.length === 0 || !replayLive) {
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

    // Replay cursor / phase changes → refresh overlays as candles form.
    scheduleRepaint(replayPhase === "playing" ? PLAY_DEBOUNCE_MS : STUDY_DEBOUNCE_MS);

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
  }, [
    chart,
    enabled,
    ready,
    symbol,
    interval,
    replayActive,
    replayPhase,
    cursorIndex,
    formProgress,
  ]);
}
