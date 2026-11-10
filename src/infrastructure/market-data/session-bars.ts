/**
 * One daily candle per exchange session.
 *
 * History often stamps 1D at midnight UTC while FX live bars sit on 22:00 UTC
 * (and equities on the cash open). Both reached the chart, so every symbol
 * showed two daily candles. Collapse onto the session open before TradingView.
 */

import { parseInterval, type Bar, type Interval, type SymbolInfo } from "@/domain";
import { alignFxSessionDailyTime } from "./cp-chart-history";

const TEHRAN_OFFSET_SEC = 3 * 3_600 + 30 * 60;

export function isDailyInterval(interval: Interval | string): boolean {
  try {
    const { unit, count } = parseInterval(interval as Interval);
    return unit === "days" && count === 1;
  } catch {
    return false;
  }
}

/** Canonical open (unix seconds) for the session day that contains `timeSec`. */
export function sessionDailyOpen(symbol: SymbolInfo, timeSec: number): number {
  const session = (symbol.session || "").toLowerCase();
  const exchange = symbol.exchange.toUpperCase();
  if (session.startsWith("2200-2159")) return alignFxSessionDailyTime(timeSec);
  if (session.startsWith("0900-") || exchange === "TSE" || exchange === "IRAN" || exchange === "TGJU") {
    return tehranClockOpen(timeSec, 9 * 3_600);
  }
  if (session.includes("0930-1600") || symbol.type === "stock" || symbol.type === "index") {
    return utcDayOpen(timeSec - 5 * 3_600) + 14 * 3_600 + 30 * 60;
  }
  return utcDayOpen(timeSec);
}

function utcDayOpen(timeSec: number): number {
  return Math.floor(timeSec / 86_400) * 86_400;
}

/** `clockSec` is seconds after Tehran midnight (09:00 → 9h). */
function tehranClockOpen(timeSec: number, clockSec: number): number {
  const tehran = timeSec + TEHRAN_OFFSET_SEC;
  const day = Math.floor(tehran / 86_400) * 86_400;
  return day - TEHRAN_OFFSET_SEC + clockSec;
}

/**
 * Merge bars that fall in the same session day. Copies keep the larger volume
 * (they are the same candle, not child bars). Idempotent on an already-aligned series.
 */
export function collapseDailyBars(
  symbol: SymbolInfo,
  interval: Interval | string,
  bars: readonly Bar[],
): Bar[] {
  if (!isDailyInterval(interval) || bars.length < 2) {
    if (!isDailyInterval(interval) || bars.length === 0) return [...bars];
    const only = bars[0]!;
    const time = sessionDailyOpen(symbol, only.time);
    return time === only.time ? [...bars] : [{ ...only, time }];
  }
  const byDay = new Map<number, Bar>();
  for (const bar of bars) {
    const time = sessionDailyOpen(symbol, bar.time);
    const prev = byDay.get(time);
    if (!prev) {
      byDay.set(time, { ...bar, time });
      continue;
    }
    byDay.set(time, {
      time,
      open: prev.open,
      high: Math.max(prev.high, bar.high),
      low: Math.min(prev.low, bar.low),
      close: bar.close,
      volume: Math.max(prev.volume || 0, bar.volume || 0),
    });
  }
  return [...byDay.values()].sort((a, b) => a.time - b.time);
}

export function canonicalizeBar(symbol: SymbolInfo, interval: Interval | string, bar: Bar): Bar {
  if (!isDailyInterval(interval)) return bar;
  const time = sessionDailyOpen(symbol, bar.time);
  return time === bar.time ? bar : { ...bar, time };
}
