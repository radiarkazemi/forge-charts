/**
 * Charting Library custom study: “Forge Sessions”.
 * Clean Inputs: session zones only (Enable / Name / Hours) + Midnight line.
 * Style tab: color + opacity per session. Drawings painted by `useSessionsStudy`.
 */

import type { CustomIndicator } from "@/infrastructure/tradingview";
import {
  DEFAULT_SESSION_DEFS,
  SESSION_COLOR_PALETTE,
  SESSIONS_DEFAULTS,
  type SessionDef,
} from "@/features/sessions/runtime";

export const SESSIONS_STUDY_NAME = "Forge Sessions";
export const SESSIONS_STUDY_ID = "ForgeSessions@tv-basicstudies-1";

/** Max sessions (Inputs “+” grows sessionCount up to this). */
export const SESSIONS_MAX_COUNT = 12;

const SLOT_IDS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"] as const;

function hoursSession(hhmmRange: string): string {
  // CL session inputs use HHMM-HHMM
  const m = hhmmRange.match(/^(\d{2}):?(\d{2})-(\d{2}):?(\d{2})$/);
  if (!m) return hhmmRange.replace(/:/g, "");
  return `${m[1]}${m[2]}-${m[3]}${m[4]}`;
}

function defaultSlot(index: number): SessionDef {
  const preset = DEFAULT_SESSION_DEFS[index];
  if (preset) return { ...preset, range: true, trendline: false, mean: false, vwap: false, maxMin: false };
  return {
    enable: false,
    name: `S${index + 1}`,
    hours: "0000-0100",
    range: true,
    trendline: false,
    mean: false,
    vwap: false,
    maxMin: false,
    color: SESSION_COLOR_PALETTE[index % SESSION_COLOR_PALETTE.length]!,
  };
}

function stylePlotId(slot: string): string {
  return `style_s${slot}`;
}

/** Zone-only inputs — no trendline / mean / VWAP / max-min clutter. */
function buildSlotInputs(index: number): Array<Record<string, unknown>> {
  const d = defaultSlot(index);
  const L = SLOT_IDS[index]!;
  const group = `SESSION ${L}`;
  const vis = index === 0 ? undefined : `sessionCount >= ${index + 1}`;
  const base = { ...(vis ? { visible: vis } : {}) };
  return [
    { ...base, id: `s${L}Enable`, name: `${group} · Enable`, defval: d.enable, type: "bool" },
    { ...base, id: `s${L}Name`, name: `${group} · Name`, defval: d.name, type: "text" },
    {
      ...base,
      id: `s${L}Hours`,
      name: `${group} · Hours`,
      defval: hoursSession(d.hours),
      type: "session",
    },
  ];
}

const DEFAULT_ZONE_COUNT = 8;

const slotInputDefaults: Record<string, string | number | boolean> = {
  sessionCount: DEFAULT_ZONE_COUNT,
  addSession: false,
  removeSession: false,
};
for (let i = 0; i < SESSIONS_MAX_COUNT; i += 1) {
  const d = defaultSlot(i);
  const L = SLOT_IDS[i]!;
  Object.assign(slotInputDefaults, {
    [`s${L}Enable`]: i < DEFAULT_ZONE_COUNT ? d.enable : false,
    [`s${L}Name`]: d.name,
    [`s${L}Hours`]: hoursSession(d.hours),
  });
}

export const SESSIONS_STUDY_DEFAULTS = {
  ...slotInputDefaults,
  extraSessions: "",
  timezoneOffset: SESSIONS_DEFAULTS.timezoneOffset,
  useExchangeTimezone: SESSIONS_DEFAULTS.useExchangeTimezone,
  exchangeTimezone: SESSIONS_DEFAULTS.exchangeTimezone,
  showRangeOutline: SESSIONS_DEFAULTS.showRangeOutline,
  showRangeLabel: SESSIONS_DEFAULTS.showRangeLabel,
  showMidnightLine: SESSIONS_DEFAULTS.showMidnightLine,
  dashboard: false,
  advancedDashboard: false,
  dashboardPosition: 0,
  dashboardSize: 1,
  showSessionDivider: false,
  showDayDivider: false,
} as const;

export function readSessionSlotsFromMap(map: Map<string, unknown>): SessionDef[] {
  const count = Math.max(
    1,
    Math.min(SESSIONS_MAX_COUNT, Math.floor(Number(map.get("sessionCount")) || DEFAULT_ZONE_COUNT)),
  );
  const slots: SessionDef[] = [];
  for (let i = 0; i < count; i += 1) {
    const L = SLOT_IDS[i]!;
    const fallback = defaultSlot(i);
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
      hours: str(`s${L}Hours`, hoursSession(fallback.hours)),
      // Zones only — overlays permanently off.
      range: true,
      trendline: false,
      mean: false,
      vwap: false,
      maxMin: false,
      color: fallback.color,
    });
  }
  return slots;
}

export function stylePlotIdForIndex(index: number): string {
  return stylePlotId(SLOT_IDS[index] ?? "A");
}

export function createSessionsIndicator(PineJS: {
  Std: { close: (ctx: unknown) => number; na?: (v: number) => boolean };
}): CustomIndicator {
  const slotInputs = Array.from({ length: SESSIONS_MAX_COUNT }, (_, i) =>
    buildSlotInputs(i),
  ).flat();

  const stylePlots = SLOT_IDS.map((L) => ({ id: stylePlotId(L), type: "line" as const }));
  const stylesMeta: Record<string, { title: string; histogramBase: number }> = {};
  const stylesDefaults: Record<string, Record<string, unknown>> = {};
  for (let i = 0; i < SESSIONS_MAX_COUNT; i += 1) {
    const L = SLOT_IDS[i]!;
    const d = defaultSlot(i);
    const id = stylePlotId(L);
    stylesMeta[id] = {
      title: i < DEFAULT_ZONE_COUNT ? d.name : `Session ${L}`,
      histogramBase: 0,
    };
    stylesDefaults[id] = {
      linestyle: 0,
      linewidth: 1,
      plottype: 0,
      trackPrice: false,
      transparency: SESSIONS_DEFAULTS.rangeTransparency,
      visible: false,
      color: d.color,
      display: 0,
    };
  }

  return {
    name: SESSIONS_STUDY_NAME,
    metainfo: {
      _metainfoVersion: 53,
      id: SESSIONS_STUDY_ID as never,
      name: SESSIONS_STUDY_NAME,
      description: SESSIONS_STUDY_NAME,
      shortDescription: "Sessions + Midnight",
      isCustomIndicator: true,
      is_price_study: true,
      linkedToSeries: true,
      format: { type: "inherit" },
      plots: [{ id: "plot_hidden", type: "line" }, ...stylePlots],
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
            display: 0,
          },
          ...stylesDefaults,
        },
        inputs: { ...SESSIONS_STUDY_DEFAULTS },
      },
      styles: {
        plot_hidden: { title: "Hidden", histogramBase: 0, isHidden: true },
        ...stylesMeta,
      },
      inputs: [
        {
          id: "sessionCount",
          name: "Sessions · count (1–12)",
          defval: DEFAULT_ZONE_COUNT,
          type: "integer",
          min: 1,
          max: SESSIONS_MAX_COUNT,
        },
        {
          id: "addSession",
          name: "+ Add session zone",
          defval: false,
          type: "bool",
        },
        {
          id: "removeSession",
          name: "− Remove last zone",
          defval: false,
          type: "bool",
        },
        ...slotInputs,
        {
          id: "extraSessions",
          name: "Extra sessions",
          defval: "",
          type: "text",
          isHidden: true,
        },
        {
          id: "showMidnightLine",
          name: "Midnight line · Enable (00:00 open → tip − 5×1m)",
          defval: SESSIONS_STUDY_DEFAULTS.showMidnightLine,
          type: "bool",
        },
        {
          id: "timezoneOffset",
          name: "Timezone · UTC (+/-)  [default New York −4]",
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
          name: "Timezone · IANA (only if Exchange on)",
          defval: SESSIONS_STUDY_DEFAULTS.exchangeTimezone,
          type: "text",
        },
        {
          id: "showRangeOutline",
          name: "Zones · Outline",
          defval: SESSIONS_STUDY_DEFAULTS.showRangeOutline,
          type: "bool",
        },
        {
          id: "showRangeLabel",
          name: "Zones · Label",
          defval: SESSIONS_STUDY_DEFAULTS.showRangeLabel,
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
        const na = PineJS.Std.na?.(raw) ?? !Number.isFinite(raw);
        const v = !na && Number.isFinite(raw) ? raw : (this._lastClose ?? raw);
        if (Number.isFinite(v) && v !== 0) this._lastClose = v;
        const out = Number.isFinite(this._lastClose) ? this._lastClose! : 1;
        return [out, ...SLOT_IDS.map(() => NaN)];
      };
    } as never,
  };
}

export const SESSIONS_PRESET_NAMES = DEFAULT_SESSION_DEFS.map((s) => s.name);
export { SLOT_IDS };
