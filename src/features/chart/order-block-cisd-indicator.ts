/**
 * Charting Library custom study: “Order Block + CISD”.
 * Inert plot — the box and dashed level are painted by `useOrderBlockCisdStudy`.
 */

import type { CustomIndicator } from "@/infrastructure/tradingview";
import { OB_CISD_DEFAULTS } from "@/features/order-block-cisd/runtime";
import { buildStylePlots, stylePlotNaNs } from "./study-style-plots";

export const OB_CISD_STUDY_NAME = "Order Block + CISD";
export const OB_CISD_STUDY_ID = "OrderBlockCisd@tv-basicstudies-1";

export const OB_STYLE_BULL = "plot_ob_bull";
export const OB_STYLE_BEAR = "plot_ob_bear";

export const OB_CISD_STUDY_DEFAULTS = {
  minSeries: OB_CISD_DEFAULTS.minSeries,
  displacement: OB_CISD_DEFAULTS.displacement,
  seriesAtr: OB_CISD_DEFAULTS.seriesAtr,
  showMitigated: OB_CISD_DEFAULTS.showMitigated,
  projectBars: OB_CISD_DEFAULTS.projectBars,
  maxZones: OB_CISD_DEFAULTS.maxZones,
} as const;

const STYLE_SPECS = [
  {
    id: OB_STYLE_BULL,
    title: "Bullish order block",
    color: OB_CISD_DEFAULTS.bullColor,
    visible: OB_CISD_DEFAULTS.showBull,
    transparency: 0,
    linewidth: OB_CISD_DEFAULTS.lineWidth,
    legendHidden: false,
  },
  {
    id: OB_STYLE_BEAR,
    title: "Bearish order block",
    color: OB_CISD_DEFAULTS.bearColor,
    visible: OB_CISD_DEFAULTS.showBear,
    transparency: 0,
    linewidth: OB_CISD_DEFAULTS.lineWidth,
    legendHidden: false,
  },
] as const;

const { plots, stylesMeta, stylesDefaults } = buildStylePlots(STYLE_SPECS);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createOrderBlockCisdIndicator(PineJS: {
  Std: { close: (ctx: any) => number };
}): CustomIndicator {
  return {
    name: OB_CISD_STUDY_NAME,
    metainfo: {
      _metainfoVersion: 53,
      id: OB_CISD_STUDY_ID as never,
      name: OB_CISD_STUDY_NAME,
      description: OB_CISD_STUDY_NAME,
      shortDescription: "Order block · CISD level",
      isCustomIndicator: true,
      is_price_study: true,
      linkedToSeries: true,
      format: { type: "inherit" },
      plots,
      defaults: {
        styles: stylesDefaults,
        inputs: { ...OB_CISD_STUDY_DEFAULTS },
      },
      styles: stylesMeta,
      inputs: [
        {
          id: "minSeries",
          name: "Delivery candles (min)",
          defval: OB_CISD_STUDY_DEFAULTS.minSeries,
          type: "integer",
          min: 1,
          max: 8,
        },
        {
          id: "displacement",
          name: "Confirm body × ATR",
          defval: OB_CISD_STUDY_DEFAULTS.displacement,
          type: "float",
          min: 0.05,
          max: 2,
          step: 0.05,
        },
        {
          id: "seriesAtr",
          name: "Delivery range × ATR",
          defval: OB_CISD_STUDY_DEFAULTS.seriesAtr,
          type: "float",
          min: 0.1,
          max: 3,
          step: 0.05,
        },
        {
          id: "showMitigated",
          name: "Show mitigated blocks",
          defval: OB_CISD_STUDY_DEFAULTS.showMitigated,
          type: "bool",
        },
        {
          id: "projectBars",
          name: "Project active zone (bars)",
          defval: OB_CISD_STUDY_DEFAULTS.projectBars,
          type: "integer",
          min: 1,
          max: 40,
        },
        {
          id: "maxZones",
          name: "Max zones",
          defval: OB_CISD_STUDY_DEFAULTS.maxZones,
          type: "integer",
          min: 1,
          max: 20,
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
