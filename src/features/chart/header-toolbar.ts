import type { ChartLayoutId, LayoutSyncSettings } from "@/application";
import { CHART_LAYOUT_CHOICES } from "./chart-layouts";
import type { IChartingLibraryWidget } from "@/infrastructure/tradingview";

const ACCOUNT_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="28" height="28"><circle cx="14" cy="14" r="14" fill="#9c27b0"/><text x="14" y="18" text-anchor="middle" fill="#fff" font-size="13" font-weight="700" font-family="Arial,sans-serif">F</text></svg>';

const LAYOUT_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="28" height="28"><rect x="4" y="4" width="9" height="9" rx="1" fill="currentColor"/><rect x="15" y="4" width="9" height="9" rx="1" fill="currentColor"/><rect x="4" y="15" width="9" height="9" rx="1" fill="currentColor"/><rect x="15" y="15" width="9" height="9" rx="1" fill="currentColor"/></svg>';

type SyncKey = keyof LayoutSyncSettings;

export interface HeaderToolbarHandlers {
  readonly onCreateAlert: () => void;
  readonly onToggleTheme: () => void;
  readonly onOpenAlertsPanel: () => void;
  readonly onOpenWatchlist: () => void;
  readonly onOpenObjectTree: () => void;
  /** In-place multi-pane layout (widgets stay mounted). */
  readonly onSetChartLayout: (layout: ChartLayoutId) => void;
  readonly onToggleLayoutSync?: (key: SyncKey) => void;
  readonly getLayoutSync?: () => LayoutSyncSettings;
  readonly getLastPrice: () => number | null;
  readonly themeLabel: string;
  readonly userInitial: string;
  readonly alertCount: number;
}

function syncLabel(key: SyncKey, on: boolean): string {
  const names: Record<SyncKey, string> = {
    symbol: "Symbol",
    interval: "Interval",
    crosshair: "Crosshair",
    time: "Time",
    dateRange: "Date range",
  };
  return `${names[key]}  ${on ? "● ON" : "○ OFF"}`;
}

function buildLayoutMenuItems(handlers: HeaderToolbarHandlers) {
  const sync = handlers.getLayoutSync?.() ?? {
    symbol: false,
    interval: false,
    crosshair: true,
    time: false,
    dateRange: false,
  };
  const syncKeys: SyncKey[] = ["symbol", "interval", "crosshair", "time", "dateRange"];
  return [
    ...CHART_LAYOUT_CHOICES.map((choice) => ({
      title: choice.title,
      icon: choice.icon,
      onSelect: () => handlers.onSetChartLayout(choice.id),
    })),
    {
      title: "── SYNC IN LAYOUT ──",
      onSelect: () => {
        /* section header */
      },
    },
    ...syncKeys.map((key) => ({
      title: syncLabel(key, sync[key]),
      onSelect: () => {
        handlers.onToggleLayoutSync?.(key);
        // Refresh labels on next open via recreate is handled by applyOptions caller.
      },
    })),
  ];
}

/**
 * Adds TradingView-style custom header controls on top of the library toolbar.
 * Built-in buttons (symbol, intervals, chart type, indicators, templates,
 * undo/redo, save, settings, fullscreen, snapshot, compare) stay enabled.
 */
export function mountHeaderToolbar(widget: IChartingLibraryWidget, handlers: HeaderToolbarHandlers): void {
  void widget.createDropdown({
    title: handlers.userInitial,
    tooltip: handlers.alertCount > 0 ? `Account (${handlers.alertCount} alerts)` : "Account & preferences",
    align: "left",
    icon: ACCOUNT_ICON,
    items: [
      { title: `Theme: ${handlers.themeLabel}`, onSelect: () => handlers.onToggleTheme() },
      { title: "Alerts panel", onSelect: () => handlers.onOpenAlertsPanel() },
      { title: "Watchlist", onSelect: () => handlers.onOpenWatchlist() },
      { title: "Object tree (layers)", onSelect: () => handlers.onOpenObjectTree() },
      { title: "Create alert", onSelect: () => handlers.onCreateAlert() },
    ],
  });

  widget.createButton({
    align: "left",
    useTradingViewStyle: true,
    text: "Alert",
    title: "Create a price alert",
    onClick: () => handlers.onCreateAlert(),
  });

  void widget.createDropdown({
    title: "Replay",
    tooltip: "Jump the chart in time",
    align: "left",
    items: [
      { title: "Jump back 1 day", onSelect: () => void shiftVisibleRange(widget, -86_400) },
      { title: "Jump back 1 week", onSelect: () => void shiftVisibleRange(widget, -604_800) },
      { title: "Jump back 1 month", onSelect: () => void shiftVisibleRange(widget, -2_592_000) },
      {
        title: "Reset time scale",
        onSelect: () => {
          try {
            widget.activeChart().executeActionById("timeScaleReset");
          } catch {
            /* chart not ready */
          }
        },
      },
    ],
  });

  // Select Layout — glyphs + SYNC IN LAYOUT. Widgets stay mounted on change.
  type DropdownApi = { applyOptions: (o: { items: ReturnType<typeof buildLayoutMenuItems> }) => void };
  let layoutDropdown: DropdownApi | null = null;
  const refreshLayoutMenu = () => {
    try {
      layoutDropdown?.applyOptions({ items: buildLayoutMenuItems(handlers) });
    } catch {
      /* dropdown gone */
    }
  };
  const wrapped: HeaderToolbarHandlers = {
    ...handlers,
    onSetChartLayout: (layout) => {
      handlers.onSetChartLayout(layout);
      refreshLayoutMenu();
    },
    onToggleLayoutSync: (key) => {
      handlers.onToggleLayoutSync?.(key);
      window.setTimeout(refreshLayoutMenu, 0);
    },
  };
  void widget
    .createDropdown({
      title: "Select Layout",
      tooltip: "Change chart layout without reloading charts · SYNC IN LAYOUT",
      align: "left",
      icon: LAYOUT_ICON,
      items: buildLayoutMenuItems(wrapped),
    })
    .then((api) => {
      layoutDropdown = api as DropdownApi;
    });

  void widget.createDropdown({
    title: "Trade",
    tooltip: "Paper trade markers",
    align: "right",
    items: [
      { title: "Buy (mark entry)", onSelect: () => void placeTradeMarker(widget, handlers, "buy") },
      { title: "Sell (mark entry)", onSelect: () => void placeTradeMarker(widget, handlers, "sell") },
      {
        title: "Clear trade markers",
        onSelect: () => {
          try {
            widget.activeChart().executeActionById("paneRemoveAllStudiesDrawingTools");
          } catch {
            /* ignore */
          }
        },
      },
    ],
  });

  widget.createButton({
    align: "right",
    useTradingViewStyle: true,
    text: "Publish",
    title: "Download a chart snapshot",
    onClick: () => {
      void publishSnapshot(widget);
    },
  });
}

async function shiftVisibleRange(widget: IChartingLibraryWidget, deltaSec: number): Promise<void> {
  try {
    const chart = widget.activeChart();
    const range = await chart.getVisibleRange();
    await chart.setVisibleRange({ from: range.from + deltaSec, to: range.to + deltaSec });
  } catch {
    /* ignore */
  }
}

async function placeTradeMarker(
  widget: IChartingLibraryWidget,
  handlers: HeaderToolbarHandlers,
  side: "buy" | "sell",
): Promise<void> {
  try {
    const chart = widget.activeChart();
    const price = handlers.getLastPrice();
    if (price == null || !Number.isFinite(price)) return;
    await chart.createShape(
      { time: Math.floor(Date.now() / 1000), price },
      {
        shape: side === "buy" ? "arrow_up" : "arrow_down",
        text: side.toUpperCase(),
        lock: false,
        disableSave: true,
        overrides: {
          color: side === "buy" ? "#26a69a" : "#ef5350",
          fontsize: 12,
        },
      },
    );
  } catch {
    /* ignore */
  }
}

async function publishSnapshot(widget: IChartingLibraryWidget): Promise<void> {
  try {
    const canvas = await widget.takeClientScreenshot();
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `forge-chart-${Date.now()}.png`;
    a.click();
  } catch {
    /* ignore */
  }
}
