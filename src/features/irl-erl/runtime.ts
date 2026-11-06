/**
 * IRL / ERL — Internal & External Range Liquidity (ICT).
 *
 * One (or few) main dealing range(s):
 *   ERL+ = range high (buy-side stops outside)
 *   ERL− = range low  (sell-side stops outside)
 *   IRL+ / IRL− = EQH/EQL and significant swings *inside* that range
 *
 * Nested micro-ranges are dropped so the chart is not a stack of ERL labels.
 */

import type { EntityId, IChartWidgetApi } from "@/infrastructure/tradingview";
import {
  computeIctConfirmedRanges,
  MULTI_TF_DR_DEFAULTS,
} from "@/features/dealing-ranges/runtime";
import type { ConfirmedDealingRange, OrcaBar } from "@/features/pine/orca-runtime";
import {
  DEFAULT_STRUCTURE_SCALES,
  resolveStructureScales,
  scaleFontSize,
  scaleLineWidth,
  scaleStrength,
} from "@/features/chart/structure-scales";

export type IrlErlKind = "IRL+" | "IRL-" | "ERL+" | "ERL-";

export interface IrlErlInputs {
  readonly leftBars: number;
  readonly rightBars: number;
  readonly smartScales: boolean;
  readonly scalesText: string;
  readonly minRangePct: number;
  readonly maxRanges: number;
  readonly lookbackDays: number;
  /** Drop DRs nested inside a larger one (keep the main / bigger range). */
  readonly hideNested: boolean;
  /** Max % of mid for two pivots to count as equal (EQH/EQL). */
  readonly eqTolerancePct: number;
  /** Also mark lone internal swings (not only EQH/EQL). */
  readonly includeSingleSwings: boolean;
  /** Ignore internal pivots within this fraction of range height from ERL edges. */
  readonly edgeMarginPct: number;
  readonly showIrlPlus: boolean;
  readonly showIrlMinus: boolean;
  readonly showErlPlus: boolean;
  readonly showErlMinus: boolean;
  readonly showLines: boolean;
  readonly showLabels: boolean;
  readonly extendToLast: boolean;
  readonly irlPlusLabel: string;
  readonly irlMinusLabel: string;
  readonly erlPlusLabel: string;
  readonly erlMinusLabel: string;
  readonly irlPlusColor: string;
  readonly irlMinusColor: string;
  readonly erlPlusColor: string;
  readonly erlMinusColor: string;
  readonly lineWidth: number;
  readonly irlLineStyle: number;
  readonly erlLineStyle: number;
  readonly fontSize: number;
  readonly maxEvents: number;
}

export const IRL_ERL_DEFAULTS: IrlErlInputs = {
  leftBars: 5,
  rightBars: 5,
  smartScales: true,
  scalesText: DEFAULT_STRUCTURE_SCALES.join(","),
  minRangePct: MULTI_TF_DR_DEFAULTS.minRangePct,
  /** Few main ranges — not every minor DR. */
  maxRanges: 2,
  lookbackDays: 90,
  hideNested: true,
  /** ~0.2% of mid — real EQH/EQL on FX/gold; 0.05 was too tight → no IRL. */
  eqTolerancePct: 0.2,
  includeSingleSwings: true,
  edgeMarginPct: 8,
  showIrlPlus: true,
  showIrlMinus: true,
  showErlPlus: true,
  showErlMinus: true,
  showLines: true,
  showLabels: true,
  extendToLast: true,
  irlPlusLabel: "IRL+",
  irlMinusLabel: "IRL-",
  erlPlusLabel: "ERL+",
  erlMinusLabel: "ERL-",
  irlPlusColor: "#26A69A",
  irlMinusColor: "#AB47BC",
  erlPlusColor: "#42A5F5",
  erlMinusColor: "#EF5350",
  lineWidth: 1,
  irlLineStyle: 2,
  erlLineStyle: 0,
  fontSize: 12,
  maxEvents: 40,
};

export interface IrlErlLevel {
  readonly kind: IrlErlKind;
  readonly t1: number;
  readonly t2: number;
  readonly price: number;
  readonly scale: number;
}

export interface IrlErlDrawCmd {
  readonly kind: "segment";
  readonly t1: number;
  readonly p1: number;
  readonly t2: number;
  readonly p2: number;
  readonly color: string;
  readonly width: number;
  readonly style: number;
  readonly text?: string;
  readonly fontSize: number;
  readonly scale: number;
  readonly levelKind: IrlErlKind;
}

interface Pivot {
  readonly kind: "high" | "low";
  readonly index: number;
  readonly time: number;
  readonly price: number;
}

function pivotHigh(
  bars: readonly OrcaBar[],
  i: number,
  left: number,
  right: number,
): number | null {
  const mid = i - right;
  if (mid < left || i >= bars.length) return null;
  const h = bars[mid]!.high;
  for (let j = mid - left; j <= mid + right; j += 1) {
    if (j === mid) continue;
    if (bars[j]!.high >= h) return null;
  }
  return h;
}

function pivotLow(
  bars: readonly OrcaBar[],
  i: number,
  left: number,
  right: number,
): number | null {
  const mid = i - right;
  if (mid < left || i >= bars.length) return null;
  const l = bars[mid]!.low;
  for (let j = mid - left; j <= mid + right; j += 1) {
    if (j === mid) continue;
    if (bars[j]!.low <= l) return null;
  }
  return l;
}

function collectPivots(
  bars: readonly OrcaBar[],
  left: number,
  right: number,
): Pivot[] {
  const out: Pivot[] = [];
  for (let i = 0; i < bars.length; i += 1) {
    const ph = pivotHigh(bars, i, left, right);
    const pl = pivotLow(bars, i, left, right);
    if (ph != null) {
      out.push({
        kind: "high",
        index: i - right,
        time: bars[i - right]!.time,
        price: ph,
      });
    }
    if (pl != null) {
      out.push({
        kind: "low",
        index: i - right,
        time: bars[i - right]!.time,
        price: pl,
      });
    }
  }
  return out.sort((a, b) => a.index - b.index);
}

function nearlyEqual(a: number, b: number, mid: number, tolPct: number): boolean {
  if (!(mid > 0)) return Math.abs(a - b) < 1e-8;
  return (Math.abs(a - b) / mid) * 100 <= Math.max(0, tolPct);
}

/** Keep larger DRs; drop boxes fully inside another. */
function filterNestedRanges(
  ranges: readonly ConfirmedDealingRange[],
  hideNested: boolean,
  tEnd?: number,
): ConfirmedDealingRange[] {
  if (!hideNested || ranges.length <= 1) return [...ranges];
  const scored = ranges
    .map((r) => {
      const height = Math.max(0, r.top - r.bot);
      const end = Math.max(r.t1, tEnd ?? r.t1, r.t0 + 1);
      return { r, height, area: height * Math.max(1, end - r.t0) };
    })
    .sort((a, b) => b.area - a.area || b.height - a.height);

  const kept: ConfirmedDealingRange[] = [];
  for (const cand of scored) {
    const nested = kept.some((outer) => {
      const outerH = Math.max(0, outer.top - outer.bot);
      if (!(outerH > 0) || cand.height >= outerH * 0.98) return false;
      if (cand.r.bot < outer.bot - outerH * 0.001) return false;
      if (cand.r.top > outer.top + outerH * 0.001) return false;
      const outerEnd = Math.max(outer.t1, tEnd ?? outer.t1, outer.t0 + 1);
      if (cand.r.t0 < outer.t0 - 1) return false;
      if (cand.r.t0 > outerEnd + 1) return false;
      return true;
    });
    if (!nested) kept.push(cand.r);
  }
  return kept.sort((a, b) => a.t1 - b.t1);
}

function findEqualClusters(
  pivots: readonly Pivot[],
  side: "high" | "low",
  mid: number,
  tolPct: number,
): Array<{ price: number; t1: number }> {
  const filtered = pivots.filter((p) => p.kind === side);
  const used = new Set<number>();
  const clusters: Array<{ price: number; t1: number }> = [];
  for (let i = 0; i < filtered.length; i += 1) {
    if (used.has(i)) continue;
    const a = filtered[i]!;
    const members = [a];
    for (let j = i + 1; j < filtered.length; j += 1) {
      if (used.has(j)) continue;
      const b = filtered[j]!;
      if (nearlyEqual(a.price, b.price, mid, tolPct)) {
        members.push(b);
        used.add(j);
      }
    }
    if (members.length < 2) continue;
    used.add(i);
    const price =
      side === "high"
        ? Math.max(...members.map((m) => m.price))
        : Math.min(...members.map((m) => m.price));
    const first = members.reduce((best, m) => (m.index < best.index ? m : best), members[0]!);
    clusters.push({ price, t1: first.time });
  }
  return clusters;
}

function barIndexAtOrAfter(bars: readonly OrcaBar[], t: number): number {
  for (let i = 0; i < bars.length; i += 1) {
    if (bars[i]!.time >= t) return i;
  }
  return bars.length - 1;
}

/** Merge levels at the same kind + nearly-same price into one segment. */
function dedupeLevels(
  levels: readonly IrlErlLevel[],
  midHint: number,
  tolPct: number,
): IrlErlLevel[] {
  const out: IrlErlLevel[] = [];
  for (const lv of levels) {
    const mid = midHint > 0 ? midHint : lv.price;
    const hit = out.findIndex(
      (x) => x.kind === lv.kind && nearlyEqual(x.price, lv.price, mid, Math.max(tolPct, 0.05)),
    );
    if (hit < 0) {
      out.push(lv);
      continue;
    }
    const prev = out[hit]!;
    out[hit] = {
      kind: prev.kind,
      t1: Math.min(prev.t1, lv.t1),
      t2: Math.max(prev.t2, lv.t2),
      price: lv.kind.endsWith("+")
        ? Math.max(prev.price, lv.price)
        : Math.min(prev.price, lv.price),
      scale: Math.max(prev.scale, lv.scale),
    };
  }
  return out.sort((a, b) => a.t1 - b.t1 || a.price - b.price);
}

/**
 * Detect IRL / ERL from chart bars.
 * ERL only on main (non-nested) dealing-range extremes; IRL inside those ranges.
 */
export function detectIrlErl(
  bars: readonly OrcaBar[],
  inputs: IrlErlInputs,
): IrlErlLevel[] {
  if (bars.length < 20) return [];
  const lastTime = bars[bars.length - 1]!.time;

  // Pull extra candidates then nest-filter down to the main ranges.
  const raw = computeIctConfirmedRanges(bars, {
    pivotLeft: inputs.leftBars,
    pivotRight: inputs.rightBars,
    breakOnWick: false,
    minRangePct: inputs.minRangePct,
    maxRanges: Math.max(inputs.maxRanges * 3, 8),
    fromDate: "",
    toDate: "",
    lookbackDays: inputs.lookbackDays,
    requireBosConfirm: false,
    smartScales: inputs.smartScales,
    scalesText: inputs.scalesText,
  });
  if (raw.length === 0) return [];

  const ranges = filterNestedRanges(raw, inputs.hideNested !== false, lastTime)
    .sort((a, b) => a.t1 - b.t1)
    .slice(-Math.max(1, Math.min(6, inputs.maxRanges)));

  const scales = resolveStructureScales({
    smartScales: inputs.smartScales,
    scalesText: inputs.scalesText,
    single: Math.max(inputs.leftBars, inputs.rightBars),
  });
  // Tighter pivot for internal liquidity than the DR legs.
  const irlScale = Math.max(
    2,
    Math.min(Math.min(...scales), Math.max(2, Math.floor(Math.max(inputs.leftBars, inputs.rightBars) / 2))),
  );
  const pivots = collectPivots(bars, irlScale, irlScale);

  const levels: IrlErlLevel[] = [];
  let midHint = 0;

  for (const dr of ranges) {
    const tEnd = inputs.extendToLast ? Math.max(lastTime, dr.t1) : dr.t1;
    const mid = dr.mid > 0 ? dr.mid : (dr.top + dr.bot) / 2;
    midHint = mid;
    const height = Math.max(0, dr.top - dr.bot);
    const margin = height * (Math.max(0, Math.min(40, inputs.edgeMarginPct)) / 100);
    const startIdx = barIndexAtOrAfter(bars, dr.t0);
    // Internal structure only after the range is confirmed (2nd extreme).
    const confirmIdx = barIndexAtOrAfter(bars, dr.t1);
    const endIdx = barIndexAtOrAfter(bars, tEnd);

    if (inputs.showErlPlus) {
      levels.push({
        kind: "ERL+",
        t1: dr.t0,
        t2: tEnd,
        price: dr.top,
        scale: Math.max(...scales),
      });
    }
    if (inputs.showErlMinus) {
      levels.push({
        kind: "ERL-",
        t1: dr.t0,
        t2: tEnd,
        price: dr.bot,
        scale: Math.max(...scales),
      });
    }

    if (!(inputs.showIrlPlus || inputs.showIrlMinus) || !(height > 0)) continue;

    const inside = pivots.filter(
      (p) =>
        p.index >= confirmIdx &&
        p.index <= endIdx &&
        p.index >= startIdx &&
        p.price <= dr.top - margin &&
        p.price >= dr.bot + margin,
    );

    const eqHighs = findEqualClusters(inside, "high", mid, inputs.eqTolerancePct);
    const eqLows = findEqualClusters(inside, "low", mid, inputs.eqTolerancePct);
    const eqHighSet = eqHighs.map((c) => c.price);
    const eqLowSet = eqLows.map((c) => c.price);

    if (inputs.showIrlPlus) {
      for (const c of eqHighs) {
        levels.push({
          kind: "IRL+",
          t1: c.t1,
          t2: tEnd,
          price: c.price,
          scale: irlScale,
        });
      }
    }
    if (inputs.showIrlMinus) {
      for (const c of eqLows) {
        levels.push({
          kind: "IRL-",
          t1: c.t1,
          t2: tEnd,
          price: c.price,
          scale: irlScale,
        });
      }
    }

    if (inputs.includeSingleSwings) {
      // Most recent internal swings that are not already EQ clusters / near ERL.
      const highs = inside.filter((p) => p.kind === "high").slice(-4);
      const lows = inside.filter((p) => p.kind === "low").slice(-4);
      if (inputs.showIrlPlus) {
        for (const p of highs) {
          if (eqHighSet.some((px) => nearlyEqual(px, p.price, mid, inputs.eqTolerancePct))) {
            continue;
          }
          levels.push({
            kind: "IRL+",
            t1: p.time,
            t2: tEnd,
            price: p.price,
            scale: irlScale,
          });
        }
      }
      if (inputs.showIrlMinus) {
        for (const p of lows) {
          if (eqLowSet.some((px) => nearlyEqual(px, p.price, mid, inputs.eqTolerancePct))) {
            continue;
          }
          levels.push({
            kind: "IRL-",
            t1: p.time,
            t2: tEnd,
            price: p.price,
            scale: irlScale,
          });
        }
      }
    }
  }

  return dedupeLevels(levels, midHint, inputs.eqTolerancePct);
}

function kindEnabled(kind: IrlErlKind, inputs: IrlErlInputs): boolean {
  if (kind === "IRL+") return inputs.showIrlPlus;
  if (kind === "IRL-") return inputs.showIrlMinus;
  if (kind === "ERL+") return inputs.showErlPlus;
  return inputs.showErlMinus;
}

function kindColor(kind: IrlErlKind, inputs: IrlErlInputs): string {
  if (kind === "IRL+") return inputs.irlPlusColor;
  if (kind === "IRL-") return inputs.irlMinusColor;
  if (kind === "ERL+") return inputs.erlPlusColor;
  return inputs.erlMinusColor;
}

function kindLabel(kind: IrlErlKind, inputs: IrlErlInputs): string {
  if (kind === "IRL+") return inputs.irlPlusLabel || "IRL+";
  if (kind === "IRL-") return inputs.irlMinusLabel || "IRL-";
  if (kind === "ERL+") return inputs.erlPlusLabel || "ERL+";
  return inputs.erlMinusLabel || "ERL-";
}

function kindLineStyle(kind: IrlErlKind, inputs: IrlErlInputs): number {
  return kind.startsWith("IRL") ? inputs.irlLineStyle : inputs.erlLineStyle;
}

export function irlErlDrawCmds(
  levels: readonly IrlErlLevel[],
  inputs: IrlErlInputs,
): IrlErlDrawCmd[] {
  const cmds: IrlErlDrawCmd[] = [];
  const scales = resolveStructureScales({
    smartScales: inputs.smartScales,
    scalesText: inputs.scalesText,
    single: Math.max(inputs.leftBars, inputs.rightBars),
  });
  const baseFont = Math.max(8, Math.min(24, Math.floor(inputs.fontSize)));
  const baseWidth = Math.max(1, Math.min(4, Math.floor(inputs.lineWidth)));

  for (const lv of levels) {
    if (!kindEnabled(lv.kind, inputs)) continue;
    if (!inputs.showLines && !inputs.showLabels) continue;
    const strength = scaleStrength(lv.scale, scales);
    cmds.push({
      kind: "segment",
      t1: lv.t1,
      p1: lv.price,
      t2: Math.max(lv.t2, lv.t1 + 1),
      p2: lv.price,
      color: kindColor(lv.kind, inputs),
      width: inputs.showLines ? scaleLineWidth(baseWidth, strength) : 1,
      style: Math.max(0, Math.min(2, Math.floor(kindLineStyle(lv.kind, inputs)))),
      text: inputs.showLabels ? kindLabel(lv.kind, inputs) : undefined,
      fontSize: scaleFontSize(baseFont, strength),
      scale: lv.scale,
      levelKind: lv.kind,
    });
  }

  const cap = Math.max(4, Math.min(80, Math.floor(inputs.maxEvents)));
  return cmds.length > cap ? cmds.slice(-cap) : cmds;
}

export function computeIrlErl(
  bars: readonly OrcaBar[],
  inputs: IrlErlInputs,
): IrlErlDrawCmd[] {
  return irlErlDrawCmds(detectIrlErl(bars, inputs), inputs);
}

const LINE_STYLES = [0, 1, 2] as const;

export async function paintIrlErl(
  chart: IChartWidgetApi,
  cmds: readonly IrlErlDrawCmd[],
  options?: { readonly ownerStudyId?: EntityId },
): Promise<EntityId[]> {
  const ids: EntityId[] = [];
  const common = {
    lock: true,
    disableSelection: true,
    disableSave: true,
    disableUndo: true,
    showInObjectsTree: false,
    ownerStudyId: options?.ownerStudyId,
  } as const;

  for (let i = 0; i < cmds.length; i += 1) {
    const cmd = cmds[i]!;
    try {
      const label = (cmd.text ?? "").trim();
      const id = await chart.createMultipointShape(
        [
          { time: cmd.t1 as never, price: cmd.p1 },
          { time: cmd.t2 as never, price: cmd.p2 },
        ],
        {
          ...common,
          shape: "trend_line",
          text: label,
          overrides: {
            linecolor: cmd.color,
            linewidth: Math.max(1, cmd.width || 1),
            linestyle: LINE_STYLES[cmd.style] ?? 0,
            showLabel: label.length > 0,
            text: label,
            textcolor: cmd.color,
            fontsize: cmd.fontSize,
            bold: true,
            // One label at the right end — avoids “ERL+ ERL+ ERL+” along the line.
            horzLabelsAlign: "right",
            vertLabelsAlign: "middle",
            showPrice: false,
            extendLeft: false,
            extendRight: false,
          },
        },
      );
      if (id) ids.push(id);
    } catch {
      /* skip */
    }
    if (i > 0 && i % 6 === 0) {
      await new Promise<void>((r) => {
        window.setTimeout(r, 0);
      });
    }
  }
  return ids;
}
