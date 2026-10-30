import type { SymbolInfo } from "@/domain";

/**
 * TradingView full symbols per Forge exchange/ticker.
 *
 * History + realtime must come from the same TV broker book the chart label
 * shows. When a venue is searchable but currently `invalid symbol` on TV’s
 * quote/resolve socket (notably FXCM CFDs), we fall back to the nearest live
 * Gain/FOREXCOM book so candles stay real — never Yahoo futures proxies.
 */
/** Venues whose TV resolve is currently invalid → nearest live Gain/FOREXCOM book. */
const EXCHANGE_FALLBACK: Readonly<Record<string, string>> = {
  FXCM: "FOREXCOM",
  FXPRO: "FOREXCOM",
  TVC: "FOREXCOM",
  DJ: "FOREXCOM",
  SP: "FOREXCOM",
  NASDAQ: "FOREXCOM",
};

/** (dataExchange, forgeTicker) → TV ticker id (right-hand side of EX:TICKER). */
const TICKER_ALIAS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  OANDA: {
    NAS100: "NAS100USD",
    US30: "US30USD",
    US500: "SPX500USD",
    SPX500: "SPX500USD",
    GER40: "DE30EUR",
    UK100: "UK100GBP",
    JPN225: "JP225USD",
    AUS200: "AU200AUD",
  },
  FOREXCOM: {
    US500: "SPX500",
    SPX500: "SPX500",
  },
  CAPITALCOM: {
    SPX500: "US500",
  },
  // IG uses its own TV tickers (NASDAQ / DOW / …), not NAS100 / US30.
  IG: {
    NAS100: "NASDAQ",
    US30: "DOW",
    US500: "SPX500",
    SPX500: "SPX500",
    GER40: "DAX",
    UK100: "FTSE",
    JPN225: "NIKKEI",
    AUS200: "ASX",
  },
  PEPPERSTONE: {
    US500: "US500",
    SPX500: "US500",
  },
};

/** Brokers we serve from TradingView’s native CFD books. */
const TV_BROKER_EXCHANGES = new Set([
  "FOREXCOM",
  "FXCM",
  "FXPRO",
  "OANDA",
  "PEPPERSTONE",
  "IG",
  "CAPITALCOM",
  "TVC",
]);

const TV_BROKER_TICKERS = new Set([
  "NAS100",
  "US30",
  "US500",
  "SPX500",
  "GER40",
  "UK100",
  "JPN225",
  "AUS200",
  "XAUUSD",
  "XAGUSD",
  "USOIL",
  "EURUSD",
  "GBPUSD",
  "USDJPY",
  "AUDUSD",
  "USDCHF",
  "USDCAD",
  "NZDUSD",
  "EURGBP",
  "EURJPY",
  "GBPJPY",
]);

export function isTvBrokerSymbol(symbol: SymbolInfo): boolean {
  const ex = symbol.exchange.toUpperCase();
  const ticker = symbol.ticker.toUpperCase();
  if (!TV_BROKER_EXCHANGES.has(ex)) return false;
  if (TV_BROKER_TICKERS.has(ticker)) return true;
  // Any FX/index/commodity listed under a CFD broker — try TV first.
  return symbol.type === "forex" || symbol.type === "index" || symbol.type === "commodity";
}

/**
 * Resolve the TradingView `EXCHANGE:SYMBOL` used for history + quote ticks.
 * Returns null when this listing should stay on Germany/Binance/Yahoo.
 */
export function tradingViewSymbolFor(symbol: SymbolInfo): string | null {
  if (!isTvBrokerSymbol(symbol)) return null;
  const forgeEx = symbol.exchange.toUpperCase();
  const forgeTicker = symbol.ticker.toUpperCase();

  // Gold on Germany-owned FOREXCOM/FXPRO/FXCM stays on GermanyMarketProvider
  // (PAXG + FOREXCOM live) — do not steal XAU from that path.
  if (forgeTicker === "XAUUSD" || forgeTicker === "GC1!") return null;

  // Prefer forge-exchange aliases first (e.g. IG:NAS100 → IG:NASDAQ) so each
  // searchable broker keeps its own TradingView book when it is resolvable.
  const forgeAlias = TICKER_ALIAS[forgeEx]?.[forgeTicker];
  if (forgeAlias && !(forgeEx in EXCHANGE_FALLBACK)) {
    return `${forgeEx}:${forgeAlias}`;
  }

  const dataEx = EXCHANGE_FALLBACK[forgeEx] ?? forgeEx;
  const aliasTable = TICKER_ALIAS[dataEx] ?? TICKER_ALIAS[forgeEx];
  const tvTicker = forgeAlias ?? aliasTable?.[forgeTicker] ?? forgeTicker;
  return `${dataEx}:${tvTicker}`;
}

/** market-ticks channel that maps to the TV quote for this listing. */
export function marketTicksChannelFor(symbol: SymbolInfo): string | null {
  const tv = tradingViewSymbolFor(symbol);
  if (!tv) return null;
  const [ex, ticker] = tv.split(":");
  if (!ex || !ticker) return null;
  return `forex:${ticker.toLowerCase()}:${ex.toUpperCase()}`;
}
