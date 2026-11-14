import { isFxDailyBreak, type Bar, type Interval, type SymbolInfo } from "@/domain";
import { fillSingleHourGaps } from "./hour-gaps";
import { collapseDailyBars } from "./session-bars";

/**
 * Prepare candles for the chart.
 *
 * This is the only step between the feed and the plot. Chart style and
 * dialogs do not pass through here, and no price is invented for a time
 * the feed did not send.
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
  const session = (symbol.session || "").toLowerCase();
  if (!session.startsWith("1800-1700") && !session.startsWith("1700-1700")) return aligned;
  return aligned.filter((bar) => !isFxDailyBreak(bar.time));
}
