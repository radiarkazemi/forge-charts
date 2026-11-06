/**
 * Multi-timeframe Dealing Ranges — ICT HH↔LL + BOS confirmation.
 *
 * Bearish: swing HH → later swing LL → BOS below that LL → range HH–LL
 * Bullish: swing LL → later swing HH → BOS above that HH → range LL–HH
 *
 * Intended dealing-range narrative (refine when PDF arrives):
 * After a rejected High, price drives into a major swing Low → dealing range
 * between that H and L; when price revisits ~50% (EQ) expect continuation
 * lower (mirror for uptrend: rejected Low → major High → 50% revisit long).
 *
 * Paint: 0→0.5 green · 0.5→1 red · 0 / 0.5 / 1 levels (OTE optional).
 * Deploy note: cache-bust build 2026-11-06T15:06 Asia/Tehran — rotate hashed asset URLs.
 */

import { intervalSeconds } from "@/domain";
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
  maxRanges: 2,
  lookbackDays: 90,
  fromDate: "",
  toDate: "",
  showFibs: false,
  /** Wider pivots = swings closer to hand-drawn majors. */
  pivotLeft: 3,
  pivotRight: 3,
  extendBars: 12,
  breakOnWick: false,
  /** ~0.25% of mid — kills micro 5m noise on gold/FX. */
  minRangePct: 0.25,
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

interface PendingLeg {
  /** +1 = bullish (LL→HH); -1 = bearish (HH→LL). */
  side: 1 | -1;
  firstPrice: number;
  firstBar: number;
  secondPrice: number;
  secondBar: number;
}

/**
 * ICT dealing ranges confirmed by BOS after the second extreme.
 * Returns chronological ConfirmedDealingRange (oldest → newest).
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
  >,
  nowSec = Math.floor(Date.now() / 1000),
): ConfirmedDealingRange[] {
  const left = Math.max(1, Math.floor(opts.pivotLeft));
  const right = Math.max(1, Math.floor(opts.pivotRight));
  if (bars.length < left + right + 5) return [];

  const toSec = parseDateEndSec(opts.toDate) ?? nowSec;
  const fromSec =
    parseDateStartSec(opts.fromDate) ??
    toSec - Math.max(1, opts.lookbackDays) * 86_400;
  const minPct = Math.max(0, opts.minRangePct);

  let anchorHigh: number | null = null;
  let anchorHighBar: number | null = null;
  let anchorLow: number | null = null;
  let anchorLowBar: number | null = null;
  let pending: PendingLeg | null = null;
  const completed: ConfirmedDealingRange[] = [];

  const confirmPending = (bosBar: number) => {
    if (!pending) return;
    if (bosBar <= pending.secondBar) return;
    const topP = Math.max(pending.firstPrice, pending.secondPrice);
    const botP = Math.min(pending.firstPrice, pending.secondPrice);
    if (!rangeMeetsMinPct(topP, botP, minPct)) {
      pending = null;
      return;
    }
    const mid = (topP + botP) / 2;
    const rng = topP - botP;
    const earlierBar = Math.min(pending.firstBar, pending.secondBar);
    const laterExtreme = Math.max(pending.firstBar, pending.secondBar);
    const t0 = bars[earlierBar]!.time;
    const t1 = bars[bosBar]!.time;
    // Absolute ICT OTE (always measured from premium / high).
    completed.push({
      bullish: pending.side === 1,
      name: pending.side === 1 ? "Bullish DR" : "Bearish DR",
      top: topP,
      bot: botP,
      mid,
      ote618: topP - rng * 0.618,
      ote786: topP - rng * 0.786,
      t0,
      t1,
      confirmBar: bosBar,
    });
    // Seed next leg from the second extreme (continuation structure).
    if (pending.side === -1) {
      anchorLow = pending.secondPrice;
      anchorLowBar = pending.secondBar;
      anchorHigh = null;
      anchorHighBar = null;
    } else {
      anchorHigh = pending.secondPrice;
      anchorHighBar = pending.secondBar;
      anchorLow = null;
      anchorLowBar = null;
    }
    pending = null;
    void laterExtreme;
  };

  for (let i = 0; i < bars.length; i += 1) {
    const bar = bars[i]!;
    const ph = pivotHigh(bars, i, left, right);
    const pl = pivotLow(bars, i, left, right);

    if (ph != null) {
      const shBar = i - right;
      // While waiting for BOS on a bullish pending leg, raise the HH if price prints a higher one.
      if (
        pending != null &&
        pending.side === 1 &&
        shBar > pending.firstBar &&
        ph > pending.secondPrice
      ) {
        pending.secondPrice = ph;
        pending.secondBar = shBar;
      } else if (pending == null) {
        if (anchorHigh == null || ph >= anchorHigh) {
          anchorHigh = ph;
          anchorHighBar = shBar;
        }
        // Bullish candidate: LL → later HH.
        if (
          anchorLow != null &&
          anchorLowBar != null &&
          shBar > anchorLowBar &&
          ph > anchorLow &&
          rangeMeetsMinPct(ph, anchorLow, minPct)
        ) {
          pending = {
            side: 1,
            firstPrice: anchorLow,
            firstBar: anchorLowBar,
            secondPrice: ph,
            secondBar: shBar,
          };
          anchorLow = null;
          anchorLowBar = null;
          anchorHigh = null;
          anchorHighBar = null;
        }
      }
    }

    if (pl != null) {
      const slBar = i - right;
      if (
        pending != null &&
        pending.side === -1 &&
        slBar > pending.firstBar &&
        pl < pending.secondPrice
      ) {
        pending.secondPrice = pl;
        pending.secondBar = slBar;
      } else if (pending == null) {
        if (anchorLow == null || pl <= anchorLow) {
          anchorLow = pl;
          anchorLowBar = slBar;
        }
        // Bearish candidate: HH → later LL.
        if (
          anchorHigh != null &&
          anchorHighBar != null &&
          slBar > anchorHighBar &&
          pl < anchorHigh &&
          rangeMeetsMinPct(anchorHigh, pl, minPct)
        ) {
          pending = {
            side: -1,
            firstPrice: anchorHigh,
            firstBar: anchorHighBar,
            secondPrice: pl,
            secondBar: slBar,
          };
          anchorHigh = null;
          anchorHighBar = null;
          anchorLow = null;
          anchorLowBar = null;
        }
      }
    }

    const useHigh = opts.breakOnWick ? bar.high : bar.close;
    const useLow = opts.breakOnWick ? bar.low : bar.close;

    if (pending && i > pending.secondBar) {
      if (pending.side === -1 && useLow < pending.secondPrice) {
        confirmPending(i);
      } else if (pending.side === 1 && useHigh > pending.secondPrice) {
        confirmPending(i);
      }
    }
  }

  const filtered = completed.filter((r) => r.t1 >= fromSec && r.t1 <= toSec);
  const maxN = Math.max(1, Math.min(20, Math.floor(opts.maxRanges)));
  return filtered.slice(-maxN);
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
