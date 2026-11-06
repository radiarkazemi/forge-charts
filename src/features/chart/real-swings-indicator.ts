/**
 * Charting Library custom study: “Real Swing High/Low”.
 * Inert plot — markers painted by `useRealSwingsStudy`.
 * Colors / visibility / size live in the Style tab (native palette).
 */

import type { CustomIndicator } from "@/infrastructure/tradingview";
import { REAL_SWING_DEFAULTS } from "@/features/real-swings/runtime";
import { buildStylePlots, stylePlotNaNs } from "./study-style-plots";

export const REAL_SWINGS_STUDY_NAME = "Real Swing High/Low";
export const REAL_SWINGS_STUDY_ID = "RealSwingHighLow@tv-basicstudies-1";

/** Style-tab plot ids (read via getStyleValues). */
export const REAL_SWING_STYLE_HIGH = "plot_swing_high";
export const REAL_SWING_STYLE_LOW = "plot_swing_low";

export const REAL_SWINGS_STUDY_DEFAULTS = {
  leftBars: REAL_SWING_DEFAULTS.leftBars,
  rightBars: REAL_SWING_DEFAULTS.rightBars,
  alternateOnly: REAL_SWING_DEFAULTS.alternateOnly,
  minSwingAtr: REAL_SWING_DEFAULTS.minSwingAtr,
  atrLen: REAL_SWING_DEFAULTS.atrLen,
  displayMode: REAL_SWING_DEFAULTS.displayMode,
  highLabel: REAL_SWING_DEFAULTS.highLabel,
  lowLabel: REAL_SWING_DEFAULTS.lowLabel,
  offsetAtr: REAL_SWING_DEFAULTS.offsetAtr,
  maxMarkers: REAL_SWING_DEFAULTS.maxMarkers,
} as const;

const STYLE_SPECS = [
  {
    id: REAL_SWING_STYLE_HIGH,
    title: "Swing High (H)",
    color: REAL_SWING_DEFAULTS.highColor,
    visible: REAL_SWING_DEFAULTS.showHighs,
    transparency: 0,
    linewidth: 2,
    legendHidden: false,
  },
  {
    id: REAL_SWING_STYLE_LOW,
    title: "Swing Low (L)",
    color: REAL_SWING_DEFAULTS.lowColor,
    visible: REAL_SWING_DEFAULTS.showLows,
    transparency: 0,
    linewidth: 2,
    legendHidden: false,
  },
] as const;

const { plots, stylesMeta, stylesDefaults } = buildStylePlots(STYLE_SPECS);

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
      plots,
      defaults: {
        styles: stylesDefaults,
        inputs: { ...REAL_SWINGS_STUDY_DEFAULTS },
      },
      styles: stylesMeta,
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
          id: "displayMode",
          name: "Marker style (0=H/L, 1=Arrows, 2=Both, 3=Triangles, 4=Dots, 5=Badge)",
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
        const out = Number.isFinite(this._lastClose) ? this._lastClose! : 1;
        return [out, ...stylePlotNaNs(STYLE_SPECS.length)];
      };
    } as never,
  };
}
