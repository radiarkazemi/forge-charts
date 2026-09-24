import type { Interval } from "@/domain";
import type { KeyValueStorage } from "../ports";
import { createPersistentStore, type Store } from "../store";

export type ThemeMode = "dark" | "light";

export type SidePanelId = "watchlist" | "alerts" | "data";

/** Multi-chart page layout (1 / 2 / 3 / 4 panes). */
export type ChartLayoutId = "s" | "2h" | "2v" | "3s" | "3h" | "3v" | "2-1" | "1-2" | "4";

export interface Settings {
  readonly theme: ThemeMode;
  readonly sidePanel: SidePanelId | null;
  readonly chartLayout: ChartLayoutId;
  /** Per-pane symbols for multi-chart (index 0 = primary). */
  readonly paneSymbols: readonly string[];
  readonly lastSymbol: string;
  readonly lastInterval: Interval;
  readonly watchlist: readonly string[];
}

const STORAGE_KEY = "forge.settings.v1";

export const DEFAULT_WATCHLIST: readonly string[] = [
  "XAUUSD",
  "BTCUSD",
  "ETHUSD",
  "EURUSD",
  "SPX",
  "AAPL",
  "NVDA",
  "TSLA",
  "USOIL",
];

export const DEFAULT_SETTINGS: Settings = {
  theme: "dark",
  sidePanel: null,
  chartLayout: "s",
  paneSymbols: ["XAUUSD"],
  lastSymbol: "XAUUSD",
  lastInterval: "15",
  watchlist: DEFAULT_WATCHLIST,
};

const VALID_LAYOUTS = new Set<ChartLayoutId>(["s", "2h", "2v", "3s", "3h", "3v", "2-1", "1-2", "4"]);

function sanitizeLayout(value: unknown): ChartLayoutId {
  return typeof value === "string" && VALID_LAYOUTS.has(value as ChartLayoutId)
    ? (value as ChartLayoutId)
    : DEFAULT_SETTINGS.chartLayout;
}

/** User preferences persisted across sessions. */
export class SettingsService {
  readonly settings: Store<Settings>;

  constructor(storage: KeyValueStorage) {
    const persisted = storage.get<Partial<Settings>>(STORAGE_KEY, {});
    const chartLayout = sanitizeLayout(persisted.chartLayout);
    const paneSymbols = Array.isArray(persisted.paneSymbols)
      ? persisted.paneSymbols.filter((s): s is string => typeof s === "string" && s.length > 0)
      : [];
    this.settings = createPersistentStore<Settings>(storage, STORAGE_KEY, {
      ...DEFAULT_SETTINGS,
      ...persisted,
      chartLayout,
      paneSymbols: paneSymbols.length > 0 ? paneSymbols : DEFAULT_SETTINGS.paneSymbols,
    });
  }

  setTheme(theme: ThemeMode): void {
    this.patch({ theme });
  }

  toggleTheme(): void {
    this.setTheme(this.settings.get().theme === "dark" ? "light" : "dark");
  }

  setSidePanel(sidePanel: SidePanelId | null): void {
    this.patch({ sidePanel });
  }

  toggleSidePanel(id: SidePanelId): void {
    this.setSidePanel(this.settings.get().sidePanel === id ? null : id);
  }

  setChartLayout(chartLayout: ChartLayoutId): void {
    this.patch({ chartLayout: sanitizeLayout(chartLayout) });
  }

  setPaneSymbol(paneIndex: number, ticker: string): void {
    if (paneIndex < 0 || paneIndex > 7) return;
    const current = this.settings.get().paneSymbols;
    const next = [...current];
    while (next.length <= paneIndex) next.push(this.settings.get().lastSymbol);
    next[paneIndex] = ticker;
    this.patch({ paneSymbols: next });
    if (paneIndex === 0) this.patch({ lastSymbol: ticker });
  }

  rememberChart(lastSymbol: string, lastInterval: Interval): void {
    const paneSymbols = [...this.settings.get().paneSymbols];
    if (paneSymbols.length === 0) paneSymbols.push(lastSymbol);
    else paneSymbols[0] = lastSymbol;
    this.patch({ lastSymbol, lastInterval, paneSymbols });
  }

  addToWatchlist(ticker: string): void {
    const { watchlist } = this.settings.get();
    if (watchlist.includes(ticker)) return;
    this.patch({ watchlist: [...watchlist, ticker] });
  }

  removeFromWatchlist(ticker: string): void {
    this.patch({ watchlist: this.settings.get().watchlist.filter((t) => t !== ticker) });
  }

  private patch(partial: Partial<Settings>): void {
    this.settings.update((current) => ({ ...current, ...partial }));
  }
}
