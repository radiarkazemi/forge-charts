import type { Interval } from "@/domain";
import type { KeyValueStorage } from "../ports";
import { createPersistentStore, type Store } from "../store";

export type ThemeMode = "dark" | "light";

export type SidePanelId = "watchlist" | "alerts" | "data" | "pine";


/** Multi-chart page layout (1 / 2 / 3 / 4 panes). */
export type ChartLayoutId = "s" | "2h" | "2v" | "3s" | "3h" | "3v" | "2-1" | "1-2" | "4";

export interface LayoutSyncSettings {
  readonly symbol: boolean;
  readonly interval: boolean;
  readonly crosshair: boolean;
  readonly time: boolean;
  readonly dateRange: boolean;
  /** Mirror drawings across panes by absolute time/price (cross-TF). */
  readonly drawings: boolean;
}

/** Per-person local profile (TradingView-style account identity). */
export interface UserProfile {
  readonly id: string;
  readonly displayName: string;
  readonly username: string;
  readonly avatarInitial: string;
  readonly avatarColor: string;
}

export interface Settings {
  readonly theme: ThemeMode;
  readonly sidePanel: SidePanelId | null;
  readonly chartLayout: ChartLayoutId;
  /** Per-pane symbols for multi-chart (index 0 = primary). */
  readonly paneSymbols: readonly string[];
  readonly layoutSync: LayoutSyncSettings;
  readonly lastSymbol: string;
  readonly lastInterval: Interval;
  readonly watchlist: readonly string[];
  readonly profiles: readonly UserProfile[];
  readonly activeProfileId: string;
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

export const DEFAULT_LAYOUT_SYNC: LayoutSyncSettings = {
  // Same ticker on every pane (TV linked multi-chart).
  symbol: true,
  // Independent intervals (15m next to 4H).
  interval: false,
  // Do not recenter other panes on mouse move (looks like zoom/scale fighting).
  crosshair: false,
  time: false,
  dateRange: false,
  // Drawings share time/price across panes (TV sample behavior).
  drawings: true,
};

export const AVATAR_COLORS = ["#9c27b0", "#2962ff", "#089981", "#f57c00", "#e91e63", "#00bcd4"] as const;

export function createDefaultProfile(): UserProfile {
  return {
    id: "local-1",
    displayName: "Forge Trader",
    username: "forge",
    avatarInitial: "F",
    avatarColor: AVATAR_COLORS[0],
  };
}

export const DEFAULT_SETTINGS: Settings = {
  theme: "dark",
  sidePanel: null,
  chartLayout: "s",
  paneSymbols: ["XAUUSD"],
  layoutSync: DEFAULT_LAYOUT_SYNC,
  lastSymbol: "XAUUSD",
  lastInterval: "15",
  watchlist: DEFAULT_WATCHLIST,
  profiles: [createDefaultProfile()],
  activeProfileId: "local-1",
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
  return value === "watchlist" || value === "alerts" || value === "data" || value === "pine" ? value : null;
}

function sanitizeLayoutSync(value: unknown): LayoutSyncSettings {
  const raw = value && typeof value === "object" ? (value as Partial<LayoutSyncSettings>) : {};
  return {
    // Defaults match TradingView linked multi-chart (same symbol, synced drawings, free interval).
    symbol: raw.symbol !== false,
    interval: Boolean(raw.interval),
    crosshair: Boolean(raw.crosshair),
    time: Boolean(raw.time),
    dateRange: Boolean(raw.dateRange),
    drawings: raw.drawings !== false,
  };
}

function sanitizeProfile(raw: unknown, fallback: UserProfile): UserProfile {
  if (!raw || typeof raw !== "object") return fallback;
  const p = raw as Partial<UserProfile>;
  const displayName =
    typeof p.displayName === "string" && p.displayName.trim() ? p.displayName.trim().slice(0, 48) : fallback.displayName;
  const username =
    typeof p.username === "string" && p.username.trim()
      ? p.username.trim().replace(/\s+/g, "").slice(0, 24).toLowerCase()
      : fallback.username;
  const initial =
    typeof p.avatarInitial === "string" && p.avatarInitial.trim()
      ? p.avatarInitial.trim().slice(0, 2).toUpperCase()
      : displayName.slice(0, 1).toUpperCase() || "F";
  const avatarColor =
    typeof p.avatarColor === "string" && /^#[0-9a-fA-F]{6}$/.test(p.avatarColor)
      ? p.avatarColor
      : fallback.avatarColor;
  return {
    id: typeof p.id === "string" && p.id ? p.id : fallback.id,
    displayName,
    username,
    avatarInitial: initial,
    avatarColor,
  };
}

function sanitizeProfiles(value: unknown): readonly UserProfile[] {
  if (!Array.isArray(value) || value.length === 0) return [createDefaultProfile()];
  return value.map((item, i) =>
    sanitizeProfile(item, {
      ...createDefaultProfile(),
      id: `local-${i + 1}`,
      avatarColor: AVATAR_COLORS[i % AVATAR_COLORS.length] ?? AVATAR_COLORS[0],
    }),
  );
}

/** Normalize any persisted blob into a full Settings object (legacy-safe). */
export function sanitizeSettings(raw: unknown): Settings {
  const persisted = raw && typeof raw === "object" ? (raw as Partial<Settings>) : {};
  const lastSymbol =
    typeof persisted.lastSymbol === "string" && persisted.lastSymbol.length > 0
      ? persisted.lastSymbol
      : DEFAULT_SETTINGS.lastSymbol;
  const paneSymbols = sanitizeStringList(persisted.paneSymbols, [lastSymbol]);
  const profiles = sanitizeProfiles(persisted.profiles);
  const activeProfileId =
    typeof persisted.activeProfileId === "string" && profiles.some((p) => p.id === persisted.activeProfileId)
      ? persisted.activeProfileId
      : profiles[0]!.id;
  return {
    theme: persisted.theme === "light" ? "light" : "dark",
    sidePanel: sanitizeSidePanel(persisted.sidePanel),
    chartLayout: sanitizeLayout(persisted.chartLayout),
    paneSymbols,
    layoutSync: sanitizeLayoutSync(persisted.layoutSync),
    lastSymbol,
    lastInterval:
      typeof persisted.lastInterval === "string" && persisted.lastInterval.length > 0
        ? persisted.lastInterval
        : DEFAULT_SETTINGS.lastInterval,
    watchlist: sanitizeStringList(persisted.watchlist, DEFAULT_WATCHLIST),
    profiles,
    activeProfileId,
  };
}

export function activeProfile(settings: Settings): UserProfile {
  return settings.profiles.find((p) => p.id === settings.activeProfileId) ?? settings.profiles[0]!;
}

/** User preferences persisted across sessions. */
export class SettingsService {
  readonly settings: Store<Settings>;

  constructor(storage: KeyValueStorage) {
    const persisted = storage.get<unknown>(STORAGE_KEY, DEFAULT_SETTINGS);
    const sanitized = sanitizeSettings(persisted);
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
    const next = sanitizeLayout(chartLayout);
    const primary = this.settings.get().lastSymbol || "XAUUSD";
    const panes = [...sanitizeStringList(this.settings.get().paneSymbols, [primary])];
    // Fill missing secondary panes with the primary symbol (don't invent AAPL/etc.).
    while (panes.length < 4) panes.push(panes[0] ?? primary);
    if (!panes[0]) panes[0] = primary;
    this.patch({ chartLayout: next, paneSymbols: panes });
  }

  setLayoutSync(partial: Partial<LayoutSyncSettings>): void {
    this.patch({
      layoutSync: sanitizeLayoutSync({ ...this.settings.get().layoutSync, ...partial }),
    });
  }

  toggleLayoutSync(key: keyof LayoutSyncSettings): void {
    const current = this.settings.get().layoutSync;
    this.setLayoutSync({ [key]: !current[key] });
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
    const bare = ticker.includes(":") ? ticker.slice(ticker.lastIndexOf(":") + 1) : ticker;
    const next = watchlist.filter((t) => t !== bare || t.includes(":"));
    if (next.includes(ticker)) return;
    this.patch({ watchlist: [...next, ticker] });
  }

  removeFromWatchlist(ticker: string): void {
    const watchlist = sanitizeStringList(this.settings.get().watchlist, DEFAULT_WATCHLIST);
    this.patch({ watchlist: watchlist.filter((t) => t !== ticker) });
  }

  setActiveProfile(id: string): void {
    const { profiles } = this.settings.get();
    if (!profiles.some((p) => p.id === id)) return;
    this.patch({ activeProfileId: id });
  }

  upsertProfile(profile: UserProfile): void {
    const profiles = [...this.settings.get().profiles];
    const idx = profiles.findIndex((p) => p.id === profile.id);
    const next = sanitizeProfile(profile, createDefaultProfile());
    if (idx >= 0) profiles[idx] = next;
    else profiles.push(next);
    this.patch({ profiles, activeProfileId: next.id });
  }

  addProfile(partial?: Partial<UserProfile>): UserProfile {
    const n = this.settings.get().profiles.length + 1;
    const profile = sanitizeProfile(
      {
        id: `local-${Date.now().toString(36)}`,
        displayName: partial?.displayName ?? `Trader ${n}`,
        username: partial?.username ?? `trader${n}`,
        avatarInitial: partial?.avatarInitial,
        avatarColor: partial?.avatarColor ?? AVATAR_COLORS[(n - 1) % AVATAR_COLORS.length] ?? AVATAR_COLORS[0],
      },
      createDefaultProfile(),
    );
    this.patch({
      profiles: [...this.settings.get().profiles, profile],
      activeProfileId: profile.id,
    });
    return profile;
  }

  removeProfile(id: string): void {
    const profiles = this.settings.get().profiles.filter((p) => p.id !== id);
    if (profiles.length === 0) {
      const fallback = createDefaultProfile();
      this.patch({ profiles: [fallback], activeProfileId: fallback.id });
      return;
    }
    const activeProfileId =
      this.settings.get().activeProfileId === id ? profiles[0]!.id : this.settings.get().activeProfileId;
    this.patch({ profiles, activeProfileId });
  }

  private patch(partial: Partial<Settings>): void {
    this.settings.update((current) => sanitizeSettings({ ...current, ...partial }));
  }
}
