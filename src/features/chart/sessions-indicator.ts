/**
 * Charting Library custom study: “Forge Sessions” (LuxAlgo Sessions port).
 * Plots are inert — boxes/lines/labels painted by `useSessionsStudy`.
 *
 * Extra vs LuxAlgo: unlimited session zones via sessionCount + Extra sessions DSL.
 */

import type { CustomIndicator } from "@/infrastructure/tradingview";
import {
  DEFAULT_SESSION_DEFS,
  SESSIONS_DEFAULTS,
  SESSIONS_MAX_SLOTS,
  defaultSessionSlot,
  type SessionDef,
} from "@/features/sessions/runtime";

export const SESSIONS_STUDY_NAME = "Forge Sessions";
export const SESSIONS_STUDY_ID = "ForgeSessions@tv-basicstudies-1";

function slotDefaults(index: number): Record<string, string | number | boolean> {
  const d = defaultSessionSlot(index);
  const n = index + 1;
  return {
    [`s${n}Enable`]: d.enable,
    [`s${n}Name`]: d.name,
    [`s${n}Hours`]: d.hours,
    [`s${n}Range`]: d.range,
    [`s${n}Trendline`]: d.trendline,
    [`s${n}Mean`]: d.mean,
    [`s${n}Vwap`]: d.vwap,
    [`s${n}MaxMin`]: d.maxMin,
    [`s${n}Color`]: d.color,
  };
}

function buildSlotInputs(index: number): Array<Record<string, unknown>> {
  const d = defaultSessionSlot(index);
  const n = index + 1;
  const group = `Session ${n}`;
  return [
    { id: `s${n}Enable`, name: `${group} · Enable`, defval: d.enable, type: "bool" },
    { id: `s${n}Name`, name: `${group} · Name`, defval: d.name, type: "text" },
    { id: `s${n}Hours`, name: `${group} · Hours (HHMM-HHMM)`, defval: d.hours, type: "text" },
    { id: `s${n}Range`, name: `${group} · Range`, defval: d.range, type: "bool" },
    { id: `s${n}Trendline`, name: `${group} · Trendline`, defval: d.trendline, type: "bool" },
    { id: `s${n}Mean`, name: `${group} · Mean`, defval: d.mean, type: "bool" },
    { id: `s${n}Vwap`, name: `${group} · VWAP`, defval: d.vwap, type: "bool" },
    { id: `s${n}MaxMin`, name: `${group} · Max/Min`, defval: d.maxMin, type: "bool" },
    { id: `s${n}Color`, name: `${group} · Color (#hex)`, defval: d.color, type: "text" },
  ];
}

const slotInputDefaults: Record<string, string | number | boolean> = {};
for (let i = 0; i < SESSIONS_MAX_SLOTS; i += 1) {
  Object.assign(slotInputDefaults, slotDefaults(i));
}

export const SESSIONS_STUDY_DEFAULTS = {
  sessionCount: SESSIONS_DEFAULTS.sessionCount,
  extraSessions: SESSIONS_DEFAULTS.extraSessions,
  historyLimit: SESSIONS_DEFAULTS.historyLimit,
  timezoneOffset: SESSIONS_DEFAULTS.timezoneOffset,
  useExchangeTimezone: SESSIONS_DEFAULTS.useExchangeTimezone,
  exchangeTimezone: SESSIONS_DEFAULTS.exchangeTimezone,
  rangeTransparency: SESSIONS_DEFAULTS.rangeTransparency,
  showRangeOutline: SESSIONS_DEFAULTS.showRangeOutline,
  showRangeLabel: SESSIONS_DEFAULTS.showRangeLabel,
  dashboard: SESSIONS_DEFAULTS.dashboard,
  advancedDashboard: SESSIONS_DEFAULTS.advancedDashboard,
  dashboardPosition: SESSIONS_DEFAULTS.dashboardPosition,
  dashboardSize: SESSIONS_DEFAULTS.dashboardSize,
  showSessionDivider: SESSIONS_DEFAULTS.showSessionDivider,
  showDayDivider: SESSIONS_DEFAULTS.showDayDivider,
  ...slotInputDefaults,
} as const;

export function readSessionSlotsFromMap(map: Map<string, unknown>): SessionDef[] {
  const slots: SessionDef[] = [];
  for (let i = 0; i < SESSIONS_MAX_SLOTS; i += 1) {
    const n = i + 1;
    const fallback = defaultSessionSlot(i);
    const bool = (id: string, fb: boolean) => {
      const v = map.get(id);
      return typeof v === "boolean" ? v : fb;
    };
    const str = (id: string, fb: string) => {
      const v = map.get(id);
      return typeof v === "string" ? v : fb;
    };
    slots.push({
      enable: bool(`s${n}Enable`, fallback.enable),
      name: str(`s${n}Name`, fallback.name),
      hours: str(`s${n}Hours`, fallback.hours),
      range: bool(`s${n}Range`, fallback.range),
      trendline: bool(`s${n}Trendline`, fallback.trendline),
      mean: bool(`s${n}Mean`, fallback.mean),
      vwap: bool(`s${n}Vwap`, fallback.vwap),
      maxMin: bool(`s${n}MaxMin`, fallback.maxMin),
      color: str(`s${n}Color`, fallback.color),
    });
  }
  return slots;
}

export function createSessionsIndicator(PineJS: {
  Std: { close: (ctx: unknown) => number };
}): CustomIndicator {
  const slotInputs = Array.from({ length: SESSIONS_MAX_SLOTS }, (_, i) => buildSlotInputs(i)).flat();

  return {
    name: SESSIONS_STUDY_NAME,
    metainfo: {
      _metainfoVersion: 53,
      id: SESSIONS_STUDY_ID as never,
      name: SESSIONS_STUDY_NAME,
      description: SESSIONS_STUDY_NAME,
      shortDescription: "Sessions zones (LuxAlgo-style)",
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
          id: "sessionCount",
          name: "Number of session slots (1–20, no hard zone cap via Extra)",
          defval: SESSIONS_STUDY_DEFAULTS.sessionCount,
          type: "integer",
          min: 1,
          max: SESSIONS_MAX_SLOTS,
        },
        {
          id: "extraSessions",
          name: "Extra sessions (unlimited) Name|HHMM-HHMM|#hex|range|trend|mean|vwap|maxmin",
          defval: SESSIONS_STUDY_DEFAULTS.extraSessions,
          type: "text",
        },
        {
          id: "historyLimit",
          name: "History boxes per session (0 = unlimited)",
          defval: SESSIONS_STUDY_DEFAULTS.historyLimit,
          type: "integer",
          min: 0,
          max: 10_000,
        },
        {
          id: "timezoneOffset",
          name: "UTC offset (+/- hours)",
          defval: SESSIONS_STUDY_DEFAULTS.timezoneOffset,
          type: "integer",
          min: -12,
          max: 14,
        },
        {
          id: "useExchangeTimezone",
          name: "Use exchange / IANA timezone",
          defval: SESSIONS_STUDY_DEFAULTS.useExchangeTimezone,
          type: "bool",
        },
        {
          id: "exchangeTimezone",
          name: "IANA timezone (e.g. America/New_York)",
          defval: SESSIONS_STUDY_DEFAULTS.exchangeTimezone,
          type: "text",
        },
        {
          id: "rangeTransparency",
          name: "Range area transparency (0–100)",
          defval: SESSIONS_STUDY_DEFAULTS.rangeTransparency,
          type: "integer",
          min: 0,
          max: 100,
        },
        {
          id: "showRangeOutline",
          name: "Range outline",
          defval: SESSIONS_STUDY_DEFAULTS.showRangeOutline,
          type: "bool",
        },
        {
          id: "showRangeLabel",
          name: "Range label",
          defval: SESSIONS_STUDY_DEFAULTS.showRangeLabel,
          type: "bool",
        },
        {
          id: "dashboard",
          name: "Dashboard",
          defval: SESSIONS_STUDY_DEFAULTS.dashboard,
          type: "bool",
        },
        {
          id: "advancedDashboard",
          name: "Advanced dashboard (trend / volume / σ)",
          defval: SESSIONS_STUDY_DEFAULTS.advancedDashboard,
          type: "bool",
        },
        {
          id: "dashboardPosition",
          name: "Dashboard position (0=Top Right, 1=Bottom Right, 2=Bottom Left)",
          defval: SESSIONS_STUDY_DEFAULTS.dashboardPosition,
          type: "integer",
          min: 0,
          max: 2,
        },
        {
          id: "dashboardSize",
          name: "Dashboard size (0=Tiny … 4=Huge)",
          defval: SESSIONS_STUDY_DEFAULTS.dashboardSize,
          type: "integer",
          min: 0,
          max: 4,
        },
        {
          id: "showSessionDivider",
          name: "Show session dividers",
          defval: SESSIONS_STUDY_DEFAULTS.showSessionDivider,
          type: "bool",
        },
        {
          id: "showDayDivider",
          name: "Show daily dividers",
          defval: SESSIONS_STUDY_DEFAULTS.showDayDivider,
          type: "bool",
        },
        ...slotInputs,
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

/** Preset blurb for docs / Pine reference. */
export const SESSIONS_PRESET_NAMES = DEFAULT_SESSION_DEFS.map((s) => s.name);
