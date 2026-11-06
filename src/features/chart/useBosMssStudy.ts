/**
 * Watches Indicators “BOS / MSS” and paints BOS+/BOS-/MSS+/MSS- markers.
 */

import { useEffect, useRef } from "react";
import { useServices } from "@/app/use-services";
import { useStore } from "@/shared/hooks/useStore";
import type { EntityId } from "@/infrastructure/tradingview";
import { barsFromChartExport } from "@/features/pine/orca-runtime";
import {
  computeBosMss,
  paintBosMss,
  type BosMssDrawCmd,
  type BosMssInputs,
} from "@/features/bos-mss/runtime";
import { BOS_MSS_STUDY_DEFAULTS } from "./bos-mss-indicator";
import { studyIsVisible } from "./study-paint-gate";

const MAX_BARS = 3_000;
const STUDY_DEBOUNCE_MS = 500;
const PRESENCE_POLL_MS = 6_000;
const LIVE_REFRESH_MS = 15_000;

function fingerprint(cmds: readonly BosMssDrawCmd[]): string {
  if (cmds.length === 0) return "empty";
  const head = cmds.slice(0, 4);
  const tail = cmds.length > 4 ? cmds.slice(-4) : [];
  const part = (c: BosMssDrawCmd) =>
    c.kind === "line"
      ? `ln:${c.t1}:${c.t2}:${c.p1}`
      : `lb:${c.t1}:${c.p1}:${c.text}`;
  return `${cmds.length}|${[...head, ...tail].map(part).join(";")}`;
}

export function useBosMssStudy(enabled = true): void {
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
              /^bos\s*\/\s*mss/i.test(name.trim()) ||
              /BosMssStructure@/i.test(name) ||
              /BOS\+\s*·\s*BOS-/i.test(name)
            );
          })
          .map((s: { id?: string | EntityId }) => s.id as EntityId);
      } catch {
        return [];
      }
    };

    const readOptions = (studyId: EntityId): BosMssInputs => {
      try {
        const api = widget.activeChart()?.getStudyById(studyId);
        if (!api) return { ...BOS_MSS_STUDY_DEFAULTS };
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
        const str = (id: string, fallback: string) => {
          const v = map.get(id);
          return typeof v === "string" && v.trim() ? v.trim() : fallback;
        };
        return {
          leftBars: Math.max(1, Math.min(50, Math.floor(num("leftBars", BOS_MSS_STUDY_DEFAULTS.leftBars)))),
          rightBars: Math.max(
            1,
            Math.min(50, Math.floor(num("rightBars", BOS_MSS_STUDY_DEFAULTS.rightBars))),
          ),
          breakOnWick: bool("breakOnWick", BOS_MSS_STUDY_DEFAULTS.breakOnWick),
          showBosPlus: bool("showBosPlus", BOS_MSS_STUDY_DEFAULTS.showBosPlus),
          showBosMinus: bool("showBosMinus", BOS_MSS_STUDY_DEFAULTS.showBosMinus),
          showMssPlus: bool("showMssPlus", BOS_MSS_STUDY_DEFAULTS.showMssPlus),
          showMssMinus: bool("showMssMinus", BOS_MSS_STUDY_DEFAULTS.showMssMinus),
          showLines: bool("showLines", BOS_MSS_STUDY_DEFAULTS.showLines),
          showLabels: bool("showLabels", BOS_MSS_STUDY_DEFAULTS.showLabels),
          bosPlusLabel: str("bosPlusLabel", BOS_MSS_STUDY_DEFAULTS.bosPlusLabel).slice(0, 12),
          bosMinusLabel: str("bosMinusLabel", BOS_MSS_STUDY_DEFAULTS.bosMinusLabel).slice(0, 12),
          mssPlusLabel: str("mssPlusLabel", BOS_MSS_STUDY_DEFAULTS.mssPlusLabel).slice(0, 12),
          mssMinusLabel: str("mssMinusLabel", BOS_MSS_STUDY_DEFAULTS.mssMinusLabel).slice(0, 12),
          bosPlusColor: str("bosPlusColor", BOS_MSS_STUDY_DEFAULTS.bosPlusColor),
          bosMinusColor: str("bosMinusColor", BOS_MSS_STUDY_DEFAULTS.bosMinusColor),
          mssPlusColor: str("mssPlusColor", BOS_MSS_STUDY_DEFAULTS.mssPlusColor),
          mssMinusColor: str("mssMinusColor", BOS_MSS_STUDY_DEFAULTS.mssMinusColor),
          lineWidth: Math.max(1, Math.min(4, Math.floor(num("lineWidth", BOS_MSS_STUDY_DEFAULTS.lineWidth)))),
          bosLineStyle: Math.max(
            0,
            Math.min(2, Math.floor(num("bosLineStyle", BOS_MSS_STUDY_DEFAULTS.bosLineStyle))),
          ),
          mssLineStyle: Math.max(
            0,
            Math.min(2, Math.floor(num("mssLineStyle", BOS_MSS_STUDY_DEFAULTS.mssLineStyle))),
          ),
          fontSize: Math.max(
            8,
            Math.min(24, Math.floor(num("fontSize", BOS_MSS_STUDY_DEFAULTS.fontSize))),
          ),
          maxEvents: Math.max(
            10,
            Math.min(400, Math.floor(num("maxEvents", BOS_MSS_STUDY_DEFAULTS.maxEvents))),
          ),
        };
      } catch {
        return { ...BOS_MSS_STUDY_DEFAULTS };
      }
    };

    const repaint = async (force = false) => {
      if (cancelled) return;
      if (busyRef.current) {
        pendingRef.current = true;
        return;
      }
      busyRef.current = true;
      const gen = ++genRef.current;
      try {
        const studyIds = findStudyIds();
        if (studyIds.length === 0) {
          clearDrawings();
          lastKeyRef.current = "";
          lastFpRef.current = "";
          return;
        }

        const studyId = studyIds[0]!;
        const api = widget.activeChart()?.getStudyById(studyId);
        if (!studyIsVisible(api)) {
          clearDrawings();
          lastFpRef.current = "";
          return;
        }

        const inputs = readOptions(studyId);
        const key = JSON.stringify({ symbol, interval, inputs });
        const active = widget.activeChart();
        if (!active) return;
        const exported = await active.exportData({
          includeTime: true,
          includeSeries: true,
          includedStudies: [],
        });
        if (cancelled || gen !== genRef.current) return;
        let bars = barsFromChartExport(exported);
        if (bars.length > MAX_BARS) bars = bars.slice(bars.length - MAX_BARS);
        if (bars.length < inputs.leftBars + inputs.rightBars + 3) return;

        const cmds = computeBosMss(bars, inputs);
        const fp = fingerprint(cmds);
        if (!force && key === lastKeyRef.current && fp === lastFpRef.current) return;

        clearDrawings();
        if (cancelled || gen !== genRef.current) return;
        const ids = await paintBosMss(active, cmds, { ownerStudyId: studyId });
        if (cancelled || gen !== genRef.current) {
          for (const id of ids) {
            try {
              chart.removeEntity(id);
            } catch {
              /* ignore */
            }
          }
          return;
        }
        entityIdsRef.current = ids;
        lastKeyRef.current = key;
        lastFpRef.current = fp;
      } catch (err) {
        console.warn("[bos-mss] paint failed", err);
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
