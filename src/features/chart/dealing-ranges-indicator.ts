/**
 * Charting Library custom study: “Dealing Ranges”.
 * Appears in Indicators. Plots are inert — boxes/lines are painted by
 * `useDealingRangesStudy` using ICT HH→LL (BOS after LL) / LL→HH (BOS after HH).
 */

import type { CustomIndicator } from "@/infrastructure/tradingview";

export const DEALING_RANGES_STUDY_NAME = "Dealing Ranges";
export const DEALING_RANGES_STUDY_ID = "DealingRanges@tv-basicstudies-1";

/** Default study inputs (order matches metainfo.inputs). */
export const DEALING_RANGES_DEFAULTS = {
  /** Keep few major DRs — high counts flood micro HH→LL noise. */
  maxRanges: 3,
  lookbackDays: 60,
  fromDate: "",
  toDate: "",
  showFibs: true,
  /** Wider pivots ≈ swings you would mark by hand. */
  pivotLeft: 3,
  pivotRight: 3,
  extendBars: 8,
  breakOnWick: false,
  /** Ignore tiny legs (percent of mid-price). Gold ~0.4% ≈ major structure. */
  minRangePct: 0.4,
} as const;

// Charting Library passes PineJS into custom_indicators_getter; we only need Std.close.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createDealingRangesIndicator(PineJS: { Std: { close: (ctx: any) => number } }): CustomIndicator {
  return {
    name: DEALING_RANGES_STUDY_NAME,
    metainfo: {
      _metainfoVersion: 53,
      id: DEALING_RANGES_STUDY_ID as never,
      // CL Indicators dialog shows `description` as the script title (not `name`).
      name: DEALING_RANGES_STUDY_NAME,
      description: DEALING_RANGES_STUDY_NAME,
      shortDescription: DEALING_RANGES_STUDY_NAME,
      isCustomIndicator: true,
      is_price_study: true,
      linkedToSeries: true,
      format: { type: "inherit" },
      plots: [{ id: "plot_hidden", type: "line" }],
      defaults: {
        styles: {
          plot_hidden: {
            linestyle: 0,
            linewidth: 1,
            plottype: 0,
            trackPrice: false,
            transparency: 100,
            visible: false,
            color: "#000000",
          },
        },
        inputs: { ...DEALING_RANGES_DEFAULTS },
      },
      styles: {
        plot_hidden: { title: "Hidden", histogramBase: 0 },
      },
      inputs: [
        {
          id: "maxRanges",
          name: "Number of dealing ranges",
          defval: DEALING_RANGES_DEFAULTS.maxRanges,
          type: "integer",
          min: 1,
          max: 20,
        },
        {
          id: "lookbackDays",
          name: "Lookback days (if dates empty)",
          defval: DEALING_RANGES_DEFAULTS.lookbackDays,
          type: "integer",
          min: 1,
          max: 3650,
        },
        {
          id: "fromDate",
          name: "From date (YYYY-MM-DD)",
          defval: DEALING_RANGES_DEFAULTS.fromDate,
          type: "text",
        },
        {
          id: "toDate",
          name: "To date (YYYY-MM-DD)",
          defval: DEALING_RANGES_DEFAULTS.toDate,
          type: "text",
        },
        {
          id: "showFibs",
          name: "Show 0.618 / 0.786 (Premium / EQ / Discount always on)",
          defval: DEALING_RANGES_DEFAULTS.showFibs,
          type: "bool",
        },
        {
          id: "pivotLeft",
          name: "Pivot left bars",
          defval: DEALING_RANGES_DEFAULTS.pivotLeft,
          type: "integer",
          min: 1,
          max: 30,
        },
        {
          id: "pivotRight",
          name: "Pivot right bars",
          defval: DEALING_RANGES_DEFAULTS.pivotRight,
          type: "integer",
          min: 1,
          max: 30,
        },
        {
          id: "extendBars",
          name: "Extend range (bars)",
          defval: DEALING_RANGES_DEFAULTS.extendBars,
          type: "integer",
          min: 1,
          max: 100,
        },
        {
          id: "breakOnWick",
          name: "Break on wick",
          defval: DEALING_RANGES_DEFAULTS.breakOnWick,
          type: "bool",
        },
        {
          id: "minRangePct",
          name: "Min range size (% of price)",
          defval: DEALING_RANGES_DEFAULTS.minRangePct,
          type: "float",
          min: 0.05,
          max: 20,
        },
      ],
    } as never,
    constructor: function (this: {
      main?: (ctx: unknown, input: (i: number) => unknown) => unknown;
      _context?: unknown;
      _lastClose?: number;
    }) {
      this.main = function (ctx: unknown) {
        this._context = ctx;
        // Must return a finite price — NaN/0 on a linked price study collapses
        // the scale and makes the main series candles vanish (looks like “no data”).
        const raw = Number(PineJS.Std.close(this._context));
        const na =
          (PineJS.Std as { na?: (v: number) => boolean }).na?.(raw) ?? !Number.isFinite(raw);
        const v = !na && Number.isFinite(raw) ? raw : (this._lastClose ?? raw);
        if (Number.isFinite(v) && v !== 0) this._lastClose = v;
        const out = Number.isFinite(this._lastClose) ? this._lastClose! : 1;
        return [out];
      };
    } as never,
  };
}
