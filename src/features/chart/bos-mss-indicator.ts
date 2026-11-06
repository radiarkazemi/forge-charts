/**
 * Charting Library custom study: “BOS / MSS”.
 * Inert plot — lines/labels painted by `useBosMssStudy`.
 * Detection lives in `src/features/bos-mss/runtime.ts` for later logic tweaks.
 */

import type { CustomIndicator } from "@/infrastructure/tradingview";
import { BOS_MSS_DEFAULTS } from "@/features/bos-mss/runtime";

export const BOS_MSS_STUDY_NAME = "BOS / MSS";
export const BOS_MSS_STUDY_ID = "BosMssStructure@tv-basicstudies-1";

export const BOS_MSS_STUDY_DEFAULTS = {
  leftBars: BOS_MSS_DEFAULTS.leftBars,
  rightBars: BOS_MSS_DEFAULTS.rightBars,
  breakOnWick: BOS_MSS_DEFAULTS.breakOnWick,
  showBosPlus: BOS_MSS_DEFAULTS.showBosPlus,
  showBosMinus: BOS_MSS_DEFAULTS.showBosMinus,
  showMssPlus: BOS_MSS_DEFAULTS.showMssPlus,
  showMssMinus: BOS_MSS_DEFAULTS.showMssMinus,
  showLines: BOS_MSS_DEFAULTS.showLines,
  showLabels: BOS_MSS_DEFAULTS.showLabels,
  bosPlusLabel: BOS_MSS_DEFAULTS.bosPlusLabel,
  bosMinusLabel: BOS_MSS_DEFAULTS.bosMinusLabel,
  mssPlusLabel: BOS_MSS_DEFAULTS.mssPlusLabel,
  mssMinusLabel: BOS_MSS_DEFAULTS.mssMinusLabel,
  bosPlusColor: BOS_MSS_DEFAULTS.bosPlusColor,
  bosMinusColor: BOS_MSS_DEFAULTS.bosMinusColor,
  mssPlusColor: BOS_MSS_DEFAULTS.mssPlusColor,
  mssMinusColor: BOS_MSS_DEFAULTS.mssMinusColor,
  lineWidth: BOS_MSS_DEFAULTS.lineWidth,
  bosLineStyle: BOS_MSS_DEFAULTS.bosLineStyle,
  mssLineStyle: BOS_MSS_DEFAULTS.mssLineStyle,
  fontSize: BOS_MSS_DEFAULTS.fontSize,
  maxEvents: BOS_MSS_DEFAULTS.maxEvents,
} as const;

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
        inputs: { ...BOS_MSS_STUDY_DEFAULTS },
      },
      styles: {
        plot_hidden: { title: "Hidden", histogramBase: 0 },
      },
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
          id: "showBosPlus",
          name: "Show BOS+",
          defval: BOS_MSS_STUDY_DEFAULTS.showBosPlus,
          type: "bool",
        },
        {
          id: "showBosMinus",
          name: "Show BOS-",
          defval: BOS_MSS_STUDY_DEFAULTS.showBosMinus,
          type: "bool",
        },
        {
          id: "showMssPlus",
          name: "Show MSS+",
          defval: BOS_MSS_STUDY_DEFAULTS.showMssPlus,
          type: "bool",
        },
        {
          id: "showMssMinus",
          name: "Show MSS-",
          defval: BOS_MSS_STUDY_DEFAULTS.showMssMinus,
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
          name: "Show labels",
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
          id: "bosPlusColor",
          name: "BOS+ color",
          defval: BOS_MSS_STUDY_DEFAULTS.bosPlusColor,
          type: "text",
        },
        {
          id: "bosMinusColor",
          name: "BOS- color",
          defval: BOS_MSS_STUDY_DEFAULTS.bosMinusColor,
          type: "text",
        },
        {
          id: "mssPlusColor",
          name: "MSS+ color",
          defval: BOS_MSS_STUDY_DEFAULTS.mssPlusColor,
          type: "text",
        },
        {
          id: "mssMinusColor",
          name: "MSS- color",
          defval: BOS_MSS_STUDY_DEFAULTS.mssMinusColor,
          type: "text",
        },
        {
          id: "lineWidth",
          name: "Line width",
          defval: BOS_MSS_STUDY_DEFAULTS.lineWidth,
          type: "integer",
          min: 1,
          max: 4,
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
          id: "fontSize",
          name: "Label font size",
          defval: BOS_MSS_STUDY_DEFAULTS.fontSize,
          type: "integer",
          min: 8,
          max: 24,
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
        return [Number.isFinite(this._lastClose) ? this._lastClose! : 1];
      };
    } as never,
  };
}
