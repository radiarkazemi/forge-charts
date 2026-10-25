/**
 * Charting Library custom study: “ICT HTF Candles”.
 * Fadi-style higher-timeframe candles beside price. Paint via `useHtfCandlesStudy`.
 */

import type { CustomIndicator } from "@/infrastructure/tradingview";
import { HTF_CANDLES_DEFAULTS, type HtfPreset, type DailyOpenMode } from "@/features/htf-candles/runtime";

export const HTF_CANDLES_STUDY_NAME = "ICT HTF Candles";
export const HTF_CANDLES_STUDY_ID = "IctHtfCandles@tv-basicstudies-1";

export const HTF_CANDLES_STUDY_DEFAULTS = {
  htf: HTF_CANDLES_DEFAULTS.htf,
  candleCount: HTF_CANDLES_DEFAULTS.candleCount,
  paddingBars: HTF_CANDLES_DEFAULTS.paddingBars,
  spacingBars: HTF_CANDLES_DEFAULTS.spacingBars,
  widthBars: HTF_CANDLES_DEFAULTS.widthBars,
  showFvg: HTF_CANDLES_DEFAULTS.showFvg,
  showVi: HTF_CANDLES_DEFAULTS.showVi,
  showTrace: HTF_CANDLES_DEFAULTS.showTrace,
  showLabels: HTF_CANDLES_DEFAULTS.showLabels,
  showTimer: HTF_CANDLES_DEFAULTS.showTimer,
  showHtfName: HTF_CANDLES_DEFAULTS.showHtfName,
  dailyOpenMode: HTF_CANDLES_DEFAULTS.dailyOpenMode,
  timezoneOffset: HTF_CANDLES_DEFAULTS.timezoneOffset,
  bodyTransparency: HTF_CANDLES_DEFAULTS.bodyTransparency,
  bullBody: HTF_CANDLES_DEFAULTS.bullBody,
  bearBody: HTF_CANDLES_DEFAULTS.bearBody,
  border: HTF_CANDLES_DEFAULTS.border,
  bullWick: HTF_CANDLES_DEFAULTS.bullWick,
  bearWick: HTF_CANDLES_DEFAULTS.bearWick,
} as const;

const HTF_OPTIONS: HtfPreset[] = ["5", "15", "30", "60", "240", "1D", "1W", "1M"];
const DAILY_OPEN_OPTIONS: DailyOpenMode[] = ["midnight", "830", "930", "exchange"];

export function createHtfCandlesIndicator(PineJS: {
  Std: { close: (ctx: unknown) => number; na?: (v: number) => boolean };
}): CustomIndicator {
  return {
    name: HTF_CANDLES_STUDY_NAME,
    metainfo: {
      _metainfoVersion: 53,
      id: HTF_CANDLES_STUDY_ID as never,
      name: HTF_CANDLES_STUDY_NAME,
      description: HTF_CANDLES_STUDY_NAME,
      shortDescription: "Fadi HTF Candles",
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
            display: 0,
          },
        },
        inputs: { ...HTF_CANDLES_STUDY_DEFAULTS },
      },
      styles: {
        plot_hidden: { title: "Hidden", histogramBase: 0, isHidden: true },
      },
      inputs: [
        {
          id: "htf",
          name: "HTF · Timeframe (5/15/30/60/240/1D/1W/1M)",
          defval: HTF_CANDLES_STUDY_DEFAULTS.htf,
          type: "text",
          options: HTF_OPTIONS,
        },
        {
          id: "candleCount",
          name: "HTF · Candles to display",
          defval: HTF_CANDLES_STUDY_DEFAULTS.candleCount,
          type: "integer",
          min: 1,
          max: 20,
        },
        {
          id: "paddingBars",
          name: "Layout · Padding from chart (bars)",
          defval: HTF_CANDLES_STUDY_DEFAULTS.paddingBars,
          type: "integer",
          min: 1,
          max: 80,
        },
        {
          id: "spacingBars",
          name: "Layout · Space between candles (bars)",
          defval: HTF_CANDLES_STUDY_DEFAULTS.spacingBars,
          type: "integer",
          min: 0,
          max: 20,
        },
        {
          id: "widthBars",
          name: "Layout · Candle width (bars)",
          defval: HTF_CANDLES_STUDY_DEFAULTS.widthBars,
          type: "integer",
          min: 1,
          max: 20,
        },
        {
          id: "dailyOpenMode",
          name: "Daily open · midnight / 830 / 930 / exchange",
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
        {
          id: "showLabels",
          name: "Label · OHLC prices",
          defval: HTF_CANDLES_STUDY_DEFAULTS.showLabels,
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
          id: "bodyTransparency",
          name: "Style · Body transparency",
          defval: HTF_CANDLES_STUDY_DEFAULTS.bodyTransparency,
          type: "integer",
          min: 0,
          max: 100,
        },
        {
          id: "bullBody",
          name: "Style · Bull body (#hex)",
          defval: HTF_CANDLES_STUDY_DEFAULTS.bullBody,
          type: "text",
        },
        {
          id: "bearBody",
          name: "Style · Bear body (#hex)",
          defval: HTF_CANDLES_STUDY_DEFAULTS.bearBody,
          type: "text",
        },
        {
          id: "border",
          name: "Style · Border (#hex)",
          defval: HTF_CANDLES_STUDY_DEFAULTS.border,
          type: "text",
        },
        {
          id: "bullWick",
          name: "Style · Bull wick (#hex)",
          defval: HTF_CANDLES_STUDY_DEFAULTS.bullWick,
          type: "text",
        },
        {
          id: "bearWick",
          name: "Style · Bear wick (#hex)",
          defval: HTF_CANDLES_STUDY_DEFAULTS.bearWick,
          type: "text",
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
        return Number.isFinite(this._lastClose) ? this._lastClose! : 1;
      };
    } as never,
  };
}
