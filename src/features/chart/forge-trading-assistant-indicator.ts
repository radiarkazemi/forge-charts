/**
 * Charting Library custom study: “Forge Trading Assistant”.
 * Plots are inert — Buy/Sell + Entry/SL/TP painted by
 * `useForgeTradingAssistantStudy` (Texas-inspired Manual Buy/Sell bias).
 */

import type { CustomIndicator } from "@/infrastructure/tradingview";
import { FTA_DEFAULTS } from "@/features/trading-assistant/runtime";

export const FTA_STUDY_NAME = "Forge Trading Assistant";
export const FTA_STUDY_ID = "ForgeTradingAssistant@tv-basicstudies-1";

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
  maxSignals: FTA_DEFAULTS.maxSignals,
  maxSignalsPerDay: FTA_DEFAULTS.maxSignalsPerDay,
  cooldownBars: FTA_DEFAULTS.cooldownBars,
  showZones: FTA_DEFAULTS.showZones,
  showTradeBox: FTA_DEFAULTS.showTradeBox,
  showStructure: FTA_DEFAULTS.showStructure,
  showHistory: FTA_DEFAULTS.showHistory,
  bullColor: FTA_DEFAULTS.bullColor,
  bearColor: FTA_DEFAULTS.bearColor,
  longBoxColor: FTA_DEFAULTS.longBoxColor,
  shortBoxColor: FTA_DEFAULTS.shortBoxColor,
  boxOpacity: FTA_DEFAULTS.boxOpacity,
} as const;

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
      shortDescription: "Forge TA · SELL/BUY pills · TP/SL",
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
        inputs: { ...FTA_STUDY_DEFAULTS },
      },
      styles: {
        plot_hidden: { title: "Hidden", histogramBase: 0 },
      },
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
          name: "Use Order Blocks",
          defval: FTA_STUDY_DEFAULTS.useOrderBlock,
          type: "bool",
        },
        {
          id: "useFvg",
          name: "Use Fair Value Gaps",
          defval: FTA_STUDY_DEFAULTS.useFvg,
          type: "bool",
        },
        {
          id: "requireRejection",
          name: "Require rejection candle",
          defval: FTA_STUDY_DEFAULTS.requireRejection,
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
          name: "Show risk/reward trade box",
          defval: FTA_STUDY_DEFAULTS.showTradeBox,
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
        {
          id: "bullColor",
          name: "Style · Long pill (#hex)",
          defval: FTA_STUDY_DEFAULTS.bullColor,
          type: "text",
        },
        {
          id: "bearColor",
          name: "Style · Short pill (#hex)",
          defval: FTA_STUDY_DEFAULTS.bearColor,
          type: "text",
        },
        {
          id: "longBoxColor",
          name: "Style · Long box light green (#hex)",
          defval: FTA_STUDY_DEFAULTS.longBoxColor,
          type: "text",
        },
        {
          id: "shortBoxColor",
          name: "Style · Short box light red (#hex)",
          defval: FTA_STUDY_DEFAULTS.shortBoxColor,
          type: "text",
        },
        {
          id: "boxOpacity",
          name: "Style · Box opacity % (lower = lighter)",
          defval: FTA_STUDY_DEFAULTS.boxOpacity,
          type: "integer",
          min: 4,
          max: 40,
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
