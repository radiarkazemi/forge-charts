/**
 * Charting Library custom study: “Fractal (igor-T)”.
 * Inert plot — swing arrows painted by `useFractalIgorStudy`.
 */

import type { CustomIndicator } from "@/infrastructure/tradingview";
import { FRACTAL_DEFAULTS } from "@/features/fractal/runtime";

export const FRACTAL_IGOR_STUDY_NAME = "Fractal (igor-T)";
export const FRACTAL_IGOR_STUDY_ID = "FractalIgorT@tv-basicstudies-1";

export const FRACTAL_IGOR_STUDY_DEFAULTS = {
  periods: FRACTAL_DEFAULTS.periods,
  showHighs: FRACTAL_DEFAULTS.showHighs,
  showLows: FRACTAL_DEFAULTS.showLows,
  highColor: FRACTAL_DEFAULTS.highColor,
  lowColor: FRACTAL_DEFAULTS.lowColor,
  maxMarkers: FRACTAL_DEFAULTS.maxMarkers,
} as const;

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
      shortDescription: "Fractal · igor-T · Chart Champions",
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
        inputs: { ...FRACTAL_IGOR_STUDY_DEFAULTS },
      },
      styles: {
        plot_hidden: { title: "Hidden", histogramBase: 0 },
      },
      inputs: [
        {
          id: "periods",
          name: "Periods (bars each side)",
          defval: FRACTAL_IGOR_STUDY_DEFAULTS.periods,
          type: "integer",
          min: 1,
          max: 10,
        },
        {
          id: "showHighs",
          name: "Show swing highs (green)",
          defval: FRACTAL_IGOR_STUDY_DEFAULTS.showHighs,
          type: "bool",
        },
        {
          id: "showLows",
          name: "Show swing lows (red)",
          defval: FRACTAL_IGOR_STUDY_DEFAULTS.showLows,
          type: "bool",
        },
        {
          id: "highColor",
          name: "High arrow color",
          defval: FRACTAL_IGOR_STUDY_DEFAULTS.highColor,
          type: "text",
        },
        {
          id: "lowColor",
          name: "Low arrow color",
          defval: FRACTAL_IGOR_STUDY_DEFAULTS.lowColor,
          type: "text",
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
        return [Number.isFinite(this._lastClose) ? this._lastClose! : 1];
      };
    } as never,
  };
}
