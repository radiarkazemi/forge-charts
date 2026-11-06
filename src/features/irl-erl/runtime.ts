/**
 * IRL / ERL — Internal & External Range Liquidity (ICT).
 *
 * Built on the same dealing-range legs as Dealing Ranges:
 *   rejected High → major Low (bearish DR) or Low → High (bullish DR).
 *
 * ERL — liquidity resting *outside* the range (stops beyond the extremes):
 *   ERL+ at range high (buy-side) · ERL− at range low (sell-side).
 *
 * IRL — liquidity resting *inside* the range (EQH / EQL clusters):
 *   IRL+ equal highs · IRL− equal lows, strictly between top and bot.
 */

import type { EntityId, IChartWidgetApi } from "@/infrastructure/tradingview";
import {
  computeIctConfirmedRanges,
  MULTI_TF_DR_DEFAULTS,
} from "@/features/dealing-ranges/runtime";
import type { OrcaBar } from "@/features/pine/orca-runtime";
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
  /** Max absolute % of mid-price for two pivots to count as equal. */
  readonly eqTolerancePct: number;
  /** Also mark lone internal swings (not only EQH/EQL). */
  readonly includeSingleSwings: boolean;
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
  maxRanges: 6,
  lookbackDays: 90,
  eqTolerancePct: 0.05,
  includeSingleSwings: false,
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
  maxEvents: 160,
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

function findEqualClusters(
  pivots: readonly Pivot[],
  side: "high" | "low",
  mid: number,
  tolPct: number,
): Array<{ price: number; t1: number; firstIndex: number }> {
  const filtered = pivots.filter((p) => p.kind === side);
  const used = new Set<number>();
  const clusters: Array<{ price: number; t1: number; firstIndex: number }> = [];
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
    clusters.push({ price, t1: first.time, firstIndex: first.index });
  }
  return clusters;
}

function barIndexAtOrAfter(bars: readonly OrcaBar[], t: number): number {
  for (let i = 0; i < bars.length; i += 1) {
    if (bars[i]!.time >= t) return i;
  }
  return bars.length - 1;
}

/**
 * Detect IRL / ERL levels from chart bars.
 * ERL from dealing-range extremes; IRL from EQH/EQL (and optional singles) inside each DR.
 */
export function detectIrlErl(
  bars: readonly OrcaBar[],
  inputs: IrlErlInputs,
): IrlErlLevel[] {
  if (bars.length < 20) return [];
  const lastTime = bars[bars.length - 1]!.time;
  const ranges = computeIctConfirmedRanges(bars, {
    pivotLeft: inputs.leftBars,
    pivotRight: inputs.rightBars,
    breakOnWick: false,
    minRangePct: inputs.minRangePct,
    maxRanges: inputs.maxRanges,
    fromDate: "",
    toDate: "",
    lookbackDays: inputs.lookbackDays,
    requireBosConfirm: false,
    smartScales: inputs.smartScales,
    scalesText: inputs.scalesText,
  });
  if (ranges.length === 0) return [];

  const scales = resolveStructureScales({
    smartScales: inputs.smartScales,
    scalesText: inputs.scalesText,
    single: Math.max(inputs.leftBars, inputs.rightBars),
  });
  // Internal pivots: prefer a slightly tighter scale so EQH/EQL form inside majors.
  const irlScale = Math.max(2, Math.min(...scales, Math.max(inputs.leftBars, inputs.rightBars)));
  const pivots = collectPivots(bars, irlScale, irlScale);

  const levels: IrlErlLevel[] = [];
  const tEndDefault = lastTime;

  for (const dr of ranges) {
    const tEnd = inputs.extendToLast ? Math.max(tEndDefault, dr.t1) : dr.t1;
    const mid = dr.mid > 0 ? dr.mid : (dr.top + dr.bot) / 2;
    const startIdx = barIndexAtOrAfter(bars, dr.t0);
    const endIdx = barIndexAtOrAfter(bars, tEnd);
    const inside = pivots.filter(
      (p) =>
        p.index >= startIdx &&
        p.index <= endIdx &&
        p.price < dr.top &&
        p.price > dr.bot,
    );

    if (inputs.showErlPlus) {
      levels.push({
        kind: "ERL+",
        t1: dr.t0,
        t2: tEnd,
        price: dr.top,
        scale: irlScale,
      });
    }
    if (inputs.showErlMinus) {
      levels.push({
        kind: "ERL-",
        t1: dr.t0,
        t2: tEnd,
        price: dr.bot,
        scale: irlScale,
      });
    }

    if (inputs.showIrlPlus || inputs.showIrlMinus) {
      const eqHighs = findEqualClusters(inside, "high", mid, inputs.eqTolerancePct);
      const eqLows = findEqualClusters(inside, "low", mid, inputs.eqTolerancePct);

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
        const eqHighPrices = new Set(eqHighs.map((c) => c.price));
        const eqLowPrices = new Set(eqLows.map((c) => c.price));
        for (const p of inside) {
          if (p.kind === "high" && inputs.showIrlPlus) {
            if ([...eqHighPrices].some((px) => nearlyEqual(px, p.price, mid, inputs.eqTolerancePct))) {
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
          if (p.kind === "low" && inputs.showIrlMinus) {
            if ([...eqLowPrices].some((px) => nearlyEqual(px, p.price, mid, inputs.eqTolerancePct))) {
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
  }

  // Dedupe near-identical levels (same kind + coarse price + start).
  const byKey = new Map<string, IrlErlLevel>();
  for (const lv of levels) {
    const key = `${lv.kind}|${Math.round(lv.price * 1e5) / 1e5}|${lv.t1}`;
    const prev = byKey.get(key);
    if (!prev || lv.t2 > prev.t2) byKey.set(key, lv);
  }
  return [...byKey.values()].sort((a, b) => a.t1 - b.t1 || a.price - b.price);
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

  const cap = Math.max(10, Math.min(500, Math.floor(inputs.maxEvents)));
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
            horzLabelsAlign: "center",
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
