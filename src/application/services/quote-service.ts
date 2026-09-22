import type { Quote, QuoteBook, SymbolInfo } from "@/domain";
import type { MarketDataProvider } from "../ports";
import { createStore, type Store } from "../store";

export interface QuoteServiceOptions {
  /** Polling cadence in milliseconds. */
  readonly refreshMs?: number;
}

/**
 * Keeps an up-to-date quote book for a set of symbols by polling every
 * provider that exposes `fetchQuotes`. Providers earlier in the chain win
 * when several return the same ticker.
 */
export class QuoteService {
  readonly quotes: Store<QuoteBook> = createStore<QuoteBook>({});

  private readonly providers: readonly MarketDataProvider[];
  private readonly refreshMs: number;
  private symbols: readonly SymbolInfo[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private inFlight = false;

  constructor(providers: readonly MarketDataProvider[], options: QuoteServiceOptions = {}) {
    this.providers = providers.filter((p) => typeof p.fetchQuotes === "function");
    this.refreshMs = options.refreshMs ?? 10_000;
  }

  start(): void {
    if (this.timer) return;
    void this.refresh();
    this.timer = setInterval(() => void this.refresh(), this.refreshMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Replace the tracked symbol set; refreshes immediately when new tickers appear. */
  track(symbols: readonly SymbolInfo[]): void {
    const known = new Set(this.symbols.map((s) => s.ticker));
    const hasNew = symbols.some((s) => !known.has(s.ticker));
    this.symbols = symbols;
    if (hasNew && this.timer) void this.refresh();
  }

  /** Latest known price for a ticker, if any. */
  lastPrice(ticker: string): number | undefined {
    return this.quotes.get()[ticker]?.price;
  }

  async refresh(): Promise<void> {
    if (this.inFlight || this.symbols.length === 0) return;
    this.inFlight = true;
    try {
      const results = await Promise.allSettled(this.providers.map((p) => p.fetchQuotes!(this.symbols)));
      const merged: Record<string, Quote> = {};
      // Iterate in reverse so higher-priority providers overwrite lower ones.
      for (let i = results.length - 1; i >= 0; i--) {
        const result = results[i];
        if (result?.status !== "fulfilled") continue;
        for (const quote of result.value) merged[quote.ticker] = quote;
      }
      if (Object.keys(merged).length > 0) {
        this.quotes.update((current) => ({ ...current, ...merged }));
      }
    } finally {
      this.inFlight = false;
    }
  }
}
