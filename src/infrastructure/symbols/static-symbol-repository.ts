import { normalizeTicker, symbolMatches, SESSION_24X7, SESSION_FX, SESSION_US_EQUITY, type SymbolInfo, type SymbolType } from "@/domain";
import type { SymbolRepository } from "@/application";

const NY = "America/New_York";
const UTC = "Etc/UTC";

type Seed = [ticker: string, name: string, exchange: string, type: SymbolType, precision: number];

/**
 * Featured first — empty Symbol Search should surface live Forge markets
 * (Iran gold, XAU, majors) before sparse Yahoo demo equities.
 */
const SEEDS: readonly Seed[] = [
  // Iran domestic gold — Faraz
  ["ABSHODE", "آبشده نقدی 1", "IRAN", "commodity", 0],
  ["G18", "گرم طلا ۱۸ عیار", "IRAN", "commodity", 0],
  ["G24", "طلای ۲۴ عیار", "IRAN", "commodity", 0],
  ["SEKKE", "سکه امامی", "IRAN", "commodity", 0],
  ["NIM", "نیم سکه", "IRAN", "commodity", 0],
  ["ROB", "ربع سکه", "IRAN", "commodity", 0],
  ["ONS", "انس جهانی (بازار ایران)", "IRAN", "commodity", 2],
  // Gold / FX
  ["XAUUSD", "Gold Spot / U.S. Dollar", "FOREXCOM", "forex", 2],
  ["XAUUSD", "Gold Spot / U.S. Dollar", "FXPRO", "forex", 2],
  ["XAUUSD", "Gold Spot / U.S. Dollar (PAXG)", "BINANCE", "forex", 2],
  ["GC1!", "Gold Futures", "FOREXCOM", "futures", 2],
  ["EURUSD", "Euro / U.S. Dollar", "FOREXCOM", "forex", 5],
  ["GBPUSD", "British Pound / U.S. Dollar", "FOREXCOM", "forex", 5],
  ["USDJPY", "U.S. Dollar / Japanese Yen", "FOREXCOM", "forex", 3],
  ["XAGUSD", "Silver Spot / U.S. Dollar", "FOREXCOM", "commodity", 3],
  ["EURUSD", "Euro / U.S. Dollar", "FXPRO", "forex", 5],
  ["GBPUSD", "British Pound / U.S. Dollar", "FXPRO", "forex", 5],
  ["USDJPY", "U.S. Dollar / Japanese Yen", "FXPRO", "forex", 3],
  ["XAGUSD", "Silver Spot / U.S. Dollar", "FXPRO", "commodity", 3],
  // BINANCE — Germany market-api universe
  ["BTCUSDT", "Bitcoin / Tether", "BINANCE", "crypto", 2],
  ["ETHUSDT", "Ethereum / Tether", "BINANCE", "crypto", 2],
  ["BNBUSDT", "BNB / Tether", "BINANCE", "crypto", 2],
  ["SOLUSDT", "Solana / Tether", "BINANCE", "crypto", 3],
  ["XRPUSDT", "XRP / Tether", "BINANCE", "crypto", 4],
  ["ADAUSDT", "Cardano / Tether", "BINANCE", "crypto", 4],
  ["DOGEUSDT", "Dogecoin / Tether", "BINANCE", "crypto", 5],
  ["AVAXUSDT", "Avalanche / Tether", "BINANCE", "crypto", 3],
  ["DOTUSDT", "Polkadot / Tether", "BINANCE", "crypto", 4],
  ["LINKUSDT", "Chainlink / Tether", "BINANCE", "crypto", 3],
  ["LTCUSDT", "Litecoin / Tether", "BINANCE", "crypto", 2],
  ["ATOMUSDT", "Cosmos / Tether", "BINANCE", "crypto", 3],
  ["NEARUSDT", "NEAR / Tether", "BINANCE", "crypto", 3],
  ["UNIUSDT", "Uniswap / Tether", "BINANCE", "crypto", 3],
  ["AAVEUSDT", "Aave / Tether", "BINANCE", "crypto", 2],
  ["SUIUSDT", "Sui / Tether", "BINANCE", "crypto", 4],
  ["APTUSDT", "Aptos / Tether", "BINANCE", "crypto", 3],
  ["ARBUSDT", "Arbitrum / Tether", "BINANCE", "crypto", 4],
  ["OPUSDT", "Optimism / Tether", "BINANCE", "crypto", 4],
  ["MATICUSDT", "Polygon / Tether", "BINANCE", "crypto", 4],
  ["PAXGUSDT", "PAX Gold / Tether", "BINANCE", "crypto", 2],
  ["BTCUSD", "Bitcoin / U.S. Dollar", "BINANCE", "crypto", 2],
  ["ETHUSD", "Ethereum / U.S. Dollar", "BINANCE", "crypto", 2],
  ["USOIL", "WTI Crude Oil", "TVC", "commodity", 2],
  ["SPX", "S&P 500", "SP", "index", 2],
  // Sparse Yahoo demo equities last (sticky NASDAQ chip used to hide everything else).
  ["AAPL", "Apple Inc.", "NASDAQ", "stock", 2],
  ["MSFT", "Microsoft Corporation", "NASDAQ", "stock", 2],
  ["NVDA", "NVIDIA Corporation", "NASDAQ", "stock", 2],
  ["TSLA", "Tesla, Inc.", "NASDAQ", "stock", 2],
];

/** Prefer these venues in the Symbol Search exchange dropdown. */
export const EXCHANGE_PRIORITY = ["IRAN", "FOREXCOM", "BINANCE", "FXPRO", "TVC", "SP", "NASDAQ"] as const;

/** Empty-query ranking for Symbol Search (ticker upper-case). */
const FEATURED_TICKERS = [
  "ABSHODE",
  "G18",
  "SEKKE",
  "XAUUSD",
  "BTCUSDT",
  "ETHUSDT",
  "EURUSD",
  "ONS",
  "G24",
  "NIM",
  "ROB",
  "PAXGUSDT",
  "GBPUSD",
  "USDJPY",
  "XAGUSD",
] as const;

const TEHRAN = "Asia/Tehran";

function sessionFor(type: SymbolType): { session: string; timezone: string } {
  switch (type) {
    case "stock":
    case "fund":
    case "option":
    case "index":
      return { session: SESSION_US_EQUITY, timezone: NY };
    case "forex":
    case "commodity":
    case "futures":
      // Spot FX/metals close for the weekend — required for TV countdown/market status.
      return { session: SESSION_FX, timezone: UTC };
    case "crypto":
    default:
      return { session: SESSION_24X7, timezone: UTC };
  }
}

function toSymbol([ticker, name, exchange, type, pricePrecision]: Seed): SymbolInfo {
  const base = { ticker, name, exchange, type, pricePrecision, ...sessionFor(type) };
  // Iran gold quotes stream continuously from TGJU/Anil — keep session open for 1S ticks.
  if (exchange.toUpperCase() === "IRAN" || exchange.toUpperCase() === "TGJU") {
    return { ...base, session: SESSION_24X7, timezone: TEHRAN };
  }
  return base;
}

function featuredRank(ticker: string): number {
  const idx = (FEATURED_TICKERS as readonly string[]).indexOf(ticker.toUpperCase());
  return idx >= 0 ? idx : FEATURED_TICKERS.length + 1;
}

/** In-memory reference data. Swap for an API-backed repository without touching callers. */
export class StaticSymbolRepository implements SymbolRepository {
  private readonly symbols: readonly SymbolInfo[];

  constructor(seeds: readonly Seed[] = SEEDS) {
    this.symbols = seeds.map(toSymbol);
  }

  all(): readonly SymbolInfo[] {
    return this.symbols;
  }

  findByTicker(ticker: string, exchange?: string): SymbolInfo | undefined {
    const raw = ticker.trim();
    const fromPrefix = raw.includes(":") ? raw.slice(0, raw.lastIndexOf(":")).trim().toUpperCase() : undefined;
    const ex = (exchange?.trim() || fromPrefix || "").toUpperCase() || undefined;
    const needle = normalizeTicker(raw);
    if (ex) {
      return this.symbols.find((s) => s.ticker === needle && s.exchange.toUpperCase() === ex);
    }
    return this.symbols.find((s) => s.ticker === needle);
  }

  search(query: string, type: SymbolType | "" = ""): SymbolInfo[] {
    const needle = query.trim().toLowerCase();
    return this.symbols
      .filter((s) => symbolMatches(s, needle, type))
      .sort((a, b) => {
        // Empty query: featured markets first (Iran / gold / crypto).
        if (!needle) {
          const fa = featuredRank(a.ticker);
          const fb = featuredRank(b.ticker);
          if (fa !== fb) return fa - fb;
          return a.ticker.localeCompare(b.ticker) || a.exchange.localeCompare(b.exchange);
        }
        const aStarts = a.ticker.toLowerCase().startsWith(needle) ? 0 : 1;
        const bStarts = b.ticker.toLowerCase().startsWith(needle) ? 0 : 1;
        if (aStarts !== bStarts) return aStarts - bStarts;
        const fa = featuredRank(a.ticker);
        const fb = featuredRank(b.ticker);
        if (fa !== fb) return fa - fb;
        return a.ticker.localeCompare(b.ticker) || a.exchange.localeCompare(b.exchange);
      });
  }
}
