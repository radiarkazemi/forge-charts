/**
 * Watches Indicators “IRL / ERL” and paints IRL+/IRL-/ERL+/ERL- segments.
 * Colors / visibility / linewidth come from the Style tab (getStyleValues).
 *
 * Refresh guard: paint-then-swap, mute study events while painting, and never
 * force-clear when the fingerprint is unchanged (stops the flicker loop).
 */

import { useEffect, useRef } from "react";
import { useServices } from "@/app/use-services";
import { useStore } from "@/shared/hooks/useStore";
import type { EntityId } from "@/infrastructure/tradingview";

import {
  IRL_ERL_DEFAULTS,
  computeIrlErl,
  paintIrlErl,
  type IrlErlDrawCmd,
  type IrlErlInputs,
} from "@/features/irl-erl/runtime";
import {
  EQL_STYLE,
  EQH_STYLE,
  ERL_STYLE_MINUS,
  ERL_STYLE_PLUS,
  IRL_ERL_STUDY_DEFAULTS,
  IRL_STYLE_MINUS,
  IRL_STYLE_PLUS,
} from "./irl-erl-indicator";
import {
  applyTransparency,
  linewidthToFontSize,
  readStylePlot,
} from "./study-style-plots";
import { studyIsVisible, markChartPaintBusy } from "./study-paint-gate";
import {
  exportChartBarsCached,
  STUDY_DEBOUNCE_MS,
  STUDY_LIVE_REFRESH_MS,
  STUDY_MAX_BARS,
  STUDY_PAINT_MUTE_MS,
  STUDY_PRESENCE_POLL_MS,
} from "./chart-export-cache";

const MAX_BARS = STUDY_MAX_BARS;
// STUDY_DEBOUNCE_MS from chart-export-cache
const PRESENCE_POLL_MS = STUDY_PRESENCE_POLL_MS;
const LIVE_REFRESH_MS = STUDY_LIVE_REFRESH_MS;
const PAINT_MUTE_MS = STUDY_PAINT_MUTE_MS;

function fingerprint(cmds: readonly IrlErlDrawCmd[]): string {
  if (cmds.length === 0) return "empty";
  const head = cmds.slice(0, 4);
  const tail = cmds.length > 4 ? cmds.slice(-4) : [];
  const part = (c: IrlErlDrawCmd) =>
    `sg:${c.levelKind}:${c.t1}:${c.t2}:${c.p1}:${c.text ?? ""}:${c.color}:${c.width}:${c.style}`;
  return `${cmds.length}|${[...head, ...tail].map(part).join(";")}`;
}

export function useIrlErlStudy(enabled = true): void {
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
  const muteUntilRef = useRef(0);

  useEffect(() => {
    if (!enabled || !ready) return;
    const widget = chart.getWidget();
    if (!widget) return;

    let cancelled = false;
    let studyTimer: number | undefined;

    const mutePaintEvents = () => {
      muteUntilRef.current = Date.now() + PAINT_MUTE_MS;
      markChartPaintBusy(PAINT_MUTE_MS);
    };
    const isMuted = () => Date.now() < muteUntilRef.current;

    const clearDrawings = () => {
      const ids = entityIdsRef.current;
      entityIdsRef.current = [];
      if (ids.length === 0) return;
      mutePaintEvents();
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
              /^irl\s*\/\s*erl/i.test(name.trim()) ||
              /IrlErlLiquidity@/i.test(name) ||
              /IRL\+\s*·\s*IRL-/i.test(name)
            );
          })
          .map((s: { id?: string | EntityId }) => s.id as EntityId);
      } catch {
        return [];
      }
    };

    const readOptions = (studyId: EntityId): IrlErlInputs => {
      try {
        const api = widget.activeChart()?.getStudyById(studyId);
        if (!api) return { ...IRL_ERL_DEFAULTS };
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

        const irlPlus = readStylePlot(api, IRL_STYLE_PLUS, {
          color: IRL_ERL_DEFAULTS.irlPlusColor,
          visible: IRL_ERL_DEFAULTS.showIrlPlus,
          transparency: 0,
          linewidth: IRL_ERL_DEFAULTS.lineWidth,
          linestyle: IRL_ERL_DEFAULTS.irlLineStyle,
        });
        const irlMinus = readStylePlot(api, IRL_STYLE_MINUS, {
          color: IRL_ERL_DEFAULTS.irlMinusColor,
          visible: IRL_ERL_DEFAULTS.showIrlMinus,
          transparency: 0,
          linewidth: IRL_ERL_DEFAULTS.lineWidth,
          linestyle: IRL_ERL_DEFAULTS.irlLineStyle,
        });
        const eqh = readStylePlot(api, EQH_STYLE, {
          color: IRL_ERL_DEFAULTS.eqhColor,
          visible: IRL_ERL_DEFAULTS.showEqh,
          transparency: 0,
          linewidth: IRL_ERL_DEFAULTS.lineWidth,
          linestyle: IRL_ERL_DEFAULTS.irlLineStyle,
        });
        const eql = readStylePlot(api, EQL_STYLE, {
          color: IRL_ERL_DEFAULTS.eqlColor,
          visible: IRL_ERL_DEFAULTS.showEql,
          transparency: 0,
          linewidth: IRL_ERL_DEFAULTS.lineWidth,
          linestyle: IRL_ERL_DEFAULTS.irlLineStyle,
        });
        const erlPlus = readStylePlot(api, ERL_STYLE_PLUS, {
          color: IRL_ERL_DEFAULTS.erlPlusColor,
          visible: IRL_ERL_DEFAULTS.showErlPlus,
          transparency: 0,
          linewidth: IRL_ERL_DEFAULTS.lineWidth,
          linestyle: IRL_ERL_DEFAULTS.erlLineStyle,
        });
        const erlMinus = readStylePlot(api, ERL_STYLE_MINUS, {
          color: IRL_ERL_DEFAULTS.erlMinusColor,
          visible: IRL_ERL_DEFAULTS.showErlMinus,
          transparency: 0,
          linewidth: IRL_ERL_DEFAULTS.lineWidth,
          linestyle: IRL_ERL_DEFAULTS.erlLineStyle,
        });

        const lineWidth = Math.max(
          1,
          Math.min(
            4,
            Math.round(
              Math.max(
                irlPlus.linewidth,
                irlMinus.linewidth,
                eqh.linewidth,
                eql.linewidth,
                erlPlus.linewidth,
                erlMinus.linewidth,
              ),
            ),
          ),
        );
        const fontSize = linewidthToFontSize(lineWidth, IRL_ERL_DEFAULTS.fontSize);
        const irlLineStyleInput = Math.max(
          0,
          Math.min(2, Math.floor(num("irlLineStyle", IRL_ERL_STUDY_DEFAULTS.irlLineStyle))),
        );
        const erlLineStyleInput = Math.max(
          0,
          Math.min(2, Math.floor(num("erlLineStyle", IRL_ERL_STUDY_DEFAULTS.erlLineStyle))),
        );

        return {
          leftBars: Math.max(
            1,
            Math.min(50, Math.floor(num("leftBars", IRL_ERL_STUDY_DEFAULTS.leftBars))),
          ),
          rightBars: Math.max(
            1,
            Math.min(50, Math.floor(num("rightBars", IRL_ERL_STUDY_DEFAULTS.rightBars))),
          ),
          smartScales: bool("smartScales", IRL_ERL_STUDY_DEFAULTS.smartScales),
          scalesText: str("scalesText", IRL_ERL_STUDY_DEFAULTS.scalesText),
          minRangePct: Math.max(0, Math.min(5, num("minRangePct", IRL_ERL_STUDY_DEFAULTS.minRangePct))),
          maxRanges: Math.max(
            1,
            Math.min(6, Math.floor(num("maxRanges", IRL_ERL_STUDY_DEFAULTS.maxRanges))),
          ),
          lookbackDays: Math.max(
            1,
            Math.min(3650, Math.floor(num("lookbackDays", IRL_ERL_STUDY_DEFAULTS.lookbackDays))),
          ),
          hideNested: bool("hideNested", IRL_ERL_STUDY_DEFAULTS.hideNested),
          eqTolerancePct: Math.max(
            0,
            Math.min(1, num("eqTolerancePct", IRL_ERL_STUDY_DEFAULTS.eqTolerancePct)),
          ),
          includeSingleSwings: bool(
            "includeSingleSwings",
            IRL_ERL_STUDY_DEFAULTS.includeSingleSwings,
          ),
          edgeMarginPct: Math.max(
            0,
            Math.min(40, num("edgeMarginPct", IRL_ERL_STUDY_DEFAULTS.edgeMarginPct)),
          ),
          showIrlPlus: irlPlus.visible,
          showIrlMinus: irlMinus.visible,
          showEqh: eqh.visible,
          showEql: eql.visible,
          showErlPlus: erlPlus.visible,
          showErlMinus: erlMinus.visible,
          showLines: bool("showLines", IRL_ERL_STUDY_DEFAULTS.showLines),
          showLabels: bool("showLabels", IRL_ERL_STUDY_DEFAULTS.showLabels),
          extendToLast: bool("extendToLast", IRL_ERL_STUDY_DEFAULTS.extendToLast),
          irlPlusLabel: str("irlPlusLabel", IRL_ERL_STUDY_DEFAULTS.irlPlusLabel).slice(0, 12),
          irlMinusLabel: str("irlMinusLabel", IRL_ERL_STUDY_DEFAULTS.irlMinusLabel).slice(0, 12),
          eqhLabel: str("eqhLabel", IRL_ERL_STUDY_DEFAULTS.eqhLabel).slice(0, 12),
          eqlLabel: str("eqlLabel", IRL_ERL_STUDY_DEFAULTS.eqlLabel).slice(0, 12),
          erlPlusLabel: str("erlPlusLabel", IRL_ERL_STUDY_DEFAULTS.erlPlusLabel).slice(0, 12),
          erlMinusLabel: str("erlMinusLabel", IRL_ERL_STUDY_DEFAULTS.erlMinusLabel).slice(0, 12),
          irlPlusColor: applyTransparency(irlPlus.color, irlPlus.transparency),
          irlMinusColor: applyTransparency(irlMinus.color, irlMinus.transparency),
          eqhColor: applyTransparency(eqh.color, eqh.transparency),
          eqlColor: applyTransparency(eql.color, eql.transparency),
          erlPlusColor: applyTransparency(erlPlus.color, erlPlus.transparency),
          erlMinusColor: applyTransparency(erlMinus.color, erlMinus.transparency),
          lineWidth,
          irlLineStyle: eqh.linestyle ?? irlPlus.linestyle ?? irlLineStyleInput,
          erlLineStyle: erlPlus.linestyle ?? erlLineStyleInput,
          fontSize,
          maxEvents: Math.max(
            4,
            Math.min(80, Math.floor(num("maxEvents", IRL_ERL_STUDY_DEFAULTS.maxEvents))),
          ),
        };
      } catch {
        return { ...IRL_ERL_DEFAULTS };
      }
    };

    const repaint = async (_force = false) => {
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
        let bars = await exportChartBarsCached(active, MAX_BARS);
        if (cancelled || gen !== genRef.current) return;
        if (bars.length < inputs.leftBars + inputs.rightBars + 5) return;

        const cmds = computeIrlErl(bars, inputs);
        const fp = fingerprint(cmds);
        if (key === lastKeyRef.current && fp === lastFpRef.current) return;

        mutePaintEvents();
        const ids = await paintIrlErl(active, cmds, { ownerStudyId: studyId });
        if (cancelled || gen !== genRef.current) {
          mutePaintEvents();
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
        mutePaintEvents();
        for (const id of prev) {
          try {
            chart.removeEntity(id);
          } catch {
            /* ignore */
          }
        }
      } catch (err) {
        console.warn("[irl-erl] paint failed", err);
        lastKeyRef.current = "";
      } finally {
        busyRef.current = false;
        if (!cancelled && pendingRef.current) {
          pendingRef.current = false;
          window.setTimeout(() => {
            void repaint(false);
          }, 200);
        }
      }
    };

    const scheduleRepaint = () => {
      window.clearTimeout(studyTimer);
      studyTimer = window.setTimeout(() => {
        void repaint(false);
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
          lastFpRef.current = "";
          return;
        }
      }
      if (/^(create|remove|price_scale|properties|visibility|toggle|hide|show)/i.test(eventType)) scheduleRepaint();
    };

    const onStudyProperties = (...args: unknown[]) => {
      if (isMuted()) return;
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
      if (cancelled || busyRef.current || isMuted()) return;
      if (findStudyIds().length === 0) return;
      void repaint(false);
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
