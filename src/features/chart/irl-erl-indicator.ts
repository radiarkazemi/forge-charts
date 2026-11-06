/**
 * Charting Library custom study: “IRL / ERL”.
 * Inert plot — levels painted by `useIrlErlStudy`.
 * Colors / visibility / linewidth live in the Style tab (native palette).
 */

import type { CustomIndicator } from "@/infrastructure/tradingview";
import { IRL_ERL_DEFAULTS } from "@/features/irl-erl/runtime";
import { buildStylePlots, stylePlotNaNs } from "./study-style-plots";

export const IRL_ERL_STUDY_NAME = "IRL / ERL";
/** Bumped to -2 — main-range ERL only + real IRL + dedupe. */
export const IRL_ERL_STUDY_ID = "IrlErlLiquidity@tv-basicstudies-2";

export const IRL_STYLE_PLUS = "plot_irl_plus";
export const IRL_STYLE_MINUS = "plot_irl_minus";
export const ERL_STYLE_PLUS = "plot_erl_plus";
export const ERL_STYLE_MINUS = "plot_erl_minus";

export const IRL_ERL_STUDY_DEFAULTS = {
  leftBars: IRL_ERL_DEFAULTS.leftBars,
  rightBars: IRL_ERL_DEFAULTS.rightBars,
  smartScales: IRL_ERL_DEFAULTS.smartScales,
  scalesText: IRL_ERL_DEFAULTS.scalesText,
  minRangePct: IRL_ERL_DEFAULTS.minRangePct,
  maxRanges: IRL_ERL_DEFAULTS.maxRanges,
  lookbackDays: IRL_ERL_DEFAULTS.lookbackDays,
  hideNested: IRL_ERL_DEFAULTS.hideNested,
  eqTolerancePct: IRL_ERL_DEFAULTS.eqTolerancePct,
  includeSingleSwings: IRL_ERL_DEFAULTS.includeSingleSwings,
  edgeMarginPct: IRL_ERL_DEFAULTS.edgeMarginPct,
  showLines: IRL_ERL_DEFAULTS.showLines,
  showLabels: IRL_ERL_DEFAULTS.showLabels,
  extendToLast: IRL_ERL_DEFAULTS.extendToLast,
  irlPlusLabel: IRL_ERL_DEFAULTS.irlPlusLabel,
  irlMinusLabel: IRL_ERL_DEFAULTS.irlMinusLabel,
  erlPlusLabel: IRL_ERL_DEFAULTS.erlPlusLabel,
  erlMinusLabel: IRL_ERL_DEFAULTS.erlMinusLabel,
  irlLineStyle: IRL_ERL_DEFAULTS.irlLineStyle,
  erlLineStyle: IRL_ERL_DEFAULTS.erlLineStyle,
  maxEvents: IRL_ERL_DEFAULTS.maxEvents,
} as const;

const STYLE_SPECS = [
  {
    id: IRL_STYLE_PLUS,
    title: "IRL+",
    color: IRL_ERL_DEFAULTS.irlPlusColor,
    visible: IRL_ERL_DEFAULTS.showIrlPlus,
    transparency: 0,
    linewidth: IRL_ERL_DEFAULTS.lineWidth,
    legendHidden: false,
  },
  {
    id: IRL_STYLE_MINUS,
    title: "IRL-",
    color: IRL_ERL_DEFAULTS.irlMinusColor,
    visible: IRL_ERL_DEFAULTS.showIrlMinus,
    transparency: 0,
    linewidth: IRL_ERL_DEFAULTS.lineWidth,
    legendHidden: false,
  },
  {
    id: ERL_STYLE_PLUS,
    title: "ERL+",
    color: IRL_ERL_DEFAULTS.erlPlusColor,
    visible: IRL_ERL_DEFAULTS.showErlPlus,
    transparency: 0,
    linewidth: IRL_ERL_DEFAULTS.lineWidth,
    legendHidden: false,
  },
  {
    id: ERL_STYLE_MINUS,
    title: "ERL-",
    color: IRL_ERL_DEFAULTS.erlMinusColor,
    visible: IRL_ERL_DEFAULTS.showErlMinus,
    transparency: 0,
    linewidth: IRL_ERL_DEFAULTS.lineWidth,
    legendHidden: false,
  },
] as const;

const { plots, stylesMeta, stylesDefaults } = buildStylePlots(STYLE_SPECS);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createIrlErlIndicator(PineJS: {
  Std: { close: (ctx: any) => number };
}): CustomIndicator {
  return {
    name: IRL_ERL_STUDY_NAME,
    metainfo: {
      _metainfoVersion: 53,
      id: IRL_ERL_STUDY_ID as never,
      name: IRL_ERL_STUDY_NAME,
      description: IRL_ERL_STUDY_NAME,
      shortDescription: "IRL+ · IRL- · ERL+ · ERL- · v2",
      isCustomIndicator: true,
      is_price_study: true,
      linkedToSeries: true,
      format: { type: "inherit" },
      plots,
      defaults: {
        styles: stylesDefaults,
        inputs: { ...IRL_ERL_STUDY_DEFAULTS },
      },
      styles: stylesMeta,
      inputs: [
        {
          id: "leftBars",
          name: "Swing left bars",
          defval: IRL_ERL_STUDY_DEFAULTS.leftBars,
          type: "integer",
          min: 1,
          max: 50,
        },
        {
          id: "rightBars",
          name: "Swing right bars",
          defval: IRL_ERL_STUDY_DEFAULTS.rightBars,
          type: "integer",
          min: 1,
          max: 50,
        },
        {
          id: "smartScales",
          name: "Smart scales (minor→major at once)",
          defval: IRL_ERL_STUDY_DEFAULTS.smartScales,
          type: "bool",
        },
        {
          id: "scalesText",
          name: "Scales (bars) e.g. 2,5,10,20,30",
          defval: IRL_ERL_STUDY_DEFAULTS.scalesText,
          type: "text",
        },
        {
          id: "minRangePct",
          name: "Min dealing-range size (% of mid)",
          defval: IRL_ERL_STUDY_DEFAULTS.minRangePct,
          type: "float",
          min: 0,
          max: 5,
        },
        {
          id: "maxRanges",
          name: "Max main ranges (ERL pairs)",
          defval: IRL_ERL_STUDY_DEFAULTS.maxRanges,
          type: "integer",
          min: 1,
          max: 6,
        },
        {
          id: "lookbackDays",
          name: "Lookback days",
          defval: IRL_ERL_STUDY_DEFAULTS.lookbackDays,
          type: "integer",
          min: 1,
          max: 3650,
        },
        {
          id: "hideNested",
          name: "Hide nested ranges (keep larger / main)",
          defval: IRL_ERL_STUDY_DEFAULTS.hideNested,
          type: "bool",
        },
        {
          id: "eqTolerancePct",
          name: "Equal high/low tolerance (% of mid)",
          defval: IRL_ERL_STUDY_DEFAULTS.eqTolerancePct,
          type: "float",
          min: 0,
          max: 1,
        },
        {
          id: "includeSingleSwings",
          name: "IRL includes single internal swings",
          defval: IRL_ERL_STUDY_DEFAULTS.includeSingleSwings,
          type: "bool",
        },
        {
          id: "edgeMarginPct",
          name: "IRL edge margin (% of range · away from ERL)",
          defval: IRL_ERL_STUDY_DEFAULTS.edgeMarginPct,
          type: "float",
          min: 0,
          max: 40,
        },
        {
          id: "extendToLast",
          name: "Extend levels to last bar",
          defval: IRL_ERL_STUDY_DEFAULTS.extendToLast,
          type: "bool",
        },
        {
          id: "showLines",
          name: "Show level lines",
          defval: IRL_ERL_STUDY_DEFAULTS.showLines,
          type: "bool",
        },
        {
          id: "showLabels",
          name: "Show labels on line",
          defval: IRL_ERL_STUDY_DEFAULTS.showLabels,
          type: "bool",
        },
        {
          id: "irlPlusLabel",
          name: "IRL+ text",
          defval: IRL_ERL_STUDY_DEFAULTS.irlPlusLabel,
          type: "text",
        },
        {
          id: "irlMinusLabel",
          name: "IRL- text",
          defval: IRL_ERL_STUDY_DEFAULTS.irlMinusLabel,
          type: "text",
        },
        {
          id: "erlPlusLabel",
          name: "ERL+ text",
          defval: IRL_ERL_STUDY_DEFAULTS.erlPlusLabel,
          type: "text",
        },
        {
          id: "erlMinusLabel",
          name: "ERL- text",
          defval: IRL_ERL_STUDY_DEFAULTS.erlMinusLabel,
          type: "text",
        },
        {
          id: "irlLineStyle",
          name: "IRL line style (0 solid · 1 dotted · 2 dashed)",
          defval: IRL_ERL_STUDY_DEFAULTS.irlLineStyle,
          type: "integer",
          min: 0,
          max: 2,
        },
        {
          id: "erlLineStyle",
          name: "ERL line style (0 solid · 1 dotted · 2 dashed)",
          defval: IRL_ERL_STUDY_DEFAULTS.erlLineStyle,
          type: "integer",
          min: 0,
          max: 2,
        },
        {
          id: "maxEvents",
          name: "Max levels",
          defval: IRL_ERL_STUDY_DEFAULTS.maxEvents,
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
