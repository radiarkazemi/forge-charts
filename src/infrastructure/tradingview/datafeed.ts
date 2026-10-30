import { normalizeTicker, parseInterval, isMarketSessionOpen, SYMBOL_TYPE_LABELS, type Bar, type SymbolInfo } from "@/domain";
import { createStore, type MarketDataService, type Store, type SymbolRepository, type Unsubscribe } from "@/application";
import { EXCHANGE_PRIORITY } from "@/infrastructure/symbols/static-symbol-repository";
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

/** Tiny Yahoo demo venues — sticky chips here make Symbol Search look empty. */
const SPARSE_EXCHANGE_FILTERS = new Set(["NASDAQ", "NYSE", "AMEX", "SP"]);

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
  const rawVol = Number(bar.volume);
  let volume = Number.isFinite(rawVol) && rawVol > 0 ? rawVol : 0;
  // FX / some CFDs omit volume — synthesize tick volume so the Volume pane is usable.
  if (volume <= 0) {
    const range = Math.abs(bar.high - bar.low);
    const body = Math.abs(bar.close - bar.open);
    const proxy = Math.round((range * 4 + body * 2) * 1e4);
    volume = Math.max(1, proxy);
  }
  return {
    time: timeSec * 1000,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    volume,
  };
}

/** Charting Library timestamps are unix seconds; some builds send ms or 0. */
function asUnixSec(value: number, fallback: number): number {
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return value > 1e12 ? Math.floor(value / 1000) : Math.floor(value);
}

function stripExchange(symbolName: string): string {
  const idx = symbolName.lastIndexOf(":");
  return idx >= 0 ? symbolName.slice(idx + 1) : symbolName;
}

/** Case-fold resolution so "30S" / "30s" pins match subscribeBars keys. */
function normalizeReplayResolution(resolution: string): string {
  return String(resolution).trim().toUpperCase();
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

  /** When set, history past this unix-second is hidden and live ticks are muted. */
  private replayCutoffSec: number | null = null;
  /** Advancing clock for candle countdown during demo/replay (unix sec). */
  private replayClockSec: number | null = null;
  private replayActive = false;
  /**
   * All live bar subscribers. Multipane layouts share one datafeed — a single
   * `replayOnTick` let the last pane steal forming-candle ticks (30S looked cut off).
   */
  private readonly barSubs = new Map<
    string,
    { readonly ticker: string; readonly resolution: string; readonly onTick: SubscribeBarsCallback }
  >();
  /** Prefetched bars for replay/demo — served from memory so past cutoffs don't re-fetch live-only OHLC. */
  private replayBuffer: Bar[] | null = null;
  /** Resolution the replay buffer was built for — reject mismatches after TF changes. */
  private replayBufferResolution: string | null = null;
  /** Optional pin so pushReplayBar only feeds matching ticker/TF (set by BarReplayController). */
  private replayPushTicker: string | null = null;
  private replayPushResolution: string | null = null;

  constructor(
    private readonly marketData: MarketDataService,
    private readonly symbols: SymbolRepository,
  ) {}

  /** Enable Bar Replay truncation (mute live, filter getBars). */
  beginReplay(opts?: { ticker?: string; resolution?: string }): void {
    this.replayActive = true;
    this.replayCutoffSec = null;
    this.replayClockSec = null;
    this.replayBuffer = null;
    this.replayBufferResolution = null;
    this.replayPushTicker = opts?.ticker ? normalizeTicker(stripExchange(opts.ticker)) : null;
    this.replayPushResolution = opts?.resolution
      ? normalizeReplayResolution(opts.resolution)
      : null;
  }

  /** Narrow which pane subscriptions receive forming/stepped replay ticks. */
  setReplayPushTarget(ticker: string | null, resolution: string | null): void {
    this.replayPushTicker = ticker ? normalizeTicker(stripExchange(ticker)) : null;
    this.replayPushResolution = resolution ? normalizeReplayResolution(resolution) : null;
  }

  /** Hide bars with time (unix sec) strictly after cutoff. Also drives getServerTime fallback. */
  setReplayCutoff(cutoffSec: number | null): void {
    this.replayCutoffSec = cutoffSec;
    if (cutoffSec != null && this.replayClockSec == null) {
      this.replayClockSec = cutoffSec;
    }
  }

  /**
   * Wall-clock for countdown during demo/replay. Should advance within the
   * forming bar’s period (open … open+barSec) so TV countdown ticks down.
   */
  setReplayClock(clockSec: number | null): void {
    this.replayClockSec = clockSec;
  }

  /** Attach the prefetched stepping buffer so getBars can serve history at any past cutoff. */
  setReplayBuffer(bars: readonly Bar[], resolution?: string): void {
    this.replayBuffer = bars.length > 0 ? [...bars] : null;
    this.replayBufferResolution =
      bars.length > 0 && resolution != null && String(resolution).trim()
        ? String(resolution).trim()
        : this.replayBufferResolution;
  }

  getReplayCutoff(): number | null {
    return this.replayCutoffSec;
  }

  isReplayActive(): boolean {
    return this.replayActive;
  }

  /** Push one synthetic realtime bar while live feed is muted. */
  pushReplayBar(bar: Bar): void {
    if (this.barSubs.size === 0) return;
    const tvBar = toTvBar(bar);
    const wantTicker = this.replayPushTicker;
    const wantRes = this.replayPushResolution
      ? normalizeReplayResolution(this.replayPushResolution)
      : null;
    let delivered = 0;
    for (const sub of this.barSubs.values()) {
      if (wantTicker && normalizeTicker(stripExchange(sub.ticker)) !== wantTicker) continue;
      if (wantRes && normalizeReplayResolution(sub.resolution) !== wantRes) continue;
      try {
        sub.onTick(tvBar);
        delivered += 1;
      } catch {
        /* ignore */
      }
    }
    // Resolution pin mismatch (e.g. "30S" vs "30s") used to drop every tick —
    // fall back to same-ticker subscribers so 30S forming bars are not cut off.
    if (delivered === 0 && wantRes) {
      for (const sub of this.barSubs.values()) {
        if (wantTicker && normalizeTicker(stripExchange(sub.ticker)) !== wantTicker) continue;
        try {
          sub.onTick(tvBar);
        } catch {
          /* ignore */
        }
      }
    }
  }

  endReplay(): void {
    this.replayActive = false;
    this.replayCutoffSec = null;
    this.replayClockSec = null;
    this.replayBuffer = null;
    this.replayBufferResolution = null;
    this.replayPushTicker = null;
    this.replayPushResolution = null;
  }

  /** Prefetch a deep history buffer for stepping (before cutoff is applied). */
  async fetchReplayBuffer(
    ticker: string,
    resolution: string,
    countBack = 5_000,
  ): Promise<readonly Bar[]> {
    // Keep EX:TICKER so broker-specific TV books (CAPITALCOM vs OANDA) are used.
    const exchange = parseExchangePrefix(ticker);
    const symbol =
      this.symbols.findByTicker(ticker, exchange) ??
      this.symbols.findByTicker(normalizeTicker(stripExchange(ticker)), exchange) ??
      this.symbols.findByTicker(normalizeTicker(stripExchange(ticker)));
    if (!symbol) return [];
    const to = Math.floor(Date.now() / 1000) + 60;
    const { bars } = await this.marketData.fetchHistory(symbol, resolution, {
      from: 0,
      to,
      countBack,
    });
    if (bars.length > 0) {
      this.replayBufferResolution = String(resolution);
    }
    return bars;
  }

  onReady(callback: OnReadyCallback): void {
    const present = [...new Set(this.symbols.all().map((s) => s.exchange))];
    const priority = EXCHANGE_PRIORITY as readonly string[];
    present.sort((a, b) => {
      const ia = priority.indexOf(a);
      const ib = priority.indexOf(b);
      const ra = ia >= 0 ? ia : priority.length;
      const rb = ib >= 0 ? ib : priority.length;
      return ra - rb || a.localeCompare(b);
    });
    const configuration: DatafeedConfiguration = {
      supported_resolutions: SUPPORTED_RESOLUTIONS,
      // Empty value first — default chip must be All exchanges (not NASDAQ).
      exchanges: [
        { value: "", name: "All exchanges", desc: "" },
        ...present.map((e) => ({ value: e, name: e, desc: e })),
      ],
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
    const exchangeNeedle = exchange.trim().toUpperCase();
    const query = userInput.trim();
    // Sticky NASDAQ (etc.) with an empty query used to hide Iran/FX/crypto — treat as All.
    const applyExchange =
      Boolean(exchangeNeedle) && !(SPARSE_EXCHANGE_FILTERS.has(exchangeNeedle) && query.length === 0);
    let matched = this.symbols
      .search(userInput, type)
      .filter((s) => !applyExchange || s.exchange.toUpperCase() === exchangeNeedle);
    // If a real venue filter somehow yields nothing, fall back to unfiltered type search.
    if (matched.length === 0 && exchangeNeedle) {
      matched = this.symbols.search(userInput, type);
    }
    const results = matched.map((s) => ({
      symbol: s.ticker,
      full_name: `${s.exchange}:${s.ticker}`,
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
      const cutoff = this.replayCutoffSec;
      const cutoffOn = cutoff != null && Number.isFinite(cutoff);

      // Prefer the prefetched replay buffer — providers often only return the
      // latest window, so re-fetching with to=pastCutoff yields empty history.
      // Skip when the chart TF no longer matches the buffer (e.g. 1m → 5m).
      const bufferResOk =
        !this.replayBufferResolution || this.replayBufferResolution === String(resolution);
      if (
        this.replayActive &&
        bufferResOk &&
        this.replayBuffer &&
        this.replayBuffer.length > 0
      ) {
        const end = cutoffOn ? cutoff! : Number.POSITIVE_INFINITY;
        const countBack = Math.max(periodParams.countBack || 300, 1);
        const upToCutoff = this.replayBuffer.filter((b) => Number(b.time) <= end);

        let slice: Bar[];
        if (periodParams.firstDataRequest || periodParams.from > end) {
          // First paint or live-window request: fill chart with bars ending at cutoff.
          slice = upToCutoff.slice(-countBack);
        } else {
          const right = Math.min(periodParams.to, end);
          slice = upToCutoff.filter(
            (b) => Number(b.time) >= periodParams.from && Number(b.time) <= right,
          );
          if (slice.length === 0) {
            const older = upToCutoff.filter((b) => Number(b.time) < periodParams.from);
            if (older.length === 0) {
              onResult([], { noData: true });
              return;
            }
            slice = older.slice(-countBack);
          }
        }

        if (periodParams.firstDataRequest) {
          this.source.set({ ticker: symbol.ticker, providerId: "replay-buffer", isSynthetic: false });
        }
        if (slice.length === 0) {
          onResult([], { noData: true });
          return;
        }
        onResult(slice.map(toTvBar), { noData: false });
        return;
      }

      const nowSec = Math.floor(Date.now() / 1000);
      let from = asUnixSec(periodParams.from, 0);
      let to = asUnixSec(periodParams.to, nowSec + 60);
      let countBack = periodParams.countBack;
      if (cutoffOn) {
        if (from > cutoff!) {
          to = cutoff! + 1;
          from = 0;
          countBack = Math.max(countBack || 300, 500);
        } else {
          to = Math.min(to, cutoff! + 1);
        }
      }

      const { bars, providerId, isSynthetic } = await this.marketData.fetchHistory(symbol, resolution, {
        from,
        to,
        countBack,
      });

      if (periodParams.firstDataRequest) {
        this.source.set({ ticker: symbol.ticker, providerId, isSynthetic });
      }

      const filtered = cutoffOn ? bars.filter((b) => Number(b.time) <= cutoff!) : bars;
      if (filtered.length === 0) {
        onResult([], { noData: true });
        return;
      }
      onResult(filtered.map(toTvBar), { noData: false });
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
    const resKey = String(resolution);

    // Keep every pane’s callback so multipane layouts don’t steal replay ticks.
    this.barSubs.set(listenerGuid, {
      ticker: symbol.ticker,
      resolution: resKey,
      onTick,
    });

    const unsubscribe = this.marketData.subscribe(symbol, resolution, (bar) => {
      if (this.replayActive) return; // muted during Bar Replay
      try {
        onTick(toTvBar(bar));
      } catch {
        /* drop corrupt realtime bars instead of crashing the widget */
      }
    });
    this.subscriptions.set(listenerGuid, () => {
      unsubscribe();
      this.barSubs.delete(listenerGuid);
    });
  }

  unsubscribeBars(listenerGuid: string): void {
    this.subscriptions.get(listenerGuid)?.();
    this.subscriptions.delete(listenerGuid);
    this.barSubs.delete(listenerGuid);
  }

  getServerTime(callback: ServerTimeCallback): void {
    // Demo/replay: use the advancing replay clock so candle countdown works.
    if (this.replayActive) {
      const clock = this.replayClockSec ?? this.replayCutoffSec;
      if (clock != null && Number.isFinite(clock)) {
        callback(Math.floor(clock));
        return;
      }
    }
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
    const hasIntraday = native.some((iv) => parseInterval(iv).unit === "minutes");
    // Any feed that can serve 1m can synthesize 5S (Yahoo / cp / Binance / Germany).
    const hasSeconds =
      native.some((iv) => parseInterval(iv).unit === "seconds") || hasIntraday;
    const sessionOpen = isMarketSessionOpen(symbol);

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
      // Do not invent empty candles when the feed is quiet / market closed.
      has_empty_bars: false,
      supported_resolutions: SUPPORTED_RESOLUTIONS,
      volume_precision: symbol.type === "crypto" ? 3 : 0,
      visible_plots_set: "ohlcv",
      // Demo/replay must stay "streaming" so candle countdown runs; otherwise
      // endofday freezes the timer when the real FX session is closed.
      data_status: this.replayActive || sessionOpen ? "streaming" : "endofday",
    };
  }
}
