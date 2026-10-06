/**
 * Charting Library custom study: “Forge Structure Intelligence”.
 * Plots are inert — boxes/lines painted by `useStructureIntelligenceStudy`
 * using the TypeScript port of Forge_Structure_Intelligence_v1.pine.
 */

import type { CustomIndicator } from "@/infrastructure/tradingview";
import { SI_DEFAULTS } from "@/features/structure-intelligence/runtime";

export const SI_STUDY_NAME = "Forge Structure Intelligence";
export const SI_STUDY_ID = "ForgeStructureIntelligence@tv-basicstudies-1";

export const SI_STUDY_DEFAULTS = {
  minorLen: SI_DEFAULTS.minorLen,
  majorLen: SI_DEFAULTS.majorLen,
  swingATR: SI_DEFAULTS.swingATR,
  breakOnWick: SI_DEFAULTS.breakOnWick,
  requireSweep: SI_DEFAULTS.requireSweep,
  requireOuter: SI_DEFAULTS.requireOuter,
  zoneMode: 0, // 0 FVG then OB, 1 FVG only, 2 OB only
  triggerMode: 1, // 0 Micro break, 1 Rejection candle — in-zone rejection is the fill
  minScore: SI_DEFAULTS.minScore,
  candidateLimit: SI_DEFAULTS.candidateLimit,
  targetR: SI_DEFAULTS.targetR,
  showPaths: SI_DEFAULTS.showPaths,
  showActive: SI_DEFAULTS.showActive,
  showHistory: SI_DEFAULTS.showHistory,
  historyLimit: SI_DEFAULTS.historyLimit,
} as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createStructureIntelligenceIndicator(PineJS: {
  Std: { close: (ctx: any) => number };
}): CustomIndicator {
  return {
    name: SI_STUDY_NAME,
    metainfo: {
      _metainfoVersion: 53,
      id: SI_STUDY_ID as never,
      name: SI_STUDY_NAME,
      description: SI_STUDY_NAME,
      shortDescription: "Forge SI POI",
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
        inputs: { ...SI_STUDY_DEFAULTS },
      },
      styles: {
        plot_hidden: { title: "Hidden", histogramBase: 0 },
      },
      inputs: [
        { id: "minorLen", name: "Minor swing confirmation bars", defval: SI_STUDY_DEFAULTS.minorLen, type: "integer", min: 1, max: 15 },
        { id: "majorLen", name: "Major swing confirmation bars", defval: SI_STUDY_DEFAULTS.majorLen, type: "integer", min: 3, max: 40 },
        { id: "swingATR", name: "Min swing separation / ATR", defval: SI_STUDY_DEFAULTS.swingATR, type: "float", min: 0, max: 5 },
        { id: "breakOnWick", name: "Break on wick", defval: SI_STUDY_DEFAULTS.breakOnWick, type: "bool" },
        { id: "requireSweep", name: "Require reclaimed liquidity sweep", defval: SI_STUDY_DEFAULTS.requireSweep, type: "bool" },
        { id: "requireOuter", name: "Require major structure break", defval: SI_STUDY_DEFAULTS.requireOuter, type: "bool" },
        {
          id: "zoneMode",
          name: "Zone source (0=FVG then OB, 1=FVG, 2=OB)",
          defval: SI_STUDY_DEFAULTS.zoneMode,
          type: "integer",
          min: 0,
          max: 2,
        },
        {
          id: "triggerMode",
          name: "Retest confirmation (0=Micro break, 1=Rejection)",
          defval: SI_STUDY_DEFAULTS.triggerMode,
          type: "integer",
          min: 0,
          max: 1,
        },
        { id: "minScore", name: "Minimum rule score", defval: SI_STUDY_DEFAULTS.minScore, type: "integer", min: 50, max: 100 },
        { id: "candidateLimit", name: "Candidate capacity", defval: SI_STUDY_DEFAULTS.candidateLimit, type: "integer", min: 4, max: 24 },
        { id: "targetR", name: "Projected target R", defval: SI_STUDY_DEFAULTS.targetR, type: "float", min: 1, max: 10 },
        { id: "showPaths", name: "Show minor swing map", defval: SI_STUDY_DEFAULTS.showPaths, type: "bool" },
        { id: "showActive", name: "Show active zone only", defval: SI_STUDY_DEFAULTS.showActive, type: "bool" },
        { id: "showHistory", name: "Mark past confirms (dots only)", defval: SI_STUDY_DEFAULTS.showHistory, type: "bool" },
        { id: "historyLimit", name: "Past confirm markers", defval: SI_STUDY_DEFAULTS.historyLimit, type: "integer", min: 0, max: 20 },
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
