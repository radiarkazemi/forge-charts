import {
  AlertService,
  MarketDataService,
  QuoteService,
  SettingsService,
  type KeyValueStorage,
  type MarketDataProvider,
  type Notifier,
  type SymbolRepository,
} from "@/application";
import type { SymbolInfo } from "@/domain";
import {
  BinanceProvider,
  BrowserNotifier,
  CpFetcherProvider,
  generateId,
  LocalSaveLoadAdapter,
  LocalStorageAdapter,
  StaticSymbolRepository,
  SyntheticProvider,
  TradingViewDatafeed,
  YahooProvider,
  type IExternalSaveLoadAdapter,
} from "@/infrastructure";
import { ChartController } from "@/features/chart/chart-controller";
import { readConfig, type AppConfig } from "./config";

/** Everything the UI layer may depend on, wired once at startup. */
export interface Services {
  readonly config: AppConfig;
  readonly storage: KeyValueStorage;
  readonly notifier: Notifier;
  readonly symbols: SymbolRepository;
  readonly marketData: MarketDataService;
  readonly quotes: QuoteService;
  readonly alerts: AlertService;
  readonly settings: SettingsService;
  readonly chart: ChartController;
  readonly datafeed: TradingViewDatafeed;
  readonly saveLoadAdapter: IExternalSaveLoadAdapter;
  /** Tear down timers and subscriptions (tests / HMR). */
  dispose(): void;
}

function buildProviders(config: AppConfig): MarketDataProvider[] {
  const providers: MarketDataProvider[] = [];
  if (config.cpFetcherEnabled) providers.push(new CpFetcherProvider());
  providers.push(new BinanceProvider(), new YahooProvider());
  // Synthetic data is the last resort so the chart is never empty.
  providers.push(new SyntheticProvider());
  return providers;
}

/**
 * Composition root. This is the only place that knows about concrete
 * infrastructure classes; everything else depends on ports and services.
 */
export function createServices(config: AppConfig = readConfig()): Services {
  const storage = new LocalStorageAdapter();
  const notifier = new BrowserNotifier();
  const symbols = new StaticSymbolRepository();
  const providers = buildProviders(config);

  const marketData = new MarketDataService(providers);
  const quotes = new QuoteService(providers, { refreshMs: 10_000 });
  const alerts = new AlertService({ storage, symbols, notifier, generateId });
  const settings = new SettingsService(storage);

  const { lastSymbol, lastInterval } = settings.settings.get();
  const chart = new ChartController(lastSymbol, lastInterval);
  const datafeed = new TradingViewDatafeed(marketData, symbols);
  const saveLoadAdapter = new LocalSaveLoadAdapter(storage);

  const disposers: Array<() => void> = [];

  // Quotes feed alert evaluation.
  disposers.push(quotes.quotes.subscribe(() => alerts.evaluate(quotes.quotes.get())));

  // Quote polling covers the watchlist, every alerted ticker and the charted symbol.
  const syncTrackedSymbols = () => {
    const tickers = new Set<string>([
      ...settings.settings.get().watchlist,
      ...alerts.alerts.get().map((a) => a.ticker),
      chart.state.get().symbol,
    ]);
    const tracked = [...tickers].map((t) => symbols.findByTicker(t)).filter((s): s is SymbolInfo => s !== undefined);
    quotes.track(tracked);
  };
  disposers.push(settings.settings.subscribe(syncTrackedSymbols));
  disposers.push(alerts.alerts.subscribe(syncTrackedSymbols));
  disposers.push(chart.state.subscribe(syncTrackedSymbols));
  syncTrackedSymbols();
  quotes.start();

  // Remember the last charted symbol/interval for the next session.
  disposers.push(
    chart.state.subscribe(() => {
      const { symbol, interval, ready } = chart.state.get();
      if (ready) settings.rememberChart(symbol, interval);
    }),
  );

  return {
    config,
    storage,
    notifier,
    symbols,
    marketData,
    quotes,
    alerts,
    settings,
    chart,
    datafeed,
    saveLoadAdapter,
    dispose: () => {
      quotes.stop();
      datafeed.dispose();
      for (const dispose of disposers) dispose();
    },
  };
}
