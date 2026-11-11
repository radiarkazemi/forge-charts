/**
 * Charting Library custom study: “IFVG + BPR”.
 * Inert plot — boxes and dashed midlines are painted by `useIfvgBprStudy`.
 */

import type { CustomIndicator } from "@/infrastructure/tradingview";
import { IFVG_BPR_DEFAULTS } from "@/features/ifvg-bpr/runtime";
import { buildStylePlots, stylePlotNaNs } from "./study-style-plots";

export const IFVG_BPR_STUDY_NAME = "IFVG + BPR";
export const IFVG_BPR_STUDY_ID = "IfvgBpr@tv-basicstudies-1";

export const IFVG_STYLE_BULL = "plot_ifvg_bull";
export const IFVG_STYLE_BEAR = "plot_ifvg_bear";
export const IFVG_STYLE_BPR = "plot_bpr";

export const IFVG_BPR_STUDY_DEFAULTS = {
  minGapAtr: IFVG_BPR_DEFAULTS.minGapAtr,
  displacement: IFVG_BPR_DEFAULTS.displacement,
  showBpr: IFVG_BPR_DEFAULTS.showBpr,
  showMitigated: IFVG_BPR_DEFAULTS.showMitigated,
  projectBars: IFVG_BPR_DEFAULTS.projectBars,
  maxZones: IFVG_BPR_DEFAULTS.maxZones,
} as const;

const STYLE_SPECS = [
  {
    id: IFVG_STYLE_BULL,
    title: "Bullish IFVG",
    color: IFVG_BPR_DEFAULTS.bullColor,
    visible: IFVG_BPR_DEFAULTS.showBull,
    transparency: 0,
    linewidth: IFVG_BPR_DEFAULTS.lineWidth,
    legendHidden: false,
  },
  {
    id: IFVG_STYLE_BEAR,
    title: "Bearish IFVG",
    color: IFVG_BPR_DEFAULTS.bearColor,
    visible: IFVG_BPR_DEFAULTS.showBear,
    transparency: 0,
    linewidth: IFVG_BPR_DEFAULTS.lineWidth,
    legendHidden: false,
  },
  {
    id: IFVG_STYLE_BPR,
    title: "Balanced price range",
    color: IFVG_BPR_DEFAULTS.bprColor,
    visible: IFVG_BPR_DEFAULTS.showBpr,
    transparency: 0,
    linewidth: IFVG_BPR_DEFAULTS.lineWidth,
    legendHidden: false,
  },
] as const;

const { plots, stylesMeta, stylesDefaults } = buildStylePlots(STYLE_SPECS);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createIfvgBprIndicator(PineJS: {
  Std: { close: (ctx: any) => number };
}): CustomIndicator {
  return {
    name: IFVG_BPR_STUDY_NAME,
    metainfo: {
      _metainfoVersion: 53,
      id: IFVG_BPR_STUDY_ID as never,
      name: IFVG_BPR_STUDY_NAME,
      description: IFVG_BPR_STUDY_NAME,
      shortDescription: "Inversion FVG · balanced price range",
      isCustomIndicator: true,
      is_price_study: true,
      linkedToSeries: true,
      format: { type: "inherit" },
      plots,
      defaults: {
        styles: stylesDefaults,
        inputs: { ...IFVG_BPR_STUDY_DEFAULTS },
      },
      styles: stylesMeta,
      inputs: [
        {
          id: "minGapAtr",
          name: "Min gap × ATR",
          defval: IFVG_BPR_STUDY_DEFAULTS.minGapAtr,
          type: "float",
          min: 0.02,
          max: 2,
          step: 0.01,
        },
        {
          id: "displacement",
          name: "Middle candle body × ATR",
          defval: IFVG_BPR_STUDY_DEFAULTS.displacement,
          type: "float",
          min: 0.05,
          max: 2,
          step: 0.05,
        },
        {
          id: "showBpr",
          name: "Show balanced price range",
          defval: IFVG_BPR_STUDY_DEFAULTS.showBpr,
          type: "bool",
        },
        {
          id: "showMitigated",
          name: "Show mitigated zones",
          defval: IFVG_BPR_STUDY_DEFAULTS.showMitigated,
          type: "bool",
        },
        {
          id: "projectBars",
          name: "Project active zone (bars)",
          defval: IFVG_BPR_STUDY_DEFAULTS.projectBars,
          type: "integer",
          min: 1,
          max: 40,
        },
        {
          id: "maxZones",
          name: "Max zones",
          defval: IFVG_BPR_STUDY_DEFAULTS.maxZones,
          type: "integer",
          min: 1,
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
