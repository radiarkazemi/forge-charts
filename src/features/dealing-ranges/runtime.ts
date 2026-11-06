/**
 * Multi-timeframe Dealing Ranges — rejected swing → opposite major swing.
 *
 * Bearish DR: swing High (rejected) → later major swing Low → range H↔L.
 *   Price revisiting ~50% (EQ) is the dealing area for continuation lower.
 * Bullish DR: swing Low (rejected) → later major swing High → range L↔H.
 *   EQ revisit → continuation higher.
 *
 * Default: range confirms when the second swing prints (no BOS wait).
 * Optional `requireBosConfirm` restores the older “break the 2nd extreme” gate.
 *
 * Paint: 0→0.5 green · 0.5→1 red · 0 / 0.5 / 1 levels (OTE optional).
 */

import { intervalSeconds } from "@/domain";
import {
  DEFAULT_STRUCTURE_SCALES,
  resolveStructureScales,
  scaleStrength,
} from "@/features/chart/structure-scales";
import {
  aggregateHtfBars,
  htfLabel,
  type DailyOpenMode,
  type HtfBar,
  type HtfPreset,
} from "@/features/htf-candles/runtime";
import type {
  ConfirmedDealingRange,
  DrawCmd,
  OrcaBar,
} from "@/features/pine/orca-runtime";

export type DrHtfPreset = HtfPreset;

export const DR_HTF_SLOT_COUNT = 4;

export interface DrHtfSlot {
  readonly enable: boolean;
  readonly htf: DrHtfPreset;
}

export interface DealingRangesStyle {
  /** 0 → 0.5 (discount / lower half). */
  readonly discountColor: string;
  /** 0.5 → 1 (premium / upper half). */
  readonly premiumColor: string;
  readonly midColor: string;
  readonly midWidth: number;
  readonly showMid: boolean;
  readonly showZeroOne: boolean;
  readonly zeroOneColor: string;
  readonly showLabels: boolean;
  readonly showFibs: boolean;
  readonly fib618Color: string;
  readonly fib786Color: string;
  /** Fill opacity 0–100 (lower = lighter). */
  readonly fillOpacity: number;
  /** Stretch each range’s right edge to the last chart bar. */
  readonly extendToLast: boolean;
}

export interface MultiTfDealingRangesOptions extends DealingRangesStyle {
  readonly maxRanges: number;
  readonly lookbackDays: number;
  readonly fromDate: string;
  readonly toDate: string;
  readonly pivotLeft: number;
  readonly pivotRight: number;
  readonly extendBars: number;
  readonly breakOnWick: boolean;
  /**
   * When true, wait for a break of the 2nd extreme before drawing (legacy).
   * Default false — DR forms as soon as rejected H→major L (or L→H) completes.
   */
  readonly requireBosConfirm: boolean;
  /** Run several pivot widths so minor + major DRs show together. */
  readonly smartScales: boolean;
  readonly scalesText: string;
  /**
   * Drop HH↔LL legs smaller than this % of mid-price
   * (filters micro noise so majors match hand-drawn DRs).
   */
  readonly minRangePct: number;
  /** Draw ranges on the chart’s own timeframe. */
  readonly showChartTf: boolean;
  readonly slots: readonly DrHtfSlot[];
  readonly dailyOpenMode: DailyOpenMode;
  readonly timezoneOffset: number;
}

/** Defaults: chart TF on; HTF slots available but off until chosen. */
export const DEFAULT_DR_HTF_SLOTS: readonly DrHtfSlot[] = [
  { enable: false, htf: "15" },
  { enable: false, htf: "60" },
  { enable: false, htf: "240" },
  { enable: false, htf: "1D" },
];

export const MULTI_TF_DR_DEFAULTS: MultiTfDealingRangesOptions = {
  maxRanges: 6,
  lookbackDays: 90,
  fromDate: "",
  toDate: "",
  showFibs: false,
  /** Wider pivots = swings closer to hand-drawn majors. */
  pivotLeft: 5,
  pivotRight: 5,
  extendBars: 12,
  breakOnWick: false,
  requireBosConfirm: false,
  smartScales: true,
  scalesText: DEFAULT_STRUCTURE_SCALES.join(","),
  /** ~0.15% of mid — keep real legs, drop pure noise. */
  minRangePct: 0.15,
  showChartTf: true,
  slots: DEFAULT_DR_HTF_SLOTS,
  dailyOpenMode: "midnight",
  timezoneOffset: 0,
  discountColor: "#089981",
  premiumColor: "#F23645",
  midColor: "#D1D4DC",
  midWidth: 1,
  showMid: true,
  showZeroOne: true,
  zeroOneColor: "#9598A1",
  showLabels: true,
  fib618Color: "#A5D6A7",
  fib786Color: "#4DD0E1",
  fillOpacity: 16,
  extendToLast: true,
};

function normalizeHex(raw: string, fallback: string): string {
  const t = (raw || "").trim();
  if (/^#([0-9a-fA-F]{6})$/.test(t)) return t;
  if (/^#([0-9a-fA-F]{3})$/.test(t)) {
    return `#${t[1]}${t[1]}${t[2]}${t[2]}${t[3]}${t[3]}`;
  }
  if (/^[0-9a-fA-F]{6}$/.test(t)) return `#${t}`;
  return fallback;
}

function htfSeconds(htf: DrHtfPreset): number {
  switch (htf) {
    case "5":
      return 5 * 60;
    case "15":
      return 15 * 60;
    case "30":
      return 30 * 60;
    case "60":
      return 60 * 60;
    case "240":
      return 240 * 60;
    case "1D":
      return 86_400;
    case "1W":
      return 7 * 86_400;
    case "1M":
      return 30 * 86_400;
    default:
      return 60 * 60;
  }
}

function chartTfLabel(interval: string): string {
  const raw = interval.trim().toUpperCase();
  if (/^\d+S$/.test(raw)) return `${Number(raw.slice(0, -1))}s`;
  if (/^\d+D$/.test(raw)) return `${Number(raw.slice(0, -1)) || 1}D`;
  if (/^\d+W$/.test(raw)) return `${Number(raw.slice(0, -1)) || 1}W`;
  if (/^\d+M$/.test(raw)) return `${Number(raw.slice(0, -1)) || 1}M`;
  if (/^\d+$/.test(raw)) {
    const n = Number(raw);
    if (n < 60) return `${n}m`;
    if (n % 60 === 0) return `${n / 60}H`;
    return `${n}m`;
  }
  return raw || "Chart";
}

function pivotHigh(bars: readonly OrcaBar[], i: number, left: number, right: number): number | null {
  const pivotIdx = i - right;
  if (pivotIdx < left || i >= bars.length) return null;
  const h = bars[pivotIdx]!.high;
  for (let j = pivotIdx - left; j <= pivotIdx + right; j += 1) {
    if (j === pivotIdx) continue;
    if (bars[j]!.high >= h) return null;
  }
  return h;
}

function pivotLow(bars: readonly OrcaBar[], i: number, left: number, right: number): number | null {
  const pivotIdx = i - right;
  if (pivotIdx < left || i >= bars.length) return null;
  const l = bars[pivotIdx]!.low;
  for (let j = pivotIdx - left; j <= pivotIdx + right; j += 1) {
    if (j === pivotIdx) continue;
    if (bars[j]!.low <= l) return null;
  }
  return l;
}

function rangeMeetsMinPct(topP: number, botP: number, minRangePct: number): boolean {
  const rng = topP - botP;
  if (!(rng > 0)) return false;
  if (!(minRangePct > 0)) return true;
  const mid = (topP + botP) / 2;
  if (!(mid > 0)) return false;
  return (rng / mid) * 100 >= minRangePct;
}

function parseDateStartSec(iso: string): number | null {
  const t = iso.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  const ms = Date.parse(`${t}T00:00:00Z`);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}

function parseDateEndSec(iso: string): number | null {
  const t = iso.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  const ms = Date.parse(`${t}T23:59:59Z`);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}

interface SwingPivot {
  kind: "high" | "low";
  index: number;
  time: number;
  price: number;
  scale: number;
}

interface PendingLeg {
  /** +1 = bullish (LL→HH); -1 = bearish (HH→LL). */
  side: 1 | -1;
  firstPrice: number;
  firstBar: number;
  secondPrice: number;
  secondBar: number;
  scale: number;
}

function collectSwings(
  bars: readonly OrcaBar[],
  left: number,
  right: number,
  scale: number,
): SwingPivot[] {
  const out: SwingPivot[] = [];
  for (let i = 0; i < bars.length; i += 1) {
    const ph = pivotHigh(bars, i, left, right);
    const pl = pivotLow(bars, i, left, right);
    if (ph != null) {
      out.push({
        kind: "high",
        index: i - right,
        time: bars[i - right]!.time,
        price: ph,
        scale,
      });
    }
    if (pl != null) {
      out.push({
        kind: "low",
        index: i - right,
        time: bars[i - right]!.time,
        price: pl,
        scale,
      });
    }
  }
  out.sort((a, b) => a.index - b.index || (a.kind === "high" ? -1 : 1));
  return out;
}

/** Keep alternating H↔L; same-side keeps the more extreme pivot. */
function alternateSwings(pivots: readonly SwingPivot[]): SwingPivot[] {
  if (pivots.length === 0) return [];
  const out: SwingPivot[] = [];
  for (const p of pivots) {
    const last = out[out.length - 1];
    if (!last) {
      out.push(p);
      continue;
    }
    if (last.kind === p.kind) {
      if (p.kind === "high" && p.price >= last.price) out[out.length - 1] = p;
      if (p.kind === "low" && p.price <= last.price) out[out.length - 1] = p;
      continue;
    }
    out.push(p);
  }
  return out;
}

function makeRange(
  side: 1 | -1,
  firstPrice: number,
  firstBar: number,
  secondPrice: number,
  secondBar: number,
  bars: readonly OrcaBar[],
  confirmBar: number,
): ConfirmedDealingRange {
  const topP = Math.max(firstPrice, secondPrice);
  const botP = Math.min(firstPrice, secondPrice);
  const mid = (topP + botP) / 2;
  const rng = topP - botP;
  const earlierBar = Math.min(firstBar, secondBar);
  return {
    bullish: side === 1,
    name: side === 1 ? "Bullish DR" : "Bearish DR",
    top: topP,
    bot: botP,
    mid,
    ote618: topP - rng * 0.618,
    ote786: topP - rng * 0.786,
    t0: bars[earlierBar]!.time,
    t1: bars[confirmBar]!.time,
    confirmBar,
  };
}

/**
 * Single-scale dealing ranges.
 * Default: rejected High → major Low (or Low → High) confirms the range immediately.
 */
export function computeIctConfirmedRangesAtScale(
  bars: readonly OrcaBar[],
  opts: Pick<
    MultiTfDealingRangesOptions,
    | "breakOnWick"
    | "minRangePct"
    | "requireBosConfirm"
  >,
  left: number,
  right: number,
  scale: number,
): ConfirmedDealingRange[] {
  const L = Math.max(1, Math.min(50, Math.floor(left)));
  const R = Math.max(1, Math.min(50, Math.floor(right)));
  if (bars.length < L + R + 5) return [];

  const swings = alternateSwings(collectSwings(bars, L, R, scale));
  const minPct = Math.max(0, opts.minRangePct);
  const completed: ConfirmedDealingRange[] = [];
  let pending: PendingLeg | null = null;

  const confirmNow = (confirmBar: number) => {
    if (!pending) return;
    if (confirmBar < pending.secondBar) return;
    if (!rangeMeetsMinPct(
      Math.max(pending.firstPrice, pending.secondPrice),
      Math.min(pending.firstPrice, pending.secondPrice),
      minPct,
    )) {
      pending = null;
      return;
    }
    completed.push(
      makeRange(
        pending.side,
        pending.firstPrice,
        pending.firstBar,
        pending.secondPrice,
        pending.secondBar,
        bars,
        confirmBar,
      ),
    );
    pending = null;
  };

  // Build legs from alternating swings (H→L bearish, L→H bullish).
  for (let s = 1; s < swings.length; s += 1) {
    const a = swings[s - 1]!;
    const b = swings[s]!;
    let leg: PendingLeg | null = null;
    if (a.kind === "high" && b.kind === "low" && b.index > a.index && b.price < a.price) {
      if (!rangeMeetsMinPct(a.price, b.price, minPct)) continue;
      leg = {
        side: -1,
        firstPrice: a.price,
        firstBar: a.index,
        secondPrice: b.price,
        secondBar: b.index,
        scale,
      };
    } else if (a.kind === "low" && b.kind === "high" && b.index > a.index && b.price > a.price) {
      if (!rangeMeetsMinPct(b.price, a.price, minPct)) continue;
      leg = {
        side: 1,
        firstPrice: a.price,
        firstBar: a.index,
        secondPrice: b.price,
        secondBar: b.index,
        scale,
      };
    }
    if (!leg) continue;

    if (!opts.requireBosConfirm) {
      pending = leg;
      confirmNow(b.index);
      continue;
    }

    // Legacy: wait for break of the 2nd extreme after the leg forms.
    pending = leg;
    let confirmed = false;
    for (let i = leg.secondBar + 1; i < bars.length; i += 1) {
      const bar = bars[i]!;
      const useHigh = opts.breakOnWick ? bar.high : bar.close;
      const useLow = opts.breakOnWick ? bar.low : bar.close;
      if (leg.side === -1 && useLow < leg.secondPrice) {
        confirmNow(i);
        confirmed = true;
        break;
      }
      if (leg.side === 1 && useHigh > leg.secondPrice) {
        confirmNow(i);
        confirmed = true;
        break;
      }
    }
    if (!confirmed) pending = null;
  }

  return completed;
}

/**
 * ICT dealing ranges — multi-scale minor→major, confirm on H↔L (default).
 */
export function computeIctConfirmedRanges(
  bars: readonly OrcaBar[],
  opts: Pick<
    MultiTfDealingRangesOptions,
    | "pivotLeft"
    | "pivotRight"
    | "breakOnWick"
    | "minRangePct"
    | "maxRanges"
    | "fromDate"
    | "toDate"
    | "lookbackDays"
    | "requireBosConfirm"
    | "smartScales"
    | "scalesText"
  >,
  nowSec = Math.floor(Date.now() / 1000),
): ConfirmedDealingRange[] {
  const toSec = parseDateEndSec(opts.toDate) ?? nowSec;
  const fromSec =
    parseDateStartSec(opts.fromDate) ??
    toSec - Math.max(1, opts.lookbackDays) * 86_400;

  const scales = resolveStructureScales({
    smartScales: opts.smartScales !== false,
    scalesText: opts.scalesText || DEFAULT_STRUCTURE_SCALES.join(","),
    single: Math.max(opts.pivotLeft, opts.pivotRight),
  });

  // Prefer larger-scale (major) ranges when two boxes nearly overlap.
  const byKey = new Map<string, ConfirmedDealingRange & { scale: number }>();
  for (const scale of scales) {
    const tier = computeIctConfirmedRangesAtScale(
      bars,
      opts,
      scale,
      scale,
      scale,
    );
    const strength = scaleStrength(scale, scales);
    for (const dr of tier) {
      // Coarse key so near-identical majors/minors collapse to the major.
      const topK = Math.round(dr.top * 1e5) / 1e5;
      const botK = Math.round(dr.bot * 1e5) / 1e5;
      const key = `${dr.bullish ? "B" : "S"}|${dr.t0}|${topK}|${botK}`;
      const prev = byKey.get(key);
      if (!prev || scale > prev.scale) {
        byKey.set(key, { ...dr, scale });
      }
      void strength;
    }
  }

  const completed = [...byKey.values()]
    .map(({ scale: _s, ...dr }) => dr)
    .filter((r) => r.t1 >= fromSec && r.t1 <= toSec)
    .sort((a, b) => a.t1 - b.t1);

  const maxN = Math.max(1, Math.min(20, Math.floor(opts.maxRanges)));
  return completed.slice(-maxN);
}

/**
 * Paint one confirmed DR — professional ICT box:
 *   • 0 → 0.5 (bot → mid) = green
 *   • 0.5 → 1 (mid → top) = red
 *   • levels drawn: 0 / 0.5 / 1 only (fibs optional)
 */
export function dealingRangeHalfCmds(
  dr: ConfirmedDealingRange,
  style: DealingRangesStyle,
  opts: { readonly tEnd: number; readonly tfLabel: string },
): DrawCmd[] {
  const discount = normalizeHex(style.discountColor, MULTI_TF_DR_DEFAULTS.discountColor);
  const premium = normalizeHex(style.premiumColor, MULTI_TF_DR_DEFAULTS.premiumColor);
  const midColor = normalizeHex(style.midColor, MULTI_TF_DR_DEFAULTS.midColor);
  const edgeColor = normalizeHex(style.zeroOneColor, MULTI_TF_DR_DEFAULTS.zeroOneColor);
  const fib618 = normalizeHex(style.fib618Color, MULTI_TF_DR_DEFAULTS.fib618Color);
  const fib786 = normalizeHex(style.fib786Color, MULTI_TF_DR_DEFAULTS.fib786Color);
  const alpha = Math.max(0.06, Math.min(0.35, Number(style.fillOpacity) / 100));
  const t0 = dr.t0;
  const t2 = Math.max(opts.tEnd, dr.t1, t0 + 1);
  const tf = (opts.tfLabel || "").trim();
  const level = (n: string) => (style.showLabels ? (tf ? `${tf} ${n}` : n) : undefined);
  const cmds: DrawCmd[] = [];

  cmds.push({
    kind: "rect",
    t1: t0,
    p1: dr.top,
    t2,
    p2: dr.mid,
    color: premium,
    fill: premium,
    fillAlpha: alpha,
    borderWidth: 0,
    style: "solid",
  });
  cmds.push({
    kind: "rect",
    t1: t0,
    p1: dr.mid,
    t2,
    p2: dr.bot,
    color: discount,
    fill: discount,
    fillAlpha: alpha,
    borderWidth: 0,
    style: "solid",
  });

  if (style.showZeroOne) {
    cmds.push({
      kind: "line",
      t1: t0,
      p1: dr.top,
      t2,
      p2: dr.top,
      color: edgeColor,
      width: 1,
      style: "solid",
      text: level("1"),
    });
  }

  if (style.showMid) {
    cmds.push({
      kind: "line",
      t1: t0,
      p1: dr.mid,
      t2,
      p2: dr.mid,
      color: midColor,
      width: Math.max(1, Math.min(3, Math.floor(style.midWidth))),
      style: "dashed",
      text: level("0.5"),
    });
  }

  if (style.showZeroOne) {
    cmds.push({
      kind: "line",
      t1: t0,
      p1: dr.bot,
      t2,
      p2: dr.bot,
      color: edgeColor,
      width: 1,
      style: "solid",
      text: level("0"),
    });
  }

  if (style.showFibs) {
    cmds.push({
      kind: "line",
      t1: t0,
      p1: dr.ote618,
      t2,
      p2: dr.ote618,
      color: fib618,
      width: 1,
      style: "dotted",
      text: style.showLabels ? "0.618" : undefined,
    });
    cmds.push({
      kind: "line",
      t1: t0,
      p1: dr.ote786,
      t2,
      p2: dr.ote786,
      color: fib786,
      width: 1,
      style: "dotted",
      text: style.showLabels ? "0.786" : undefined,
    });
  }

  return cmds;
}

/**
 * Detect ICT DRs on the chart TF and enabled higher TFs; paint green/red halves.
 */
export function computeMultiTfDealingRanges(
  chartBars: readonly OrcaBar[],
  chartInterval: string,
  opts: MultiTfDealingRangesOptions,
): DrawCmd[] {
  if (chartBars.length < 20) return [];
  const chartSec = intervalSeconds(chartInterval);
  const lastT = chartBars[chartBars.length - 1]!.time;
  const cmds: DrawCmd[] = [];

  const pushRanges = (ranges: readonly ConfirmedDealingRange[], tfLabel: string) => {
    for (const dr of ranges) {
      const end = opts.extendToLast ? lastT : Math.max(dr.t1, dr.t0 + 1);
      cmds.push(...dealingRangeHalfCmds(dr, opts, { tEnd: end, tfLabel }));
    }
  };

  if (opts.showChartTf) {
    pushRanges(computeIctConfirmedRanges(chartBars, opts), chartTfLabel(chartInterval));
  }

  const asHtf: HtfBar[] = chartBars.map((b) => ({
    time: b.time,
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
    volume: b.volume ?? 0,
  }));

  const seen = new Set<number>();
  if (opts.showChartTf) seen.add(chartSec);

  for (const slot of opts.slots) {
    if (!slot.enable) continue;
    const sec = htfSeconds(slot.htf);
    if (sec <= chartSec) continue;
    if (seen.has(sec)) continue;
    seen.add(sec);

    const htfBars = aggregateHtfBars(
      asHtf,
      slot.htf,
      opts.dailyOpenMode,
      opts.timezoneOffset,
    );
    if (htfBars.length < 20) continue;
    const orcaBars: OrcaBar[] = htfBars.map((b) => ({
      time: b.time,
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
      volume: b.volume,
    }));
    pushRanges(computeIctConfirmedRanges(orcaBars, opts), htfLabel(slot.htf));
  }

  return cmds;
}

export function computeStyledDealingRanges(
  bars: readonly OrcaBar[],
  chartInterval: string,
  opts: MultiTfDealingRangesOptions,
): DrawCmd[] {
  return computeMultiTfDealingRanges(bars, chartInterval, opts);
}
