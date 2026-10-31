/**
 * Charting Library custom study: “Forge Trading Assistant”.
 * Plots are inert — Buy/Sell + Entry/SL/TP painted by
 * `useForgeTradingAssistantStudy` from the Phase 1 confluence runtime.
 */

import type { CustomIndicator } from "@/infrastructure/tradingview";
import { FTA_DEFAULTS } from "@/features/trading-assistant/runtime";

export const FTA_STUDY_NAME = "Forge Trading Assistant";
export const FTA_STUDY_ID = "ForgeTradingAssistant@tv-basicstudies-1";

export const FTA_STUDY_DEFAULTS = {
  swingLeft: FTA_DEFAULTS.swingLeft,
  swingRight: FTA_DEFAULTS.swingRight,
  targetR: FTA_DEFAULTS.targetR,
  preferMss: FTA_DEFAULTS.preferMss,
  useOrderBlock: FTA_DEFAULTS.useOrderBlock,
  useFvg: FTA_DEFAULTS.useFvg,
  requireRejection: FTA_DEFAULTS.requireRejection,
  maxSignals: FTA_DEFAULTS.maxSignals,
  showZones: FTA_DEFAULTS.showZones,
  showStructure: FTA_DEFAULTS.showStructure,
  showHistory: FTA_DEFAULTS.showHistory,
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
      shortDescription: "Forge TA · Buy/Sell TP/SL",
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
          id: "targetR",
          name: "TP / SL ratio (R)",
          defval: FTA_STUDY_DEFAULTS.targetR,
          type: "float",
          min: 1,
          max: 6,
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
          id: "maxSignals",
          name: "Max signals drawn",
          defval: FTA_STUDY_DEFAULTS.maxSignals,
          type: "integer",
          min: 1,
          max: 24,
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
        return [Number.isFinite(this._lastClose) ? this._lastClose! : 1];
      };
    } as never,
  };
}
