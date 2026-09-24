import { normalizeTicker, parseInterval, SYMBOL_TYPE_LABELS, type Bar, type SymbolInfo } from "@/domain";
import { createStore, type MarketDataService, type Store, type SymbolRepository, type Unsubscribe } from "@/application";
import type {
  DatafeedConfiguration,
  DatafeedErrorCallback,
  HistoryCallback,
  IBasicDataFeed,
  LibrarySymbolInfo,
  OnReadyCallback,
  PeriodParams,
  ResolutionString,
  ResolveCallback,
  SearchSymbolsCallback,
  ServerTimeCallback,
  SubscribeBarsCallback,
  Timezone,
} from "./types";

/** Full TradingView resolution set (seconds → months). */
export const SUPPORTED_RESOLUTIONS = [
  "1S",
  "5S",
  "10S",
  "15S",
  "30S",
  "45S",
  "1",
  "2",
  "3",
  "5",
  "10",
  "15",
  "30",
  "45",
  "60",
  "120",
  "180",
  "240",
  "360",
  "480",
  "720",
  "1D",
  "1W",
  "1M",
] as ResolutionString[];

const SECONDS_MULTIPLIERS = ["1", "5", "10", "15", "30", "45"];
const INTRADAY_MULTIPLIERS = ["1", "2", "3", "5", "10", "15", "30", "45", "60", "120", "180", "240", "360", "480", "720"];

export interface DataSourceInfo {
  readonly ticker: string;
  readonly providerId: string;
  readonly isSynthetic: boolean;
}

function toTvBar(bar: Bar) {
  // Library crashes with RangeError: Invalid time value if `time` is NaN/non-finite.
  const timeSec = Number(bar.time);
  if (!Number.isFinite(timeSec) || timeSec <= 0) {
    throw new Error(`Invalid bar time: ${String(bar.time)}`);
  }
  return {
    time: timeSec * 1000,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    volume: bar.volume,
  };
}

function stripExchange(symbolName: string): string {
  const idx = symbolName.lastIndexOf(":");
  return idx >= 0 ? symbolName.slice(idx + 1) : symbolName;
}

function parseExchangePrefix(symbolName: string): string | undefined {
  const idx = symbolName.lastIndexOf(":");
  return idx >= 0 ? symbolName.slice(0, idx) : undefined;
}

/**
 * Adapts the application's `MarketDataService` to the TradingView
 * `IBasicDataFeed` contract (Adapter pattern). Everything TradingView-specific
 * about symbology and resolution rules lives here.
 */
export class TradingViewDatafeed implements IBasicDataFeed {
  /** Which provider is currently feeding the main series — lets the UI flag demo data. */
  readonly source: Store<DataSourceInfo | null> = createStore<DataSourceInfo | null>(null);

  private readonly subscriptions = new Map<string, Unsubscribe>();

  constructor(
    private readonly marketData: MarketDataService,
    private readonly symbols: SymbolRepository,
  ) {}

  onReady(callback: OnReadyCallback): void {
    const exchanges = [...new Set(this.symbols.all().map((s) => s.exchange))].sort();
    const configuration: DatafeedConfiguration = {
      supported_resolutions: SUPPORTED_RESOLUTIONS,
      exchanges: [{ value: "", name: "All exchanges", desc: "" }, ...exchanges.map((e) => ({ value: e, name: e, desc: e }))],
      symbols_types: [
        { name: "All types", value: "" },
        ...Object.entries(SYMBOL_TYPE_LABELS).map(([value, name]) => ({ name, value })),
      ],
      supports_marks: false,
      supports_timescale_marks: false,
      supports_time: true,
    };
    setTimeout(() => callback(configuration), 0);
  }

  searchSymbols(userInput: string, exchange: string, symbolType: string, onResult: SearchSymbolsCallback): void {
    const type = symbolType as SymbolInfo["type"] | "";
    const results = this.symbols
      .search(userInput, type)
      .filter((s) => !exchange || s.exchange === exchange)
      .map((s) => ({
        symbol: s.ticker,
        ticker: `${s.exchange}:${s.ticker}`,
        description: s.name,
        exchange: s.exchange,
        type: s.type,
      }));
    onResult(results);
  }

  resolveSymbol(symbolName: string, onResolve: ResolveCallback, onError: DatafeedErrorCallback): void {
    const exchange = parseExchangePrefix(symbolName);
    const ticker = stripExchange(symbolName);
    const symbol =
      (exchange ? this.symbols.findByTicker(ticker, exchange) : undefined) ?? this.symbols.findByTicker(ticker);
    if (!symbol) {
      setTimeout(() => onError(`Unknown symbol: ${symbolName}`), 0);
      return;
    }
    setTimeout(() => onResolve(this.toLibrarySymbolInfo(symbol)), 0);
  }

  async getBars(
    symbolInfo: LibrarySymbolInfo,
    resolution: ResolutionString,
    periodParams: PeriodParams,
    onResult: HistoryCallback,
    onError: DatafeedErrorCallback,
  ): Promise<void> {
    const symbol = this.requireSymbol(symbolInfo);
    try {
      const { bars, providerId, isSynthetic } = await this.marketData.fetchHistory(symbol, resolution, {
        from: periodParams.from,
        to: periodParams.to,
        countBack: periodParams.countBack,
      });

      if (periodParams.firstDataRequest) {
        this.source.set({ ticker: symbol.ticker, providerId, isSynthetic });
      }

      if (bars.length === 0) {
        onResult([], { noData: true });
        return;
      }
      onResult(bars.map(toTvBar), { noData: false });
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    }
  }

  subscribeBars(
    symbolInfo: LibrarySymbolInfo,
    resolution: ResolutionString,
    onTick: SubscribeBarsCallback,
    listenerGuid: string,
  ): void {
    this.unsubscribeBars(listenerGuid);
    const symbol = this.requireSymbol(symbolInfo);
    const unsubscribe = this.marketData.subscribe(symbol, resolution, (bar) => {
      try {
        onTick(toTvBar(bar));
      } catch {
        /* drop corrupt realtime bars instead of crashing the widget */
      }
    });
    this.subscriptions.set(listenerGuid, unsubscribe);
  }

  unsubscribeBars(listenerGuid: string): void {
    this.subscriptions.get(listenerGuid)?.();
    this.subscriptions.delete(listenerGuid);
  }

  getServerTime(callback: ServerTimeCallback): void {
    callback(Math.floor(Date.now() / 1000));
  }

  dispose(): void {
    for (const unsubscribe of this.subscriptions.values()) unsubscribe();
    this.subscriptions.clear();
  }

  /* ── internals ─────────────────────────────────────────────────────── */

  private requireSymbol(symbolInfo: LibrarySymbolInfo): SymbolInfo {
    const ticker = normalizeTicker(stripExchange(symbolInfo.ticker ?? symbolInfo.name));
    const exchange = symbolInfo.exchange || parseExchangePrefix(symbolInfo.ticker ?? symbolInfo.name);
    const symbol =
      (exchange ? this.symbols.findByTicker(ticker, exchange) : undefined) ?? this.symbols.findByTicker(ticker);
    if (!symbol) throw new Error(`Unknown symbol: ${ticker}`);
    return symbol;
  }

  private toLibrarySymbolInfo(symbol: SymbolInfo): LibrarySymbolInfo {
    const native = this.marketData.describe(symbol).nativeIntervals;
    const hasSeconds = native.some((iv) => parseInterval(iv).unit === "seconds");
    const hasIntraday = native.some((iv) => parseInterval(iv).unit === "minutes");

    return {
      name: symbol.ticker,
      ticker: `${symbol.exchange}:${symbol.ticker}`,
      description: symbol.name,
      type: symbol.type,
      session: symbol.session,
      timezone: symbol.timezone as Timezone,
      exchange: symbol.exchange,
      listed_exchange: symbol.exchange,
      format: "price",
      minmov: 1,
      pricescale: 10 ** symbol.pricePrecision,
      has_seconds: hasSeconds,
      seconds_multipliers: hasSeconds ? SECONDS_MULTIPLIERS : [],
      has_intraday: hasIntraday,
      intraday_multipliers: hasIntraday ? INTRADAY_MULTIPLIERS : [],
      has_daily: true,
      daily_multipliers: ["1"],
      has_weekly_and_monthly: true,
      weekly_multipliers: ["1"],
      monthly_multipliers: ["1"],
      supported_resolutions: SUPPORTED_RESOLUTIONS,
      volume_precision: symbol.type === "crypto" ? 3 : 0,
      visible_plots_set: "ohlcv",
      data_status: "streaming",
    };
  }
}
