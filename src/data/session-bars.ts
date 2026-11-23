import type { Bar } from "../engine/types";

const NY = "America/New_York";
/** FOREXCOM / TV FX 4H grid starts at 18:00 America/New_York (not UTC midnight). */
export const FX_SESSION_OPEN_HOUR = 18;

function nyParts(timeSec: number): { year: number; month: number; day: number; hour: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: NY,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  });
  const parts = fmt.formatToParts(new Date(timeSec * 1000));
  const pick = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  let hour = pick("hour");
  if (hour === 24) hour = 0;
  return { year: pick("year"), month: pick("month"), day: pick("day"), hour };
}

function utcAtNewYork(year: number, month: number, day: number, hour: number): number {
  const desired = Date.UTC(year, month - 1, day, hour, 0, 0);
  const guess = Math.floor(desired / 1000);
  const got = nyParts(guess);
  const gotAsUtc = Date.UTC(got.year, got.month - 1, got.day, got.hour, 0, 0);
  return Math.floor((desired - (gotAsUtc - desired)) / 1000);
}

/** Snap a unix time onto the FX session grid (18:00 NY, DST-aware). */
export function alignFxBarTime(timeSec: number, stepSec: number, openHour = FX_SESSION_OPEN_HOUR): number {
  if (!(stepSec > 0)) return timeSec;
  const ny = nyParts(timeSec);
  let year = ny.year;
  let month = ny.month;
  let day = ny.day;
  if (ny.hour < openHour) {
    const prev = new Date(Date.UTC(year, month - 1, day) - 86_400_000);
    year = prev.getUTCFullYear();
    month = prev.getUTCMonth() + 1;
    day = prev.getUTCDate();
  }
  const sessionOpen = utcAtNewYork(year, month, day, openHour);
  const elapsed = timeSec - sessionOpen;
  const n = Math.floor(elapsed / stepSec);
  return sessionOpen + n * stepSec;
}

export function aggregateBars(
  bars: readonly Bar[],
  group: number,
  stepSec: number,
  fxSession = false,
): Bar[] {
  if (bars.length === 0) return [];
  if (group <= 1 && !fxSession) return [...bars];
  const bucket = stepSec * Math.max(1, group);
  const out: Bar[] = [];
  let cur: Bar | null = null;
  let bucketStart = -1;
  for (const bar of bars) {
    const start = fxSession ? alignFxBarTime(bar.time, bucket) : Math.floor(bar.time / bucket) * bucket;
    if (!cur || start !== bucketStart) {
      if (cur) out.push(cur);
      bucketStart = start;
      cur = { time: start, open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: bar.volume };
    } else {
      cur.high = Math.max(cur.high, bar.high);
      cur.low = Math.min(cur.low, bar.low);
      cur.close = bar.close;
      cur.volume += bar.volume || 0;
    }
  }
  if (cur) out.push(cur);
  return out;
}

/** Fold a live lower-TF print into the open candle on `intervalSec`. */
export function foldLiveBar(current: Bar | undefined, incoming: Bar, intervalSec: number, fxSession: boolean): Bar {
  const time = fxSession ? alignFxBarTime(incoming.time, intervalSec) : Math.floor(incoming.time / intervalSec) * intervalSec;
  if (!current || current.time !== time) {
    return {
      time,
      open: incoming.open,
      high: incoming.high,
      low: incoming.low,
      close: incoming.close,
      volume: incoming.volume,
    };
  }
  return {
    time,
    open: current.open,
    high: Math.max(current.high, incoming.high),
    low: Math.min(current.low, incoming.low),
    close: incoming.close,
    volume: current.volume,
  };
}
