import type { ChartLayoutId, LayoutSyncSettings, UserProfile } from "@/application";
import { activeProfile, type Settings } from "@/application";
import type { IChartingLibraryWidget } from "@/infrastructure/tradingview";
import { CHART_LAYOUT_CHOICES } from "./chart-layouts";
import { activateDealingRange } from "./dealing-range";

function avatarIcon(profile: UserProfile): string {
  const initial = (profile.avatarInitial || "F").slice(0, 2).replace(/[<>&"']/g, "");
  const color = /^#[0-9a-fA-F]{6}$/.test(profile.avatarColor) ? profile.avatarColor : "#9c27b0";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="28" height="28"><circle cx="14" cy="14" r="14" fill="${color}"/><text x="14" y="18.5" text-anchor="middle" fill="#fff" font-size="12" font-weight="700" font-family="Arial,sans-serif">${initial}</text></svg>`;
}

/**
 * TradingView "Select layout" glyph — hollow/dashed frame with pane cross.
 * NOT the filled 2×2 (that is indicator templates).
 */
const LAYOUT_GRID_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="28" height="28" fill="none"><rect x="4.5" y="4.5" width="19" height="19" rx="1.5" stroke="currentColor" stroke-width="1.5" stroke-dasharray="2.5 2"/><path d="M14 5v18M5 14h18" stroke="currentColor" stroke-width="1.2" opacity="0.9"/></svg>';

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
    crosshair: false,
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
      title: "── Sync in layout ──",
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

/**
 * Adds TradingView-style custom header controls on top of the library toolbar.
 * Profile avatar sits on the far-right corner (TradingView account menu).
 *
 * Layout placement (matches TV):
 * 1) Named layout dropdown (Save / Autosave / …) — text next to account area
 * 2) Dashed-square "Select Layout" — multi-pane grid (NOT templates 2×2)
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

  // Named layout menu (TradingView: layout name near profile) — Save / Autosave / …
  const layoutName = handlers.getProfile().displayName || "Layout";
  void widget.createDropdown({
    title: layoutName,
    tooltip: "Save and manage chart layouts",
    align: "right",
    items: [
      {
        title: "Save layout    Ctrl + S",
        onSelect: () => {
          try {
            widget.save(() => {
              /* persisted via save_load_adapter */
            });
          } catch {
            /* ignore */
          }
        },
      },
      {
        title: "Autosave  ● ON",
        onSelect: () => {
          /* always on via auto_save_delay */
        },
      },
      {
        title: "Make a copy…",
        onSelect: () => {
          try {
            widget.save(() => {
              /* copy via autosave snapshot */
            });
          } catch {
            /* ignore */
          }
        },
      },
      {
        title: "Rename…",
        onSelect: () => handlers.onOpenProfile(),
      },
      {
        title: "Create new layout…",
        onSelect: () => {
          try {
            widget.activeChart().resetData();
          } catch {
            /* ignore */
          }
        },
      },
      {
        title: `Recently used · ${layoutName}`,
        onSelect: () => {
          /* current layout */
        },
      },
      {
        title: "Open layout…",
        onSelect: () => {
          try {
            (widget as unknown as { showLoadChartDialog?: () => void }).showLoadChartDialog?.();
          } catch {
            /* ignore */
          }
        },
      },
    ],
  });

  // Multi-pane Select Layout — dashed square (never the templates 2×2).
  void widget
    .createDropdown({
      title: "Select Layout",
      tooltip: "Multi-chart layout · Sync in layout",
      align: "right",
      icon: LAYOUT_GRID_ICON,
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

  // Profile avatar → React ProfileMenu (HTML button so we can inject the avatar SVG).
  const profile = handlers.getProfile();
  const profileBtn = widget.createButton({
    align: "right",
    useTradingViewStyle: false,
  });
  profileBtn.setAttribute("title", `${profile.displayName} (@${profile.username})`);
  profileBtn.setAttribute("aria-label", "Account menu");
  profileBtn.style.display = "inline-flex";
  profileBtn.style.alignItems = "center";
  profileBtn.style.justifyContent = "center";
  profileBtn.style.padding = "0 4px";
  profileBtn.style.cursor = "pointer";
  profileBtn.innerHTML = avatarIcon(profile);
  profileBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    window.dispatchEvent(new CustomEvent("forge:open-profile-menu"));
  });

  return {
    updateProfile: (next) => {
      try {
        profileBtn.innerHTML = avatarIcon(next);
        profileBtn.setAttribute("title", `${next.displayName} (@${next.username})`);
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
