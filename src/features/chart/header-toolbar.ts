import type { ChartLayoutId } from "@/application";
import { CHART_LAYOUT_CHOICES } from "./chart-layouts";
import type { IChartingLibraryWidget } from "@/infrastructure/tradingview";

const ACCOUNT_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="28" height="28"><circle cx="14" cy="14" r="14" fill="#9c27b0"/><text x="14" y="18" text-anchor="middle" fill="#fff" font-size="13" font-weight="700" font-family="Arial,sans-serif">F</text></svg>';

const LAYOUT_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="28" height="28"><rect x="4" y="4" width="9" height="9" rx="1" fill="currentColor"/><rect x="15" y="4" width="9" height="9" rx="1" fill="currentColor"/><rect x="4" y="15" width="9" height="9" rx="1" fill="currentColor"/><rect x="15" y="15" width="9" height="9" rx="1" fill="currentColor"/></svg>';

export interface HeaderToolbarHandlers {
  readonly onCreateAlert: () => void;
  readonly onToggleTheme: () => void;
  readonly onOpenAlertsPanel: () => void;
  readonly onOpenWatchlist: () => void;
  readonly onOpenObjectTree: () => void;
  /** Forge multi-pane layout (2 / 3 / 4 charts on one page). */
  readonly onSetChartLayout: (layout: ChartLayoutId) => void;
  readonly getLastPrice: () => number | null;
  readonly themeLabel: string;
  readonly userInitial: string;
  readonly alertCount: number;
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

  // Keep Layout on the left so it stays visible on crowded / mobile headers.
  void widget.createDropdown({
    title: "Layout",
    tooltip: "Select chart layout (1 / 2 / 3 / 4 charts on this page)",
    align: "left",
    icon: LAYOUT_ICON,
    items: CHART_LAYOUT_CHOICES.map((choice) => ({
      title: choice.title,
      onSelect: () => handlers.onSetChartLayout(choice.id),
    })),
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
    if (!range) return;
    await chart.setVisibleRange({ from: range.from + deltaSec, to: range.to + deltaSec });
  } catch {
    widget.showNoticeDialog({
      title: "Replay",
      body: "Could not move the visible range for this chart.",
      callback: () => undefined,
    });
  }
}

async function placeTradeMarker(
  widget: IChartingLibraryWidget,
  handlers: HeaderToolbarHandlers,
  side: "buy" | "sell",
): Promise<void> {
  const price = handlers.getLastPrice();
  if (price == null || Number.isNaN(price)) {
    widget.showNoticeDialog({
      title: "Trade",
      body: "No live price available yet. Wait for the quote to load, then try again.",
      callback: () => undefined,
    });
    return;
  }

  const color = side === "buy" ? "#089981" : "#f23645";
  try {
    await widget.activeChart().createShape(
      { time: Math.floor(Date.now() / 1000), price },
      {
        shape: "horizontal_line",
        text: side === "buy" ? "BUY" : "SELL",
        lock: false,
        disableSave: false,
        overrides: {
          linecolor: color,
          linestyle: 0,
          linewidth: 2,
          showLabel: true,
          textcolor: color,
        },
      },
    );
  } catch {
    widget.showNoticeDialog({
      title: "Trade",
      body: "Could not place a paper trade marker on the current series.",
      callback: () => undefined,
    });
  }
}

async function publishSnapshot(widget: IChartingLibraryWidget): Promise<void> {
  try {
    const canvas = await widget.takeClientScreenshot();
    const url = canvas.toDataURL("image/png");
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `forge-chart-${Date.now()}.png`;
    anchor.click();
  } catch {
    try {
      widget.takeScreenshot();
    } catch {
      widget.showNoticeDialog({
        title: "Publish",
        body: "Snapshot is unavailable in this session.",
        callback: () => undefined,
      });
    }
  }
}
