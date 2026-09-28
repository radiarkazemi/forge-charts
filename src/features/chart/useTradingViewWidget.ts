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

export interface TradingViewWidgetDeps {
  readonly controller: ChartController;
  readonly datafeed: IBasicDataFeed;
  readonly saveLoadAdapter: IExternalSaveLoadAdapter;
  readonly storage: KeyValueStorage;
  readonly libraryPath: string;
  readonly initialSymbol: string;
  readonly initialInterval: Interval;
  /** Native CL multi-chart layout id (s / 2h / 2v / …). */
  readonly initialLayout?: ChartLayoutId;
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
const READY_TIMEOUT_MS = 12_000;

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
  const raw = storage.get<unknown>(AUTOSAVE_KEY, undefined);
  if (!raw || typeof raw !== "object") return undefined;
  const record = raw as Record<string, unknown>;
  const hasCharts = Array.isArray(record.charts) || Array.isArray(record.content);
  const hasLayout = typeof record.layout === "string" || typeof record.name === "string";
  if (!hasCharts && !hasLayout) {
    storage.remove(AUTOSAVE_KEY);
    return undefined;
  }
  return raw as object;
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
    layout: deps.initialLayout ?? ("s" as ChartLayoutId),
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
    const isMobile = typeof window !== "undefined" && window.matchMedia("(max-width: 900px)").matches;
    const autosaveKey = isPrimary ? AUTOSAVE_KEY : `${AUTOSAVE_KEY}.pane.${paneIndex}`;

    seedDealingRangeTemplate(storage);

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
        // Corrupt saved_data often leaves the iframe alive but never fires onChartReady.
        if (savedState) {
          storage.remove(autosaveKey);
          try {
            mount(Widget, undefined);
          } catch (error) {
            if (!cancelled) controller.fail(error instanceof Error ? error.message : String(error));
          }
        }
      }, READY_TIMEOUT_MS);

      widget.onChartReady(() => {
        if (cancelled || !widget) return;
        ready = true;
        window.clearTimeout(readyTimer);
        controller.attach(widget);
        onWidgetReady(widget);
        // Restore native multi-chart layout under the original header.
        if (isPrimary) {
          const layout = initial.layout;
          if (layout && layout !== "s") {
            window.setTimeout(() => {
              try {
                widget?.setLayout(layout as never);
              } catch {
                /* ignore */
              }
            }, 50);
          }
          try {
            const onLayoutChanged = () => {
              try {
                const next = widget?.layout();
                if (next) onSetChartLayout(next as ChartLayoutId);
              } catch {
                /* ignore */
              }
            };
            widget.subscribe("layout_changed", onLayoutChanged);
          } catch {
            /* layout_changed may be unavailable */
          }
        }
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
        if (isPrimary) {
          widget.subscribe("onAutoSaveNeeded", () => widget?.save((state) => storage.set(autosaveKey, state)));
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

      // Primary pane keeps the original CL/Forge header (secondary panes are headerless).
      if (isPrimary && !hideHeader) {
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
          storage.remove(autosaveKey);
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
    void controller.changeTheme(theme);
  }, [controller, theme]);
}
