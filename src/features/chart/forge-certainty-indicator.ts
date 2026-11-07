/**
 * Charting Library custom study: “Forge Certainty”.
 * Inert plot — strict SI+DR signals painted by `useForgeCertaintyStudy`.
 * Colors / visibility live in the Style tab (native palette).
 */

import type { CustomIndicator } from "@/infrastructure/tradingview";
import { CERTAINTY_DEFAULTS } from "@/features/certainty/runtime";
import { buildStylePlots, stylePlotNaNs } from "./study-style-plots";

export const CERTAINTY_STUDY_NAME = "Forge Certainty";
/** Bumped to -2 — Style-tab color palettes (no hex Inputs). */
export const CERTAINTY_STUDY_ID = "ForgeCertainty@tv-basicstudies-2";

export const CERT_STYLE_BULL = "plot_bull";
export const CERT_STYLE_BEAR = "plot_bear";
export const CERT_STYLE_ACCENT = "plot_accent";
export const CERT_STYLE_TP = "plot_tp";
export const CERT_STYLE_SL = "plot_sl";

export const CERTAINTY_STUDY_DEFAULTS = {
  biasMode: CERTAINTY_DEFAULTS.biasMode,
  minScore: CERTAINTY_DEFAULTS.minScore,
  targetR: CERTAINTY_DEFAULTS.targetR,
  requireDrBias: CERTAINTY_DEFAULTS.requireDrBias,
  requireEntryHalf: CERTAINTY_DEFAULTS.requireEntryHalf,
  requireOte: CERTAINTY_DEFAULTS.requireOte,
  requireFvg: CERTAINTY_DEFAULTS.requireFvg,
  firstTouchOnly: CERTAINTY_DEFAULTS.firstTouchOnly,
  withTrend: CERTAINTY_DEFAULTS.withTrend,
  cooldownBars: CERTAINTY_DEFAULTS.cooldownBars,
  maxSignals: CERTAINTY_DEFAULTS.maxSignals,
  maxSignalsPerDay: CERTAINTY_DEFAULTS.maxSignalsPerDay,
  showDealingRange: CERTAINTY_DEFAULTS.showDealingRange,
  showZones: CERTAINTY_DEFAULTS.showZones,
  showTradeBox: CERTAINTY_DEFAULTS.showTradeBox,
  showAwaiting: CERTAINTY_DEFAULTS.showAwaiting,
  showHistory: CERTAINTY_DEFAULTS.showHistory,
  showScore: CERTAINTY_DEFAULTS.showScore,
  historyLimit: CERTAINTY_DEFAULTS.historyLimit,
} as const;

const STYLE_SPECS = [
  {
    id: CERT_STYLE_BULL,
    title: "Bull",
    color: CERTAINTY_DEFAULTS.bullColor,
    visible: true,
    transparency: 0,
    linewidth: 2,
    legendHidden: false,
  },
  {
    id: CERT_STYLE_BEAR,
    title: "Bear",
    color: CERTAINTY_DEFAULTS.bearColor,
    visible: true,
    transparency: 0,
    linewidth: 2,
    legendHidden: false,
  },
  {
    id: CERT_STYLE_ACCENT,
    title: "Awaiting accent",
    color: CERTAINTY_DEFAULTS.accentColor,
    visible: true,
    transparency: 0,
    linewidth: 1,
    legendHidden: false,
  },
  {
    id: CERT_STYLE_TP,
    title: "Target box",
    color: CERTAINTY_DEFAULTS.longBoxColor,
    visible: true,
    transparency: 100 - CERTAINTY_DEFAULTS.boxOpacity,
    linewidth: 1,
    legendHidden: false,
  },
  {
    id: CERT_STYLE_SL,
    title: "Stop box",
    color: CERTAINTY_DEFAULTS.shortBoxColor,
    visible: true,
    transparency: 100 - CERTAINTY_DEFAULTS.boxOpacity,
    linewidth: 1,
    legendHidden: false,
  },
] as const;

const { plots, stylesMeta, stylesDefaults } = buildStylePlots(STYLE_SPECS);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createForgeCertaintyIndicator(PineJS: {
  Std: { close: (ctx: any) => number };
}): CustomIndicator {
  return {
    name: CERTAINTY_STUDY_NAME,
    metainfo: {
      _metainfoVersion: 53,
      id: CERTAINTY_STUDY_ID as never,
      name: CERTAINTY_STUDY_NAME,
      description: CERTAINTY_STUDY_NAME,
      shortDescription: "Certainty · SI POI · DR bias · 1:3",
      isCustomIndicator: true,
      is_price_study: true,
      linkedToSeries: true,
      format: { type: "inherit" },
      plots,
      defaults: {
        styles: stylesDefaults,
        inputs: { ...CERTAINTY_STUDY_DEFAULTS },
      },
      styles: stylesMeta,
      inputs: [ // CL input types are string literals at runtime; cast metainfo below.
        {
          id: "biasMode",
          name: "Direction (0=Auto, 1=Long only, 2=Short only)",
          defval: CERTAINTY_STUDY_DEFAULTS.biasMode,
          type: "integer",
          min: 0,
          max: 2,
        },
        {
          id: "minScore",
          name: "Min confirmation score",
          defval: CERTAINTY_STUDY_DEFAULTS.minScore,
          type: "integer",
          min: 50,
          max: 100,
        },
        {
          id: "targetR",
          name: "Target R multiple",
          defval: CERTAINTY_STUDY_DEFAULTS.targetR,
          type: "float",
          min: 1,
          max: 6,
        },
        {
          id: "requireDrBias",
          name: "Require Dealing Range bias match",
          defval: CERTAINTY_STUDY_DEFAULTS.requireDrBias,
          type: "bool",
        },
        {
          id: "requireEntryHalf",
          name: "Require discount/premium entry half",
          defval: CERTAINTY_STUDY_DEFAULTS.requireEntryHalf,
          type: "bool",
        },
        {
          id: "requireOte",
          name: "Require OTE (0.618–0.786) touch",
          defval: CERTAINTY_STUDY_DEFAULTS.requireOte,
          type: "bool",
        },
        {
          id: "requireFvg",
          name: "Prefer FVG POI (SI require FVG)",
          defval: CERTAINTY_STUDY_DEFAULTS.requireFvg,
          type: "bool",
        },
        {
          id: "firstTouchOnly",
          name: "First touch only",
          defval: CERTAINTY_STUDY_DEFAULTS.firstTouchOnly,
          type: "bool",
        },
        {
          id: "withTrend",
          name: "With major trend only",
          defval: CERTAINTY_STUDY_DEFAULTS.withTrend,
          type: "bool",
        },
        {
          id: "cooldownBars",
          name: "Cooldown bars between signals",
          defval: CERTAINTY_STUDY_DEFAULTS.cooldownBars,
          type: "integer",
          min: 0,
          max: 40,
        },
        {
          id: "maxSignals",
          name: "Max signals kept",
          defval: CERTAINTY_STUDY_DEFAULTS.maxSignals,
          type: "integer",
          min: 1,
          max: 24,
        },
        {
          id: "maxSignalsPerDay",
          name: "Max signals / UTC day",
          defval: CERTAINTY_STUDY_DEFAULTS.maxSignalsPerDay,
          type: "integer",
          min: 1,
          max: 12,
        },
        {
          id: "showDealingRange",
          name: "Show Dealing Range backdrop",
          defval: CERTAINTY_STUDY_DEFAULTS.showDealingRange,
          type: "bool",
        },
        {
          id: "showZones",
          name: "Show POI zones",
          defval: CERTAINTY_STUDY_DEFAULTS.showZones,
          type: "bool",
        },
        {
          id: "showTradeBox",
          name: "Show Long/Short Position box",
          defval: CERTAINTY_STUDY_DEFAULTS.showTradeBox,
          type: "bool",
        },
        {
          id: "showAwaiting",
          name: "Show awaiting / touch setups",
          defval: CERTAINTY_STUDY_DEFAULTS.showAwaiting,
          type: "bool",
        },
        {
          id: "showHistory",
          name: "Show resolved history",
          defval: CERTAINTY_STUDY_DEFAULTS.showHistory,
          type: "bool",
        },
        {
          id: "showScore",
          name: "Show score + family tags",
          defval: CERTAINTY_STUDY_DEFAULTS.showScore,
          type: "bool",
        },
        {
          id: "historyLimit",
          name: "SI history depth",
          defval: CERTAINTY_STUDY_DEFAULTS.historyLimit,
          type: "integer",
          min: 2,
          max: 24,
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
