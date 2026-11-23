/**
 * Charting Library custom study: Fractal & Time Alignment.
 * Clock/overlays painted by `useFractalTimeStudy` (Pine compiler is not available).
 */

import type { CustomIndicator } from "@/infrastructure/tradingview";
import { FRACTAL_TIME_DEFAULTS } from "@/features/fractal-time/runtime";
import { buildStylePlots, stylePlotNaNs } from "./study-style-plots";

export const FRACTAL_TIME_STUDY_NAME = "Fractal & Time Alignment";
export const FRACTAL_TIME_STUDY_ID = "ForgeFractalTime@tv-basicstudies-1";

export const FT_STYLE_C = "plot_c";
export const FT_STYLE_Q = "plot_q";
export const FT_STYLE_MACRO = "plot_macro";
export const FT_STYLE_OPEN = "plot_open";
export const FT_STYLE_ALIGN = "plot_align";

export const FRACTAL_TIME_STUDY_DEFAULTS = {
  mode: FRACTAL_TIME_DEFAULTS.mode === "sameQ" ? 1 : 0,
  enableYear: FRACTAL_TIME_DEFAULTS.enableYear,
  enableMonth: FRACTAL_TIME_DEFAULTS.enableMonth,
  enableWeek: FRACTAL_TIME_DEFAULTS.enableWeek,
  enableH4: FRACTAL_TIME_DEFAULTS.enableH4,
  enableMacro: FRACTAL_TIME_DEFAULTS.enableMacro,
  monthAllow: FRACTAL_TIME_DEFAULTS.monthAllow.join(","),
  weekAllow: FRACTAL_TIME_DEFAULTS.weekAllow.join(","),
  h4Allow: FRACTAL_TIME_DEFAULTS.h4Allow.join(","),
  macroAllow: FRACTAL_TIME_DEFAULTS.macroAllow.join(","),
  foldW5: FRACTAL_TIME_DEFAULTS.foldW5,
  showCBlocks: FRACTAL_TIME_DEFAULTS.showCBlocks,
  showHourQuarters: FRACTAL_TIME_DEFAULTS.showHourQuarters,
  showMacros: FRACTAL_TIME_DEFAULTS.showMacros,
  showOpens: FRACTAL_TIME_DEFAULTS.showOpens,
  showAlignment: FRACTAL_TIME_DEFAULTS.showAlignment,
  showDashboard: FRACTAL_TIME_DEFAULTS.showDashboard,
  showPhaseLabels: FRACTAL_TIME_DEFAULTS.showPhaseLabels,
} as const;

const STYLE_SPECS = [
  { id: FT_STYLE_C, title: "H4 C1–C6", color: FRACTAL_TIME_DEFAULTS.cColor, visible: true, transparency: 0, linewidth: 1, legendHidden: false },
  { id: FT_STYLE_Q, title: "Hourly Q1–Q4", color: FRACTAL_TIME_DEFAULTS.qColor, visible: true, transparency: 20, linewidth: 1, legendHidden: false },
  { id: FT_STYLE_MACRO, title: "Macro windows", color: FRACTAL_TIME_DEFAULTS.macroColor, visible: true, transparency: 70, linewidth: 1, legendHidden: false },
  { id: FT_STYLE_OPEN, title: "17:00 / Asia TO / TDO", color: FRACTAL_TIME_DEFAULTS.openColor, visible: true, transparency: 0, linewidth: 2, legendHidden: false },
  { id: FT_STYLE_ALIGN, title: "Alignment", color: FRACTAL_TIME_DEFAULTS.alignColor, visible: true, transparency: 60, linewidth: 1, legendHidden: false },
] as const;

const { plots, stylesMeta, stylesDefaults } = buildStylePlots(STYLE_SPECS);

export function createFractalTimeIndicator(PineJS: {
  Std: { close: (ctx: unknown) => number; na?: (v: number) => boolean };
}): CustomIndicator {
  return {
    name: FRACTAL_TIME_STUDY_NAME,
    metainfo: {
      _metainfoVersion: 53,
      id: FRACTAL_TIME_STUDY_ID as never,
      name: FRACTAL_TIME_STUDY_NAME,
      description: FRACTAL_TIME_STUDY_NAME,
      shortDescription: "NY 17:00 fractal layers · Phase Match",
      isCustomIndicator: true,
      is_price_study: true,
      linkedToSeries: true,
      format: { type: "inherit" },
      plots: plots as never,
      defaults: {
        styles: stylesDefaults as never,
        inputs: { ...FRACTAL_TIME_STUDY_DEFAULTS },
      },
      styles: stylesMeta as never,
      inputs: [
        {
          id: "mode",
          name: "Alignment · 0 Phase Match · 1 Same Q",
          defval: FRACTAL_TIME_STUDY_DEFAULTS.mode,
          type: "integer",
          min: 0,
          max: 1,
        },
        { id: "enableMonth", name: "Layer · Month W", defval: FRACTAL_TIME_STUDY_DEFAULTS.enableMonth, type: "bool" },
        { id: "enableWeek", name: "Layer · Week day", defval: FRACTAL_TIME_STUDY_DEFAULTS.enableWeek, type: "bool" },
        { id: "enableH4", name: "Layer · H4 quarter", defval: FRACTAL_TIME_STUDY_DEFAULTS.enableH4, type: "bool" },
        { id: "enableMacro", name: "Layer · NY/London macro", defval: FRACTAL_TIME_STUDY_DEFAULTS.enableMacro, type: "bool" },
        { id: "enableYear", name: "Layer · Year quarter", defval: FRACTAL_TIME_STUDY_DEFAULTS.enableYear, type: "bool" },
        { id: "monthAllow", name: "Month allow (W3,W4)", defval: FRACTAL_TIME_STUDY_DEFAULTS.monthAllow, type: "text" },
        { id: "weekAllow", name: "Week allow (Wed,Thu)", defval: FRACTAL_TIME_STUDY_DEFAULTS.weekAllow, type: "text" },
        { id: "h4Allow", name: "H4 allow (Q2)", defval: FRACTAL_TIME_STUDY_DEFAULTS.h4Allow, type: "text" },
        { id: "macroAllow", name: "Macro allow (NY2)", defval: FRACTAL_TIME_STUDY_DEFAULTS.macroAllow, type: "text" },
        { id: "foldW5", name: "Month · fold W5+ into W4", defval: FRACTAL_TIME_STUDY_DEFAULTS.foldW5, type: "bool" },
        { id: "showCBlocks", name: "Show C1–C6 separators", defval: FRACTAL_TIME_STUDY_DEFAULTS.showCBlocks, type: "bool" },
        { id: "showHourQuarters", name: "Show hourly Q on ≤15m", defval: FRACTAL_TIME_STUDY_DEFAULTS.showHourQuarters, type: "bool" },
        { id: "showMacros", name: "Show London / NY macros", defval: FRACTAL_TIME_STUDY_DEFAULTS.showMacros, type: "bool" },
        { id: "showOpens", name: "Show 17:00 · Asia TO · TDO", defval: FRACTAL_TIME_STUDY_DEFAULTS.showOpens, type: "bool" },
        { id: "showAlignment", name: "Highlight alignment", defval: FRACTAL_TIME_STUDY_DEFAULTS.showAlignment, type: "bool" },
        { id: "showDashboard", name: "Dashboard table", defval: FRACTAL_TIME_STUDY_DEFAULTS.showDashboard, type: "bool" },
        { id: "showPhaseLabels", name: "Phase labels in table", defval: FRACTAL_TIME_STUDY_DEFAULTS.showPhaseLabels, type: "bool" },
      ],
    } as never,
    constructor: function (this: {
      main?: (ctx: unknown) => unknown;
      _context?: unknown;
      _lastClose?: number;
    }) {
      this.main = function (ctx: unknown) {
        this._context = ctx;
        const raw = Number(PineJS.Std.close(this._context));
        const na = PineJS.Std.na?.(raw) ?? !Number.isFinite(raw);
        const v = !na && Number.isFinite(raw) ? raw : (this._lastClose ?? raw);
        if (Number.isFinite(v) && v !== 0) this._lastClose = v;
        const out = Number.isFinite(this._lastClose) ? this._lastClose! : 1;
        return [out, ...stylePlotNaNs(STYLE_SPECS.length)];
      };
    } as never,
  };
}
