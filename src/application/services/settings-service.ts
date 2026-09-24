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

function sanitizeStringList(value: unknown, fallback: readonly string[]): readonly string[] {
  if (!Array.isArray(value)) return fallback;
  const next = value.filter((s): s is string => typeof s === "string" && s.length > 0);
  return next.length > 0 ? next : fallback;
}

function sanitizeSidePanel(value: unknown): SidePanelId | null {
  return value === "watchlist" || value === "alerts" || value === "data" ? value : null;
}

/** Normalize any persisted blob into a full Settings object (legacy-safe). */
export function sanitizeSettings(raw: unknown): Settings {
  const persisted = raw && typeof raw === "object" ? (raw as Partial<Settings>) : {};
  const lastSymbol =
    typeof persisted.lastSymbol === "string" && persisted.lastSymbol.length > 0
      ? persisted.lastSymbol
      : DEFAULT_SETTINGS.lastSymbol;
  const paneSymbols = sanitizeStringList(persisted.paneSymbols, [lastSymbol]);
  return {
    theme: persisted.theme === "light" ? "light" : "dark",
    sidePanel: sanitizeSidePanel(persisted.sidePanel),
    chartLayout: sanitizeLayout(persisted.chartLayout),
    paneSymbols,
    lastSymbol,
    lastInterval:
      typeof persisted.lastInterval === "string" && persisted.lastInterval.length > 0
        ? persisted.lastInterval
        : DEFAULT_SETTINGS.lastInterval,
    watchlist: sanitizeStringList(persisted.watchlist, DEFAULT_WATCHLIST),
  };
}

/** User preferences persisted across sessions. */
export class SettingsService {
  readonly settings: Store<Settings>;

  constructor(storage: KeyValueStorage) {
    const persisted = storage.get<unknown>(STORAGE_KEY, DEFAULT_SETTINGS);
    const sanitized = sanitizeSettings(persisted);
    // createPersistentStore prefers the raw stored value; force the sanitized shape.
    this.settings = createPersistentStore<Settings>(storage, STORAGE_KEY, sanitized);
    this.settings.set(sanitized);
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
    const current = sanitizeStringList(this.settings.get().paneSymbols, [this.settings.get().lastSymbol]);
    const next = [...current];
    while (next.length <= paneIndex) next.push(this.settings.get().lastSymbol);
    next[paneIndex] = ticker;
    this.patch({ paneSymbols: next });
    if (paneIndex === 0) this.patch({ lastSymbol: ticker });
  }

  rememberChart(lastSymbol: string, lastInterval: Interval): void {
    const paneSymbols = [...sanitizeStringList(this.settings.get().paneSymbols, [lastSymbol])];
    if (paneSymbols.length === 0) paneSymbols.push(lastSymbol);
    else paneSymbols[0] = lastSymbol;
    this.patch({ lastSymbol, lastInterval, paneSymbols });
  }

  addToWatchlist(ticker: string): void {
    const watchlist = sanitizeStringList(this.settings.get().watchlist, DEFAULT_WATCHLIST);
    if (watchlist.includes(ticker)) return;
    this.patch({ watchlist: [...watchlist, ticker] });
  }

  removeFromWatchlist(ticker: string): void {
    const watchlist = sanitizeStringList(this.settings.get().watchlist, DEFAULT_WATCHLIST);
    this.patch({ watchlist: watchlist.filter((t) => t !== ticker) });
  }

  private patch(partial: Partial<Settings>): void {
    this.settings.update((current) => sanitizeSettings({ ...current, ...partial }));
  }
}
