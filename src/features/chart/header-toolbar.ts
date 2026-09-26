import type { ChartLayoutId, LayoutSyncSettings, UserProfile } from "@/application";
import { activeProfile, type Settings } from "@/application";
import type { IChartingLibraryWidget, IDropdownApi } from "@/infrastructure/tradingview";
import { CHART_LAYOUT_CHOICES } from "./chart-layouts";
import { activateDealingRange } from "./dealing-range";

function avatarIcon(profile: UserProfile): string {
  const initial = (profile.avatarInitial || "F").slice(0, 2).replace(/[<>&"']/g, "");
  const color = /^#[0-9a-fA-F]{6}$/.test(profile.avatarColor) ? profile.avatarColor : "#9c27b0";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="28" height="28"><circle cx="14" cy="14" r="14" fill="${color}"/><text x="14" y="18.5" text-anchor="middle" fill="#fff" font-size="12" font-weight="700" font-family="Arial,sans-serif">${initial}</text></svg>`;
}

const LAYOUT_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="28" height="28"><rect x="4" y="4" width="9" height="9" rx="1" fill="currentColor"/><rect x="15" y="4" width="9" height="9" rx="1" fill="currentColor"/><rect x="4" y="15" width="9" height="9" rx="1" fill="currentColor"/><rect x="15" y="15" width="9" height="9" rx="1" fill="currentColor"/></svg>';

type SyncKey = keyof LayoutSyncSettings;

export interface HeaderToolbarHandlers {
  readonly onCreateAlert: () => void;
  readonly onToggleTheme: () => void;
  readonly onOpenAlertsPanel: () => void;
  readonly onOpenWatchlist: () => void;
  readonly onOpenObjectTree: () => void;
  readonly onOpenProfile: () => void;
  /** Open TradingView-style Bar Replay toolbar. */
  readonly onEnterBarReplay: () => void;
  /** In-place multi-pane layout (widgets stay mounted). */
  readonly onSetChartLayout: (layout: ChartLayoutId) => void;
  readonly onToggleLayoutSync?: (key: SyncKey) => void;
  readonly getLayoutSync?: () => LayoutSyncSettings;
  readonly getLastPrice: () => number | null;
  readonly getProfile: () => UserProfile;
  readonly themeLabel: string;
  readonly alertCount: number;
}

export interface HeaderToolbarApi {
  readonly updateProfile: (profile: UserProfile) => void;
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
      },
    })),
  ];
}

function profileMenuItems(handlers: HeaderToolbarHandlers, profile: UserProfile) {
  return [
    {
      title: `${profile.displayName}  (@${profile.username})`,
      onSelect: () => handlers.onOpenProfile(),
    },
    { title: "Profile & accounts…", onSelect: () => handlers.onOpenProfile() },
    { title: `Theme: ${handlers.themeLabel}`, onSelect: () => handlers.onToggleTheme() },
    { title: "Alerts panel", onSelect: () => handlers.onOpenAlertsPanel() },
    { title: "Watchlist", onSelect: () => handlers.onOpenWatchlist() },
    { title: "Object tree (layers)", onSelect: () => handlers.onOpenObjectTree() },
    { title: "Create alert", onSelect: () => handlers.onCreateAlert() },
  ];
}

/**
 * Adds TradingView-style custom header controls on top of the library toolbar.
 * Profile avatar sits on the far-right corner (TradingView account menu).
 */
export function mountHeaderToolbar(
  widget: IChartingLibraryWidget,
  handlers: HeaderToolbarHandlers,
): HeaderToolbarApi {
  widget.createButton({
    align: "left",
    useTradingViewStyle: true,
    text: "Alert",
    title: "Create a price alert",
    onClick: () => handlers.onCreateAlert(),
  });

  widget.createButton({
    align: "left",
    useTradingViewStyle: true,
    text: "Replay",
    title: "Bar Replay — select a bar and play history forward",
    onClick: () => handlers.onEnterBarReplay(),
  });

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

  // Tools — Dealing Range (ICT premium / discount) via Fib template.
  void widget.createDropdown({
    title: "Tools",
    tooltip: "Drawing helpers",
    align: "right",
    items: [
      {
        title: "Dealing Range (Premium / Discount)",
        onSelect: () => {
          void activateDealingRange(widget);
        },
      },
    ],
  });

  // Profile — outermost right corner, TradingView-style.
  let accountDropdown: IDropdownApi | null = null;
  const profile = handlers.getProfile();
  void widget
    .createDropdown({
      title: profile.avatarInitial,
      tooltip: `${profile.displayName} (@${profile.username})`,
      align: "right",
      icon: avatarIcon(profile),
      items: profileMenuItems(handlers, profile),
    })
    .then((api) => {
      accountDropdown = api;
    });

  return {
    updateProfile: (next) => {
      try {
        accountDropdown?.applyOptions({
          title: next.avatarInitial,
          tooltip: `${next.displayName} (@${next.username})`,
          icon: avatarIcon(next),
          items: profileMenuItems(handlers, next),
        });
      } catch {
        /* ignore */
      }
    },
  };
}

/** Helper for callers that only have Settings. */
export function profileFromSettings(settings: Settings): UserProfile {
  return activeProfile(settings);
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
