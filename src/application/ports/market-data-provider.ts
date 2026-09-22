import type { Bar, BarRange, Interval, Quote, SymbolInfo } from "@/domain";

export type Unsubscribe = () => void;

/**
 * Port for anything that can serve historical and streaming market data.
 * Implementations live in the infrastructure layer (Binance, Yahoo, …).
 */
export interface MarketDataProvider {
  readonly id: string;
  /** `true` when the provider only fabricates data (demo mode). */
  readonly isSynthetic: boolean;

  supports(symbol: SymbolInfo, interval: Interval): boolean;

  /**
   * Intervals the upstream serves directly for `symbol`. Consumers may build
   * coarser intervals (e.g. 4h from 1h) from these.
   */
  nativeIntervals(symbol: SymbolInfo): readonly Interval[];

  /** Return bars inside `range`, sorted ascending. An empty array means "no data here". */
  fetchBars(symbol: SymbolInfo, interval: Interval, range: BarRange): Promise<Bar[]>;

  /** Stream updates for the most recent bar. Must be safe to call unsubscribe twice. */
  subscribeBars(symbol: SymbolInfo, interval: Interval, onBar: (bar: Bar) => void): Unsubscribe;

  /** Optional snapshot quotes for the subset of `symbols` this provider knows. */
  fetchQuotes?(symbols: readonly SymbolInfo[]): Promise<Quote[]>;
}
