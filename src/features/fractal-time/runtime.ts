import type { DrawCmd } from "@/features/pine/orca-runtime";
import {
  DEFAULT_ALIGNMENT,
  evaluateAlignment,
  h4Block,
  nyClock,
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
  const lo = Math.max(first, last - 14 * 86_400);
  const hi = last + chartSec;
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
      if (options.showHourQuarters && chartSec <= 15 * 60) {
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
        text: "17:00 NY",
      });
      cmds.push({
        kind: "vline",
        t1: s.asiaTrueOpen,
        p1: 0,
        color: options.openColor,
        width: 1,
        style: "dashed",
        text: "Asia TO 19:00",
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
  }

  if (options.showMacros) {
    let day = sessionOpenSec(lo);
    let guard = 0;
    while (day <= hi && guard < 16) {
      guard += 1;
      const openNy = nyClock(day);
      const next = new Date(Date.UTC(openNy.year, openNy.month - 1, openNy.day + 1));
      const y = next.getUTCFullYear();
      const mo = next.getUTCMonth() + 1;
      const d = next.getUTCDate();
      for (const m of [
        { name: "London1" as const, sh: 2, sm: 30, eh: 3, em: 0 },
        { name: "London2" as const, sh: 4, sm: 0, eh: 4, em: 30 },
        { name: "NY1" as const, sh: 8, sm: 50, eh: 9, em: 10 },
        { name: "NY2" as const, sh: 9, sm: 50, eh: 10, em: 10 },
      ]) {
        const t1 = utcAtNewYork(y, mo, d, m.sh, m.sm);
        const t2 = utcAtNewYork(y, mo, d, m.eh, m.em);
        if (t2 < lo || t1 > hi) continue;
        cmds.push({
          kind: "rect",
          t1,
          p1: pLo,
          t2,
          p2: pHi,
          color: options.macroColor,
          fill: rgba(options.macroColor, m.name === "NY2" ? 0.18 : 0.1),
          text: m.name,
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

  const capped = cmds.length > 220 ? cmds.slice(-220) : cmds;
  return { cmds: capped, result, snap };
}

export { evaluateAlignment, snapshotAt, formatTehran } from "./engine";
export type { AlignmentResult, FractalSnapshot };
