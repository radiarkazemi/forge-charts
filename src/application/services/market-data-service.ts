import { normalizeBars, type Bar, type BarRange, type Interval, type SymbolInfo } from "@/domain";
import type { MarketDataProvider, Unsubscribe } from "../ports";

export interface HistoryResult {
  readonly bars: Bar[];
  /** Provider that produced the bars. */
  readonly providerId: string;
  readonly isSynthetic: boolean;
}

export interface MarketDataLogger {
  warn(message: string, detail?: unknown): void;
}

/**
 * Resolves market data by walking an ordered chain of providers
 * (Chain of Responsibility). The first provider that supports the symbol and
 * answers successfully wins; the synthetic provider is expected to sit last so
 * the chart is never blank.
 */
export class MarketDataService {
  private readonly providers: readonly MarketDataProvider[];
  private readonly logger: MarketDataLogger;

  constructor(providers: readonly MarketDataProvider[], logger: MarketDataLogger = console) {
    if (providers.length === 0) throw new Error("MarketDataService requires at least one provider");
    this.providers = providers;
    this.logger = logger;
  }

  /** The provider that would currently serve `symbol` (used for streaming). */
  resolveProvider(symbol: SymbolInfo, interval: Interval): MarketDataProvider {
    const match = this.providers.find((p) => p.supports(symbol, interval));
    if (!match) throw new Error(`No provider supports ${symbol.ticker} @ ${interval}`);
    return match;
  }

  /** Primary provider for `symbol` and the intervals it serves natively. */
  describe(symbol: SymbolInfo): { provider: MarketDataProvider; nativeIntervals: readonly Interval[] } {
    for (const provider of this.providers) {
      const nativeIntervals = provider.nativeIntervals(symbol).filter((iv) => provider.supports(symbol, iv));
      if (nativeIntervals.length > 0) return { provider, nativeIntervals };
    }
    const fallback = this.providers[this.providers.length - 1]!;
    return { provider: fallback, nativeIntervals: fallback.nativeIntervals(symbol) };
  }

  async fetchHistory(symbol: SymbolInfo, interval: Interval, range: BarRange): Promise<HistoryResult> {
    let lastError: unknown = null;

    for (const provider of this.providers) {
      if (!provider.supports(symbol, interval)) continue;
      try {
        const bars = normalizeBars(await provider.fetchBars(symbol, interval, range));
        return { bars, providerId: provider.id, isSynthetic: provider.isSynthetic };
      } catch (error) {
        lastError = error;
        this.logger.warn(`[market-data] ${provider.id} failed for ${symbol.ticker} @ ${interval}`, error);
      }
    }

    throw lastError ?? new Error(`No data for ${symbol.ticker} @ ${interval}`);
  }

  subscribe(symbol: SymbolInfo, interval: Interval, onBar: (bar: Bar) => void): Unsubscribe {
    let active = true;
    let unsubscribe: Unsubscribe = () => {};

    try {
      unsubscribe = this.resolveProvider(symbol, interval).subscribeBars(symbol, interval, (bar) => {
        if (active) onBar(bar);
      });
    } catch (error) {
      this.logger.warn(`[market-data] subscribe failed for ${symbol.ticker}`, error);
    }

    return () => {
      active = false;
      unsubscribe();
    };
  }
}
