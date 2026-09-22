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

export interface TradingViewWidgetDeps {
  readonly controller: ChartController;
  readonly datafeed: IBasicDataFeed;
  readonly saveLoadAdapter: IExternalSaveLoadAdapter;
  readonly storage: KeyValueStorage;
  readonly libraryPath: string;
  readonly initialSymbol: string;
  readonly initialInterval: Interval;
  readonly theme: ThemeMode;
  readonly onCreateAlert: () => void;
}

const AUTOSAVE_KEY = "forge.tv.autosave";

/**
 * Owns the TradingView widget lifecycle: script loading, construction,
 * auto-save, the custom header button and teardown. Theme changes are applied
 * in place so the widget is created exactly once per mount.
 */
export function useTradingViewWidget(containerRef: RefObject<HTMLDivElement | null>, deps: TradingViewWidgetDeps): void {
  const { controller, datafeed, saveLoadAdapter, storage, libraryPath, theme } = deps;

  // Effect events read the latest props without becoming effect dependencies.
  const onCreateAlert = useEffectEvent(() => deps.onCreateAlert());
  const readInitial = useEffectEvent(() => ({
    symbol: deps.initialSymbol,
    interval: deps.initialInterval,
    theme: deps.theme,
  }));

  // Create / destroy the widget once per mount.
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
          widget.createButton({
            align: "right",
            useTradingViewStyle: true,
            text: "Alert",
            title: "Create a price alert",
            onClick: onCreateAlert,
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

  // Apply theme changes in place; the controller defers until the widget is ready.
  useEffect(() => {
    void controller.changeTheme(theme);
  }, [controller, theme]);
}
