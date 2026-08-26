import type { Interval } from "../engine/types";

export type IntervalKind = "seconds" | "minutes" | "hours" | "days" | "weeks" | "months" | "range";

export type ParsedInterval = {
  kind: IntervalKind;
  n: number;
  seconds: number;
};

export function parseInterval(id: Interval): ParsedInterval {
  const raw = String(id).trim();
  const upper = raw.toUpperCase();
  const tagged = /^(\d+)([SHDWMR])$/.exec(upper);
  if (tagged) {
    const n = Math.max(1, Number(tagged[1]));
    const unit = tagged[2];
    if (unit === "S") return { kind: "seconds", n, seconds: n };
    if (unit === "H") return { kind: "hours", n, seconds: n * 3600 };
    if (unit === "D") return { kind: "days", n, seconds: n * 86400 };
    if (unit === "W") return { kind: "weeks", n, seconds: n * 604800 };
    if (unit === "M") return { kind: "months", n, seconds: n * 2592000 };
    if (unit === "R") return { kind: "range", n, seconds: 60 };
  }
  if (/^\d+$/.test(raw)) {
    const n = Math.max(1, Number(raw));
    return { kind: "minutes", n, seconds: n * 60 };
  }
  return { kind: "minutes", n: 15, seconds: 900 };
}

export function intervalSeconds(interval: Interval): number {
  return parseInterval(interval).seconds;
}

export function intervalShort(interval: Interval): string {
  const p = parseInterval(interval);
  if (p.kind === "seconds") return `${p.n}s`;
  if (p.kind === "minutes") return p.n % 60 === 0 && p.n >= 60 ? `${p.n / 60}h` : `${p.n}m`;
  if (p.kind === "hours") return `${p.n}h`;
  if (p.kind === "days") return p.n === 1 ? "D" : `${p.n}D`;
  if (p.kind === "weeks") return p.n === 1 ? "W" : `${p.n}W`;
  if (p.kind === "months") return p.n === 1 ? "M" : `${p.n}M`;
  return `${p.n}R`;
}

export function intervalLabel(interval: Interval): string {
  const p = parseInterval(interval);
  const unit =
    p.kind === "seconds"
      ? "second"
      : p.kind === "minutes"
        ? "minute"
        : p.kind === "hours"
          ? "hour"
          : p.kind === "days"
            ? "day"
            : p.kind === "weeks"
              ? "week"
              : p.kind === "months"
                ? "month"
                : "range";
  const plural = p.n === 1 ? unit : `${unit}s`;
  if (p.kind === "range") return `${p.n} ${plural}`;
  return `${p.n} ${plural}`;
}

export function makeIntervalId(n: number, unit: "S" | "m" | "H" | "D" | "W" | "M" | "R"): Interval {
  const count = Math.max(1, Math.floor(n));
  if (unit === "m") return String(count);
  return `${count}${unit}`;
}
