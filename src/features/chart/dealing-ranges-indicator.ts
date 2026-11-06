/**
 * Charting Library custom study: “Dealing Ranges”.
 * Multi-TF Orca DRs painted by `useDealingRangesStudy` with ICT halves
 * (0→0.5 green discount · 0.5→1 red premium · midline at EQ).
 *
 * Colors / visibility / linewidth live in the Style tab (native palette).
 */

import type { CustomIndicator } from "@/infrastructure/tradingview";
import {
  DEFAULT_DR_HTF_SLOTS,
  DR_HTF_SLOT_COUNT,
  MULTI_TF_DR_DEFAULTS,
  type DrHtfPreset,
  type DrHtfSlot,
  type MultiTfDealingRangesOptions,
} from "@/features/dealing-ranges/runtime";
import type { DailyOpenMode } from "@/features/htf-candles/runtime";
import { buildStylePlots, stylePlotNaNs } from "./study-style-plots";

export const DEALING_RANGES_STUDY_NAME = "Dealing Ranges";
/** Bumped to -6 — Style-tab plots + hide-nested (keep larger main DR). */
export const DEALING_RANGES_STUDY_ID = "DealingRanges@tv-basicstudies-6";

export const DR_STYLE_PREMIUM = "plot_premium";
export const DR_STYLE_DISCOUNT = "plot_discount";
export const DR_STYLE_MID = "plot_mid";
export const DR_STYLE_EDGES = "plot_edges";
export const DR_STYLE_FIB618 = "plot_fib618";
export const DR_STYLE_FIB786 = "plot_fib786";

const HTF_OPTIONS: DrHtfPreset[] = ["5", "15", "30", "60", "240", "1D", "1W", "1M"];
const DAILY_OPEN_OPTIONS: DailyOpenMode[] = ["midnight", "830", "930", "exchange"];

function slotDefaults(index: number): DrHtfSlot {
  return DEFAULT_DR_HTF_SLOTS[index] ?? { enable: false, htf: "60" };
}

function buildSlotInputs(index: number): Array<Record<string, unknown>> {
  const d = slotDefaults(index);
  const n = index + 1;
  const group = `HTF ${n}`;
  return [
    { id: `htf${n}Enable`, name: `${group} · Enable`, defval: d.enable, type: "bool" },
    {
      id: `htf${n}`,
      name: `${group} · Timeframe (5/15/30/60/240/1D/1W/1M)`,
      defval: d.htf,
      type: "text",
      options: HTF_OPTIONS,
    },
  ];
}

const slotInputDefaults: Record<string, string | boolean> = {};
for (let i = 0; i < DR_HTF_SLOT_COUNT; i += 1) {
  const d = slotDefaults(i);
  const n = i + 1;
  Object.assign(slotInputDefaults, {
    [`htf${n}Enable`]: d.enable,
    [`htf${n}`]: d.htf,
  });
}

/** Default study inputs (order matches metainfo.inputs). Colors live in Style. */
export const DEALING_RANGES_DEFAULTS = {
  maxRanges: MULTI_TF_DR_DEFAULTS.maxRanges,
  lookbackDays: MULTI_TF_DR_DEFAULTS.lookbackDays,
  fromDate: MULTI_TF_DR_DEFAULTS.fromDate,
  toDate: MULTI_TF_DR_DEFAULTS.toDate,
  showChartTf: MULTI_TF_DR_DEFAULTS.showChartTf,
  ...slotInputDefaults,
  dailyOpenMode: MULTI_TF_DR_DEFAULTS.dailyOpenMode,
  timezoneOffset: MULTI_TF_DR_DEFAULTS.timezoneOffset,
  showLabels: MULTI_TF_DR_DEFAULTS.showLabels,
  extendToLast: MULTI_TF_DR_DEFAULTS.extendToLast,
  pivotLeft: MULTI_TF_DR_DEFAULTS.pivotLeft,
  pivotRight: MULTI_TF_DR_DEFAULTS.pivotRight,
  extendBars: MULTI_TF_DR_DEFAULTS.extendBars,
  breakOnWick: MULTI_TF_DR_DEFAULTS.breakOnWick,
  requireBosConfirm: MULTI_TF_DR_DEFAULTS.requireBosConfirm,
  smartScales: MULTI_TF_DR_DEFAULTS.smartScales,
  scalesText: MULTI_TF_DR_DEFAULTS.scalesText,
  minRangePct: MULTI_TF_DR_DEFAULTS.minRangePct,
  hideNested: MULTI_TF_DR_DEFAULTS.hideNested,
} as const;

const STYLE_SPECS = [
  {
    id: DR_STYLE_PREMIUM,
    title: "Premium 0.5→1",
    color: MULTI_TF_DR_DEFAULTS.premiumColor,
    visible: true,
    // High transparency → light fill (alpha ≈ (100 - t) / 100).
    transparency: 100 - MULTI_TF_DR_DEFAULTS.fillOpacity,
    linewidth: 1,
    legendHidden: false,
  },
  {
    id: DR_STYLE_DISCOUNT,
    title: "Discount 0→0.5",
    color: MULTI_TF_DR_DEFAULTS.discountColor,
    visible: true,
    transparency: 100 - MULTI_TF_DR_DEFAULTS.fillOpacity,
    linewidth: 1,
    legendHidden: false,
  },
  {
    id: DR_STYLE_MID,
    title: "EQ 0.5",
    color: MULTI_TF_DR_DEFAULTS.midColor,
    visible: MULTI_TF_DR_DEFAULTS.showMid,
    transparency: 0,
    linewidth: MULTI_TF_DR_DEFAULTS.midWidth,
    legendHidden: false,
  },
  {
    id: DR_STYLE_EDGES,
    title: "0 / 1.0 edges",
    color: MULTI_TF_DR_DEFAULTS.zeroOneColor,
    visible: MULTI_TF_DR_DEFAULTS.showZeroOne,
    transparency: 0,
    linewidth: 1,
    legendHidden: false,
  },
  {
    id: DR_STYLE_FIB618,
    title: "0.618 OTE",
    color: MULTI_TF_DR_DEFAULTS.fib618Color,
    visible: MULTI_TF_DR_DEFAULTS.showFibs,
    transparency: 0,
    linewidth: 1,
    legendHidden: false,
  },
  {
    id: DR_STYLE_FIB786,
    title: "0.786 OTE",
    color: MULTI_TF_DR_DEFAULTS.fib786Color,
    visible: MULTI_TF_DR_DEFAULTS.showFibs,
    transparency: 0,
    linewidth: 1,
    legendHidden: false,
  },
] as const;

const { plots, stylesMeta, stylesDefaults } = buildStylePlots(STYLE_SPECS);

/** Read HTF 1–4 slots from study input map. */
export function readDrHtfSlotsFromMap(map: Map<string, unknown>): DrHtfSlot[] {
  const slots: DrHtfSlot[] = [];
  for (let i = 0; i < DR_HTF_SLOT_COUNT; i += 1) {
    const n = i + 1;
    const fallback = slotDefaults(i);
    const enableRaw = map.get(`htf${n}Enable`);
    const enable = typeof enableRaw === "boolean" ? enableRaw : fallback.enable;
    const htfRaw = map.get(`htf${n}`);
    const htfStr = typeof htfRaw === "string" && htfRaw.trim() ? htfRaw.trim() : fallback.htf;
    const htf = (HTF_OPTIONS.includes(htfStr as DrHtfPreset) ? htfStr : fallback.htf) as DrHtfPreset;
    slots.push({ enable, htf });
  }
  return slots;
}

export function dealingRangesOptionsFromMap(map: Map<string, unknown>): MultiTfDealingRangesOptions {
  const num = (id: string, fallback: number) => {
    const v = Number(map.get(id));
    return Number.isFinite(v) ? v : fallback;
  };
  const str = (id: string, fallback: string) => {
    const v = map.get(id);
    return typeof v === "string" ? v : fallback;
  };
  const bool = (id: string, fallback: boolean) => {
    const v = map.get(id);
    return typeof v === "boolean" ? v : fallback;
  };
  const d = DEALING_RANGES_DEFAULTS;
  const modeRaw = str("dailyOpenMode", d.dailyOpenMode);
  const dailyOpenMode = (
    DAILY_OPEN_OPTIONS.includes(modeRaw as DailyOpenMode) ? modeRaw : d.dailyOpenMode
  ) as DailyOpenMode;

  // Style defaults (overridden by Style-tab plots in the study hook).
  const style = MULTI_TF_DR_DEFAULTS;

  return {
    maxRanges: Math.max(1, Math.min(20, Math.floor(num("maxRanges", d.maxRanges)))),
    lookbackDays: Math.max(1, Math.min(3650, Math.floor(num("lookbackDays", d.lookbackDays)))),
    fromDate: str("fromDate", d.fromDate),
    toDate: str("toDate", d.toDate),
    showChartTf: bool("showChartTf", d.showChartTf),
    slots: readDrHtfSlotsFromMap(map),
    dailyOpenMode,
    timezoneOffset: Math.max(-12, Math.min(14, Math.floor(num("timezoneOffset", d.timezoneOffset)))),
    showFibs: style.showFibs,
    showMid: style.showMid,
    showZeroOne: style.showZeroOne,
    showPremium: style.showPremium,
    showDiscount: style.showDiscount,
    showLabels: bool("showLabels", d.showLabels),
    extendToLast: bool("extendToLast", d.extendToLast),
    pivotLeft: Math.max(1, Math.min(50, Math.floor(num("pivotLeft", d.pivotLeft)))),
    pivotRight: Math.max(1, Math.min(50, Math.floor(num("pivotRight", d.pivotRight)))),
    extendBars: Math.max(1, Math.min(100, Math.floor(num("extendBars", d.extendBars)))),
    breakOnWick: bool("breakOnWick", d.breakOnWick),
    requireBosConfirm: bool(
      "requireBosConfirm",
      (d as { requireBosConfirm?: boolean }).requireBosConfirm ?? false,
    ),
    smartScales: bool("smartScales", (d as { smartScales?: boolean }).smartScales ?? true),
    scalesText: str(
      "scalesText",
      (d as { scalesText?: string }).scalesText ?? "2,5,10,20,30",
    ),
    minRangePct: Math.max(0, Math.min(5, num("minRangePct", d.minRangePct))),
    hideNested: bool("hideNested", (d as { hideNested?: boolean }).hideNested ?? true),
    discountColor: style.discountColor,
    premiumColor: style.premiumColor,
    midColor: style.midColor,
    midWidth: style.midWidth,
    zeroOneColor: style.zeroOneColor,
    fib618Color: style.fib618Color,
    fib786Color: style.fib786Color,
    fillOpacity: style.fillOpacity,
  };
}

// Charting Library passes PineJS into custom_indicators_getter; we only need Std.close.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createDealingRangesIndicator(PineJS: { Std: { close: (ctx: any) => number } }): CustomIndicator {
  const slotInputs = Array.from({ length: DR_HTF_SLOT_COUNT }, (_, i) => buildSlotInputs(i)).flat();

  return {
    name: DEALING_RANGES_STUDY_NAME,
    metainfo: {
      _metainfoVersion: 53,
      id: DEALING_RANGES_STUDY_ID as never,
      name: DEALING_RANGES_STUDY_NAME,
      description: DEALING_RANGES_STUDY_NAME,
      shortDescription: "ICT DR · HH↔LL · 0/0.5/1 · v5",
      isCustomIndicator: true,
      is_price_study: true,
      linkedToSeries: true,
      format: { type: "inherit" },
      plots,
      defaults: {
        styles: stylesDefaults,
        inputs: { ...DEALING_RANGES_DEFAULTS },
      },
      styles: stylesMeta,
      inputs: [
        {
          id: "maxRanges",
          name: "Ranges per timeframe",
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
          id: "showChartTf",
          name: "Draw on chart timeframe",
          defval: DEALING_RANGES_DEFAULTS.showChartTf,
          type: "bool",
        },
        ...slotInputs,
        {
          id: "dailyOpenMode",
          name: "Daily open · midnight / 830 / 930 / exchange",
          defval: DEALING_RANGES_DEFAULTS.dailyOpenMode,
          type: "text",
          options: DAILY_OPEN_OPTIONS,
        },
        {
          id: "timezoneOffset",
          name: "Timezone · UTC (+/-) for daily open",
          defval: DEALING_RANGES_DEFAULTS.timezoneOffset,
          type: "integer",
          min: -12,
          max: 14,
        },
        {
          id: "showLabels",
          name: "Show level tags (0 / 0.5 / 1)",
          defval: DEALING_RANGES_DEFAULTS.showLabels,
          type: "bool",
        },
        {
          id: "extendToLast",
          name: "Extend ranges to last bar",
          defval: DEALING_RANGES_DEFAULTS.extendToLast,
          type: "bool",
        },
        {
          id: "pivotLeft",
          name: "Pivot left bars (base)",
          defval: DEALING_RANGES_DEFAULTS.pivotLeft,
          type: "integer",
          min: 1,
          max: 50,
        },
        {
          id: "pivotRight",
          name: "Pivot right bars (base)",
          defval: DEALING_RANGES_DEFAULTS.pivotRight,
          type: "integer",
          min: 1,
          max: 50,
        },
        {
          id: "smartScales",
          name: "Smart scales (minor→major DRs at once)",
          defval: DEALING_RANGES_DEFAULTS.smartScales,
          type: "bool",
        },
        {
          id: "scalesText",
          name: "Scales (bars) e.g. 2,5,10,20,30",
          defval: DEALING_RANGES_DEFAULTS.scalesText,
          type: "text",
        },
        {
          id: "hideNested",
          name: "Hide nested ranges (keep larger / main)",
          defval: DEALING_RANGES_DEFAULTS.hideNested,
          type: "bool",
        },
        {
          id: "extendBars",
          name: "Detector extend (HTF bars)",
          defval: DEALING_RANGES_DEFAULTS.extendBars,
          type: "integer",
          min: 1,
          max: 100,
        },
        {
          id: "requireBosConfirm",
          name: "Require BOS after 2nd swing (legacy · off = H↔L confirms)",
          defval: DEALING_RANGES_DEFAULTS.requireBosConfirm,
          type: "bool",
        },
        {
          id: "breakOnWick",
          name: "BOS on wick (only if Require BOS on)",
          defval: DEALING_RANGES_DEFAULTS.breakOnWick,
          type: "bool",
        },
        {
          id: "minRangePct",
          name: "Min range size (% of mid) — filter micro legs",
          defval: DEALING_RANGES_DEFAULTS.minRangePct,
          type: "float",
          min: 0,
          max: 5,
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
        return [out, ...stylePlotNaNs(STYLE_SPECS.length)];
      };
    } as never,
  };
}
