import { useEffect, useEffectEvent, type RefObject } from "react";
import type { KeyValueStorage, ThemeMode } from "@/application";
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
  readonly onCreateAlert: () => void;
  readonly onToggleTheme: () => void;
  readonly onOpenAlertsPanel: () => void;
  readonly onOpenWatchlist: () => void;
  readonly getLastPrice: () => number | null;
}

const AUTOSAVE_KEY = "forge.tv.autosave";

/**
 * Owns the TradingView widget lifecycle: script loading, construction,
 * auto-save, TradingView-style header controls, and teardown.
 */
export function useTradingViewWidget(containerRef: RefObject<HTMLDivElement | null>, deps: TradingViewWidgetDeps): void {
  const { controller, datafeed, saveLoadAdapter, storage, libraryPath, theme } = deps;

  const onCreateAlert = useEffectEvent(() => deps.onCreateAlert());
  const onToggleTheme = useEffectEvent(() => deps.onToggleTheme());
  const onOpenAlertsPanel = useEffectEvent(() => deps.onOpenAlertsPanel());
  const onOpenWatchlist = useEffectEvent(() => deps.onOpenWatchlist());
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
            savedState: storage.get<object | undefined>(AUTOSAVE_KEY, undefined),
          }),
        );

        widget.onChartReady(() => {
          if (cancelled || !widget) return;
          controller.attach(widget);
          widget.subscribe("onAutoSaveNeeded", () => widget?.save((state) => storage.set(AUTOSAVE_KEY, state)));
        });

        void widget.headerReady().then(() => {
          if (cancelled || !widget) return;
          mountHeaderToolbar(widget, {
            onCreateAlert,
            onToggleTheme,
            onOpenAlertsPanel,
            onOpenWatchlist,
            getLastPrice,
            themeLabel: initial.theme === "dark" ? "Dark" : "Light",
            userInitial: "F",
            alertCount: initial.alertCount,
          });
        });
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
  }, [containerRef, controller, datafeed, libraryPath, saveLoadAdapter, storage]);

  useEffect(() => {
    void controller.changeTheme(theme);
  }, [controller, theme]);
}
