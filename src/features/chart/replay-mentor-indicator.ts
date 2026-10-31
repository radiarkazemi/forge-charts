/**
 * Charting Library custom study: “Forge Replay Mentor”.
 * Beginner ICT practice coach — drawings painted by `useReplayMentorStudy`
 * only while Bar Replay is active.
 */

import type { CustomIndicator } from "@/infrastructure/tradingview";
import { MENTOR_DEFAULTS } from "@/features/replay-mentor/runtime";

export const REPLAY_MENTOR_STUDY_NAME = "Forge Replay Mentor";
export const REPLAY_MENTOR_STUDY_ID = "ForgeReplayMentor@tv-basicstudies-1";

export const REPLAY_MENTOR_DEFAULTS = {
  swingLeft: MENTOR_DEFAULTS.swingLeft,
  swingRight: MENTOR_DEFAULTS.swingRight,
  showStructure: MENTOR_DEFAULTS.showStructure,
  showFvg: MENTOR_DEFAULTS.showFvg,
  showOrderBlocks: MENTOR_DEFAULTS.showOrderBlocks,
  showLiquidity: MENTOR_DEFAULTS.showLiquidity,
  showBpr: MENTOR_DEFAULTS.showBpr,
  showIof: MENTOR_DEFAULTS.showIof,
  showIfvg: MENTOR_DEFAULTS.showIfvg,
  maxItems: MENTOR_DEFAULTS.maxItems,
} as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createReplayMentorIndicator(PineJS: {
  Std: { close: (ctx: any) => number };
}): CustomIndicator {
  return {
    name: REPLAY_MENTOR_STUDY_NAME,
    metainfo: {
      _metainfoVersion: 53,
      id: REPLAY_MENTOR_STUDY_ID as never,
      name: REPLAY_MENTOR_STUDY_NAME,
      description: REPLAY_MENTOR_STUDY_NAME,
      shortDescription: "ICT practice · BOS/MSS/FVG/OB (Replay)",
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
        inputs: { ...REPLAY_MENTOR_DEFAULTS },
      },
      styles: {
        plot_hidden: { title: "Hidden", histogramBase: 0 },
      },
      inputs: [
        {
          id: "swingLeft",
          name: "Swing left bars",
          defval: REPLAY_MENTOR_DEFAULTS.swingLeft,
          type: "integer",
          min: 1,
          max: 10,
        },
        {
          id: "swingRight",
          name: "Swing right bars",
          defval: REPLAY_MENTOR_DEFAULTS.swingRight,
          type: "integer",
          min: 1,
          max: 10,
        },
        {
          id: "maxItems",
          name: "Max labels per type",
          defval: REPLAY_MENTOR_DEFAULTS.maxItems,
          type: "integer",
          min: 2,
          max: 24,
        },
        {
          id: "showStructure",
          name: "Show BOS / MSS",
          defval: REPLAY_MENTOR_DEFAULTS.showStructure,
          type: "bool",
        },
        {
          id: "showFvg",
          name: "Show FVG (valid once)",
          defval: REPLAY_MENTOR_DEFAULTS.showFvg,
          type: "bool",
        },
        {
          id: "showOrderBlocks",
          name: "Show Order Blocks",
          defval: REPLAY_MENTOR_DEFAULTS.showOrderBlocks,
          type: "bool",
        },
        {
          id: "showLiquidity",
          name: "Show Liquidity (BSL / SSL)",
          defval: REPLAY_MENTOR_DEFAULTS.showLiquidity,
          type: "bool",
        },
        {
          id: "showBpr",
          name: "Show BPR (balanced range)",
          defval: REPLAY_MENTOR_DEFAULTS.showBpr,
          type: "bool",
        },
        {
          id: "showIof",
          name: "Show IOF (inducement)",
          defval: REPLAY_MENTOR_DEFAULTS.showIof,
          type: "bool",
        },
        {
          id: "showIfvg",
          name: "Show IFVG (inversion)",
          defval: REPLAY_MENTOR_DEFAULTS.showIfvg,
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
