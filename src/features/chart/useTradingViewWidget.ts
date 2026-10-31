import { useEffect, useEffectEvent, type RefObject } from "react";
import type { ChartLayoutId, KeyValueStorage, ThemeMode, UserProfile } from "@/application";
import type { Interval } from "@/domain";
import {
  buildWidgetOptions,
  loadChartingLibrary,
  seedDrawingFavorites,
  type IBasicDataFeed,
  type IChartingLibraryWidget,
  type IExternalSaveLoadAdapter,
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
import {
  mountSymbolSearchExchangeReset,
  purgeStickySymbolSearchFilters,
} from "./symbol-search-defaults";

export interface TradingViewWidgetDeps {
  readonly controller: ChartController;
  readonly datafeed: IBasicDataFeed;
  readonly saveLoadAdapter: IExternalSaveLoadAdapter;
  readonly storage: KeyValueStorage;
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
  readonly onSaveNamedLayout?: () => void;
  readonly onEnterBarReplay: () => void;
  readonly onSetChartLayout: (layout: ChartLayoutId) => void;
  readonly onToggleLayoutSync?: (
    key: "symbol" | "interval" | "crosshair" | "time" | "dateRange" | "drawings",
  ) => void;
  readonly getLayoutSync?: () => {
    symbol: boolean;
    interval: boolean;
    crosshair: boolean;
    time: boolean;
    dateRange: boolean;
    drawings: boolean;
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

/** Reject corrupt / incomplete library snapshots that leave the chart spinning forever. */
function readAutosave(storage: KeyValueStorage): object | undefined {
  purgeLegacyAutosaves(storage);
  const tryParse = (raw: unknown): object | undefined => {
    if (!raw || typeof raw !== "object") return undefined;
    const record = raw as Record<string, unknown>;
    const hasCharts = Array.isArray(record.charts) || Array.isArray(record.content);
    const hasLayout = typeof record.layout === "string" || typeof record.name === "string";
    if (!hasCharts && !hasLayout) return undefined;
    return raw as object;
  };
  const primary = tryParse(storage.get<unknown>(AUTOSAVE_KEY, undefined));
  if (primary) return primary;
  const bak = tryParse(storage.get<unknown>(AUTOSAVE_BAK_KEY, undefined));
  if (bak) {
    // Restore backup into the live key so the next refresh keeps it.
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
  const { controller, datafeed, saveLoadAdapter, storage, libraryPath, theme } = deps;
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
  const onSaveNamedLayout = useEffectEvent(() => deps.onSaveNamedLayout?.());
  const onEnterBarReplay = useEffectEvent(() => deps.onEnterBarReplay());
  const onHeaderReady = useEffectEvent((api: HeaderToolbarApi) => deps.onHeaderReady?.(api));
  const onWidgetReady = useEffectEvent((widget: IChartingLibraryWidget) => deps.onWidgetReady?.(widget));
  const onSetChartLayout = useEffectEvent((layout: ChartLayoutId) => deps.onSetChartLayout(layout));
  const onToggleLayoutSync = useEffectEvent(
    (key: "symbol" | "interval" | "crosshair" | "time" | "dateRange" | "drawings") =>
      deps.onToggleLayoutSync?.(key),
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
      // Force TV-matching drawing stars before the iframe reads localStorage.
      seedDrawingFavorites();
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
          const persistChart = () => {
            try {
              widget?.save((state) => {
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
              });
            } catch {
              /* ignore */
            }
          };
          widget.subscribe("onAutoSaveNeeded", persistChart);
          // Studies / drawings / properties — don't wait for the debounce alone.
          try {
            widget.subscribe("study_event", persistChart as never);
            widget.subscribe("drawing_event", persistChart as never);
            widget.subscribe("study_properties_changed", persistChart as never);
          } catch {
            /* older CL builds */
          }
          const onLeave = () => persistChart();
          const onVisibility = () => {
            if (document.visibilityState === "hidden") persistChart();
          };
          window.addEventListener("pagehide", onLeave);
          window.addEventListener("beforeunload", onLeave);
          document.addEventListener("visibilitychange", onVisibility);
          (widget as unknown as { __forgePersistLeave?: () => void }).__forgePersistLeave = () => {
            window.removeEventListener("pagehide", onLeave);
            window.removeEventListener("beforeunload", onLeave);
            document.removeEventListener("visibilitychange", onVisibility);
          };
          // Immediate snapshot after ready so a fast refresh still has a baseline.
          window.setTimeout(persistChart, 400);
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

      // Desktop primary keeps the original CL/Forge header. Mobile uses the bottom shell.
      if (isPrimary && !hideHeader && !isMobile) {
        void widget.headerReady().then(() => {
          if (cancelled || !widget) return;
          const api = mountHeaderToolbar(widget, {
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
            onSaveNamedLayout,
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
        const saved = isPrimary ? readAutosave(storage) : undefined;
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
      try {
        (widget as unknown as { __forgePersistLeave?: () => void } | null)?.__forgePersistLeave?.();
      } catch {
        /* ignore */
      }
      // Flush latest chart state before tearing down (layout switches / HMR).
      if (isPrimary && widget) {
        try {
          widget.save((state) => storage.set(autosaveKey, state));
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
  }, [containerRef, controller, datafeed, libraryPath, saveLoadAdapter, storage, isPrimary, paneIndex, hideHeader]);

  useEffect(() => {
    void (async () => {
      await controller.changeTheme(theme);
      // Theme is in forge.settings; also snapshot chart so CL chrome matches after refresh.
      try {
        const widget = controller.getWidget();
        if (widget) {
          const key = isPrimary ? AUTOSAVE_KEY : `${AUTOSAVE_KEY}.pane.${paneIndex}`;
          widget.save((state) => storage.set(key, state));
        }
      } catch {
        /* ignore */
      }
    })();
  }, [controller, theme, storage, isPrimary, paneIndex]);
}
