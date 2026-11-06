/**
 * Charting Library custom study: “Dealing Ranges”.
 * Multi-TF Orca DRs painted by `useDealingRangesStudy` with ICT halves
 * (0→0.5 green discount · 0.5→1 red premium · midline at EQ).
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

export const DEALING_RANGES_STUDY_NAME = "Dealing Ranges";
/** Bumped to -5 — rejected H→major L (confirm on swing pair, smart scales). */
export const DEALING_RANGES_STUDY_ID = "DealingRanges@tv-basicstudies-5";

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

/** Default study inputs (order matches metainfo.inputs). */
export const DEALING_RANGES_DEFAULTS = {
  maxRanges: MULTI_TF_DR_DEFAULTS.maxRanges,
  lookbackDays: MULTI_TF_DR_DEFAULTS.lookbackDays,
  fromDate: MULTI_TF_DR_DEFAULTS.fromDate,
  toDate: MULTI_TF_DR_DEFAULTS.toDate,
  showChartTf: MULTI_TF_DR_DEFAULTS.showChartTf,
  ...slotInputDefaults,
  dailyOpenMode: MULTI_TF_DR_DEFAULTS.dailyOpenMode,
  timezoneOffset: MULTI_TF_DR_DEFAULTS.timezoneOffset,
  showFibs: MULTI_TF_DR_DEFAULTS.showFibs,
  showMid: MULTI_TF_DR_DEFAULTS.showMid,
  showZeroOne: MULTI_TF_DR_DEFAULTS.showZeroOne,
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
  discountColor: MULTI_TF_DR_DEFAULTS.discountColor,
  premiumColor: MULTI_TF_DR_DEFAULTS.premiumColor,
  midColor: MULTI_TF_DR_DEFAULTS.midColor,
  midWidth: MULTI_TF_DR_DEFAULTS.midWidth,
  zeroOneColor: MULTI_TF_DR_DEFAULTS.zeroOneColor,
  fib618Color: MULTI_TF_DR_DEFAULTS.fib618Color,
  fib786Color: MULTI_TF_DR_DEFAULTS.fib786Color,
  fillOpacity: MULTI_TF_DR_DEFAULTS.fillOpacity,
} as const;

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

  return {
    maxRanges: Math.max(1, Math.min(20, Math.floor(num("maxRanges", d.maxRanges)))),
    lookbackDays: Math.max(1, Math.min(3650, Math.floor(num("lookbackDays", d.lookbackDays)))),
    fromDate: str("fromDate", d.fromDate),
    toDate: str("toDate", d.toDate),
    showChartTf: bool("showChartTf", d.showChartTf),
    slots: readDrHtfSlotsFromMap(map),
    dailyOpenMode,
    timezoneOffset: Math.max(-12, Math.min(14, Math.floor(num("timezoneOffset", d.timezoneOffset)))),
    showFibs: bool("showFibs", d.showFibs),
    showMid: bool("showMid", d.showMid),
    showZeroOne: bool("showZeroOne", d.showZeroOne),
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
    discountColor: str("discountColor", d.discountColor),
    premiumColor: str("premiumColor", d.premiumColor),
    midColor: str("midColor", d.midColor),
    midWidth: Math.max(1, Math.min(4, Math.floor(num("midWidth", d.midWidth)))),
    zeroOneColor: str("zeroOneColor", d.zeroOneColor),
    fib618Color: str("fib618Color", d.fib618Color),
    fib786Color: str("fib786Color", d.fib786Color),
    fillOpacity: Math.max(4, Math.min(40, Math.floor(num("fillOpacity", d.fillOpacity)))),
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
      shortDescription: "ICT DR · HH↔LL+BOS · 0/0.5/1 · v4",
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
          id: "showMid",
          name: "Show middle (0.5 / EQ)",
          defval: DEALING_RANGES_DEFAULTS.showMid,
          type: "bool",
        },
        {
          id: "showZeroOne",
          name: "Show 0 / 1.0 edges",
          defval: DEALING_RANGES_DEFAULTS.showZeroOne,
          type: "bool",
        },
        {
          id: "showFibs",
          name: "Show 0.618 / 0.786 OTE (off = 0 / 0.5 / 1 only)",
          defval: DEALING_RANGES_DEFAULTS.showFibs,
          type: "bool",
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
        {
          id: "discountColor",
          name: "Style · 0–0.5 green (#hex)",
          defval: DEALING_RANGES_DEFAULTS.discountColor,
          type: "text",
        },
        {
          id: "premiumColor",
          name: "Style · 0.5–1 red (#hex)",
          defval: DEALING_RANGES_DEFAULTS.premiumColor,
          type: "text",
        },
        {
          id: "midColor",
          name: "Style · 0.5 middle line (#hex)",
          defval: DEALING_RANGES_DEFAULTS.midColor,
          type: "text",
        },
        {
          id: "midWidth",
          name: "Style · Middle line width",
          defval: DEALING_RANGES_DEFAULTS.midWidth,
          type: "integer",
          min: 1,
          max: 4,
        },
        {
          id: "zeroOneColor",
          name: "Style · 0 / 1.0 edges (#hex)",
          defval: DEALING_RANGES_DEFAULTS.zeroOneColor,
          type: "text",
        },
        {
          id: "fib618Color",
          name: "Style · 0.618 (#hex)",
          defval: DEALING_RANGES_DEFAULTS.fib618Color,
          type: "text",
        },
        {
          id: "fib786Color",
          name: "Style · 0.786 (#hex)",
          defval: DEALING_RANGES_DEFAULTS.fib786Color,
          type: "text",
        },
        {
          id: "fillOpacity",
          name: "Style · Half fill opacity % (lower = lighter)",
          defval: DEALING_RANGES_DEFAULTS.fillOpacity,
          type: "integer",
          min: 4,
          max: 40,
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
