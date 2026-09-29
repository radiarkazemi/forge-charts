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
 * Spot FX / metals (FOREXCOM-style): Sun 22:00 → Fri 21:59 in the symbol timezone.
 * Weekends closed — matches TradingView countdown / market-status behavior.
 */
export const SESSION_FX = "2200-2159:123456";

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

  // FX / metals: 2200-2159:123456 (Sun 22:00 → Fri 21:59)
  if (session.startsWith("2200-2159")) {
    const { day, hhmm } = zonedParts(nowMs, tz === "UTC" ? "UTC" : tz);
    if (day === 6) return false; // Saturday
    if (day === 5 && hhmm > 2159) return false; // Friday after 21:59 close
    if (day === 0 && hhmm < 2200) return false; // Sunday before open
    return true;
  }

  // US equity regular: 0930-1600 Mon–Fri
  if (session.includes("0930-1600") || symbol.type === "stock" || symbol.type === "index") {
    const { day, hhmm } = zonedParts(nowMs, "America/New_York");
    if (day === 0 || day === 6) return false;
    return hhmm >= 930 && hhmm < 1600;
  }

  return true;
}
