/**
 * Multi-timeframe Dealing Ranges — Orca-confirmed C1/C2 ranges painted with
 * ICT halves: 0→0.5 discount (green), 0.5→1 premium (red), midline at EQ.
 */

import { intervalSeconds } from "@/domain";
import {
  aggregateHtfBars,
  htfLabel,
  type DailyOpenMode,
  type HtfBar,
  type HtfPreset,
} from "@/features/htf-candles/runtime";
import {
  computeOrcaAnalysis,
  dealingRangesInputs,
  type ConfirmedDealingRange,
  type DealingRangesOptions as BaseDrOptions,
  type DrawCmd,
  type OrcaBar,
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

export interface MultiTfDealingRangesOptions extends BaseDrOptions, DealingRangesStyle {
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
  /** One clean range — avoids overlapping muddy fills. */
  maxRanges: 1,
  lookbackDays: 90,
  fromDate: "",
  toDate: "",
  /** Only 0 / 0.5 / 1 by default (OTE optional). */
  showFibs: false,
  pivotLeft: 1,
  pivotRight: 1,
  extendBars: 12,
  breakOnWick: false,
  showChartTf: true,
  slots: DEFAULT_DR_HTF_SLOTS,
  dailyOpenMode: "midnight",
  timezoneOffset: 0,
  /** TradingView-style green / red halves. */
  discountColor: "#089981",
  premiumColor: "#F23645",
  midColor: "#D1D4DC",
  midWidth: 1,
  showMid: true,
  showZeroOne: true,
  zeroOneColor: "#9598A1",
  /** Level tags on 0 / 0.5 / 1 only — no Premium/Discount pills. */
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

  // Two clean halves — no borders (borders stack into muddy bands).
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

  // 1.0 (top)
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

  // 0.5 (EQ) — always the focal line
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

  // 0 (bottom)
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

  // Optional OTE — off by default; never the primary view.
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

function baseOptsFrom(opts: MultiTfDealingRangesOptions): BaseDrOptions {
  return {
    maxRanges: opts.maxRanges,
    lookbackDays: opts.lookbackDays,
    fromDate: opts.fromDate,
    toDate: opts.toDate,
    showFibs: opts.showFibs,
    pivotLeft: opts.pivotLeft,
    pivotRight: opts.pivotRight,
    extendBars: opts.extendBars,
    breakOnWick: opts.breakOnWick,
  };
}

function rangesForBars(
  bars: readonly OrcaBar[],
  opts: MultiTfDealingRangesOptions,
): ConfirmedDealingRange[] {
  if (bars.length < 20) return [];
  const analysis = computeOrcaAnalysis(bars, dealingRangesInputs(baseOptsFrom(opts)));
  const maxN = Math.max(1, Math.min(20, Math.floor(opts.maxRanges)));
  return analysis.ranges.slice(-maxN);
}

/**
 * Detect Orca DRs on the chart TF and enabled higher TFs; paint ICT halves.
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
      // Prefer stretching to the live edge; otherwise keep detector confirm end.
      const end = opts.extendToLast ? lastT : Math.max(dr.t1, dr.t0 + 1);
      cmds.push(...dealingRangeHalfCmds(dr, opts, { tEnd: end, tfLabel }));
    }
  };

  if (opts.showChartTf) {
    pushRanges(rangesForBars(chartBars, opts), chartTfLabel(chartInterval));
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
    // Only higher TFs — equal/lower would duplicate or invent bars.
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
    pushRanges(rangesForBars(orcaBars, opts), htfLabel(slot.htf));
  }

  return cmds;
}

/** @deprecated Prefer computeMultiTfDealingRanges — kept for call-site clarity. */
export function computeStyledDealingRanges(
  bars: readonly OrcaBar[],
  chartInterval: string,
  opts: MultiTfDealingRangesOptions,
): DrawCmd[] {
  return computeMultiTfDealingRanges(bars, chartInterval, opts);
}
