/**
 * Charting Library custom study: “Forge Sessions”.
 * LuxAlgo-style Inputs panel (SESSION A–D + timezone / ranges / style /
 * dashboard / dividers). Unlimited zones via Extra sessions lines.
 * Plots are inert — boxes painted by `useSessionsStudy`.
 */

import type { CustomIndicator } from "@/infrastructure/tradingview";
import {
  DEFAULT_SESSION_DEFS,
  SESSIONS_DEFAULTS,
  type SessionDef,
} from "@/features/sessions/runtime";

export const SESSIONS_STUDY_NAME = "Forge Sessions";
export const SESSIONS_STUDY_ID = "ForgeSessions@tv-basicstudies-1";

const SLOT_COUNT = 4;
const SLOT_LABELS = ["A", "B", "C", "D"] as const;

function hoursDisplay(hhmmRange: string): string {
  // 0700-0927 → 07:00-09:27 (matches LuxAlgo hours row)
  const m = hhmmRange.match(/^(\d{2})(\d{2})-(\d{2})(\d{2})$/);
  if (!m) return hhmmRange;
  return `${m[1]}:${m[2]}-${m[3]}:${m[4]}`;
}

function slotDefaults(index: number): Record<string, string | boolean> {
  const d = DEFAULT_SESSION_DEFS[index] ?? DEFAULT_SESSION_DEFS[0]!;
  const L = SLOT_LABELS[index] ?? String(index + 1);
  return {
    [`s${L}Enable`]: d.enable,
    [`s${L}Name`]: d.name,
    [`s${L}Hours`]: hoursDisplay(d.hours),
    [`s${L}Range`]: d.range,
    [`s${L}Trendline`]: d.trendline,
    [`s${L}Mean`]: d.mean,
    [`s${L}Vwap`]: d.vwap,
    [`s${L}MaxMin`]: d.maxMin,
    [`s${L}Color`]: d.color,
  };
}

function buildSlotInputs(index: number): Array<Record<string, unknown>> {
  const d = DEFAULT_SESSION_DEFS[index] ?? DEFAULT_SESSION_DEFS[0]!;
  const L = SLOT_LABELS[index]!;
  const group = `SESSION ${L}`;
  return [
    { id: `s${L}Enable`, name: `${group} · Enable`, defval: d.enable, type: "bool" },
    { id: `s${L}Name`, name: `${group} · Name`, defval: d.name, type: "text" },
    {
      id: `s${L}Hours`,
      name: `${group} · Hours (HH:MM-HH:MM)`,
      defval: hoursDisplay(d.hours),
      type: "text",
    },
    { id: `s${L}Range`, name: `${group} · Range`, defval: d.range, type: "bool" },
    { id: `s${L}Trendline`, name: `${group} · Trendline`, defval: d.trendline, type: "bool" },
    { id: `s${L}Mean`, name: `${group} · Mean`, defval: d.mean, type: "bool" },
    { id: `s${L}Vwap`, name: `${group} · VWAP`, defval: d.vwap, type: "bool" },
    { id: `s${L}MaxMin`, name: `${group} · Max/Min`, defval: d.maxMin, type: "bool" },
    { id: `s${L}Color`, name: `${group} · Color (#hex)`, defval: d.color, type: "text" },
  ];
}

const slotInputDefaults: Record<string, string | boolean> = {};
for (let i = 0; i < SLOT_COUNT; i += 1) Object.assign(slotInputDefaults, slotDefaults(i));

export const SESSIONS_STUDY_DEFAULTS = {
  ...slotInputDefaults,
  extraSessions: "",
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
} as const;

export function readSessionSlotsFromMap(map: Map<string, unknown>): SessionDef[] {
  const slots: SessionDef[] = [];
  for (let i = 0; i < SLOT_COUNT; i += 1) {
    const L = SLOT_LABELS[i]!;
    const fallback = DEFAULT_SESSION_DEFS[i]!;
    const bool = (id: string, fb: boolean) => {
      const v = map.get(id);
      return typeof v === "boolean" ? v : fb;
    };
    const str = (id: string, fb: string) => {
      const v = map.get(id);
      return typeof v === "string" && v.trim() ? v : fb;
    };
    slots.push({
      enable: bool(`s${L}Enable`, fallback.enable),
      name: str(`s${L}Name`, fallback.name),
      hours: str(`s${L}Hours`, hoursDisplay(fallback.hours)),
      range: bool(`s${L}Range`, fallback.range),
      trendline: bool(`s${L}Trendline`, fallback.trendline),
      mean: bool(`s${L}Mean`, fallback.mean),
      vwap: bool(`s${L}Vwap`, fallback.vwap),
      maxMin: bool(`s${L}MaxMin`, fallback.maxMin),
      color: str(`s${L}Color`, fallback.color),
    });
  }
  return slots;
}

export function createSessionsIndicator(PineJS: {
  Std: { close: (ctx: unknown) => number };
}): CustomIndicator {
  const slotInputs = Array.from({ length: SLOT_COUNT }, (_, i) => buildSlotInputs(i)).flat();

  return {
    name: SESSIONS_STUDY_NAME,
    metainfo: {
      _metainfoVersion: 53,
      id: SESSIONS_STUDY_ID as never,
      name: SESSIONS_STUDY_NAME,
      description: SESSIONS_STUDY_NAME,
      shortDescription: "LuxAlgo Sessions",
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
        ...slotInputs,
        {
          id: "extraSessions",
          name: "Extra sessions (unlimited) Name HH:MM-HH:MM",
          defval: SESSIONS_STUDY_DEFAULTS.extraSessions,
          type: "text",
        },
        {
          id: "timezoneOffset",
          name: "Timezone · UTC (+/-)",
          defval: SESSIONS_STUDY_DEFAULTS.timezoneOffset,
          type: "integer",
          min: -12,
          max: 14,
        },
        {
          id: "useExchangeTimezone",
          name: "Timezone · Use Exchange Timezone",
          defval: SESSIONS_STUDY_DEFAULTS.useExchangeTimezone,
          type: "bool",
        },
        {
          id: "exchangeTimezone",
          name: "Timezone · IANA (when Exchange on)",
          defval: SESSIONS_STUDY_DEFAULTS.exchangeTimezone,
          type: "text",
        },
        {
          id: "rangeTransparency",
          name: "Ranges · Area Transparency",
          defval: SESSIONS_STUDY_DEFAULTS.rangeTransparency,
          type: "integer",
          min: 0,
          max: 100,
        },
        {
          id: "showRangeOutline",
          name: "Ranges · Outline",
          defval: SESSIONS_STUDY_DEFAULTS.showRangeOutline,
          type: "bool",
        },
        {
          id: "showRangeLabel",
          name: "Ranges · Label",
          defval: SESSIONS_STUDY_DEFAULTS.showRangeLabel,
          type: "bool",
        },
        {
          id: "dashboard",
          name: "Dashboard · Enable",
          defval: SESSIONS_STUDY_DEFAULTS.dashboard,
          type: "bool",
        },
        {
          id: "advancedDashboard",
          name: "Dashboard · Advanced",
          defval: SESSIONS_STUDY_DEFAULTS.advancedDashboard,
          type: "bool",
        },
        {
          id: "dashboardPosition",
          name: "Dashboard · Position (0 TopRight, 1 BottomRight, 2 BottomLeft)",
          defval: SESSIONS_STUDY_DEFAULTS.dashboardPosition,
          type: "integer",
          min: 0,
          max: 2,
        },
        {
          id: "dashboardSize",
          name: "Dashboard · Size (0 Tiny … 4 Huge)",
          defval: SESSIONS_STUDY_DEFAULTS.dashboardSize,
          type: "integer",
          min: 0,
          max: 4,
        },
        {
          id: "showSessionDivider",
          name: "Dividers · Show Sessions Divider",
          defval: SESSIONS_STUDY_DEFAULTS.showSessionDivider,
          type: "bool",
        },
        {
          id: "showDayDivider",
          name: "Dividers · Show Daily Divider",
          defval: SESSIONS_STUDY_DEFAULTS.showDayDivider,
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

export const SESSIONS_PRESET_NAMES = DEFAULT_SESSION_DEFS.map((s) => s.name);
