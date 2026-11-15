import { useEffect, useEffectEvent, type RefObject } from "react";
import type { ChartLayoutId, KeyValueStorage, ThemeMode, UserProfile } from "@/application";
import type { Interval } from "@/domain";
import {
  buildWidgetOptions,
  loadChartingLibrary,
  seedDrawingFavorites,
  seedFavoriteIntervals,
  type IBasicDataFeed,
  type IChartingLibraryWidget,
  type IExternalSaveLoadAdapter,
  libraryChartState,
  LocalSaveLoadAdapter,
  type ISettingsAdapter,
  type WidgetConstructor,
} from "@/infrastructure/tradingview";
import type { ChartController } from "./chart-controller";
import {
  activateDealingRange,
  mountDealingRangeFlyoutInjector,
  seedDealingRangeTemplate,
} from "./dealing-range";
import { mountPositionToolIconPatcher } from "./position-tool-icons";
import { mountHeaderToolbar, type HeaderToolbarApi } from "./header-toolbar";
import { mountFavoriteToolbar, mountFloatingChromePin } from "./chart-layout-geometry";
import { mountForgeChartLogo } from "./forge-chart-logo";
import {
  mountSymbolSearchExchangeReset,
  purgeStickySymbolSearchFilters,
} from "./symbol-search-defaults";
import { mountIndicatorsIntercept } from "./indicators-intercept";
import { isChartPaintBusy } from "./study-paint-gate";
import {
  DEFAULT_FAVORITE_INDICATORS,
  DRAWINGS_UPDATED_EVENT,
  profilePersistHeld,
  SETTINGS_UPDATED_EVENT,
  USER_SETTINGS_KEY,
} from "@/features/profile-sync";

export interface TradingViewWidgetDeps {
  readonly controller: ChartController;
  readonly datafeed: IBasicDataFeed;
  readonly saveLoadAdapter: IExternalSaveLoadAdapter;
  readonly storage: KeyValueStorage;
  readonly settingsAdapter?: ISettingsAdapter;
  /** Push chart/favorites changes to the cloud Radiar profile. */
  readonly notifyProfileDirty?: () => void;
  readonly libraryPath: string;
  readonly initialSymbol: string;
  readonly initialInterval: Interval;
  readonly theme: ThemeMode;
  readonly alertCount: number;
  /** Primary pane mounts Forge header tools; secondary panes stay library-only. */
  readonly isPrimary?: boolean;
  readonly paneIndex?: number;
  /** Multi-layout: hide CL header on secondary panes (primary keeps original navbar). */
  readonly hideHeader?: boolean;
  readonly onCreateAlert: () => void;
  readonly onToggleTheme: () => void;
  readonly onOpenAlertsPanel: () => void;
  readonly onOpenWatchlist: () => void;
  readonly onOpenObjectTree: () => void;
  readonly onOpenProfile: () => void;
  readonly getProfile: () => UserProfile;
  readonly onSaveNamedLayout?: (name?: string) => void;
  readonly onEnterBarReplay: () => void;
  readonly onSetChartLayout: (layout: ChartLayoutId) => void;
  readonly onToggleLayoutSync?: (
    key:
      | "symbol"
      | "interval"
      | "crosshair"
      | "time"
      | "dateRange"
      | "drawings"
      | "indicators",
  ) => void;
  readonly getLayoutSync?: () => {
    symbol: boolean;
    interval: boolean;
    crosshair: boolean;
    time: boolean;
    dateRange: boolean;
    drawings: boolean;
    indicators: boolean;
  };
  readonly onSymbolChanged?: (paneIndex: number, symbol: string) => void;
  readonly getLastPrice: () => number | null;
  readonly onHeaderReady?: (api: HeaderToolbarApi) => void;
  /** Fired once when the primary chart widget is ready (Bar Replay attach). */
  readonly onWidgetReady?: (widget: IChartingLibraryWidget) => void;
}

/** Bump when autosave recovery needs a clean slate for all browsers. */
const AUTOSAVE_KEY = "forge.tv.autosave.v3";
const LEGACY_AUTOSAVE_KEYS = [
  "forge.tv.autosave.v2",
  "forge.tv.autosave",
  "forge.tv.autosave.pane.1",
  "forge.tv.autosave.pane.2",
  "forge.tv.autosave.pane.3",
] as const;
/** Soft timeout only — never wipe autosave (slow feeds after deploy must not erase layouts). */
const READY_TIMEOUT_MS = 45_000;
const AUTOSAVE_BAK_KEY = `${AUTOSAVE_KEY}.bak`;

function purgeLegacyAutosaves(storage: KeyValueStorage): void {
  for (const key of LEGACY_AUTOSAVE_KEYS) {
    try {
      storage.remove(key);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Saved charts can still carry the TSE cash session. The library then reserves
 * empty slots for nights and holidays, which shows up as a hole between candles.
 * The live symbol info is 24x7; the saved copy has to match.
 */
function openSavedTseSession(saved: object | undefined): object | undefined {
  if (!saved) return saved;
  try {
    const json = JSON.stringify(saved);
    if (!json.includes("0900-1230")) return saved;
    return JSON.parse(json.replaceAll("0900-1230:71234", "24x7").replaceAll("0900-1230", "24x7")) as object;
  } catch {
    return saved;
  }
}

/** Reject corrupt / incomplete library snapshots that leave the chart spinning forever. */
function readAutosave(storage: KeyValueStorage): object | undefined {
  purgeLegacyAutosaves(storage);
  const heal = (key: string, raw: unknown): object | undefined => {
    const state = libraryChartState(raw);
    if (!state) return undefined;
    if (state !== raw) {
      try {
        storage.set(key, state);
      } catch {
        /* ignore */
      }
    }
    return state;
  };
  const primary = heal(AUTOSAVE_KEY, storage.get<unknown>(AUTOSAVE_KEY, undefined));
  if (primary) return primary;
  const bak = heal(AUTOSAVE_BAK_KEY, storage.get<unknown>(AUTOSAVE_BAK_KEY, undefined));
  if (bak) {
    try {
      storage.set(AUTOSAVE_KEY, bak);
    } catch {
      /* ignore */
    }
    return bak;
  }
  return undefined;
}

/**
 * Owns the TradingView widget lifecycle: script loading, construction,
 * auto-save, TradingView-style header controls, and teardown.
 */
export function useTradingViewWidget(containerRef: RefObject<HTMLDivElement | null>, deps: TradingViewWidgetDeps): void {
  const {
    controller,
    datafeed,
    saveLoadAdapter,
    storage,
    settingsAdapter,
    notifyProfileDirty,
    libraryPath,
    theme,
  } = deps;
  const isPrimary = deps.isPrimary !== false;
  const hideHeader = Boolean(deps.hideHeader);
  const paneIndex = deps.paneIndex ?? 0;

  const onCreateAlert = useEffectEvent(() => deps.onCreateAlert());
  const onToggleTheme = useEffectEvent(() => deps.onToggleTheme());
  const onOpenAlertsPanel = useEffectEvent(() => deps.onOpenAlertsPanel());
  const onOpenWatchlist = useEffectEvent(() => deps.onOpenWatchlist());
  const onOpenObjectTree = useEffectEvent(() => deps.onOpenObjectTree());
  const onOpenProfile = useEffectEvent(() => deps.onOpenProfile());
  const getProfile = useEffectEvent(() => deps.getProfile());
  const onEnterBarReplay = useEffectEvent(() => deps.onEnterBarReplay());
  const onHeaderReady = useEffectEvent((api: HeaderToolbarApi) => deps.onHeaderReady?.(api));
  const onWidgetReady = useEffectEvent((widget: IChartingLibraryWidget) => deps.onWidgetReady?.(widget));
  const onSetChartLayout = useEffectEvent((layout: ChartLayoutId) => deps.onSetChartLayout(layout));
  const onToggleLayoutSync = useEffectEvent(
    (
      key:
        | "symbol"
        | "interval"
        | "crosshair"
        | "time"
        | "dateRange"
        | "drawings"
        | "indicators",
    ) => deps.onToggleLayoutSync?.(key),
  );
  const getLayoutSync = useEffectEvent(
    () =>
      deps.getLayoutSync?.() ?? {
        symbol: true,
        interval: false,
        crosshair: false,
        time: false,
        dateRange: false,
        drawings: true,
        indicators: false,
      },
  );
  const onSymbolChanged = useEffectEvent((symbol: string) => deps.onSymbolChanged?.(paneIndex, symbol));
  const getLastPrice = useEffectEvent(() => deps.getLastPrice());
  const readInitial = useEffectEvent(() => ({
    symbol: deps.initialSymbol,
    interval: deps.initialInterval,
    theme: deps.theme,
    alertCount: deps.alertCount,
  }));

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const initial = readInitial();
    let widget: IChartingLibraryWidget | null = null;
    let cancelled = false;
    let ready = false;
    let readyTimer = 0;
    let unmountDealingRange: (() => void) | null = null;
    let unmountPositionIcons: (() => void) | null = null;
    let unmountSymbolSearchReset: (() => void) | null = null;
    let unmountIndicatorsIntercept: (() => void) | null = null;
    let unmountForgeLogo: (() => void) | null = null;
    let unmountFloatingPin: (() => void) | null = null;
    let unmountFavoriteToolbar: (() => void) | null = null;
    const isMobile = typeof window !== "undefined" && window.matchMedia("(max-width: 900px)").matches;
    const autosaveKey = isPrimary ? AUTOSAVE_KEY : `${AUTOSAVE_KEY}.pane.${paneIndex}`;

    seedDealingRangeTemplate(storage);
    purgeStickySymbolSearchFilters();

    const mount = (Widget: WidgetConstructor, savedState: object | undefined) => {
      try {
        widget?.remove();
      } catch {
        /* previous instance may already be torn down */
      }
      // Force TV-matching drawing stars + interval strip before the iframe reads localStorage.
      seedDrawingFavorites();
      seedFavoriteIntervals();
      if (isPrimary) {
        (saveLoadAdapter as LocalSaveLoadAdapter).setDefaultLayoutName(getProfile().displayName?.trim() || "Layout");
      }
      widget = new Widget(
        buildWidgetOptions({
          container,
          datafeed,
          saveLoadAdapter,
          libraryPath,
          symbol: initial.symbol,
          interval: initial.interval,
          theme: initial.theme,
          savedState: isPrimary ? savedState : undefined,
          isMobile,
          secondaryPane: !isPrimary,
          hideHeader,
          settingsAdapter,
        }),
      );

      ready = false;
      window.clearTimeout(readyTimer);
      readyTimer = window.setTimeout(() => {
        if (cancelled || ready) return;
        // Slow feed after deploy: keep waiting with saved_data intact.
        // Never remount blank + persist — that overwrote indicators/layout/profile.
        if (savedState) {
          try {
            storage.set(AUTOSAVE_BAK_KEY, savedState);
          } catch {
            /* ignore */
          }
          console.warn(
            "[forge-charts] chart ready timed out; keeping autosave (Radiar layout) for next load",
          );
        }
      }, READY_TIMEOUT_MS);

      widget.onChartReady(() => {
        if (cancelled || !widget) return;
        ready = true;
        window.clearTimeout(readyTimer);
        controller.attach(widget);
        onWidgetReady(widget);
        // Bottom-left Forge mark inside the chart pane (TV / Faraz logo slot).
        unmountForgeLogo?.();
        unmountForgeLogo = mountForgeChartLogo(widget);
        unmountFloatingPin?.();
        unmountFloatingPin = mountFloatingChromePin(container);
        unmountFavoriteToolbar?.();
        unmountFavoriteToolbar = isPrimary ? mountFavoriteToolbar(container) : null;
        // Always route Indicators button / insertIndicator → Forge TV-style dialog.
        unmountIndicatorsIntercept?.();
        unmountIndicatorsIntercept = mountIndicatorsIntercept(widget);
        // Volume is disabled by featureset; also strip any leftover Volume from
        // layouts that migrated from older autosave keys once.
        try {
          const clearedKey = "forge.charts.volumeDefaultCleared.v2";
          const readyWidget = widget;
          if (typeof localStorage !== "undefined" && localStorage.getItem(clearedKey) !== "1") {
            const stripAndSave = () => {
              try {
                controller.removeVolumeStudy();
                if (isPrimary && readyWidget) {
                  readyWidget.save((state) => storage.set(autosaveKey, state));
                }
              } catch {
                /* ignore */
              }
            };
            stripAndSave();
            window.setTimeout(stripAndSave, 1000);
            window.setTimeout(() => {
              stripAndSave();
              try {
                localStorage.setItem(clearedKey, "1");
              } catch {
                /* ignore */
              }
            }, 3000);
          }
        } catch {
          /* ignore */
        }
        // Drawing flyout patches on every pane (each widget has its own iframe).
        unmountDealingRange?.();
        unmountDealingRange = mountDealingRangeFlyoutInjector(container, () => {
          if (widget) void activateDealingRange(widget);
        });
        unmountPositionIcons?.();
        unmountPositionIcons = mountPositionToolIconPatcher(container);
        unmountSymbolSearchReset?.();
        unmountSymbolSearchReset = mountSymbolSearchExchangeReset(container);
        if (isPrimary) {
          // Full widget.save() is expensive. Never run it on every study/drawing
          // event (indicator add / shape paint storms) — coalesce instead.
          let persistTimer: number | undefined;
          let persistQueued = false;
          const AUTOSAVE_IDLE_MS = 4_000;

          const runPersist = () => {
            try {
              if (profilePersistHeld()) return;
              // Wait out active shape paints so we don't save mid-storm.
              if (isChartPaintBusy()) {
                persistQueued = true;
                window.clearTimeout(persistTimer);
                persistTimer = window.setTimeout(flushPersist, 600);
                return;
              }
              widget?.save(
                (state) => {
                  if (!state || typeof state !== "object") return;
                  // Refuse to persist a hollow layout (no panes / charts) — protects
                  // study templates and drawings when history temporarily returns noData.
                  const charts = (state as { charts?: unknown }).charts;
                  if (Array.isArray(charts) && charts.length === 0) return;
                  storage.set(autosaveKey, state);
                  try {
                    storage.set(AUTOSAVE_BAK_KEY, state);
                  } catch {
                    /* ignore */
                  }
                  notifyProfileDirty?.();
                },
                storage.get("forge.tv.drawingsSeparate.v1", null) ? { includeDrawings: false } : undefined,
              );
            } catch {
              /* ignore */
            }
          };

          const flushPersist = () => {
            persistTimer = undefined;
            if (!persistQueued) return;
            persistQueued = false;
            runPersist();
          };

          const schedulePersist = () => {
            persistQueued = true;
            if (persistTimer != null) return;
            persistTimer = window.setTimeout(flushPersist, AUTOSAVE_IDLE_MS);
          };

          const persistNow = () => {
            persistQueued = false;
            window.clearTimeout(persistTimer);
            persistTimer = undefined;
            runPersist();
          };

          widget.subscribe("onAutoSaveNeeded", schedulePersist);
          // Coalesce — do NOT save synchronously on every study/drawing tick.
          let drawingSyncTimer: number | undefined;
          let ignoreDrawingsUntil = 0;
          const syncDrawingsNow = () => {
            if (cancelled || !widget || Date.now() < ignoreDrawingsUntil) return;
            try {
              const drawn = widget.activeChart().getLineToolsState();
              void saveLoadAdapter.saveLineToolsAndGroups(undefined, "1", drawn);
            } catch {
              /* separate drawing storage is not available on this library build */
            }
          };
          const paintRemoteDrawings = () => {
            if (cancelled || !widget) return;
            ignoreDrawingsUntil = Date.now() + 1_500;
            const chart = widget.activeChart();
            let symbol = "";
            try {
              const ext = chart.symbolExt();
              symbol = ext?.ticker || chart.symbol();
            } catch {
              symbol = "";
            }
            void saveLoadAdapter
              .loadLineToolsAndGroups(undefined, "1", "mainSeriesLineTools", { symbol })
              .then((state) => {
                if (cancelled || !widget || !state?.sources) return;
                ignoreDrawingsUntil = Date.now() + 1_500;
                return chart.applyLineToolsState(state as never);
              })
              .catch(() => {
                /* the chart keeps the lines it already has */
              });
          };
          window.addEventListener(DRAWINGS_UPDATED_EVENT, paintRemoteDrawings);
          try {
            widget.subscribe("study_event", schedulePersist as never);
            widget.subscribe("drawing_event", (() => {
              if (Date.now() < ignoreDrawingsUntil) return;
              schedulePersist();
              window.clearTimeout(drawingSyncTimer);
              drawingSyncTimer = window.setTimeout(syncDrawingsNow, 350);
            }) as never);
            widget.subscribe("study_properties_changed", schedulePersist as never);
          } catch {
            /* older CL builds */
          }
          const onLeave = () => persistNow();
          const onVisibility = () => {
            if (document.visibilityState === "hidden") persistNow();
          };
          window.addEventListener("pagehide", onLeave);
          window.addEventListener("beforeunload", onLeave);
          document.addEventListener("visibilitychange", onVisibility);
          (widget as unknown as { __forgePersistLeave?: () => void }).__forgePersistLeave = () => {
            window.clearTimeout(persistTimer);
            window.clearTimeout(drawingSyncTimer);
            window.removeEventListener(DRAWINGS_UPDATED_EVENT, paintRemoteDrawings);
            window.removeEventListener("pagehide", onLeave);
            window.removeEventListener("beforeunload", onLeave);
            document.removeEventListener("visibilitychange", onVisibility);
          };
          // Baseline snapshot after ready (still deferred so first paint stays smooth).
          window.setTimeout(schedulePersist, 1_200);
          // Move drawings out of this device's layout and onto the symbol, so the
          // other device can load the same trendline for the same broker.
          const migrateTimer = window.setTimeout(() => {
            if (cancelled || !widget) return;
            const flag = "forge.tv.drawingsSeparate.v1";
            if (storage.get(flag, null)) return;
            try {
              const chartApi = widget.activeChart();
              const drawn = chartApi.getLineToolsState();
              const count = drawn.sources
                ? [...drawn.sources.values()].filter((entry) => entry != null).length
                : 0;
              if (count === 0) return;
              void saveLoadAdapter.saveLineToolsAndGroups(undefined, "1", drawn).then(() => {
                if (cancelled || !widget) return;
                widget.save(
                  (state) => {
                    if (!state || typeof state !== "object") return;
                    storage.set(autosaveKey, state);
                    try {
                      storage.set(AUTOSAVE_BAK_KEY, state);
                    } catch {
                      /* ignore */
                    }
                    storage.set(flag, 1);
                    notifyProfileDirty?.();
                  },
                  { includeDrawings: false },
                );
              });
            } catch {
              /* separate drawing storage is not available on this library build */
            }
          }, 2_000);
          const prevLeave = (widget as unknown as { __forgePersistLeave?: () => void }).__forgePersistLeave;
          (widget as unknown as { __forgePersistLeave?: () => void }).__forgePersistLeave = () => {
            window.clearTimeout(migrateTimer);
            prevLeave?.();
          };
        }
        try {
          widget
            .activeChart()
            .onSymbolChanged()
            .subscribe(null, () => {
              try {
                const ext = widget?.activeChart().symbolExt();
                const ticker = ext?.ticker ?? ext?.name ?? widget?.activeChart().symbol();
                if (ticker) onSymbolChanged(ticker.includes(":") ? ticker.slice(ticker.lastIndexOf(":") + 1) : ticker);
              } catch {
                /* ignore */
              }
            });
        } catch {
          /* chart API unavailable */
        }
      });

      // One library header on desktop and on the phone. The symbol list is wired here.
      if (isPrimary && !hideHeader) {
        void widget.headerReady().then(() => {
          if (cancelled || !widget) return;
          const chartWidget = widget;
          const layouts = saveLoadAdapter as LocalSaveLoadAdapter;
          const displayName = getProfile().displayName?.trim() || "";
          if (displayName && !/^(save|saved|layout|untitled|unnamed|radiar|forge|trader)$/i.test(displayName)) {
            layouts.setDefaultLayoutName(displayName);
          }
          try {
            const symbolInterval = chartWidget.symbolInterval();
            layouts.ensureNamedLayout(symbolInterval.symbol, symbolInterval.interval);
          } catch {
            /* chart not ready */
          }
          const api = mountHeaderToolbar(chartWidget, {
            onCreateAlert,
            onToggleTheme,
            onOpenAlertsPanel,
            onOpenWatchlist,
            onOpenObjectTree,
            onOpenProfile,
            onEnterBarReplay,
            onSetChartLayout,
            onToggleLayoutSync,
            getLayoutSync,
            getLastPrice,
            getProfile,
            onSaveNamedLayout: (name) => {
              const profileName = getProfile().displayName?.trim() || "";
              const realProfile = /^(radiar|layout|forge|trader|untitled|save|saved)$/i.test(profileName) ? "" : profileName;
              if (realProfile) layouts.setDefaultLayoutName(realProfile);
              const requested = (name || "").trim();
              const chosen = !requested || /^(layout|untitled|unnamed|radiar|forge|save|saved)$/i.test(requested)
                ? realProfile || requested || "Layout"
                : requested;
              const layoutId = layouts.rememberLayout(chosen);
              layouts.markExplicitSave();
              chartWidget.save((state) => {
                const symbolInterval = chartWidget.symbolInterval();
                const account = storage.get<{
                  chartLayout?: string;
                  paneSymbols?: string[];
                  layoutSync?: object;
                }>("forge.settings.v1", {});
                void layouts
                  .saveChart({
                    id: layoutId,
                    name: chosen,
                    content: JSON.stringify(state),
                    symbol: symbolInterval.symbol,
                    resolution: symbolInterval.interval,
                    timestamp: Math.round(Date.now() / 1000),
                    forgeLayout: {
                      chartLayout: account.chartLayout,
                      paneSymbols: account.paneSymbols,
                      layoutSync: account.layoutSync,
                    },
                  } as never)
                  .then(() => notifyProfileDirty?.());
              });
              chartWidget.saveChartToServer(undefined, undefined, { chartName: chosen });
            },
            currentLayoutName: () => layouts.currentLayoutName(),
            onCopyLayout: (name) => {
              chartWidget.save((state) => {
                layouts.markExplicitSave();
                const symbolInterval = chartWidget.symbolInterval();
                void layouts
                  .saveChart({
                    name,
                    content: JSON.stringify(state),
                    symbol: symbolInterval.symbol,
                    resolution: symbolInterval.interval,
                    timestamp: Math.round(Date.now() / 1000),
                  })
                  .then(() => notifyProfileDirty?.());
              });
            },
            onLoadLayout: (id) => {
              const charts = storage.get<
                Array<{
                  id?: string | number;
                  name?: string;
                  content?: string;
                  forgeLayout?: {
                    chartLayout?: unknown;
                    paneSymbols?: unknown;
                    layoutSync?: unknown;
                  };
                }>
              >("forge.tv.charts", []);
              const chart = charts.find((item) => String(item.id) === String(id));
              if (!chart) return;
              const state = libraryChartState(chart.content);
              if (state) {
                storage.set("forge.tv.autosave.v3", state);
                storage.set("forge.tv.autosave.v3.bak", state);
              }
              if (chart.forgeLayout) {
                const current = storage.get<Record<string, unknown>>("forge.settings.v1", {});
                storage.set("forge.settings.v1", {
                  ...current,
                  chartLayout: chart.forgeLayout.chartLayout ?? current.chartLayout,
                  paneSymbols: chart.forgeLayout.paneSymbols ?? current.paneSymbols,
                  layoutSync: chart.forgeLayout.layoutSync ?? current.layoutSync,
                });
              }
              if (chart.id != null && chart.name) {
                storage.set("forge.layout.current.v1", { id: chart.id, name: chart.name });
              }
              window.dispatchEvent(new CustomEvent(SETTINGS_UPDATED_EVENT));
            },
            onDownloadChartData: () => {
              void chartWidget
                .activeChart()
                .exportData({ includeTime: true, includeUserTime: true })
                .then((exported) => {
                  const header = exported.schema
                    .map((field) => ("plotTitle" in field ? field.plotTitle : field.type))
                    .join(",");
                  const rows = exported.displayedData?.length
                    ? exported.displayedData.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
                    : exported.data.map((row) => [...row].join(","));
                  const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
                  const url = URL.createObjectURL(blob);
                  const link = document.createElement("a");
                  link.href = url;
                  link.download = "chart-data.csv";
                  link.click();
                  URL.revokeObjectURL(url);
                })
                .catch(() => undefined);
            },
            getSavedLayouts: () => layouts.getAllCharts(),
            isAutosaveOn: () => layouts.isAutosaveEnabled(),
            setAutosaveOn: (on) => layouts.setAutosaveEnabled(on),
            getFavoriteIndicators: () => {
              const map = storage.get<Record<string, string> | null>(USER_SETTINGS_KEY, null);
              const raw = map?.["chart.favoriteIndicators"];
              if (raw) {
                try {
                  const parsed = JSON.parse(raw) as unknown;
                  if (Array.isArray(parsed) && parsed.length) return parsed.map((item) => String(item));
                } catch {
                  /* use defaults */
                }
              }
              return [...DEFAULT_FAVORITE_INDICATORS];
            },
            getStudyTemplates: () => layouts.getAllStudyTemplates(),
            onSaveStudyTemplate: (name) => {
              const template = chartWidget.activeChart().createStudyTemplate({ saveSymbol: false, saveInterval: false });
              void layouts.saveStudyTemplate({ name, content: JSON.stringify(template) });
            },
            onApplyStudyTemplate: (name) => {
              void layouts.getStudyTemplateContent({ name }).then((content) => {
                chartWidget.activeChart().applyStudyTemplate(JSON.parse(content) as object);
              });
            },
            themeLabel: initial.theme === "dark" ? "Dark" : "Light",
            alertCount: initial.alertCount,
            compact: false,
            mobile: isMobile,
          });
          onHeaderReady(api);
        });
      }
    };

    loadChartingLibrary(libraryPath)
      .then((Widget) => {
        if (cancelled) return;
        const saved = isPrimary ? openSavedTseSession(readAutosave(storage)) : undefined;
        try {
          mount(Widget, saved);
        } catch {
          // Keep autosave; blank mount this session only.
          if (saved) {
            try {
              storage.set(AUTOSAVE_BAK_KEY, saved);
            } catch {
              /* ignore */
            }
          }
          mount(Widget, undefined);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) controller.fail(error instanceof Error ? error.message : String(error));
      });

    return () => {
      cancelled = true;
      window.clearTimeout(readyTimer);
      unmountDealingRange?.();
      unmountPositionIcons?.();
      unmountSymbolSearchReset?.();
      unmountIndicatorsIntercept?.();
      unmountIndicatorsIntercept = null;
      unmountForgeLogo?.();
      unmountForgeLogo = null;
      unmountFloatingPin?.();
      unmountFloatingPin = null;
      unmountFavoriteToolbar?.();
      unmountFavoriteToolbar = null;
      try {
        (widget as unknown as { __forgePersistLeave?: () => void } | null)?.__forgePersistLeave?.();
      } catch {
        /* ignore */
      }
      // Flush latest chart state before tearing down (layout switches / HMR).
      if (isPrimary && widget && !profilePersistHeld()) {
        try {
          widget.save(
            (state) => storage.set(autosaveKey, state),
            storage.get("forge.tv.drawingsSeparate.v1", null) ? { includeDrawings: false } : undefined,
          );
        } catch {
          /* ignore */
        }
      }
      controller.detach();
      try {
        widget?.remove();
      } catch {
        /* ignore */
      }
      widget = null;
    };
    // Keep the widget alive across layout / symbol changes (TradingView in-place).
    // Symbol updates go through chart.setSymbol via TradingViewChart effect.
  }, [
    containerRef,
    controller,
    datafeed,
    libraryPath,
    saveLoadAdapter,
    storage,
    settingsAdapter,
    notifyProfileDirty,
    isPrimary,
    paneIndex,
    hideHeader,
  ]);

  useEffect(() => {
    void (async () => {
      await controller.changeTheme(theme);
      // Theme is in forge.settings; also snapshot chart so CL chrome matches after refresh.
      try {
        const widget = controller.getWidget();
        if (widget && !profilePersistHeld()) {
          const key = isPrimary ? AUTOSAVE_KEY : `${AUTOSAVE_KEY}.pane.${paneIndex}`;
          widget.save(
            (state) => storage.set(key, state),
            storage.get("forge.tv.drawingsSeparate.v1", null) ? { includeDrawings: false } : undefined,
          );
        }
      } catch {
        /* ignore */
      }
    })();
  }, [controller, theme, storage, isPrimary, paneIndex]);
}
