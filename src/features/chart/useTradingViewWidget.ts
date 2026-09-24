import { useEffect, useEffectEvent, type RefObject } from "react";
import type { ChartLayoutId, KeyValueStorage, ThemeMode } from "@/application";
import type { Interval } from "@/domain";
import {
  buildWidgetOptions,
  loadChartingLibrary,
  type IBasicDataFeed,
  type IChartingLibraryWidget,
  type IExternalSaveLoadAdapter,
  type WidgetConstructor,
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

/** Bump when autosave recovery needs a clean slate for all browsers. */
const AUTOSAVE_KEY = "forge.tv.autosave.v2";
const LEGACY_AUTOSAVE_KEYS = ["forge.tv.autosave", "forge.tv.autosave.pane.1", "forge.tv.autosave.pane.2", "forge.tv.autosave.pane.3"] as const;
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
    let ready = false;
    let readyTimer = 0;
    const isMobile = typeof window !== "undefined" && window.matchMedia("(max-width: 900px)").matches;
    const autosaveKey = isPrimary ? AUTOSAVE_KEY : `${AUTOSAVE_KEY}.pane.${paneIndex}`;

    const mount = (Widget: WidgetConstructor, savedState: object | undefined) => {
      try {
        widget?.remove();
      } catch {
        /* previous instance may already be torn down */
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
      controller.detach();
      try {
        widget?.remove();
      } catch {
        /* ignore */
      }
      widget = null;
    };
    // Remount when the pane's starting symbol changes (layout / pane assignment).
  }, [containerRef, controller, datafeed, libraryPath, saveLoadAdapter, storage, isPrimary, paneIndex, deps.initialSymbol]);

  useEffect(() => {
    void controller.changeTheme(theme);
  }, [controller, theme]);
}
