/**
 * Charting Library custom study: “Watermark”.
 * Inert plot — title/subtitle painted by `useWatermarkStudy` + WatermarkOverlay.
 * Colors / transparency live in the Style tab (native palette).
 */

import type { CustomIndicator } from "@/infrastructure/tradingview";
import { WATERMARK_DEFAULTS } from "@/features/watermark/runtime";
import { buildStylePlots, stylePlotNaNs } from "./study-style-plots";

export const WATERMARK_STUDY_NAME = "Watermark";
export const WATERMARK_STUDY_ID = "ForgeWatermark@tv-basicstudies-1";

export const WM_STYLE_TITLE = "plot_title";
export const WM_STYLE_SUBTITLE = "plot_subtitle";
export const WM_STYLE_SYMBOL = "plot_symbol";

export const WATERMARK_STUDY_DEFAULTS = {
  title: WATERMARK_DEFAULTS.title,
  subtitle: WATERMARK_DEFAULTS.subtitle,
  showTitle: WATERMARK_DEFAULTS.showTitle,
  showSubtitle: WATERMARK_DEFAULTS.showSubtitle,
  showSymbolInfo: WATERMARK_DEFAULTS.showSymbolInfo,
  vertPos: WATERMARK_DEFAULTS.vertPos,
  horzPos: WATERMARK_DEFAULTS.horzPos,
  symbolVertPos: WATERMARK_DEFAULTS.symbolVertPos,
  titleSize: WATERMARK_DEFAULTS.titleSize,
  subtitleSize: WATERMARK_DEFAULTS.subtitleSize,
  symbolSize: WATERMARK_DEFAULTS.symbolSize,
  titleBold: WATERMARK_DEFAULTS.titleBold,
  subtitleBold: WATERMARK_DEFAULTS.subtitleBold,
  letterSpacing: WATERMARK_DEFAULTS.letterSpacing,
  lineGap: WATERMARK_DEFAULTS.lineGap,
  offsetX: WATERMARK_DEFAULTS.offsetX,
  offsetY: WATERMARK_DEFAULTS.offsetY,
} as const;

const STYLE_SPECS = [
  {
    id: WM_STYLE_TITLE,
    title: "Title",
    color: WATERMARK_DEFAULTS.titleColor,
    visible: true,
    transparency: WATERMARK_DEFAULTS.titleTransparency,
    linewidth: 2,
    legendHidden: false,
  },
  {
    id: WM_STYLE_SUBTITLE,
    title: "Subtitle",
    color: WATERMARK_DEFAULTS.subtitleColor,
    visible: true,
    transparency: WATERMARK_DEFAULTS.subtitleTransparency,
    linewidth: 1,
    legendHidden: false,
  },
  {
    id: WM_STYLE_SYMBOL,
    title: "Symbol info",
    color: WATERMARK_DEFAULTS.symbolColor,
    visible: true,
    transparency: WATERMARK_DEFAULTS.symbolTransparency,
    linewidth: 1,
    legendHidden: false,
  },
] as const;

const { plots, stylesMeta, stylesDefaults } = buildStylePlots(STYLE_SPECS);

const V_POS = ["top", "middle", "bottom"] as const;
const H_POS = ["left", "center", "right"] as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createWatermarkIndicator(PineJS: {
  Std: { close: (ctx: any) => number };
}): CustomIndicator {
  return {
    name: WATERMARK_STUDY_NAME,
    metainfo: {
      _metainfoVersion: 53,
      id: WATERMARK_STUDY_ID as never,
      name: WATERMARK_STUDY_NAME,
      description: WATERMARK_STUDY_NAME,
      shortDescription: "Title · Subtitle · AG FX style",
      isCustomIndicator: true,
      is_price_study: true,
      linkedToSeries: true,
      format: { type: "inherit" },
      plots: plots as never,
      defaults: {
        styles: stylesDefaults as never,
        inputs: { ...WATERMARK_STUDY_DEFAULTS },
      },
      styles: stylesMeta as never,
      inputs: [
        {
          id: "title",
          name: "Title",
          defval: WATERMARK_STUDY_DEFAULTS.title,
          type: "text",
        },
        {
          id: "subtitle",
          name: "Subtitle",
          defval: WATERMARK_STUDY_DEFAULTS.subtitle,
          type: "text",
        },
        {
          id: "showTitle",
          name: "Show title",
          defval: WATERMARK_STUDY_DEFAULTS.showTitle,
          type: "bool",
        },
        {
          id: "showSubtitle",
          name: "Show subtitle",
          defval: WATERMARK_STUDY_DEFAULTS.showSubtitle,
          type: "bool",
        },
        {
          id: "showSymbolInfo",
          name: "Show symbol info",
          defval: WATERMARK_STUDY_DEFAULTS.showSymbolInfo,
          type: "bool",
        },
        {
          id: "vertPos",
          name: "Watermark · Vertical position",
          defval: WATERMARK_STUDY_DEFAULTS.vertPos,
          type: "text",
          options: [...V_POS],
        },
        {
          id: "horzPos",
          name: "Watermark · Horizontal position",
          defval: WATERMARK_STUDY_DEFAULTS.horzPos,
          type: "text",
          options: [...H_POS],
        },
        {
          id: "symbolVertPos",
          name: "Symbol · Vertical position",
          defval: WATERMARK_STUDY_DEFAULTS.symbolVertPos,
          type: "text",
          options: [...V_POS],
        },
        {
          id: "titleSize",
          name: "Title font size (px)",
          defval: WATERMARK_STUDY_DEFAULTS.titleSize,
          type: "integer",
          min: 10,
          max: 72,
        },
        {
          id: "subtitleSize",
          name: "Subtitle font size (px)",
          defval: WATERMARK_STUDY_DEFAULTS.subtitleSize,
          type: "integer",
          min: 8,
          max: 48,
        },
        {
          id: "symbolSize",
          name: "Symbol font size (px)",
          defval: WATERMARK_STUDY_DEFAULTS.symbolSize,
          type: "integer",
          min: 8,
          max: 32,
        },
        {
          id: "titleBold",
          name: "Title bold",
          defval: WATERMARK_STUDY_DEFAULTS.titleBold,
          type: "bool",
        },
        {
          id: "subtitleBold",
          name: "Subtitle bold",
          defval: WATERMARK_STUDY_DEFAULTS.subtitleBold,
          type: "bool",
        },
        {
          id: "letterSpacing",
          name: "Letter spacing (em)",
          defval: WATERMARK_STUDY_DEFAULTS.letterSpacing,
          type: "float",
          min: 0,
          max: 0.4,
        },
        {
          id: "lineGap",
          name: "Gap between lines (px)",
          defval: WATERMARK_STUDY_DEFAULTS.lineGap,
          type: "integer",
          min: 0,
          max: 40,
        },
        {
          id: "offsetX",
          name: "Offset X (px)",
          defval: WATERMARK_STUDY_DEFAULTS.offsetX,
          type: "integer",
          min: -200,
          max: 200,
        },
        {
          id: "offsetY",
          name: "Offset Y (px · below toolbar when top)",
          defval: WATERMARK_STUDY_DEFAULTS.offsetY,
          type: "integer",
          min: 0,
          max: 240,
        },
      ] as never,
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
          (PineJS.Std as { na?: (v: number) => boolean }).na?.(raw) ??
          !Number.isFinite(raw);
        const v = !na && Number.isFinite(raw) ? raw : (this._lastClose ?? raw);
        if (Number.isFinite(v) && v !== 0) this._lastClose = v;
        const out = Number.isFinite(this._lastClose) ? this._lastClose! : 1;
        return [out, ...stylePlotNaNs(STYLE_SPECS.length)];
      };
    } as never,
  };
}
