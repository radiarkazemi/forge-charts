/**
 * Charting Library custom study: “Forge Trading Assistant”.
 * Plots are inert — Buy/Sell + Entry/SL/TP painted by
 * `useForgeTradingAssistantStudy` (clean Texas Manual Buy/Sell stop-entry).
 * Colors / visibility live in the Style tab (native palette).
 */

import type { CustomIndicator } from "@/infrastructure/tradingview";
import { FTA_DEFAULTS } from "@/features/trading-assistant/runtime";
import { buildStylePlots, stylePlotNaNs } from "./study-style-plots";

export const FTA_STUDY_NAME = "Forge Trading Assistant";
/** Bumped to -4 — Style-tab color palettes (no hex Inputs). */
export const FTA_STUDY_ID = "ForgeTradingAssistant@tv-basicstudies-4";

export const FTA_STYLE_BULL = "plot_bull";
export const FTA_STYLE_BEAR = "plot_bear";
export const FTA_STYLE_TP = "plot_tp";
export const FTA_STYLE_SL = "plot_sl";

export const FTA_STUDY_DEFAULTS = {
  biasMode: FTA_DEFAULTS.biasMode,
  swingLeft: FTA_DEFAULTS.swingLeft,
  swingRight: FTA_DEFAULTS.swingRight,
  tp1R: FTA_DEFAULTS.tp1R,
  tp2R: FTA_DEFAULTS.tp2R,
  atrLength: FTA_DEFAULTS.atrLength,
  atrSlPad: FTA_DEFAULTS.atrSlPad,
  preferMss: FTA_DEFAULTS.preferMss,
  useOrderBlock: FTA_DEFAULTS.useOrderBlock,
  useFvg: FTA_DEFAULTS.useFvg,
  requireRejection: FTA_DEFAULTS.requireRejection,
  requireDealingRange: FTA_DEFAULTS.requireDealingRange,
  requireTrendAlign: FTA_DEFAULTS.requireTrendAlign,
  requireDrOte: FTA_DEFAULTS.requireDrOte,
  maxSignals: FTA_DEFAULTS.maxSignals,
  maxSignalsPerDay: FTA_DEFAULTS.maxSignalsPerDay,
  cooldownBars: FTA_DEFAULTS.cooldownBars,
  showZones: FTA_DEFAULTS.showZones,
  showDealingRange: FTA_DEFAULTS.showDealingRange,
  showTradeBox: FTA_DEFAULTS.showTradeBox,
  showStructure: FTA_DEFAULTS.showStructure,
  showHistory: FTA_DEFAULTS.showHistory,
} as const;

const STYLE_SPECS = [
  {
    id: FTA_STYLE_BULL,
    title: "Long pill",
    color: FTA_DEFAULTS.bullColor,
    visible: true,
    transparency: 0,
    linewidth: 2,
    legendHidden: false,
  },
  {
    id: FTA_STYLE_BEAR,
    title: "Short pill",
    color: FTA_DEFAULTS.bearColor,
    visible: true,
    transparency: 0,
    linewidth: 2,
    legendHidden: false,
  },
  {
    id: FTA_STYLE_TP,
    title: "Target (TP) zone",
    color: FTA_DEFAULTS.longBoxColor,
    visible: true,
    transparency: 100 - FTA_DEFAULTS.boxOpacity,
    linewidth: 1,
    legendHidden: false,
  },
  {
    id: FTA_STYLE_SL,
    title: "Stop (SL) zone",
    color: FTA_DEFAULTS.shortBoxColor,
    visible: true,
    transparency: 100 - FTA_DEFAULTS.boxOpacity,
    linewidth: 1,
    legendHidden: false,
  },
] as const;

const { plots, stylesMeta, stylesDefaults } = buildStylePlots(STYLE_SPECS);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createForgeTradingAssistantIndicator(PineJS: {
  Std: { close: (ctx: any) => number };
}): CustomIndicator {
  return {
    name: FTA_STUDY_NAME,
    metainfo: {
      _metainfoVersion: 53,
      id: FTA_STUDY_ID as never,
      name: FTA_STUDY_NAME,
      description: FTA_STUDY_NAME,
      shortDescription: "Texas · Manual Buy/Sell · Stop entry",
      isCustomIndicator: true,
      is_price_study: true,
      linkedToSeries: true,
      format: { type: "inherit" },
      plots,
      defaults: {
        styles: stylesDefaults,
        inputs: { ...FTA_STUDY_DEFAULTS },
      },
      styles: stylesMeta,
      inputs: [
        {
          id: "biasMode",
          name: "Direction (0=Auto, 1=Manual Buy, 2=Manual Sell)",
          defval: FTA_STUDY_DEFAULTS.biasMode,
          type: "integer",
          min: 0,
          max: 2,
        },
        {
          id: "swingLeft",
          name: "Swing left bars",
          defval: FTA_STUDY_DEFAULTS.swingLeft,
          type: "integer",
          min: 1,
          max: 8,
        },
        {
          id: "swingRight",
          name: "Swing right bars",
          defval: FTA_STUDY_DEFAULTS.swingRight,
          type: "integer",
          min: 1,
          max: 8,
        },
        {
          id: "tp1R",
          name: "TP1 (R multiple)",
          defval: FTA_STUDY_DEFAULTS.tp1R,
          type: "float",
          min: 0.5,
          max: 4,
        },
        {
          id: "tp2R",
          name: "TP2 (R multiple)",
          defval: FTA_STUDY_DEFAULTS.tp2R,
          type: "float",
          min: 1,
          max: 6,
        },
        {
          id: "atrLength",
          name: "ATR length",
          defval: FTA_STUDY_DEFAULTS.atrLength,
          type: "integer",
          min: 5,
          max: 50,
        },
        {
          id: "atrSlPad",
          name: "SL pad × ATR",
          defval: FTA_STUDY_DEFAULTS.atrSlPad,
          type: "float",
          min: 0,
          max: 2,
        },
        {
          id: "preferMss",
          name: "Prefer MSS (reversal) over BOS",
          defval: FTA_STUDY_DEFAULTS.preferMss,
          type: "bool",
        },
        {
          id: "useOrderBlock",
          name: "Legacy · Order Blocks (off = Texas clean)",
          defval: FTA_STUDY_DEFAULTS.useOrderBlock,
          type: "bool",
        },
        {
          id: "useFvg",
          name: "Legacy · Fair Value Gaps (off = Texas clean)",
          defval: FTA_STUDY_DEFAULTS.useFvg,
          type: "bool",
        },
        {
          id: "requireRejection",
          name: "Legacy · Require rejection candle",
          defval: FTA_STUDY_DEFAULTS.requireRejection,
          type: "bool",
        },
        {
          id: "requireDealingRange",
          name: "Legacy · Require Dealing Range gate",
          defval: FTA_STUDY_DEFAULTS.requireDealingRange,
          type: "bool",
        },
        {
          id: "requireTrendAlign",
          name: "Prefer structure-aligned breaks (Auto)",
          defval: FTA_STUDY_DEFAULTS.requireTrendAlign,
          type: "bool",
        },
        {
          id: "requireDrOte",
          name: "Legacy · Require DR OTE touch",
          defval: FTA_STUDY_DEFAULTS.requireDrOte,
          type: "bool",
        },
        {
          id: "maxSignalsPerDay",
          name: "Max signals / day (UTC)",
          defval: FTA_STUDY_DEFAULTS.maxSignalsPerDay,
          type: "integer",
          min: 1,
          max: 20,
        },
        {
          id: "cooldownBars",
          name: "Cooldown bars between signals",
          defval: FTA_STUDY_DEFAULTS.cooldownBars,
          type: "integer",
          min: 1,
          max: 60,
        },
        {
          id: "maxSignals",
          name: "Max signals drawn",
          defval: FTA_STUDY_DEFAULTS.maxSignals,
          type: "integer",
          min: 1,
          max: 24,
        },
        {
          id: "showTradeBox",
          name: "Show Target/Stop boxes (off keeps BUY/SELL labels)",
          defval: FTA_STUDY_DEFAULTS.showTradeBox,
          type: "bool",
        },
        {
          id: "showDealingRange",
          name: "Show last confirmed Dealing Range",
          defval: FTA_STUDY_DEFAULTS.showDealingRange,
          type: "bool",
        },
        {
          id: "showZones",
          name: "Show OB / FVG zones",
          defval: FTA_STUDY_DEFAULTS.showZones,
          type: "bool",
        },
        {
          id: "showStructure",
          name: "Show BOS / MSS lines",
          defval: FTA_STUDY_DEFAULTS.showStructure,
          type: "bool",
        },
        {
          id: "showHistory",
          name: "Show closed signals (TP/SL)",
          defval: FTA_STUDY_DEFAULTS.showHistory,
          type: "bool",
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
