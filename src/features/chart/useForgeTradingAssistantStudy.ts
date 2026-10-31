/**
 * Watches Indicators “Forge Trading Assistant” and paints Buy/Sell + TP/SL
 * from the Phase 1 confluence runtime (MSS/BOS · OB/FVG · rejection).
 */

import { useEffect, useRef } from "react";
import { useServices } from "@/app/use-services";
import { useStore } from "@/shared/hooks/useStore";
import type { EntityId } from "@/infrastructure/tradingview";
import { barsFromChartExport } from "@/features/pine/orca-runtime";
import {
  computeTradingAssistant,
  paintTradingAssistant,
  tradingAssistantDrawCmds,
  type FtaInputs,
  FTA_DEFAULTS,
} from "@/features/trading-assistant/runtime";
import { FTA_STUDY_DEFAULTS } from "./forge-trading-assistant-indicator";

const MAX_BARS = 4_000;
const STUDY_DEBOUNCE_MS = 450;
const PRESENCE_POLL_MS = 6_000;

function fingerprint(cmds: readonly { kind: string; t1: number; p1: number }[]): string {
  if (cmds.length === 0) return "empty";
  const head = cmds.slice(0, 4);
  const tail = cmds.length > 4 ? cmds.slice(-4) : [];
  return `${cmds.length}|${[...head, ...tail].map((c) => `${c.kind}:${c.t1}:${c.p1}`).join(";")}`;
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
          return typeof v === "boolean" ? v : fallback;
        };
        return {
          swingLeft: Math.max(1, Math.floor(num("swingLeft", FTA_STUDY_DEFAULTS.swingLeft))),
          swingRight: Math.max(1, Math.floor(num("swingRight", FTA_STUDY_DEFAULTS.swingRight))),
          targetR: Math.max(1, num("targetR", FTA_STUDY_DEFAULTS.targetR)),
          preferMss: bool("preferMss", FTA_STUDY_DEFAULTS.preferMss),
          useOrderBlock: bool("useOrderBlock", FTA_STUDY_DEFAULTS.useOrderBlock),
          useFvg: bool("useFvg", FTA_STUDY_DEFAULTS.useFvg),
          requireRejection: bool("requireRejection", FTA_STUDY_DEFAULTS.requireRejection),
          maxSignals: Math.min(
            24,
            Math.max(1, Math.floor(num("maxSignals", FTA_STUDY_DEFAULTS.maxSignals))),
          ),
          showZones: bool("showZones", FTA_STUDY_DEFAULTS.showZones),
          showStructure: bool("showStructure", FTA_STUDY_DEFAULTS.showStructure),
          showHistory: bool("showHistory", FTA_STUDY_DEFAULTS.showHistory),
          bullColor: FTA_DEFAULTS.bullColor,
          bearColor: FTA_DEFAULTS.bearColor,
          tpColor: FTA_DEFAULTS.tpColor,
          slColor: FTA_DEFAULTS.slColor,
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
        const result = computeTradingAssistant(bars, opts);
        const cmds = tradingAssistantDrawCmds(result, opts, bars[bars.length - 1]!.time);
        const fp = fingerprint(cmds);
        if (!force && fp === lastFpRef.current && lastKeyRef.current === key) return;
        if (cancelled || myGen !== genRef.current) return;
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
        console.info(
          `[forge-ta] painted ${ids.length} shapes · signals=${result.signals.length} live=${live} bars=${bars.length}`,
        );
      } catch (err) {
        console.warn("[forge-ta] paint failed", err);
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
