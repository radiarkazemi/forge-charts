/**
 * Charting Library custom study: “Real Swing High/Low”.
 * Inert plot — markers painted by `useRealSwingsStudy`.
 */

import type { CustomIndicator } from "@/infrastructure/tradingview";
import { REAL_SWING_DEFAULTS } from "@/features/real-swings/runtime";

export const REAL_SWINGS_STUDY_NAME = "Real Swing High/Low";
export const REAL_SWINGS_STUDY_ID = "RealSwingHighLow@tv-basicstudies-1";

export const REAL_SWINGS_STUDY_DEFAULTS = {
  leftBars: REAL_SWING_DEFAULTS.leftBars,
  rightBars: REAL_SWING_DEFAULTS.rightBars,
  alternateOnly: REAL_SWING_DEFAULTS.alternateOnly,
  minSwingAtr: REAL_SWING_DEFAULTS.minSwingAtr,
  atrLen: REAL_SWING_DEFAULTS.atrLen,
  showHighs: REAL_SWING_DEFAULTS.showHighs,
  showLows: REAL_SWING_DEFAULTS.showLows,
  displayMode: REAL_SWING_DEFAULTS.displayMode,
  highLabel: REAL_SWING_DEFAULTS.highLabel,
  lowLabel: REAL_SWING_DEFAULTS.lowLabel,
  highColor: REAL_SWING_DEFAULTS.highColor,
  lowColor: REAL_SWING_DEFAULTS.lowColor,
  fontSize: REAL_SWING_DEFAULTS.fontSize,
  offsetAtr: REAL_SWING_DEFAULTS.offsetAtr,
  maxMarkers: REAL_SWING_DEFAULTS.maxMarkers,
} as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createRealSwingsIndicator(PineJS: {
  Std: { close: (ctx: any) => number };
}): CustomIndicator {
  return {
    name: REAL_SWINGS_STUDY_NAME,
    metainfo: {
      _metainfoVersion: 53,
      id: REAL_SWINGS_STUDY_ID as never,
      name: REAL_SWINGS_STUDY_NAME,
      description: REAL_SWINGS_STUDY_NAME,
      shortDescription: "Real swings · H/L · styleable",
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
        inputs: { ...REAL_SWINGS_STUDY_DEFAULTS },
      },
      styles: {
        plot_hidden: { title: "Hidden", histogramBase: 0 },
      },
      inputs: [
        {
          id: "leftBars",
          name: "Left bars (confirm)",
          defval: REAL_SWINGS_STUDY_DEFAULTS.leftBars,
          type: "integer",
          min: 1,
          max: 50,
        },
        {
          id: "rightBars",
          name: "Right bars (confirm)",
          defval: REAL_SWINGS_STUDY_DEFAULTS.rightBars,
          type: "integer",
          min: 1,
          max: 50,
        },
        {
          id: "alternateOnly",
          name: "Alternate only (real structure H↔L)",
          defval: REAL_SWINGS_STUDY_DEFAULTS.alternateOnly,
          type: "bool",
        },
        {
          id: "minSwingAtr",
          name: "Min swing size (× ATR) · 0 = off",
          defval: REAL_SWINGS_STUDY_DEFAULTS.minSwingAtr,
          type: "float",
          min: 0,
          max: 10,
        },
        {
          id: "atrLen",
          name: "ATR length",
          defval: REAL_SWINGS_STUDY_DEFAULTS.atrLen,
          type: "integer",
          min: 2,
          max: 100,
        },
        {
          id: "showHighs",
          name: "Show swing highs",
          defval: REAL_SWINGS_STUDY_DEFAULTS.showHighs,
          type: "bool",
        },
        {
          id: "showLows",
          name: "Show swing lows",
          defval: REAL_SWINGS_STUDY_DEFAULTS.showLows,
          type: "bool",
        },
        {
          id: "displayMode",
          name: "Style (0=Letters, 1=Arrows, 2=Both, 3=Triangles, 4=Dots, 5=Badge)",
          defval: REAL_SWINGS_STUDY_DEFAULTS.displayMode,
          type: "integer",
          min: 0,
          max: 5,
        },
        {
          id: "highLabel",
          name: "High letter / text",
          defval: REAL_SWINGS_STUDY_DEFAULTS.highLabel,
          type: "text",
        },
        {
          id: "lowLabel",
          name: "Low letter / text",
          defval: REAL_SWINGS_STUDY_DEFAULTS.lowLabel,
          type: "text",
        },
        {
          id: "highColor",
          name: "High color (#hex)",
          defval: REAL_SWINGS_STUDY_DEFAULTS.highColor,
          type: "text",
        },
        {
          id: "lowColor",
          name: "Low color (#hex)",
          defval: REAL_SWINGS_STUDY_DEFAULTS.lowColor,
          type: "text",
        },
        {
          id: "fontSize",
          name: "Font / marker size",
          defval: REAL_SWINGS_STUDY_DEFAULTS.fontSize,
          type: "integer",
          min: 8,
          max: 28,
        },
        {
          id: "offsetAtr",
          name: "Label offset (× ATR)",
          defval: REAL_SWINGS_STUDY_DEFAULTS.offsetAtr,
          type: "float",
          min: 0,
          max: 5,
        },
        {
          id: "maxMarkers",
          name: "Max markers",
          defval: REAL_SWINGS_STUDY_DEFAULTS.maxMarkers,
          type: "integer",
          min: 20,
          max: 500,
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
        const raw = Number(PineJS.Std.close(this._context));
        const na =
          (PineJS.Std as { na?: (v: number) => boolean }).na?.(raw) ?? !Number.isFinite(raw);
        const v = !na && Number.isFinite(raw) ? raw : (this._lastClose ?? raw);
        if (Number.isFinite(v) && v !== 0) this._lastClose = v;
        return [Number.isFinite(this._lastClose) ? this._lastClose! : 1];
      };
    } as never,
  };
}
