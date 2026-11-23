import type { DrawCmd } from "@/features/pine/orca-runtime";
import {
  DEFAULT_ALIGNMENT,
  KILLZONES,
  MACROS,
  evaluateAlignment,
  h4Block,
  nyClock,
  qtDayOpenSec,
  session90,
  sessionOpenSec,
  snapshotAt,
  utcAtNewYork,
  type AlignmentInputs,
  type AlignmentMode,
  type AlignmentResult,
  type FractalSnapshot,
} from "./engine";

export type FractalTimeOptions = AlignmentInputs & {
  showCBlocks: boolean;
  showHourQuarters: boolean;
  showMacros: boolean;
  showOpens: boolean;
  showAlignment: boolean;
  showDashboard: boolean;
  showPhaseLabels: boolean;
  cColor: string;
  qColor: string;
  macroColor: string;
  openColor: string;
  alignColor: string;
};

export const FRACTAL_TIME_DEFAULTS: FractalTimeOptions = {
  ...DEFAULT_ALIGNMENT,
  showCBlocks: true,
  showHourQuarters: true,
  showMacros: true,
  showOpens: true,
  showAlignment: true,
  showDashboard: true,
  showPhaseLabels: true,
  cColor: "#5b8def",
  qColor: "#7a8499",
  macroColor: "#e8b96c",
  openColor: "#c792ea",
  alignColor: "#3dcc8c",
};

export type FractalTimeDashboardState = {
  title: string;
  mode: AlignmentMode;
  aligned: boolean;
  reason: string;
  tehran: string;
  rows: AlignmentResult["rows"];
  matched: number;
  enabled: number;
};

let dash: FractalTimeDashboardState | null = null;
const dashSubs = new Set<() => void>();

export function publishFractalTimeDashboard(next: FractalTimeDashboardState | null): void {
  dash = next;
  for (const fn of dashSubs) fn();
}

export function getFractalTimeDashboard(): FractalTimeDashboardState | null {
  return dash;
}

export function subscribeFractalTimeDashboard(fn: () => void): () => void {
  dashSubs.add(fn);
  return () => {
    dashSubs.delete(fn);
  };
}

function addUtcDay(year: number, month: number, day: number, delta: number): { y: number; mo: number; d: number } {
  const dt = new Date(Date.UTC(year, month - 1, day + delta));
  return { y: dt.getUTCFullYear(), mo: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

function rgba(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const n = Number.parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h.slice(0, 6), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${a})`;
}

export function computeFractalTimeDraws(
  times: readonly number[],
  options: FractalTimeOptions,
  chartSec: number,
  priceLow: number,
  priceHigh: number,
): { cmds: DrawCmd[]; result: AlignmentResult; snap: FractalSnapshot } {
  const last = times.length ? times[times.length - 1]! : Math.floor(Date.now() / 1000);
  const first = times.length ? times[0]! : last - 86_400 * 5;
  const result = evaluateAlignment(last, options);
  const snap = result.snap;
  const cmds: DrawCmd[] = [];
  const lo = Math.max(first, last - 10 * 86_400);
  const hi = last + Math.max(chartSec, 3_600);
  const pLo = Number.isFinite(priceLow) ? priceLow : 1;
  const pHi = Number.isFinite(priceHigh) && priceHigh > pLo ? priceHigh : pLo * 1.002;

  if (options.showCBlocks || options.showHourQuarters || options.showOpens) {
    let t = sessionOpenSec(lo);
    const end = sessionOpenSec(hi) + 86_400;
    let guard = 0;
    while (t <= end && guard < 400) {
      guard += 1;
      const h = h4Block(t + 1);
      if (options.showCBlocks && h.quarter === "Q1") {
        cmds.push({
          kind: "vline",
          t1: h.blockStart,
          p1: 0,
          color: options.cColor,
          width: 1,
          style: "dashed",
          text: h.block,
        });
      }
      if (options.showHourQuarters && chartSec <= 60 * 60) {
        cmds.push({
          kind: "vline",
          t1: h.quarterStart,
          p1: 0,
          color: options.qColor,
          width: 1,
          style: "dotted",
        });
      }
      t += 3_600;
    }
  }

  if (options.showHourQuarters && chartSec <= 4 * 3_600) {
    let t = qtDayOpenSec(lo);
    let guard = 0;
    while (t <= hi && guard < 80) {
      guard += 1;
      const s = session90(t + 1);
      cmds.push({
        kind: "vline",
        t1: s.quarterStart,
        p1: 0,
        color: options.qColor,
        width: s.quarter === "Q1" ? 2 : 1,
        style: s.quarter === "Q1" ? "dashed" : "dotted",
        text: s.quarter === "Q1" ? s.session : s.quarter,
      });
      t += 5_400;
    }
  }

  if (options.showOpens) {
    let t = sessionOpenSec(lo);
    let guard = 0;
    while (t <= hi && guard < 20) {
      guard += 1;
      const s = snapshotAt(t + 60, options.foldW5);
      cmds.push({
        kind: "vline",
        t1: s.sessionOpen,
        p1: 0,
        color: options.openColor,
        width: 2,
        style: "solid",
        text: "FX 17:00",
      });
      cmds.push({
        kind: "vline",
        t1: s.qtDayOpen,
        p1: 0,
        color: options.openColor,
        width: 2,
        style: "solid",
        text: "18:00 QT",
      });
      cmds.push({
        kind: "vline",
        t1: s.asiaTrueOpen,
        p1: 0,
        color: options.openColor,
        width: 1,
        style: "dashed",
        text: "Asia TSO 19:30",
      });
      cmds.push({
        kind: "vline",
        t1: s.trueDayOpen,
        p1: 0,
        color: options.openColor,
        width: 1,
        style: "dashed",
        text: "TDO 00:00",
      });
      t += 86_400;
    }
    cmds.push({
      kind: "vline",
      t1: snap.trueWeekOpen,
      p1: 0,
      color: options.openColor,
      width: 2,
      style: "solid",
      text: "TWO",
    });
    cmds.push({
      kind: "vline",
      t1: snap.trueMonthOpen,
      p1: 0,
      color: options.openColor,
      width: 1,
      style: "dashed",
      text: "TMO",
    });
  }

  if (options.showMacros) {
    let day = sessionOpenSec(lo);
    let guard = 0;
    while (day <= hi && guard < 16) {
      guard += 1;
      const openNy = nyClock(day);
      const next = addUtcDay(openNy.year, openNy.month, openNy.day, 1);
      const cal = (mins: number) => (mins >= 17 * 60 ? { y: openNy.year, mo: openNy.month, d: openNy.day } : next);
      for (const m of MACROS) {
        const c = cal(m.startMin);
        const t1 = utcAtNewYork(c.y, c.mo, c.d, Math.floor(m.startMin / 60), m.startMin % 60);
        const t2 = utcAtNewYork(c.y, c.mo, c.d, Math.floor(m.endMin / 60), m.endMin % 60);
        if (t2 < lo || t1 > hi) continue;
        cmds.push({
          kind: "rect",
          t1,
          p1: pLo,
          t2,
          p2: pHi,
          color: options.macroColor,
          fill: rgba(options.macroColor, m.name === "NY2" || m.name === "NYPM1" ? 0.18 : 0.09),
          text: m.name,
        });
      }
      for (const z of KILLZONES) {
        const c = cal(z.startMin);
        const t1 = utcAtNewYork(c.y, c.mo, c.d, Math.floor(z.startMin / 60), z.startMin % 60);
        const t2 = utcAtNewYork(c.y, c.mo, c.d, Math.floor(z.endMin / 60), z.endMin % 60);
        if (t2 < lo || t1 > hi) continue;
        cmds.push({
          kind: "rect",
          t1,
          p1: pLo,
          t2,
          p2: pHi,
          color: options.cColor,
          fill: rgba(options.cColor, 0.05),
          text: z.name,
        });
      }
      day += 86_400;
    }
  }

  if (options.showAlignment && result.aligned) {
    const q0 = snap.h4.quarterStart;
    cmds.push({
      kind: "rect",
      t1: q0,
      p1: pLo,
      t2: q0 + 3_600,
      p2: pHi,
      color: options.alignColor,
      fill: rgba(options.alignColor, 0.16),
      text: "ALIGN",
    });
    cmds.push({
      kind: "label",
      t1: q0,
      p1: pHi,
      color: options.alignColor,
      text: `ALIGN ${snap.h4.label} ${snap.trading.name} ${snap.monthW}`,
    });
  }

  const capped = cmds.length > 420 ? cmds.slice(-420) : cmds;
  return { cmds: capped, result, snap };
}

export { evaluateAlignment, snapshotAt, formatTehran } from "./engine";
export type { AlignmentResult, FractalSnapshot };
