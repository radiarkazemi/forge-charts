import { isFxDailyBreak, type Bar, type Interval, type SymbolInfo } from "@/domain";
import { fillSingleHourGaps } from "./hour-gaps";
import { collapseDailyBars } from "./session-bars";
import { densifySessionBars } from "./session-fill";

/**
 * Prepare candles for the chart.
 *
 * Aligns stamps, then fills any in-session hole the feed skipped (Mongo
 * writer drop, Iran API 499). The New York 17:00–18:00 break and the
 * weekend stay empty — those are real closes.
 */
export function presentCandleSeries(
  symbol: SymbolInfo,
  resolution: Interval | string,
  bars: readonly Bar[],
  stepSec: number,
): Bar[] {
  const collapsed = collapseDailyBars(symbol, resolution, bars);
  if (symbol.exchange.toUpperCase() === "TSE") return collapsed;
  const aligned = fillSingleHourGaps(collapsed, stepSec);
  if (stepSec <= 0 || stepSec >= 86_400) return aligned;
  const filled = densifySessionBars(symbol, aligned, stepSec);
  const session = (symbol.session || "").toLowerCase();
  if (!session.startsWith("1800-1700") && !session.startsWith("1700-1700")) return filled;
  return filled.filter((bar) => !isFxDailyBreak(bar.time));
}
