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
  /** Unique identifier used across the app and in data requests, e.g. `BTCUSD`. */
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
