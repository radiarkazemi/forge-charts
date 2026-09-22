import type { Interval } from "@/domain";
import type { KeyValueStorage } from "../ports";
import { createPersistentStore, type Store } from "../store";

export type ThemeMode = "dark" | "light";

export type SidePanelId = "watchlist" | "alerts" | "data";

export interface Settings {
  readonly theme: ThemeMode;
  readonly sidePanel: SidePanelId | null;
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
  sidePanel: "watchlist",
  lastSymbol: "XAUUSD",
  lastInterval: "15",
  watchlist: DEFAULT_WATCHLIST,
};

/** User preferences persisted across sessions. */
export class SettingsService {
  readonly settings: Store<Settings>;

  constructor(storage: KeyValueStorage) {
    const persisted = storage.get<Partial<Settings>>(STORAGE_KEY, {});
    this.settings = createPersistentStore<Settings>(storage, STORAGE_KEY, { ...DEFAULT_SETTINGS, ...persisted });
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

  rememberChart(lastSymbol: string, lastInterval: Interval): void {
    this.patch({ lastSymbol, lastInterval });
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
