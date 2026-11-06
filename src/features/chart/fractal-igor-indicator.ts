/**
 * Charting Library custom study: “Fractal (igor-T)”.
 * Inert plot — swing H/L markers painted by `useFractalIgorStudy`.
 * Colors / visibility / size live in the Style tab (native palette).
 */

import type { CustomIndicator } from "@/infrastructure/tradingview";
import { FRACTAL_DEFAULTS } from "@/features/fractal/runtime";
import { buildStylePlots, stylePlotNaNs } from "./study-style-plots";

export const FRACTAL_IGOR_STUDY_NAME = "Fractal (igor-T)";
export const FRACTAL_IGOR_STUDY_ID = "FractalIgorT@tv-basicstudies-1";

/** Style-tab plot ids (read via getStyleValues). */
export const FRACTAL_STYLE_HIGH = "plot_swing_high";
export const FRACTAL_STYLE_LOW = "plot_swing_low";

export const FRACTAL_IGOR_STUDY_DEFAULTS = {
  periods: FRACTAL_DEFAULTS.periods,
  smartScales: FRACTAL_DEFAULTS.smartScales,
  scalesText: FRACTAL_DEFAULTS.scalesText,
  displayMode: FRACTAL_DEFAULTS.displayMode,
  highLabel: FRACTAL_DEFAULTS.highLabel,
  lowLabel: FRACTAL_DEFAULTS.lowLabel,
  offsetAtr: FRACTAL_DEFAULTS.offsetAtr,
  atrLen: FRACTAL_DEFAULTS.atrLen,
  maxMarkers: FRACTAL_DEFAULTS.maxMarkers,
} as const;

const STYLE_SPECS = [
  {
    id: FRACTAL_STYLE_HIGH,
    title: "Swing High (H)",
    color: FRACTAL_DEFAULTS.highColor,
    visible: FRACTAL_DEFAULTS.showHighs,
    transparency: 0,
    linewidth: 2,
    legendHidden: false,
  },
  {
    id: FRACTAL_STYLE_LOW,
    title: "Swing Low (L)",
    color: FRACTAL_DEFAULTS.lowColor,
    visible: FRACTAL_DEFAULTS.showLows,
    transparency: 0,
    linewidth: 2,
    legendHidden: false,
  },
] as const;

const { plots, stylesMeta, stylesDefaults } = buildStylePlots(STYLE_SPECS);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createFractalIgorIndicator(PineJS: {
  Std: { close: (ctx: any) => number };
}): CustomIndicator {
  return {
    name: FRACTAL_IGOR_STUDY_NAME,
    metainfo: {
      _metainfoVersion: 53,
      id: FRACTAL_IGOR_STUDY_ID as never,
      name: FRACTAL_IGOR_STUDY_NAME,
      description: FRACTAL_IGOR_STUDY_NAME,
      shortDescription: "Fractal · H/L · igor-T",
      isCustomIndicator: true,
      is_price_study: true,
      linkedToSeries: true,
      format: { type: "inherit" },
      plots,
      defaults: {
        styles: stylesDefaults,
        inputs: { ...FRACTAL_IGOR_STUDY_DEFAULTS },
      },
      styles: stylesMeta,
      inputs: [
        {
          id: "periods",
          name: "Periods (bars each side)",
          defval: FRACTAL_IGOR_STUDY_DEFAULTS.periods,
          type: "integer",
          min: 1,
          max: 50,
        },
        {
          id: "smartScales",
          name: "Smart scales (minor→major at once)",
          defval: FRACTAL_IGOR_STUDY_DEFAULTS.smartScales,
          type: "bool",
        },
        {
          id: "scalesText",
          name: "Scales (bars) e.g. 2,5,10,20,30",
          defval: FRACTAL_IGOR_STUDY_DEFAULTS.scalesText,
          type: "text",
        },
        {
          id: "displayMode",
          name: "Marker style (0=H/L, 1=Arrows, 2=Both, 3=Triangles, 4=Dots, 5=Badge)",
          defval: FRACTAL_IGOR_STUDY_DEFAULTS.displayMode,
          type: "integer",
          min: 0,
          max: 5,
        },
        {
          id: "highLabel",
          name: "High letter / text",
          defval: FRACTAL_IGOR_STUDY_DEFAULTS.highLabel,
          type: "text",
        },
        {
          id: "lowLabel",
          name: "Low letter / text",
          defval: FRACTAL_IGOR_STUDY_DEFAULTS.lowLabel,
          type: "text",
        },
        {
          id: "offsetAtr",
          name: "Label offset (× ATR)",
          defval: FRACTAL_IGOR_STUDY_DEFAULTS.offsetAtr,
          type: "float",
          min: 0,
          max: 5,
        },
        {
          id: "atrLen",
          name: "ATR length (offset)",
          defval: FRACTAL_IGOR_STUDY_DEFAULTS.atrLen,
          type: "integer",
          min: 2,
          max: 100,
        },
        {
          id: "maxMarkers",
          name: "Max markers",
          defval: FRACTAL_IGOR_STUDY_DEFAULTS.maxMarkers,
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
