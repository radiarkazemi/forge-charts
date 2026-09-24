import { useEffect, useEffectEvent, type RefObject } from "react";
import type { ChartLayoutId, KeyValueStorage, ThemeMode } from "@/application";
import type { Interval } from "@/domain";
import {
  buildWidgetOptions,
  loadChartingLibrary,
  type IBasicDataFeed,
  type IChartingLibraryWidget,
  type IExternalSaveLoadAdapter,
} from "@/infrastructure/tradingview";
import type { ChartController } from "./chart-controller";
import { mountHeaderToolbar } from "./header-toolbar";

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
  readonly onCreateAlert: () => void;
  readonly onToggleTheme: () => void;
  readonly onOpenAlertsPanel: () => void;
  readonly onOpenWatchlist: () => void;
  readonly onOpenObjectTree: () => void;
  readonly onSetChartLayout: (layout: ChartLayoutId) => void;
  readonly onSymbolChanged?: (paneIndex: number, symbol: string) => void;
  readonly getLastPrice: () => number | null;
}

const AUTOSAVE_KEY = "forge.tv.autosave";

/**
 * Owns the TradingView widget lifecycle: script loading, construction,
 * auto-save, TradingView-style header controls, and teardown.
 */
export function useTradingViewWidget(containerRef: RefObject<HTMLDivElement | null>, deps: TradingViewWidgetDeps): void {
  const { controller, datafeed, saveLoadAdapter, storage, libraryPath, theme } = deps;
  const isPrimary = deps.isPrimary !== false;
  const paneIndex = deps.paneIndex ?? 0;

  const onCreateAlert = useEffectEvent(() => deps.onCreateAlert());
  const onToggleTheme = useEffectEvent(() => deps.onToggleTheme());
  const onOpenAlertsPanel = useEffectEvent(() => deps.onOpenAlertsPanel());
  const onOpenWatchlist = useEffectEvent(() => deps.onOpenWatchlist());
  const onOpenObjectTree = useEffectEvent(() => deps.onOpenObjectTree());
  const onSetChartLayout = useEffectEvent((layout: ChartLayoutId) => deps.onSetChartLayout(layout));
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
    const isMobile = typeof window !== "undefined" && window.matchMedia("(max-width: 900px)").matches;
    const autosaveKey = isPrimary ? AUTOSAVE_KEY : `${AUTOSAVE_KEY}.pane.${paneIndex}`;

    loadChartingLibrary(libraryPath)
      .then((Widget) => {
        if (cancelled) return;
        widget = new Widget(
          buildWidgetOptions({
            container,
            datafeed,
            saveLoadAdapter,
            libraryPath,
            symbol: initial.symbol,
            interval: initial.interval,
            theme: initial.theme,
            savedState: isPrimary ? storage.get<object | undefined>(AUTOSAVE_KEY, undefined) : undefined,
            isMobile,
            secondaryPane: !isPrimary,
          }),
        );

        widget.onChartReady(() => {
          if (cancelled || !widget) return;
          controller.attach(widget);
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

        if (isPrimary) {
          void widget.headerReady().then(() => {
            if (cancelled || !widget) return;
            mountHeaderToolbar(widget, {
              onCreateAlert,
              onToggleTheme,
              onOpenAlertsPanel,
              onOpenWatchlist,
              onOpenObjectTree,
              onSetChartLayout,
              getLastPrice,
              themeLabel: initial.theme === "dark" ? "Dark" : "Light",
              userInitial: "F",
              alertCount: initial.alertCount,
            });
          });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) controller.fail(error instanceof Error ? error.message : String(error));
      });

    return () => {
      cancelled = true;
      controller.detach();
      widget?.remove();
      widget = null;
    };
    // Remount when the pane's starting symbol changes (layout / pane assignment).
  }, [containerRef, controller, datafeed, libraryPath, saveLoadAdapter, storage, isPrimary, paneIndex, deps.initialSymbol]);

  useEffect(() => {
    void controller.changeTheme(theme);
  }, [controller, theme]);
}
