/**
 * Watches Indicators “Forge Structure Intelligence” and paints chart-TF
 * zones / confirmations from the TypeScript port of the official Pine v1.
 */

import { useEffect, useRef } from "react";
import { useServices } from "@/app/use-services";
import { useStore } from "@/shared/hooks/useStore";
import type { EntityId } from "@/infrastructure/tradingview";
import { barsFromChartExport } from "@/features/pine/orca-runtime";
import {
  computeStructureIntelligence,
  paintStructureIntelligence,
  structureIntelligenceDrawCmds,
  type SiInputs,
  SI_DEFAULTS,
} from "@/features/structure-intelligence/runtime";
import { SI_STUDY_DEFAULTS } from "./structure-intelligence-indicator";

const MAX_BARS = 5_000;
const STUDY_DEBOUNCE_MS = 450;
const PRESENCE_POLL_MS = 6_000;

function fingerprint(cmds: readonly { kind: string; t1: number; p1: number }[]): string {
  if (cmds.length === 0) return "empty";
  const head = cmds.slice(0, 4);
  const tail = cmds.length > 4 ? cmds.slice(-4) : [];
  return `${cmds.length}|${[...head, ...tail].map((c) => `${c.kind}:${c.t1}:${c.p1}`).join(";")}`;
}

function zoneModeFrom(n: number): SiInputs["zoneMode"] {
  if (n === 1) return "FVG only";
  if (n === 2) return "OB only";
  return "FVG then OB";
}

export function useStructureIntelligenceStudy(enabled = true): void {
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
              /forge\s*structure\s*intelligence/i.test(name) ||
              /ForgeStructureIntelligence@/i.test(name) ||
              /Forge SI/i.test(name)
            );
          })
          .map((s: { id?: string | EntityId }) => s.id as EntityId);
      } catch {
        return [];
      }
    };

    const readOptions = (studyId: EntityId): Partial<SiInputs> => {
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
          minorLen: Math.max(1, Math.floor(num("minorLen", SI_STUDY_DEFAULTS.minorLen))),
          majorLen: Math.max(3, Math.floor(num("majorLen", SI_STUDY_DEFAULTS.majorLen))),
          swingATR: Math.max(0, num("swingATR", SI_STUDY_DEFAULTS.swingATR)),
          breakOnWick: bool("breakOnWick", SI_STUDY_DEFAULTS.breakOnWick),
          requireSweep: bool("requireSweep", SI_STUDY_DEFAULTS.requireSweep),
          requireOuter: bool("requireOuter", SI_STUDY_DEFAULTS.requireOuter),
          zoneMode: zoneModeFrom(Math.floor(num("zoneMode", SI_STUDY_DEFAULTS.zoneMode))),
          triggerMode:
            Math.floor(num("triggerMode", SI_STUDY_DEFAULTS.triggerMode)) === 1
              ? "Rejection candle"
              : "Micro break",
          minScore: Math.max(50, Math.floor(num("minScore", SI_STUDY_DEFAULTS.minScore))),
          candidateLimit: Math.max(
            4,
            Math.floor(num("candidateLimit", SI_STUDY_DEFAULTS.candidateLimit)),
          ),
          targetR: Math.max(1, num("targetR", SI_STUDY_DEFAULTS.targetR)),
          showPaths: bool("showPaths", SI_STUDY_DEFAULTS.showPaths),
          showActive: bool("showActive", SI_STUDY_DEFAULTS.showActive),
          showHistory: bool("showHistory", SI_STUDY_DEFAULTS.showHistory),
          historyLimit: Math.min(
            24,
            Math.max(1, Math.floor(num("historyLimit", SI_STUDY_DEFAULTS.historyLimit))),
          ),
          bullColor: SI_DEFAULTS.bullColor,
          bearColor: SI_DEFAULTS.bearColor,
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
      const opts = readOptions(studyId);
      const key = JSON.stringify({ symbol, interval, opts, studies: studyIds });
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
        if (bars.length < 40) {
          if (entityIdsRef.current.length === 0) lastKeyRef.current = "";
          return;
        }
        const result = computeStructureIntelligence(bars, opts);
        const cmds = structureIntelligenceDrawCmds(result, opts, bars[bars.length - 1]!.time);
        const fp = fingerprint(cmds);
        if (!force && fp === lastFpRef.current && lastKeyRef.current === key) return;
        if (cancelled || myGen !== genRef.current) return;
        const ids =
          cmds.length === 0
            ? ([] as EntityId[])
            : await paintStructureIntelligence(api, cmds, { ownerStudyId: studyId });
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
        console.info(
          `[forge-si] painted ${ids.length} shapes from ${bars.length} bars (cmds=${cmds.length}, hist=${result.history.length}, stage=${result.last?.stage ?? 0})`,
        );
      } catch (err) {
        console.warn("[forge-si] paint failed", err);
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
