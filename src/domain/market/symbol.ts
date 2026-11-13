export type SymbolType =
  | "crypto"
  | "forex"
  | "stock"
  | "commodity"
  | "index"
  | "fund"
  | "futures"
  | "bond"
  | "economic"
  | "option";

export interface SymbolInfo {
  /** Unique identifier used across the app and in datafeed requests, e.g. `BTCUSD`. */
  readonly ticker: string;
  readonly name: string;
  readonly exchange: string;
  readonly type: SymbolType;
  /** Number of decimal places for price display. */
  readonly pricePrecision: number;
  /** Trading session in exchange time, TradingView session format. */
  readonly session: string;
  readonly timezone: string;
}

export const SYMBOL_TYPE_LABELS: Readonly<Record<SymbolType, string>> = {
  stock: "Stocks",
  fund: "Funds",
  futures: "Futures",
  forex: "Forex",
  crypto: "Crypto",
  index: "Indices",
  commodity: "Commodities",
  bond: "Bonds",
  economic: "Economy",
  option: "Options",
};

/** Crypto / 24h instruments. */
export const SESSION_24X7 = "24x7";
/** US equities regular session (exchange TZ America/New_York). */
export const SESSION_US_EQUITY = "0930-1600";
/**
 * Spot FX / metals. 17:00 America/New_York → next day 17:00.
 * TradingView day index: 1=Sunday … 6=Friday.
 * Friday has to be a start day too. Without it the library treats the
 * Thursday 17:00 session (it ends Friday afternoon) as outside the week
 * and deletes those candles, so gold 1H shows a hole into every weekend.
 * Saturday is not listed, and there is no Saturday tape, so the Friday
 * 16:00 → Sunday 18:00 close stays empty.
 * A fixed 22:00 UTC grid only matches winter, so summer bars (21:00 UTC)
 * and the gold feed (18:00 New York) were drawn a second time beside the real candle.
 */
export const SESSION_FX = "1700-1700:123456";
/**
 * Iran gold / Faraz cash session (exchange TZ Asia/Tehran).
 * 09:00–22:00 every day — overnight is outside session so the chart
 * collapses it (Faraz-style no-gap) instead of painting 11h holes.
 */
export const SESSION_IRAN_GOLD = "0900-2200:1234567";
/**
 * Tehran Stock Exchange cash session (Asia/Tehran, no DST).
 * Sat–Wed 09:00–12:30. TradingView day index: 7=Sat … 4=Wed.
 */
export const SESSION_TSE = "0900-1230:71234";

export function normalizeTicker(ticker: string): string {
  const raw = ticker.trim().toUpperCase();
  const idx = raw.lastIndexOf(":");
  return idx >= 0 ? raw.slice(idx + 1) : raw;
}

export function symbolMatches(symbol: SymbolInfo, query: string, type?: SymbolType | ""): boolean {
  if (type && symbol.type !== type) return false;
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return `${symbol.ticker} ${symbol.name} ${symbol.exchange}`.toLowerCase().includes(needle);
}

/** Wall-clock parts in a fixed timezone (UTC or America/New_York). */
function zonedParts(nowMs: number, timeZone: string): { day: number; hhmm: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = fmt.formatToParts(new Date(nowMs));
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { day: dayMap[weekday] ?? new Date(nowMs).getUTCDay(), hhmm: hour * 100 + minute };
}

/**
 * Whether the instrument is in a regular trading session right now.
 * Used to freeze live candle creation / avoid inventing bars when the market is closed
 * (TradingView-style: no new candles, countdown stops via session + data_status).
 */
export function isMarketSessionOpen(symbol: SymbolInfo, nowMs: number = Date.now()): boolean {
  const session = (symbol.session || "").trim().toLowerCase();
  if (!session || session === "24x7") return true;

  const tz =
    symbol.timezone === "America/New_York" || symbol.timezone === "US/Eastern"
      ? "America/New_York"
      : symbol.timezone === "Etc/UTC" || symbol.timezone === "UTC"
        ? "UTC"
        : symbol.timezone || "UTC";

  // FX / metals: 17:00 America/New_York, Sun open → Fri 17:00 close.
  // 2200-2159 remains for any saved layout that still has the old UTC session.
  if (session.startsWith("1700-1700") || session.startsWith("1700-1659") || session.startsWith("2200-2159")) {
    const ny = session.startsWith("1700");
    const { day, hhmm } = zonedParts(nowMs, ny ? "America/New_York" : tz === "UTC" ? "UTC" : tz);
    if (day === 6) return false; // Saturday
    const close = ny ? 1700 : 2159;
    const open = ny ? 1700 : 2200;
    if (day === 5 && hhmm >= close) return false;
    if (day === 0 && hhmm < open) return false;
    return true;
  }

  // Tehran Stock Exchange: Sat–Wed 09:00–12:30 (Asia/Tehran). Closed Thu/Fri.
  if (session.startsWith("0900-1230")) {
    const { day, hhmm } = zonedParts(nowMs, tz.includes("Tehran") ? "Asia/Tehran" : tz);
    if (day === 4 || day === 5) return false;
    return hhmm >= 900 && hhmm < 1230;
  }

  // Iran gold / Faraz: 0900-2200 every day (Asia/Tehran)
  if (session.startsWith("0900-2200")) {
    const { hhmm } = zonedParts(nowMs, tz.includes("Tehran") ? "Asia/Tehran" : tz);
    return hhmm >= 900 && hhmm < 2200;
  }

  // US equity regular: 0930-1600 Mon–Fri
  if (session.includes("0930-1600") || symbol.type === "stock" || symbol.type === "index") {
    const { day, hhmm } = zonedParts(nowMs, "America/New_York");
    if (day === 0 || day === 6) return false;
    return hhmm >= 930 && hhmm < 1600;
  }

  return true;
}
