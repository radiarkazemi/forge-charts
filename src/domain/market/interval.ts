/**
 * Chart resolution using TradingView notation:
 * - plain number  → minutes (`"1"`, `"15"`, `"240"`)
 * - `<n>S`        → seconds
 * - `<n>D|W|M`    → days / weeks / months
 */
export type Interval = string;

export type IntervalUnit = "seconds" | "minutes" | "days" | "weeks" | "months";

export interface ParsedInterval {
  readonly unit: IntervalUnit;
  readonly count: number;
  /** Nominal duration in seconds (months use 30 days). */
  readonly seconds: number;
}

const SECONDS_PER: Readonly<Record<IntervalUnit, number>> = {
  seconds: 1,
  minutes: 60,
  days: 86_400,
  weeks: 604_800,
  months: 2_592_000,
};

const UNIT_BY_SUFFIX: Readonly<Record<string, IntervalUnit>> = {
  S: "seconds",
  D: "days",
  W: "weeks",
  M: "months",
};

export const DEFAULT_INTERVAL: Interval = "15";

export function parseInterval(interval: Interval): ParsedInterval {
  const raw = interval.trim().toUpperCase();
  const tagged = /^(\d*)([SDWM])$/.exec(raw);
  if (tagged) {
    const count = Math.max(1, Number(tagged[1] || 1));
    const unit = UNIT_BY_SUFFIX[tagged[2] ?? ""] ?? "days";
    return { unit, count, seconds: count * SECONDS_PER[unit] };
  }
  if (/^\d+$/.test(raw)) {
    const count = Math.max(1, Number(raw));
    return { unit: "minutes", count, seconds: count * SECONDS_PER.minutes };
  }
  return parseInterval(DEFAULT_INTERVAL);
}

export function intervalSeconds(interval: Interval): number {
  return parseInterval(interval).seconds;
}

export function isIntraday(interval: Interval): boolean {
  const { unit } = parseInterval(interval);
  return unit === "seconds" || unit === "minutes";
}

/** Floor a UNIX timestamp (seconds) to the start of its bar. */
export function alignToInterval(time: number, interval: Interval): number {
  const { seconds, unit } = parseInterval(interval);
  if (unit === "months") {
    const d = new Date(time * 1000);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000;
  }
  if (unit === "weeks") {
    // Align to Monday 00:00 UTC.
    const dayStart = time - (time % 86_400);
    const weekday = (new Date(dayStart * 1000).getUTCDay() + 6) % 7;
    return dayStart - weekday * 86_400;
  }
  return time - (time % seconds);
}
