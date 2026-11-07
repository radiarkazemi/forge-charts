/**
 * IRL / ERL — Internal & External Range Liquidity (Trading Handbook pt.3).
 *
 * ERL = outer edges of the chosen dealing range (H / L).
 * IRL = levels inside that range; EQH/EQL = equal highs/lows (lesson 3.3).
 * Nested micro-ranges are dropped so only the main DR drives ERL.
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

export type IrlErlKind = "IRL+" | "IRL-" | "EQH" | "EQL" | "ERL+" | "ERL-";

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
  readonly showEqh: boolean;
  readonly showEql: boolean;
  readonly showErlPlus: boolean;
  readonly showErlMinus: boolean;
  readonly showLines: boolean;
  readonly showLabels: boolean;
  readonly extendToLast: boolean;
  readonly irlPlusLabel: string;
  readonly irlMinusLabel: string;
  readonly eqhLabel: string;
  readonly eqlLabel: string;
  readonly erlPlusLabel: string;
  readonly erlMinusLabel: string;
  readonly irlPlusColor: string;
  readonly irlMinusColor: string;
  readonly eqhColor: string;
  readonly eqlColor: string;
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
  /**
   * Handbook: one active dealing range → one ERL+/ERL- pair.
   * Raise only if you want historical prior ranges as well.
   */
  maxRanges: 1,
  lookbackDays: 90,
  hideNested: true,
  /** ~0.2% of mid — real EQH/EQL on FX/gold; 0.05 was too tight → no IRL. */
  eqTolerancePct: 0.2,
  includeSingleSwings: true,
  /** Soft band near ERL edges; 8% was wiping most internal swings. */
  edgeMarginPct: 2,
  showIrlPlus: true,
  showIrlMinus: true,
  showEqh: true,
  showEql: true,
  showErlPlus: true,
  showErlMinus: true,
  showLines: true,
  showLabels: true,
  extendToLast: true,
  irlPlusLabel: "IRL+",
  irlMinusLabel: "IRL-",
  eqhLabel: "EQH",
  eqlLabel: "EQL",
  erlPlusLabel: "ERL+",
  erlMinusLabel: "ERL-",
  irlPlusColor: "#26A69A",
  irlMinusColor: "#AB47BC",
  eqhColor: "#00897B",
  eqlColor: "#8E24AA",
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

/**
 * Prefer larger outer ranges.
 * Drop fully nested micro-ranges and near-nested ones whose height is
 * < 60% of an outer that already contains their mid (handbook: micro
 * edges are IRL of the main DR, not another ERL).
 */
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

  const kept: Array<{ r: ConfirmedDealingRange; height: number }> = [];
  for (const cand of scored) {
    const nested = kept.some((outer) => {
      const outerH = outer.height;
      if (!(outerH > 0)) return false;
      const outerEnd = Math.max(outer.r.t1, tEnd ?? outer.r.t1, outer.r.t0 + 1);
      const timeOverlap =
        cand.r.t0 >= outer.r.t0 - 1 && cand.r.t0 <= outerEnd + 1;
      if (!timeOverlap) return false;
      const fullContain =
        cand.r.top <= outer.r.top + outerH * 0.001 &&
        cand.r.bot >= outer.r.bot - outerH * 0.001;
      if (fullContain && cand.height < outerH * 0.98) return true;
      const mid = (cand.r.top + cand.r.bot) / 2;
      const midInside = mid <= outer.r.top && mid >= outer.r.bot;
      return midInside && cand.height < outerH * 0.6;
    });
    if (!nested) kept.push({ r: cand.r, height: cand.height });
  }
  return kept.map((k) => k.r).sort((a, b) => a.t1 - b.t1);
}

/** Handbook “active” DR: largest that still contains last close (else latest major). */
function pickActiveRanges(
  ranges: readonly ConfirmedDealingRange[],
  lastClose: number,
  maxN: number,
): ConfirmedDealingRange[] {
  if (ranges.length === 0) return [];
  const byHeight = (xs: readonly ConfirmedDealingRange[]) =>
    [...xs].sort(
      (a, b) => b.top - b.bot - (a.top - a.bot) || b.t1 - a.t1,
    );
  const containing = ranges.filter(
    (r) => lastClose <= r.top && lastClose >= r.bot,
  );
  const pool = containing.length > 0 ? containing : ranges;
  return byHeight(pool).slice(0, Math.max(1, Math.min(4, maxN)));
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
      price:
        lv.kind === "ERL+" || lv.kind === "IRL+" || lv.kind === "EQH"
          ? Math.max(prev.price, lv.price)
          : Math.min(prev.price, lv.price),
      scale: Math.max(prev.scale, lv.scale),
    };
  }
  return out.sort((a, b) => a.t1 - b.t1 || a.price - b.price);
}

/**
 * Detect IRL / ERL from chart bars (Trading Handbook pt.3).
 *
 * Active dealing range → ERL at outer H/L.
 * Internal pivots BETWEEN the two extremes (and while price stays in-box)
 * → EQH/EQL + IRL+/IRL-.
 */
export function detectIrlErl(
  bars: readonly OrcaBar[],
  inputs: IrlErlInputs,
): IrlErlLevel[] {
  if (bars.length < 20) return [];
  const lastTime = bars[bars.length - 1]!.time;
  const lastClose = bars[bars.length - 1]!.close;

  // Pull extra candidates then nest-filter + pick the active main range(s).
  const raw = computeIctConfirmedRanges(bars, {
    pivotLeft: inputs.leftBars,
    pivotRight: inputs.rightBars,
    breakOnWick: false,
    minRangePct: inputs.minRangePct,
    maxRanges: Math.max(inputs.maxRanges * 4, 12),
    fromDate: "",
    toDate: "",
    lookbackDays: inputs.lookbackDays,
    requireBosConfirm: false,
    smartScales: inputs.smartScales,
    scalesText: inputs.scalesText,
  });
  if (raw.length === 0) return [];

  const nestFiltered = filterNestedRanges(
    raw,
    inputs.hideNested !== false,
    lastTime,
  );
  const ranges = pickActiveRanges(
    nestFiltered,
    lastClose,
    Math.max(1, Math.min(4, inputs.maxRanges)),
  );
  if (ranges.length === 0) return [];

  const scales = resolveStructureScales({
    smartScales: inputs.smartScales,
    scalesText: inputs.scalesText,
    single: Math.max(inputs.leftBars, inputs.rightBars),
  });
  // Tighter pivot for internal liquidity than the DR legs.
  const irlScale = Math.max(
    2,
    Math.min(
      Math.min(...scales),
      Math.max(2, Math.floor(Math.max(inputs.leftBars, inputs.rightBars) / 2)),
    ),
  );
  const pivots = collectPivots(bars, irlScale, irlScale);

  const levels: IrlErlLevel[] = [];
  let midHint = 0;

  for (const dr of ranges) {
    const tEnd = inputs.extendToLast ? Math.max(lastTime, dr.t1) : dr.t1;
    const mid = dr.mid > 0 ? dr.mid : (dr.top + dr.bot) / 2;
    midHint = mid;
    const height = Math.max(0, dr.top - dr.bot);
    const margin =
      height * (Math.max(0, Math.min(40, inputs.edgeMarginPct)) / 100);
    const startIdx = barIndexAtOrAfter(bars, dr.t0);
    const secondIdx = barIndexAtOrAfter(bars, dr.t1);

    // Extend the internal window while price still interacts with the box.
    let endIdx = secondIdx;
    for (let i = secondIdx; i < bars.length; i += 1) {
      const b = bars[i]!;
      if (b.low <= dr.top && b.high >= dr.bot) endIdx = i;
      else if (!inputs.extendToLast) break;
    }
    if (inputs.extendToLast) endIdx = Math.max(endIdx, bars.length - 1);

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

    const wantInternal =
      inputs.showEqh ||
      inputs.showEql ||
      inputs.showIrlPlus ||
      inputs.showIrlMinus;
    if (!wantInternal || !(height > 0)) continue;

    // Handbook: internal swings form BETWEEN the two extremes (t0…t1),
    // not only after confirmation. Also keep post-confirm pullbacks in-box.
    const inside = pivots.filter((p) => {
      if (p.index <= startIdx || p.index >= endIdx) return false;
      if (p.price > dr.top - margin || p.price < dr.bot + margin) return false;
      // Drop the DR legs themselves (those are ERL).
      if (nearlyEqual(p.price, dr.top, mid, inputs.eqTolerancePct)) return false;
      if (nearlyEqual(p.price, dr.bot, mid, inputs.eqTolerancePct)) return false;
      return true;
    });

    const eqHighs = findEqualClusters(
      inside,
      "high",
      mid,
      inputs.eqTolerancePct,
    );
    const eqLows = findEqualClusters(
      inside,
      "low",
      mid,
      inputs.eqTolerancePct,
    );
    const eqHighSet = eqHighs.map((c) => c.price);
    const eqLowSet = eqLows.map((c) => c.price);

    // Handbook lesson 3.3 — equal highs/lows are first-class internal liquidity.
    if (inputs.showEqh) {
      for (const c of eqHighs) {
        levels.push({
          kind: "EQH",
          t1: c.t1,
          t2: tEnd,
          price: c.price,
          scale: irlScale,
        });
      }
    }
    if (inputs.showEql) {
      for (const c of eqLows) {
        levels.push({
          kind: "EQL",
          t1: c.t1,
          t2: tEnd,
          price: c.price,
          scale: irlScale,
        });
      }
    }

    if (inputs.includeSingleSwings) {
      // Strongest remaining internal swings (not already EQH/EQL).
      const highs = inside
        .filter((p) => p.kind === "high")
        .filter(
          (p) =>
            !eqHighSet.some((px) =>
              nearlyEqual(px, p.price, mid, inputs.eqTolerancePct),
            ),
        )
        .sort((a, b) => b.price - a.price)
        .slice(0, 3);
      const lows = inside
        .filter((p) => p.kind === "low")
        .filter(
          (p) =>
            !eqLowSet.some((px) =>
              nearlyEqual(px, p.price, mid, inputs.eqTolerancePct),
            ),
        )
        .sort((a, b) => a.price - b.price)
        .slice(0, 3);
      if (inputs.showIrlPlus) {
        for (const p of highs) {
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
  if (kind === "EQH") return inputs.showEqh;
  if (kind === "EQL") return inputs.showEql;
  if (kind === "ERL+") return inputs.showErlPlus;
  return inputs.showErlMinus;
}

function kindColor(kind: IrlErlKind, inputs: IrlErlInputs): string {
  if (kind === "IRL+") return inputs.irlPlusColor;
  if (kind === "IRL-") return inputs.irlMinusColor;
  if (kind === "EQH") return inputs.eqhColor;
  if (kind === "EQL") return inputs.eqlColor;
  if (kind === "ERL+") return inputs.erlPlusColor;
  return inputs.erlMinusColor;
}

function kindLabel(kind: IrlErlKind, inputs: IrlErlInputs): string {
  if (kind === "IRL+") return inputs.irlPlusLabel || "IRL+";
  if (kind === "IRL-") return inputs.irlMinusLabel || "IRL-";
  if (kind === "EQH") return inputs.eqhLabel || "EQH";
  if (kind === "EQL") return inputs.eqlLabel || "EQL";
  if (kind === "ERL+") return inputs.erlPlusLabel || "ERL+";
  return inputs.erlMinusLabel || "ERL-";
}

function kindLineStyle(kind: IrlErlKind, inputs: IrlErlInputs): number {
  if (kind.startsWith("ERL")) return inputs.erlLineStyle;
  return inputs.irlLineStyle;
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
