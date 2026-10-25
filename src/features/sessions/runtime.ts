/**
 * Forge Sessions — LuxAlgo Sessions port (CC BY-NC-SA 4.0 © LuxAlgo).
 * Overlay boxes / lines / labels / dashboard stats from exported OHLC.
 */

import type { EntityId, IChartWidgetApi } from "@/infrastructure/tradingview";
import type { DrawCmd } from "@/features/pine/orca-runtime";

/**
 * LuxAlgo Sessions style colors (New York / London / Tokyo / Sydney).
 * Soft palette — auto-assigned when a session line has no color.
 */
export const SESSION_COLOR_PALETTE = [
  "#ff5d00", // New York — orange
  "#2157f3", // London — blue
  "#e91e63", // Tokyo — pink
  "#ffeb3b", // Sydney — yellow
  "#00bcd4",
  "#9c27b0",
  "#8bc34a",
  "#ff9800",
] as const;

export interface SessionDef {
  readonly enable: boolean;
  readonly name: string;
  readonly hours: string;
  readonly range: boolean;
  readonly trendline: boolean;
  readonly mean: boolean;
  readonly vwap: boolean;
  readonly maxMin: boolean;
  readonly color: string;
  /** Box opacity from Style tab (0–100 transparency). */
  readonly transparency?: number;
}

export interface SessionsOptions {
  readonly sessions: readonly SessionDef[];
  /** 0 = draw every completed session in the loaded bars (no artificial cap). */
  readonly historyLimit: number;
  readonly timezoneOffset: number;
  readonly useExchangeTimezone: boolean;
  readonly exchangeTimezone: string;
  readonly rangeTransparency: number;
  readonly showRangeOutline: boolean;
  readonly showRangeLabel: boolean;
  readonly dashboard: boolean;
  readonly advancedDashboard: boolean;
  readonly dashboardPosition: 0 | 1 | 2;
  readonly dashboardSize: 0 | 1 | 2 | 3 | 4;
  readonly showSessionDivider: boolean;
  readonly showDayDivider: boolean;
}

export interface SessionBar {
  readonly time: number;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
}

export interface SessionDashRow {
  readonly name: string;
  readonly color: string;
  readonly status: "Active" | "Inactive" | "Disabled";
  readonly trend: number | null;
  readonly volume: number | null;
  readonly sigma: number | null;
}

export interface SessionsDashboardState {
  readonly title: string;
  readonly advanced: boolean;
  readonly position: 0 | 1 | 2;
  readonly size: 0 | 1 | 2 | 3 | 4;
  readonly rows: readonly SessionDashRow[];
}

/**
 * Trader startup presets (from LuxAlgo Sessions setup).
 * Colors match LuxAlgo Style defaults: NY orange, London blue, Tokyo pink, Sydney yellow.
 * Hours are interpreted in New York time (UTC−4).
 */
export const DEFAULT_SESSION_DEFS: SessionDef[] = [
  {
    enable: true,
    name: "LQ",
    hours: "0700-0927",
    range: true,
    trendline: false,
    mean: false,
    vwap: false,
    maxMin: false,
    color: "#ff5d00", // New York
  },
  {
    enable: true,
    name: "Open",
    hours: "0930-1100",
    range: true,
    trendline: false,
    mean: false,
    vwap: false,
    maxMin: false,
    color: "#2157f3", // London
  },
  {
    enable: true,
    name: "NY1",
    hours: "0850-0910",
    range: true,
    trendline: false,
    mean: false,
    vwap: false,
    maxMin: false,
    color: "#e91e63", // Tokyo
  },
  {
    enable: true,
    name: "NY2",
    hours: "0950-1010",
    range: true,
    trendline: false,
    mean: false,
    vwap: false,
    maxMin: false,
    color: "#ffeb3b", // Sydney
  },
];

/** One zone per line — add more lines for unlimited sessions. */
export const DEFAULT_SESSIONS_TEXT = [
  "LQ 07:00-09:27 #ff5d00",
  "Open 09:30-11:00 #2157f3",
  "NY1 08:50-09:10 #e91e63",
  "NY2 09:50-10:10 #ffeb3b",
].join("\n");

export const SESSIONS_DEFAULTS = {
  sessionsText: DEFAULT_SESSIONS_TEXT,
  historyLimit: 0,
  /** Fixed New York offset (UTC−4). Hours below are NY wall-clock. */
  timezoneOffset: -4,
  useExchangeTimezone: false,
  exchangeTimezone: "America/New_York",
  /** LuxAlgo default is 90; CL rectangles need a bit more fill to stay visible. */
  rangeTransparency: 80,
  showRangeOutline: true,
  showRangeLabel: true,
  dashboard: false,
  advancedDashboard: false,
  dashboardPosition: 0 as 0 | 1 | 2,
  dashboardSize: 1 as 0 | 1 | 2 | 3 | 4,
  showSessionDivider: false,
  showDayDivider: true,
} as const;

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

/** Normalize `07:00`, `700`, `0700` → `0700`. */
function normalizeTimeToken(raw: string): string | null {
  const t = raw.trim();
  const colon = t.match(/^(\d{1,2}):(\d{2})$/);
  if (colon) {
    const hh = Number(colon[1]);
    const mm = Number(colon[2]);
    if (hh > 23 || mm > 59) return null;
    return `${String(hh).padStart(2, "0")}${String(mm).padStart(2, "0")}`;
  }
  if (/^\d{3,4}$/.test(t)) {
    const n = Number(t.padStart(4, "0"));
    const hh = Math.floor(n / 100);
    const mm = n % 100;
    if (hh > 23 || mm > 59) return null;
    return `${String(hh).padStart(2, "0")}${String(mm).padStart(2, "0")}`;
  }
  return null;
}

/** Parse `HHMM-HHMM` or `HH:MM-HH:MM` into minutes-from-midnight. */
export function parseSessionHours(hours: string): { startMin: number; endMin: number } | null {
  const m = String(hours ?? "")
    .trim()
    .match(/^(.+?)\s*-\s*(.+)$/);
  if (!m) return null;
  const a = normalizeTimeToken(m[1]!);
  const b = normalizeTimeToken(m[2]!);
  if (!a || !b) return null;
  const toMin = (hhmm: string) => {
    const n = Number(hhmm);
    return Math.floor(n / 100) * 60 + (n % 100);
  };
  return { startMin: toMin(a), endMin: toMin(b) };
}

function normalizeHoursKey(hours: string): string | null {
  const parsed = parseSessionHours(hours);
  if (!parsed) return null;
  const fmt = (mins: number) => {
    const hh = Math.floor(mins / 60);
    const mm = mins % 60;
    return `${String(hh).padStart(2, "0")}${String(mm).padStart(2, "0")}`;
  };
  return `${fmt(parsed.startMin)}-${fmt(parsed.endMin)}`;
}

function parseHexColor(raw: string | undefined, fallback: string): string {
  const v = (raw ?? "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v;
  if (/^[0-9a-fA-F]{6}$/.test(v)) return `#${v}`;
  return fallback;
}

/**
 * Trader-friendly session list (unlimited — one zone per line):
 *   LQ 07:00-09:27
 *   Open 09:30-11:00 #2157f3
 *   NY1|0850-0910|#e91e63
 */
export function parseSessionsText(text: string): SessionDef[] {
  const out: SessionDef[] = [];
  for (const line of String(text ?? "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    // Pipe form: Name|HHMM-HHMM|#hex|range|trend|mean|vwap|maxmin
    if (trimmed.includes("|")) {
      const parts = trimmed.split("|").map((p) => p.trim());
      if (parts.length < 2) continue;
      const hours = normalizeHoursKey(parts[1] ?? "");
      if (!hours) continue;
      const color = parseHexColor(
        parts[2],
        SESSION_COLOR_PALETTE[out.length % SESSION_COLOR_PALETTE.length]!,
      );
      const flag = (i: number, fallback: boolean) => {
        const v = (parts[i] ?? "").toLowerCase();
        if (!v) return fallback;
        return v === "1" || v === "true" || v === "yes" || v === "on";
      };
      out.push({
        enable: true,
        name: parts[0] || `S${out.length + 1}`,
        hours,
        color,
        range: flag(3, true),
        trendline: flag(4, false),
        mean: flag(5, false),
        vwap: flag(6, false),
        maxMin: flag(7, false),
      });
      continue;
    }

    // Simple form: Name HH:MM-HH:MM [#hex]
    const simple = trimmed.match(
      /^(\S+)\s+(\d{1,2}:?\d{2}\s*-\s*\d{1,2}:?\d{2})(?:\s+(#[0-9a-fA-F]{6}|[0-9a-fA-F]{6}))?\s*$/i,
    );
    if (!simple) continue;
    const hours = normalizeHoursKey(simple[2]!);
    if (!hours) continue;
    out.push({
      enable: true,
      name: simple[1]!,
      hours,
      color: parseHexColor(
        simple[3],
        SESSION_COLOR_PALETTE[out.length % SESSION_COLOR_PALETTE.length]!,
      ),
      range: true,
      trendline: false,
      mean: false,
      vwap: false,
      maxMin: false,
    });
  }
  return out;
}

/** @deprecated alias — use parseSessionsText */
export function parseExtraSessions(text: string): SessionDef[] {
  return parseSessionsText(text);
}

/** Merge SESSION A–D slots with unlimited Extra sessions lines. */
export function mergeSessionDefs(
  slots: readonly SessionDef[],
  _sessionCount: number,
  extraText: string,
): SessionDef[] {
  const fromSlots = slots.filter((s) => s.enable && s.name.trim() && parseSessionHours(s.hours));
  const extras = parseSessionsText(extraText);
  const merged = [...fromSlots, ...extras];
  return merged.length > 0 ? merged : [...DEFAULT_SESSION_DEFS];
}

function tzOffsetSeconds(utcSec: number, opts: SessionsOptions): number {
  if (opts.useExchangeTimezone) {
    const tz = opts.exchangeTimezone.trim() || "America/New_York";
    try {
      return ianaOffsetSeconds(tz, utcSec);
    } catch {
      /* fall through */
    }
  }
  return Math.round(opts.timezoneOffset * 3600);
}

function ianaOffsetSeconds(timeZone: string, utcSec: number): number {
  const d = new Date(utcSec * 1000);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = fmt.formatToParts(d);
  const tz = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const m = tz.match(/^(?:GMT|UTC)([+-])(\d{1,2})(?::?(\d{2}))?$/i);
  if (!m) {
    // Fallback: compare locale wall time
    const asUtc = new Date(d.toLocaleString("en-US", { timeZone: "UTC" })).getTime();
    const asTz = new Date(d.toLocaleString("en-US", { timeZone })).getTime();
    return Math.round((asTz - asUtc) / 1000);
  }
  const sign = m[1] === "-" ? -1 : 1;
  const hh = Number(m[2]);
  const mm = Number(m[3] ?? "0");
  return sign * (hh * 3600 + mm * 60);
}

function localMinutes(utcSec: number, offsetSec: number): number {
  const shifted = utcSec + offsetSec;
  const daySec = ((shifted % 86_400) + 86_400) % 86_400;
  return Math.floor(daySec / 60);
}

function localWeekday(utcSec: number, offsetSec: number): number {
  // 0=Sunday … match JS / Pine dayofweek
  const shifted = (utcSec + offsetSec) * 1000;
  return new Date(shifted).getUTCDay();
}

export function isSessionActive(
  utcSec: number,
  hours: string,
  opts: SessionsOptions,
): boolean {
  const parsed = parseSessionHours(hours);
  if (!parsed) return false;
  const { startMin, endMin } = parsed;
  if (startMin === endMin) return false;
  const mins = localMinutes(utcSec, tzOffsetSeconds(utcSec, opts));
  if (startMin < endMin) return mins >= startMin && mins < endMin;
  return mins >= startMin || mins < endMin;
}

interface RunState {
  active: boolean;
  startIdx: number;
  startTime: number;
  high: number;
  low: number;
  length: number;
  cumClose: number;
  cumWeighted: number;
  cumSq: number;
  vwapNum: number;
  vwapDen: number;
  firstValue: number;
  lastValue: number;
  deviation: number;
  correlation: number | null;
  completedHigh: number | null;
  completedLow: number | null;
  maxMinFromIdx: number | null;
}

function freshRun(bar: SessionBar, idx: number): RunState {
  const c = bar.close;
  return {
    active: true,
    startIdx: idx,
    startTime: bar.time,
    high: bar.high,
    low: bar.low,
    length: 1,
    cumClose: c,
    cumWeighted: c,
    cumSq: c * c,
    vwapNum: c * Math.max(0, bar.volume),
    vwapDen: Math.max(0, bar.volume),
    firstValue: c,
    lastValue: c,
    deviation: 0,
    correlation: null,
    completedHigh: null,
    completedLow: null,
    maxMinFromIdx: null,
  };
}

function updateRegression(run: RunState): void {
  const length = run.length;
  const average = run.cumClose / length;
  const weightedAverage = run.cumWeighted / ((length * (length + 1)) / 2);
  const covariance = (weightedAverage - average) * (length + 1) / 2;
  const variance = Math.max(run.cumSq / length - average * average, 0);
  const corrDen =
    Math.sqrt(variance) * (Math.sqrt(length * length - 1) / (2 * Math.sqrt(3)));
  run.deviation = Math.sqrt(variance);
  run.correlation = corrDen !== 0 ? covariance / corrDen : null;
  run.firstValue = 4 * average - 3 * weightedAverage;
  run.lastValue = 3 * weightedAverage - 2 * average;
}

function stepRun(run: RunState, bar: SessionBar): void {
  run.high = Math.max(run.high, bar.high);
  run.low = Math.min(run.low, bar.low);
  run.length += 1;
  run.cumClose += bar.close;
  run.cumSq += bar.close * bar.close;
  run.cumWeighted += bar.close * run.length;
  run.vwapNum += bar.close * Math.max(0, bar.volume);
  run.vwapDen += Math.max(0, bar.volume);
  updateRegression(run);
}

function hexToRgb(color: string): { r: number; g: number; b: number } {
  const c = color.trim();
  const m = c.match(/^#?([0-9a-fA-F]{6})$/);
  if (!m) return { r: 137, g: 180, b: 250 };
  const n = m[1]!;
  return {
    r: Number.parseInt(n.slice(0, 2), 16),
    g: Number.parseInt(n.slice(2, 4), 16),
    b: Number.parseInt(n.slice(4, 6), 16),
  };
}

function withAlpha(color: string, transparency: number): string {
  const { r, g, b } = hexToRgb(color);
  const a = Math.max(0, Math.min(1, 1 - transparency / 100));
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function pushRange(
  cmds: DrawCmd[],
  run: RunState,
  endTime: number,
  def: SessionDef,
  opts: SessionsOptions,
): void {
  if (!def.range) return;
  // CL rectangles reject zero-width time spans.
  const t2 = endTime > run.startTime ? endTime : run.startTime + 60;
  const top = Math.max(run.high, run.low);
  const bot = Math.min(run.high, run.low);
  // Avoid degenerate price boxes (flat tick) — pad a tiny amount so CL accepts.
  const pad = Math.max(Math.abs(top) * 1e-6, 1e-8);
  const p1 = top === bot ? top + pad : top;
  const p2 = top === bot ? bot - pad : bot;
  const transparency =
    typeof def.transparency === "number" && Number.isFinite(def.transparency)
      ? def.transparency
      : opts.rangeTransparency;
  cmds.push({
    kind: "rect",
    t1: run.startTime,
    p1,
    t2,
    p2,
    color: def.color,
    fill: withAlpha(def.color, transparency),
    style: opts.showRangeOutline ? "dotted" : "solid",
    width: opts.showRangeOutline ? 2 : 1,
  });
  if (opts.showRangeLabel) {
    const mid = Math.floor((run.startTime + t2) / 2);
    cmds.push({
      kind: "label",
      t1: mid,
      p1,
      color: def.color,
      text: def.name,
    });
  }
}

function pushSessionOverlays(
  cmds: DrawCmd[],
  run: RunState,
  endTime: number,
  def: SessionDef,
): void {
  if (def.trendline && Number.isFinite(run.firstValue) && Number.isFinite(run.lastValue)) {
    cmds.push({
      kind: "line",
      t1: run.startTime,
      p1: run.firstValue,
      t2: endTime,
      p2: run.lastValue,
      color: def.color,
      width: 1,
      style: "solid",
    });
  }
  if (def.mean && run.length > 0) {
    const avg = run.cumClose / run.length;
    cmds.push({
      kind: "line",
      t1: run.startTime,
      p1: avg,
      t2: endTime,
      p2: avg,
      color: def.color,
      width: 1,
      style: "solid",
    });
  }
  if (def.vwap && run.vwapDen > 0) {
    const v = run.vwapNum / run.vwapDen;
    cmds.push({
      kind: "line",
      t1: run.startTime,
      p1: v,
      t2: endTime,
      p2: v,
      color: def.color,
      width: 1,
      style: "solid",
    });
  }
}

export interface SessionsComputeResult {
  readonly cmds: DrawCmd[];
  readonly dashboard: SessionsDashboardState | null;
}

/**
 * Replay bars and emit LuxAlgo-quality session drawings.
 * `historyLimit` 0 = unlimited completed ranges (all bars).
 */
export function computeSessions(
  bars: readonly SessionBar[],
  opts: SessionsOptions,
): SessionsComputeResult {
  const cmds: DrawCmd[] = [];
  if (bars.length < 2) return { cmds, dashboard: null };

  const defs = opts.sessions.filter((s) => s.enable && s.name.trim() && parseSessionHours(s.hours));
  const runs: (RunState | null)[] = defs.map(() => null);
  const completedBoxes: DrawCmd[][] = defs.map(() => []);

  let prevDay = -1;
  const lastBarTime = bars[bars.length - 1]!.time;
  // Only draw ~3 weeks of day dividers — older ones clutter and steal paint budget.
  const dayDividerFrom = lastBarTime - 21 * 86_400;

  for (let i = 0; i < bars.length; i += 1) {
    const bar = bars[i]!;
    const off = tzOffsetSeconds(bar.time, opts);
    const day = localWeekday(bar.time, off);

    if (opts.showDayDivider && bar.time >= dayDividerFrom) {
      if (prevDay >= 0 && day !== prevDay) {
        cmds.push({
          kind: "vline",
          t1: bar.time,
          p1: bar.close,
          color: "#808080",
          width: 1,
          style: "dashed",
        });
        cmds.push({
          kind: "label",
          t1: bar.time,
          p1: bar.high,
          color: "#808080",
          text: DAY_NAMES[day] ?? "",
        });
      }
      prevDay = day;
    } else if (opts.showDayDivider) {
      prevDay = day;
    }

    for (let s = 0; s < defs.length; s += 1) {
      const def = defs[s]!;
      const active = isSessionActive(bar.time, def.hours, opts);
      let run = runs[s];

      if (active && (!run || !run.active)) {
        // Close prior max/min extension at the bar before this session.
        if (run && run.maxMinFromIdx != null && def.maxMin && run.completedHigh != null) {
          const from = bars[run.maxMinFromIdx]!;
          const to = bars[Math.max(0, i - 1)]!;
          cmds.push({
            kind: "line",
            t1: from.time,
            p1: run.completedHigh,
            t2: to.time,
            p2: run.completedHigh,
            color: def.color,
            width: 1,
            style: "solid",
          });
          cmds.push({
            kind: "line",
            t1: from.time,
            p1: run.completedLow!,
            t2: to.time,
            p2: run.completedLow!,
            color: def.color,
            width: 1,
            style: "solid",
          });
        }
        run = freshRun(bar, i);
        updateRegression(run);
        runs[s] = run;
        if (opts.showSessionDivider) {
          cmds.push({
            kind: "label",
            t1: bar.time,
            p1: bar.low,
            color: def.color,
            text: "❚",
          });
        }
      } else if (active && run && run.active) {
        stepRun(run, bar);
      } else if (!active && run && run.active) {
        // Session just closed on previous bar.
        const endBar = bars[Math.max(run.startIdx, i - 1)]!;
        const boxCmds: DrawCmd[] = [];
        pushRange(boxCmds, run, endBar.time, def, opts);
        pushSessionOverlays(boxCmds, run, endBar.time, def);
        completedBoxes[s]!.push(...boxCmds);
        run.active = false;
        run.completedHigh = run.high;
        run.completedLow = run.low;
        run.maxMinFromIdx = i > 0 ? i - 1 : i;
        if (opts.showSessionDivider) {
          cmds.push({
            kind: "label",
            t1: endBar.time,
            p1: endBar.low,
            color: def.color,
            text: "❚",
          });
        }
      }
    }
  }

  // Active (forming) sessions + trailing max/min to last bar.
  const last = bars[bars.length - 1]!;
  for (let s = 0; s < defs.length; s += 1) {
    const def = defs[s]!;
    const run = runs[s];
    if (!run) continue;
    if (run.active) {
      pushRange(cmds, run, last.time, def, opts);
      pushSessionOverlays(cmds, run, last.time, def);
    } else if (def.maxMin && run.completedHigh != null && run.maxMinFromIdx != null) {
      const from = bars[run.maxMinFromIdx]!;
      cmds.push({
        kind: "line",
        t1: from.time,
        p1: run.completedHigh,
        t2: last.time,
        p2: run.completedHigh,
        color: def.color,
        width: 1,
        style: "solid",
      });
      cmds.push({
        kind: "line",
        t1: from.time,
        p1: run.completedLow!,
        t2: last.time,
        p2: run.completedLow!,
        color: def.color,
        width: 1,
        style: "solid",
      });
    }
  }

  // Apply per-session history limit (0 = unlimited).
  for (let s = 0; s < defs.length; s += 1) {
    const boxCmds = completedBoxes[s]!;
    if (opts.historyLimit > 0) {
      // Each range is ~1–2 cmds; keep last N range groups roughly.
      const per = Math.max(1, opts.historyLimit) * 3;
      cmds.push(...boxCmds.slice(Math.max(0, boxCmds.length - per)));
    } else {
      cmds.push(...boxCmds);
    }
  }

  const dashboard = opts.dashboard
    ? buildDashboard(defs, runs, bars, opts)
    : null;

  return { cmds, dashboard };
}

function buildDashboard(
  defs: readonly SessionDef[],
  runs: readonly (RunState | null)[],
  bars: readonly SessionBar[],
  opts: SessionsOptions,
): SessionsDashboardState {
  const last = bars[bars.length - 1]!;
  const rows: SessionDashRow[] = defs.map((def, s) => {
    const active = isSessionActive(last.time, def.hours, opts);
    const run = runs[s];
    return {
      name: def.name,
      color: def.color,
      status: active ? "Active" : "Inactive",
      trend: opts.advancedDashboard ? (run?.correlation ?? null) : null,
      volume: opts.advancedDashboard ? (run?.vwapDen ?? null) : null,
      sigma: opts.advancedDashboard ? (run?.deviation ?? null) : null,
    };
  });
  return {
    title: "Sessions [Forge]",
    advanced: opts.advancedDashboard,
    position: opts.dashboardPosition,
    size: opts.dashboardSize,
    rows,
  };
}

function clColor(color: string, fallback = "#888888"): string {
  const c = (color || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(c)) return c;
  if (/^#[0-9a-fA-F]{3}$/.test(c)) {
    const r = c[1]!;
    const g = c[2]!;
    const b = c[3]!;
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  const m = c.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (m) {
    const hex = (n: string) => Number(n).toString(16).padStart(2, "0");
    return `#${hex(m[1]!)}${hex(m[2]!)}${hex(m[3]!)}`;
  }
  return fallback;
}

function parseRgba(fill: string | undefined, stroke: string): {
  r: number;
  g: number;
  b: number;
  a: number;
} {
  if (fill) {
    const m = fill.match(
      /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([0-9.]+)\s*)?\)$/i,
    );
    if (m) {
      return {
        r: Number(m[1]),
        g: Number(m[2]),
        b: Number(m[3]),
        a: m[4] != null ? Number(m[4]) : 1,
      };
    }
  }
  const { r, g, b } = hexToRgb(stroke);
  return { r, g, b, a: 0.1 };
}

const linestyleMap = { solid: 0, dotted: 1, dashed: 2 } as const;

/** Paint session drawings — rectangles first so zones always win the budget. */
export async function paintSessionsOnChart(
  chart: IChartWidgetApi,
  cmds: readonly DrawCmd[],
  options?: { readonly ownerStudyId?: EntityId; readonly maxDrawings?: number },
): Promise<EntityId[]> {
  const ids: EntityId[] = [];
  const maxDrawings = options?.maxDrawings ?? 2_000;
  // Prefer range boxes / overlays over day-divider noise.
  const ordered = [
    ...cmds.filter((c) => c.kind === "rect"),
    ...cmds.filter((c) => c.kind === "line"),
    ...cmds.filter((c) => c.kind === "label" || c.kind === "dot"),
    ...cmds.filter((c) => c.kind === "vline"),
  ];
  const limited = ordered.length > maxDrawings ? ordered.slice(0, maxDrawings) : ordered;
  const ownerStudyId = options?.ownerStudyId;

  for (let i = 0; i < limited.length; i += 1) {
    const cmd = limited[i]!;
    const stroke = clColor(cmd.color);
    const common = {
      disableSelection: true,
      disableSave: true,
      disableUndo: true,
      showInObjectsTree: false,
      ...(ownerStudyId ? { ownerStudyId } : {}),
    } as const;
    try {
      if (cmd.kind === "vline") {
        const id = await chart.createShape(
          { time: cmd.t1 as never, price: cmd.p1 },
          {
            ...common,
            shape: "vertical_line",
            overrides: {
              linecolor: stroke,
              linewidth: cmd.width ?? 1,
              linestyle: linestyleMap[cmd.style ?? "dashed"],
              showLabel: false,
            },
          },
        );
        if (id) ids.push(id);
      } else if (cmd.kind === "line" && cmd.t2 != null && cmd.p2 != null) {
        const id = await chart.createMultipointShape(
          [
            { time: cmd.t1 as never, price: cmd.p1 },
            { time: cmd.t2 as never, price: cmd.p2 },
          ],
          {
            ...common,
            shape: "trend_line",
            overrides: {
              linecolor: stroke,
              linewidth: cmd.width ?? 1,
              linestyle: linestyleMap[cmd.style ?? "solid"],
              showLabel: false,
              text: "",
            },
          },
        );
        if (id) ids.push(id);
      } else if (cmd.kind === "rect" && cmd.t2 != null && cmd.p2 != null) {
        // Match Dealing Ranges paint path (known-good CL rectangle overrides).
        const { r, g, b, a } = parseRgba(cmd.fill, stroke);
        const alpha = Math.max(0.12, Math.min(0.45, a > 0 ? a : 0.2));
        const id = await chart.createMultipointShape(
          [
            { time: cmd.t1 as never, price: cmd.p1 },
            { time: cmd.t2 as never, price: cmd.p2 },
          ],
          {
            ...common,
            shape: "rectangle",
            overrides: {
              color: stroke,
              backgroundColor: `rgba(${r}, ${g}, ${b}, ${alpha})`,
              fillBackground: true,
              linewidth: optsShowOutline(cmd) ? 2 : 1,
              linestyle: linestyleMap[cmd.style ?? "dotted"],
              transparency: Math.round((1 - alpha) * 100),
            },
          },
        );
        if (id) ids.push(id);
      } else if (cmd.kind === "label" || cmd.kind === "dot") {
        const text = cmd.kind === "dot" ? "·" : (cmd.text ?? "").trim() || "·";
        const id = await chart.createShape(
          { time: cmd.t1 as never, price: cmd.p1 },
          {
            ...common,
            shape: "text",
            text,
            overrides: {
              color: stroke,
              fontsize: cmd.kind === "dot" ? 10 : 12,
              fillBackground: false,
              drawBorder: false,
              bold: false,
            },
          },
        );
        if (id) ids.push(id);
      }
    } catch {
      /* skip bad draw */
    }
    if (i > 0 && i % 4 === 0) {
      await new Promise<void>((r) => {
        window.setTimeout(r, 0);
      });
    }
  }
  return ids;
}

function optsShowOutline(cmd: DrawCmd): boolean {
  return (cmd.width ?? 1) > 0 && cmd.style !== "solid";
}

/* ── Dashboard pub/sub for React overlay ─────────────────────────── */

type DashListener = () => void;
let dashState: SessionsDashboardState | null = null;
const dashListeners = new Set<DashListener>();

export function publishSessionsDashboard(state: SessionsDashboardState | null): void {
  dashState = state;
  for (const l of dashListeners) l();
}

export function getSessionsDashboard(): SessionsDashboardState | null {
  return dashState;
}

export function subscribeSessionsDashboard(listener: DashListener): () => void {
  dashListeners.add(listener);
  return () => {
    dashListeners.delete(listener);
  };
}
