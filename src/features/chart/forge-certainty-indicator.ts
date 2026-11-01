/**
 * Charting Library custom study: “Forge Certainty”.
 * Inert plot — strict SI+DR signals painted by `useForgeCertaintyStudy`.
 */

import type { CustomIndicator } from "@/infrastructure/tradingview";
import { CERTAINTY_DEFAULTS } from "@/features/certainty/runtime";

export const CERTAINTY_STUDY_NAME = "Forge Certainty";
export const CERTAINTY_STUDY_ID = "ForgeCertainty@tv-basicstudies-1";

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
  bullColor: CERTAINTY_DEFAULTS.bullColor,
  bearColor: CERTAINTY_DEFAULTS.bearColor,
  accentColor: CERTAINTY_DEFAULTS.accentColor,
  longBoxColor: CERTAINTY_DEFAULTS.longBoxColor,
  shortBoxColor: CERTAINTY_DEFAULTS.shortBoxColor,
  boxOpacity: CERTAINTY_DEFAULTS.boxOpacity,
} as const;

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
        inputs: { ...CERTAINTY_STUDY_DEFAULTS },
      },
      styles: {
        plot_hidden: { title: "Hidden", histogramBase: 0 },
      },
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
        {
          id: "bullColor",
          name: "Bull color",
          defval: CERTAINTY_STUDY_DEFAULTS.bullColor,
          type: "text",
        },
        {
          id: "bearColor",
          name: "Bear color",
          defval: CERTAINTY_STUDY_DEFAULTS.bearColor,
          type: "text",
        },
        {
          id: "accentColor",
          name: "Awaiting accent",
          defval: CERTAINTY_STUDY_DEFAULTS.accentColor,
          type: "text",
        },
        {
          id: "longBoxColor",
          name: "Target box color",
          defval: CERTAINTY_STUDY_DEFAULTS.longBoxColor,
          type: "text",
        },
        {
          id: "shortBoxColor",
          name: "Stop box color",
          defval: CERTAINTY_STUDY_DEFAULTS.shortBoxColor,
          type: "text",
        },
        {
          id: "boxOpacity",
          name: "Box opacity %",
          defval: CERTAINTY_STUDY_DEFAULTS.boxOpacity,
          type: "integer",
          min: 8,
          max: 50,
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
