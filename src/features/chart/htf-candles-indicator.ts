/**
 * Charting Library custom study: “ICT HTF Candles”.
 * Fadi-style: up to 6 HTF candle groups beside price. Paint via `useHtfCandlesStudy`.
 * Colors / transparency live in the Style tab (native palette).
 */

import type { CustomIndicator } from "@/infrastructure/tradingview";
import {
  DEFAULT_HTF_SLOTS,
  HTF_CANDLES_DEFAULTS,
  HTF_SLOT_COUNT,
  type DailyOpenMode,
  type HtfPreset,
  type HtfSlot,
} from "@/features/htf-candles/runtime";
import { buildStylePlots, stylePlotNaNs } from "./study-style-plots";

export const HTF_CANDLES_STUDY_NAME = "ICT HTF Candles";
/** Bumped to -2 — Style-tab color palettes (no hex Inputs). */
export const HTF_CANDLES_STUDY_ID = "IctHtfCandles@tv-basicstudies-2";

export const HTF_STYLE_BULL = "plot_bull_body";
export const HTF_STYLE_BEAR = "plot_bear_body";
export const HTF_STYLE_BORDER = "plot_border";
export const HTF_STYLE_BULL_WICK = "plot_bull_wick";
export const HTF_STYLE_BEAR_WICK = "plot_bear_wick";

const HTF_OPTIONS: HtfPreset[] = ["5", "15", "30", "60", "240", "1D", "1W", "1M"];
const DAILY_OPEN_OPTIONS: DailyOpenMode[] = ["midnight", "830", "930", "exchange"];

function slotDefaults(index: number): HtfSlot {
  return DEFAULT_HTF_SLOTS[index] ?? { enable: false, htf: "60", candleCount: 10 };
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
    {
      id: `htf${n}Count`,
      name: `${group} · Candles to display`,
      defval: d.candleCount,
      type: "integer",
      min: 1,
      max: 40,
    },
  ];
}

const slotInputDefaults: Record<string, string | number | boolean> = {};
for (let i = 0; i < HTF_SLOT_COUNT; i += 1) {
  const d = slotDefaults(i);
  const n = i + 1;
  Object.assign(slotInputDefaults, {
    [`htf${n}Enable`]: d.enable,
    [`htf${n}`]: d.htf,
    [`htf${n}Count`]: d.candleCount,
  });
}

export const HTF_CANDLES_STUDY_DEFAULTS = {
  ...slotInputDefaults,
  limitHtf: HTF_CANDLES_DEFAULTS.limitHtf,
  paddingBars: HTF_CANDLES_DEFAULTS.paddingBars,
  spacingBars: HTF_CANDLES_DEFAULTS.spacingBars,
  groupGapBars: HTF_CANDLES_DEFAULTS.groupGapBars,
  widthBars: HTF_CANDLES_DEFAULTS.widthBars,
  showGroupBackdrop: HTF_CANDLES_DEFAULTS.showGroupBackdrop,
  showFvg: HTF_CANDLES_DEFAULTS.showFvg,
  showVi: HTF_CANDLES_DEFAULTS.showVi,
  showTrace: HTF_CANDLES_DEFAULTS.showTrace,
  showLabels: HTF_CANDLES_DEFAULTS.showLabels,
  showTimer: HTF_CANDLES_DEFAULTS.showTimer,
  showHtfName: HTF_CANDLES_DEFAULTS.showHtfName,
  dailyOpenMode: HTF_CANDLES_DEFAULTS.dailyOpenMode,
  timezoneOffset: HTF_CANDLES_DEFAULTS.timezoneOffset,
} as const;

const STYLE_SPECS = [
  {
    id: HTF_STYLE_BULL,
    title: "Bull body",
    color: HTF_CANDLES_DEFAULTS.bullBody,
    visible: true,
    transparency: HTF_CANDLES_DEFAULTS.bodyTransparency,
    linewidth: 1,
    legendHidden: false,
  },
  {
    id: HTF_STYLE_BEAR,
    title: "Bear body",
    color: HTF_CANDLES_DEFAULTS.bearBody,
    visible: true,
    transparency: HTF_CANDLES_DEFAULTS.bodyTransparency,
    linewidth: 1,
    legendHidden: false,
  },
  {
    id: HTF_STYLE_BORDER,
    title: "Border",
    color: HTF_CANDLES_DEFAULTS.border,
    visible: true,
    transparency: 0,
    linewidth: 1,
    legendHidden: false,
  },
  {
    id: HTF_STYLE_BULL_WICK,
    title: "Bull wick",
    color: HTF_CANDLES_DEFAULTS.bullWick,
    visible: true,
    transparency: 0,
    linewidth: 1,
    legendHidden: false,
  },
  {
    id: HTF_STYLE_BEAR_WICK,
    title: "Bear wick",
    color: HTF_CANDLES_DEFAULTS.bearWick,
    visible: true,
    transparency: 0,
    linewidth: 1,
    legendHidden: false,
  },
] as const;

const { plots, stylesMeta, stylesDefaults } = buildStylePlots(STYLE_SPECS);

/** Read HTF 1–6 slots from study input map (Fadi layout). */
export function readHtfSlotsFromMap(map: Map<string, unknown>): HtfSlot[] {
  const slots: HtfSlot[] = [];
  for (let i = 0; i < HTF_SLOT_COUNT; i += 1) {
    const n = i + 1;
    const fallback = slotDefaults(i);
    const enableRaw = map.get(`htf${n}Enable`);
    const enable = typeof enableRaw === "boolean" ? enableRaw : fallback.enable;
    const htfRaw = map.get(`htf${n}`);
    const htfStr = typeof htfRaw === "string" && htfRaw.trim() ? htfRaw.trim() : fallback.htf;
    const htf = (HTF_OPTIONS.includes(htfStr as HtfPreset) ? htfStr : fallback.htf) as HtfPreset;
    const countRaw = Number(map.get(`htf${n}Count`));
    const candleCount = Number.isFinite(countRaw)
      ? Math.max(1, Math.min(40, Math.floor(countRaw)))
      : fallback.candleCount;
    slots.push({ enable, htf, candleCount });
  }
  return slots;
}

export function createHtfCandlesIndicator(PineJS: {
  Std: { close: (ctx: unknown) => number; na?: (v: number) => boolean };
}): CustomIndicator {
  const slotInputs = Array.from({ length: HTF_SLOT_COUNT }, (_, i) => buildSlotInputs(i)).flat();

  return {
    name: HTF_CANDLES_STUDY_NAME,
    metainfo: {
      _metainfoVersion: 53,
      id: HTF_CANDLES_STUDY_ID as never,
      name: HTF_CANDLES_STUDY_NAME,
      description: HTF_CANDLES_STUDY_NAME,
      shortDescription: "Fadi HTF Candles (6 TF)",
      isCustomIndicator: true,
      is_price_study: true,
      linkedToSeries: true,
      format: { type: "inherit" },
      plots,
      defaults: {
        styles: stylesDefaults,
        inputs: { ...HTF_CANDLES_STUDY_DEFAULTS },
      },
      styles: stylesMeta,
      inputs: [
        ...slotInputs,
        {
          id: "limitHtf",
          name: "Limit to next HTFs only",
          defval: HTF_CANDLES_STUDY_DEFAULTS.limitHtf,
          type: "integer",
          min: 1,
          max: 6,
        },
        {
          id: "dailyOpenMode",
          name: "Custom daily candle open · midnight / 830 / 930 / exchange",
          defval: HTF_CANDLES_STUDY_DEFAULTS.dailyOpenMode,
          type: "text",
          options: DAILY_OPEN_OPTIONS,
        },
        {
          id: "timezoneOffset",
          name: "Timezone · UTC (+/-) for daily open",
          defval: HTF_CANDLES_STUDY_DEFAULTS.timezoneOffset,
          type: "integer",
          min: -12,
          max: 14,
        },
        {
          id: "paddingBars",
          name: "Layout · Padding from current candles",
          defval: HTF_CANDLES_STUDY_DEFAULTS.paddingBars,
          type: "integer",
          min: 1,
          max: 80,
        },
        {
          id: "spacingBars",
          name: "Layout · Space between candles",
          defval: HTF_CANDLES_STUDY_DEFAULTS.spacingBars,
          type: "integer",
          min: 0,
          max: 20,
        },
        {
          id: "groupGapBars",
          name: "Layout · Space between Higher Timeframes",
          defval: HTF_CANDLES_STUDY_DEFAULTS.groupGapBars,
          type: "integer",
          min: 0,
          max: 40,
        },
        {
          id: "widthBars",
          name: "Layout · Candle width",
          defval: HTF_CANDLES_STUDY_DEFAULTS.widthBars,
          type: "integer",
          min: 1,
          max: 20,
        },
        {
          id: "showGroupBackdrop",
          name: "Layout · Group backdrop",
          defval: HTF_CANDLES_STUDY_DEFAULTS.showGroupBackdrop,
          type: "bool",
        },
        {
          id: "showHtfName",
          name: "Label · HTF name",
          defval: HTF_CANDLES_STUDY_DEFAULTS.showHtfName,
          type: "bool",
        },
        {
          id: "showTimer",
          name: "Label · Remaining time",
          defval: HTF_CANDLES_STUDY_DEFAULTS.showTimer,
          type: "bool",
        },
        {
          id: "showLabels",
          name: "Label · OHLC prices",
          defval: HTF_CANDLES_STUDY_DEFAULTS.showLabels,
          type: "bool",
        },
        {
          id: "showFvg",
          name: "Imbalance · Fair Value Gap",
          defval: HTF_CANDLES_STUDY_DEFAULTS.showFvg,
          type: "bool",
        },
        {
          id: "showVi",
          name: "Imbalance · Volume Imbalance",
          defval: HTF_CANDLES_STUDY_DEFAULTS.showVi,
          type: "bool",
        },
        {
          id: "showTrace",
          name: "Trace · OHLC lines to chart",
          defval: HTF_CANDLES_STUDY_DEFAULTS.showTrace,
          type: "bool",
        },
      ],
    } as never,
    constructor: function (this: {
      main?: (ctx: unknown) => unknown;
      _context?: unknown;
      _lastClose?: number;
    }) {
      this.main = function (ctx: unknown) {
        this._context = ctx;
        const raw = Number(PineJS.Std.close(this._context));
        const na = PineJS.Std.na?.(raw) ?? !Number.isFinite(raw);
        const v = !na && Number.isFinite(raw) ? raw : (this._lastClose ?? raw);
        if (Number.isFinite(v) && v !== 0) this._lastClose = v;
        const out = Number.isFinite(this._lastClose) ? this._lastClose! : 1;
        return [out, ...stylePlotNaNs(STYLE_SPECS.length)];
      };
    } as never,
  };
}
