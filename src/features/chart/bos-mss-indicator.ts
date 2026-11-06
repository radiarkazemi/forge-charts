/**
 * Charting Library custom study: “BOS / MSS”.
 * Inert plot — lines/labels painted by `useBosMssStudy`.
 * Colors / visibility / linewidth live in the Style tab (native palette).
 */

import type { CustomIndicator } from "@/infrastructure/tradingview";
import { BOS_MSS_DEFAULTS } from "@/features/bos-mss/runtime";
import { buildStylePlots, stylePlotNaNs } from "./study-style-plots";

export const BOS_MSS_STUDY_NAME = "BOS / MSS";
export const BOS_MSS_STUDY_ID = "BosMssStructure@tv-basicstudies-1";

export const BOS_STYLE_PLUS = "plot_bos_plus";
export const BOS_STYLE_MINUS = "plot_bos_minus";
export const MSS_STYLE_PLUS = "plot_mss_plus";
export const MSS_STYLE_MINUS = "plot_mss_minus";

export const BOS_MSS_STUDY_DEFAULTS = {
  leftBars: BOS_MSS_DEFAULTS.leftBars,
  rightBars: BOS_MSS_DEFAULTS.rightBars,
  breakOnWick: BOS_MSS_DEFAULTS.breakOnWick,
  showLines: BOS_MSS_DEFAULTS.showLines,
  showLabels: BOS_MSS_DEFAULTS.showLabels,
  bosPlusLabel: BOS_MSS_DEFAULTS.bosPlusLabel,
  bosMinusLabel: BOS_MSS_DEFAULTS.bosMinusLabel,
  mssPlusLabel: BOS_MSS_DEFAULTS.mssPlusLabel,
  mssMinusLabel: BOS_MSS_DEFAULTS.mssMinusLabel,
  bosLineStyle: BOS_MSS_DEFAULTS.bosLineStyle,
  mssLineStyle: BOS_MSS_DEFAULTS.mssLineStyle,
  maxEvents: BOS_MSS_DEFAULTS.maxEvents,
} as const;

const STYLE_SPECS = [
  {
    id: BOS_STYLE_PLUS,
    title: "BOS+",
    color: BOS_MSS_DEFAULTS.bosPlusColor,
    visible: BOS_MSS_DEFAULTS.showBosPlus,
    transparency: 0,
    linewidth: BOS_MSS_DEFAULTS.lineWidth,
    legendHidden: false,
  },
  {
    id: BOS_STYLE_MINUS,
    title: "BOS-",
    color: BOS_MSS_DEFAULTS.bosMinusColor,
    visible: BOS_MSS_DEFAULTS.showBosMinus,
    transparency: 0,
    linewidth: BOS_MSS_DEFAULTS.lineWidth,
    legendHidden: false,
  },
  {
    id: MSS_STYLE_PLUS,
    title: "MSS+",
    color: BOS_MSS_DEFAULTS.mssPlusColor,
    visible: BOS_MSS_DEFAULTS.showMssPlus,
    transparency: 0,
    linewidth: BOS_MSS_DEFAULTS.lineWidth,
    legendHidden: false,
  },
  {
    id: MSS_STYLE_MINUS,
    title: "MSS-",
    color: BOS_MSS_DEFAULTS.mssMinusColor,
    visible: BOS_MSS_DEFAULTS.showMssMinus,
    transparency: 0,
    linewidth: BOS_MSS_DEFAULTS.lineWidth,
    legendHidden: false,
  },
] as const;

const { plots, stylesMeta, stylesDefaults } = buildStylePlots(STYLE_SPECS);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createBosMssIndicator(PineJS: {
  Std: { close: (ctx: any) => number };
}): CustomIndicator {
  return {
    name: BOS_MSS_STUDY_NAME,
    metainfo: {
      _metainfoVersion: 53,
      id: BOS_MSS_STUDY_ID as never,
      name: BOS_MSS_STUDY_NAME,
      description: BOS_MSS_STUDY_NAME,
      shortDescription: "BOS+ · BOS- · MSS+ · MSS-",
      isCustomIndicator: true,
      is_price_study: true,
      linkedToSeries: true,
      format: { type: "inherit" },
      plots,
      defaults: {
        styles: stylesDefaults,
        inputs: { ...BOS_MSS_STUDY_DEFAULTS },
      },
      styles: stylesMeta,
      inputs: [
        {
          id: "leftBars",
          name: "Swing left bars",
          defval: BOS_MSS_STUDY_DEFAULTS.leftBars,
          type: "integer",
          min: 1,
          max: 50,
        },
        {
          id: "rightBars",
          name: "Swing right bars",
          defval: BOS_MSS_STUDY_DEFAULTS.rightBars,
          type: "integer",
          min: 1,
          max: 50,
        },
        {
          id: "breakOnWick",
          name: "Break on wick (off = close)",
          defval: BOS_MSS_STUDY_DEFAULTS.breakOnWick,
          type: "bool",
        },
        {
          id: "showLines",
          name: "Show level lines",
          defval: BOS_MSS_STUDY_DEFAULTS.showLines,
          type: "bool",
        },
        {
          id: "showLabels",
          name: "Show labels on line",
          defval: BOS_MSS_STUDY_DEFAULTS.showLabels,
          type: "bool",
        },
        {
          id: "bosPlusLabel",
          name: "BOS+ text",
          defval: BOS_MSS_STUDY_DEFAULTS.bosPlusLabel,
          type: "text",
        },
        {
          id: "bosMinusLabel",
          name: "BOS- text",
          defval: BOS_MSS_STUDY_DEFAULTS.bosMinusLabel,
          type: "text",
        },
        {
          id: "mssPlusLabel",
          name: "MSS+ text",
          defval: BOS_MSS_STUDY_DEFAULTS.mssPlusLabel,
          type: "text",
        },
        {
          id: "mssMinusLabel",
          name: "MSS- text",
          defval: BOS_MSS_STUDY_DEFAULTS.mssMinusLabel,
          type: "text",
        },
        {
          id: "bosLineStyle",
          name: "BOS line style (0 solid · 1 dotted · 2 dashed)",
          defval: BOS_MSS_STUDY_DEFAULTS.bosLineStyle,
          type: "integer",
          min: 0,
          max: 2,
        },
        {
          id: "mssLineStyle",
          name: "MSS line style (0 solid · 1 dotted · 2 dashed)",
          defval: BOS_MSS_STUDY_DEFAULTS.mssLineStyle,
          type: "integer",
          min: 0,
          max: 2,
        },
        {
          id: "maxEvents",
          name: "Max events",
          defval: BOS_MSS_STUDY_DEFAULTS.maxEvents,
          type: "integer",
          min: 10,
          max: 400,
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
