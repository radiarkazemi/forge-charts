import {
  intervalSeconds,
  normalizeBars,
  resampleBars,
  type Bar,
  type BarRange,
  type Interval,
  type SymbolInfo,
} from "@/domain";
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
  /** Dedupe parallel getBars (TF switch / quotes vs chart). */
  private readonly inflight = new Map<string, Promise<HistoryResult>>();
  /** Short memory of the last page — Chartix-style; CL also caches in the widget. */
  private readonly memo = new Map<string, { at: number; value: HistoryResult }>();
  /** Per-symbol OHLC by bar step so TF switches never wait on the network. */
  private readonly byStep = new Map<string, Bar[]>();
  private readonly warming = new Set<string>();
  private static readonly ROLL_STEPS = [60, 300, 900, 1_800, 3_600, 7_200, 14_400, 86_400] as const;

  constructor(providers: readonly MarketDataProvider[], logger: MarketDataLogger = console) {
    if (providers.length === 0) throw new Error("MarketDataService requires at least one provider");
    this.providers = providers;
    this.logger = logger;
  }

  private historyKey(symbol: SymbolInfo, interval: Interval, range: BarRange): string {
    const toBucket = range.to > 0 ? Math.floor(range.to / 20) : Math.floor(Date.now() / 20_000);
    return `${symbol.exchange}:${symbol.ticker}|${interval}|${toBucket}|${range.countBack}|${Math.floor(range.from / 3_600)}`;
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

  private seriesKey(symbol: SymbolInfo): string {
    return `${symbol.exchange}:${symbol.ticker}`;
  }

  private stepKey(symbol: SymbolInfo, step: number): string {
    return `${this.seriesKey(symbol)}|${step}`;
  }

  private rememberSeries(symbol: SymbolInfo, interval: Interval, bars: Bar[]): void {
    if (bars.length < 8) return;
    const step = intervalSeconds(interval);
    this.byStep.set(this.stepKey(symbol, step), bars.slice(-12_000));
    for (const roll of MarketDataService.ROLL_STEPS) {
      if (roll < step || roll % step !== 0) continue;
      const rolled = roll === step ? bars : resampleBars(bars, roll);
      if (rolled.length >= 8) this.byStep.set(this.stepKey(symbol, roll), rolled.slice(-4_000));
    }
  }

  private resampleCached(symbol: SymbolInfo, interval: Interval, range: BarRange): HistoryResult | null {
    const want = intervalSeconds(interval);
    if (want < 60) return null;
    const before = range.to > 0 ? range.to : Number.POSITIVE_INFINITY;
    const need = Math.max(1, range.countBack);
    const exact = this.byStep.get(this.stepKey(symbol, want));
    if (exact && exact.length >= 8) {
      const filtered = exact.filter((b) => b.time < before);
      if (filtered.length >= 8) {
        return { bars: filtered.slice(-need), providerId: "tf-cache", isSynthetic: false };
      }
    }
    let best: Bar[] | null = null;
    let bestStep = Number.POSITIVE_INFINITY;
    const prefix = `${this.seriesKey(symbol)}|`;
    for (const [key, bars] of this.byStep) {
      if (!key.startsWith(prefix)) continue;
      const step = Number(key.slice(prefix.length));
      if (!Number.isFinite(step) || step <= 0 || want < step || want % step !== 0) continue;
      if (step < bestStep && bars.length >= 8) {
        best = bars;
        bestStep = step;
      }
    }
    if (!best) return null;
    const src = bestStep === want ? best : resampleBars(best, want);
    const filtered = src.filter((b) => b.time < before);
    if (filtered.length < 8) return null;
    return { bars: filtered.slice(-need), providerId: "tf-cache", isSynthetic: false };
  }

  private warmMinuteHistory(symbol: SymbolInfo): void {
    const key = `${this.seriesKey(symbol)}|1`;
    if (this.warming.has(key)) return;
    if ((this.byStep.get(this.stepKey(symbol, 60))?.length ?? 0) >= 200) return;
    this.warming.add(key);
    const to = Math.floor(Date.now() / 1000) + 60;
    void this.fetchHistory(symbol, "1", { from: 0, to, countBack: 2_000 }).catch(() => {
      this.warming.delete(key);
    });
  }

  async fetchHistory(symbol: SymbolInfo, interval: Interval, range: BarRange): Promise<HistoryResult> {
    const cachedTf = range.countBack > 24 ? this.resampleCached(symbol, interval, range) : null;
    if (cachedTf) {
      if (intervalSeconds(interval) > 60) this.warmMinuteHistory(symbol);
      return cachedTf;
    }

    const key = this.historyKey(symbol, interval, range);
    const hit = this.memo.get(key);
    const ttl = range.countBack <= 24 ? 4_000 : 12_000;
    if (hit && Date.now() - hit.at < ttl && hit.value.bars.length > 0) {
      return hit.value;
    }
    const pending = this.inflight.get(key);
    if (pending) return pending;

    const run = this.fetchHistoryUncached(symbol, interval, range).then((value) => {
      if (value.bars.length > 0) {
        this.memo.set(key, { at: Date.now(), value });
        this.rememberSeries(symbol, interval, value.bars);
        if (intervalSeconds(interval) > 60) this.warmMinuteHistory(symbol);
      }
      if (this.memo.size > 64) {
        const oldest = this.memo.keys().next().value;
        if (oldest) this.memo.delete(oldest);
      }
      return value;
    });
    this.inflight.set(key, run);
    try {
      return await run;
    } finally {
      this.inflight.delete(key);
    }
  }

  private async fetchHistoryUncached(
    symbol: SymbolInfo,
    interval: Interval,
    range: BarRange,
  ): Promise<HistoryResult> {
    let lastError: unknown = null;
    let sawRealProvider = false;
    let emptyRealId: string | null = null;

    for (const provider of this.providers) {
      if (!provider.supports(symbol, interval)) continue;
      // Never invent demo OHLC for symbols that a real feed owns (e.g. XAUUSD).
      if (provider.isSynthetic && sawRealProvider) {
        this.logger.warn(
          `[market-data] skipping synthetic for ${symbol.ticker} @ ${interval} (real provider failed)`,
          lastError,
        );
        break;
      }
      if (!provider.isSynthetic) sawRealProvider = true;
      try {
        const bars = normalizeBars(await provider.fetchBars(symbol, interval, range));
        // Empty real history must not stop the chain (e.g. missing Mongo → Yahoo).
        // If every real feed is empty (end of paging), return noData — not an error.
        if (bars.length === 0 && !provider.isSynthetic) {
          emptyRealId = provider.id;
          lastError = new Error(`${provider.id}: empty history for ${symbol.ticker} @ ${interval}`);
          this.logger.warn(`[market-data] ${provider.id} empty for ${symbol.ticker} @ ${interval}`);
          continue;
        }
        return { bars, providerId: provider.id, isSynthetic: provider.isSynthetic };
      } catch (error) {
        lastError = error;
        this.logger.warn(`[market-data] ${provider.id} failed for ${symbol.ticker} @ ${interval}`, error);
      }
    }

    if (emptyRealId) {
      return { bars: [], providerId: emptyRealId, isSynthetic: false };
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
