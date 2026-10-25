/**
 * Charting Library custom study: “Forge Sessions”.
 * Simple trader UI — one sessions list + a few toggles. Unlimited zones =
 * add more lines. Plots are inert; drawings painted by `useSessionsStudy`.
 */

import type { CustomIndicator } from "@/infrastructure/tradingview";
import {
  DEFAULT_SESSION_DEFS,
  DEFAULT_SESSIONS_TEXT,
  SESSIONS_DEFAULTS,
} from "@/features/sessions/runtime";

export const SESSIONS_STUDY_NAME = "Forge Sessions";
export const SESSIONS_STUDY_ID = "ForgeSessions@tv-basicstudies-1";

export const SESSIONS_STUDY_DEFAULTS = {
  sessionsText: DEFAULT_SESSIONS_TEXT,
  timezoneOffset: SESSIONS_DEFAULTS.timezoneOffset,
  useExchangeTimezone: SESSIONS_DEFAULTS.useExchangeTimezone,
  exchangeTimezone: SESSIONS_DEFAULTS.exchangeTimezone,
  showRangeLabel: SESSIONS_DEFAULTS.showRangeLabel,
  showDayDivider: SESSIONS_DEFAULTS.showDayDivider,
  rangeTransparency: SESSIONS_DEFAULTS.rangeTransparency,
} as const;

export function createSessionsIndicator(PineJS: {
  Std: { close: (ctx: unknown) => number };
}): CustomIndicator {
  return {
    name: SESSIONS_STUDY_NAME,
    metainfo: {
      _metainfoVersion: 53,
      id: SESSIONS_STUDY_ID as never,
      name: SESSIONS_STUDY_NAME,
      description: SESSIONS_STUDY_NAME,
      shortDescription: "Session zones — one line each",
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
        inputs: { ...SESSIONS_STUDY_DEFAULTS },
      },
      styles: {
        plot_hidden: { title: "Hidden", histogramBase: 0 },
      },
      inputs: [
        {
          id: "sessionsText",
          name: "Sessions (one per line: Name HH:MM-HH:MM)",
          defval: SESSIONS_STUDY_DEFAULTS.sessionsText,
          type: "text",
        },
        {
          id: "useExchangeTimezone",
          name: "Use exchange timezone",
          defval: SESSIONS_STUDY_DEFAULTS.useExchangeTimezone,
          type: "bool",
        },
        {
          id: "exchangeTimezone",
          name: "Timezone (e.g. America/New_York)",
          defval: SESSIONS_STUDY_DEFAULTS.exchangeTimezone,
          type: "text",
        },
        {
          id: "timezoneOffset",
          name: "UTC offset if exchange TZ off",
          defval: SESSIONS_STUDY_DEFAULTS.timezoneOffset,
          type: "integer",
          min: -12,
          max: 14,
        },
        {
          id: "showRangeLabel",
          name: "Show labels",
          defval: SESSIONS_STUDY_DEFAULTS.showRangeLabel,
          type: "bool",
        },
        {
          id: "showDayDivider",
          name: "Daily divider",
          defval: SESSIONS_STUDY_DEFAULTS.showDayDivider,
          type: "bool",
        },
        {
          id: "rangeTransparency",
          name: "Box transparency (0–100)",
          defval: SESSIONS_STUDY_DEFAULTS.rangeTransparency,
          type: "integer",
          min: 0,
          max: 100,
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

export const SESSIONS_PRESET_NAMES = DEFAULT_SESSION_DEFS.map((s) => s.name);
