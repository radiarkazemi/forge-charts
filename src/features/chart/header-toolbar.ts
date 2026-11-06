import type { ChartLayoutId, LayoutSyncSettings, UserProfile } from "@/application";
import { activeProfile, type Settings } from "@/application";
import type { IChartingLibraryWidget } from "@/infrastructure/tradingview";
import { CHART_LAYOUT_CHOICES } from "./chart-layouts";
import { activateDealingRange } from "./dealing-range";

/** Faraz / TV-style person silhouette (not first-letter chip). */
function profilePersonIcon(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="3.4"/><path d="M5.2 19.2c.8-3.2 3.2-5 6.8-5s6 1.8 6.8 5"/></svg>`;
}

/**
 * TradingView "Select layout" glyph — hollow dashed frame (pane outline).
 * Never the filled 2×2 squares used for indicator templates.
 */
const LAYOUT_GRID_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="28" height="28" fill="none"><rect x="5" y="5" width="18" height="18" rx="1" stroke="currentColor" stroke-width="1.6" stroke-dasharray="3 2.5" stroke-linecap="round"/><path d="M14 6.2v15.6M6.2 14h15.6" stroke="currentColor" stroke-width="1.15" stroke-linecap="square" opacity="0.75"/></svg>';

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
  /** Persist current chart into the named Radiar layout (+ autosave). */
  readonly onSaveNamedLayout?: () => void;
  readonly themeLabel: string;
  readonly alertCount: number;
  /**
   * Secondary panes: only Select Layout + Sync-in-layout (options on both sides).
   * Primary keeps the full Forge header chrome.
   */
  readonly compact?: boolean;
  /**
   * Phone / narrow viewport: skip bulky Forge text buttons (bottom bar covers
   * Alert / Trade / etc.). Keep layout menu + profile avatar only.
   */
  readonly mobile?: boolean;
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
    drawings: "Drawings",
  };
  return `${names[key]}  ${on ? "● ON" : "○ OFF"}`;
}

function buildLayoutMenuItems(handlers: HeaderToolbarHandlers) {
  const sync = handlers.getLayoutSync?.() ?? {
    symbol: true,
    interval: false,
    crosshair: false,
    time: false,
    dateRange: false,
    drawings: true,
  };
  const syncKeys: SyncKey[] = ["symbol", "interval", "crosshair", "time", "dateRange", "drawings"];
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

  // Secondary panes get the same Select Layout + Sync menu (options on both sides).
  if (handlers.compact) {
    void widget
      .createDropdown({
        title: " ",
        tooltip: "Select layout / Sync in layout",
        align: "right",
        icon: LAYOUT_GRID_ICON,
        items: buildLayoutMenuItems(wrapped),
      })
      .then((api) => {
        layoutDropdown = api as DropdownApi;
      });
    return {
      updateProfile: () => {
        /* no avatar on secondary panes */
      },
    };
  }

  // Desktop-only Forge chrome — phones use MobileBottomBar instead.
  if (!handlers.mobile) {
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
      text: "▶ Bar Replay",
      title: "Bar Replay — select a bar and play history forward",
      onClick: () => handlers.onEnterBarReplay(),
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
  }

  // Named layout menu — title stays "Layout" (never the profile displayName
  // "Radiar", which looked stuck in the top bar).
  const profileName = handlers.getProfile().displayName?.trim() || "Radiar";
  if (!handlers.mobile) {
    void widget.createDropdown({
      title: "Layout",
      tooltip: "Save and manage chart layouts",
      align: "right",
      items: [
        {
          title: "Save layout    Ctrl + S",
          onSelect: () => {
            try {
              handlers.onSaveNamedLayout?.();
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
              handlers.onSaveNamedLayout?.();
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
              handlers.onOpenProfile();
            } catch {
              /* ignore */
            }
          },
        },
        {
          title: `Account · ${profileName}`,
          onSelect: () => handlers.onOpenProfile(),
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
  }

  // Multi-pane Select Layout — icon-only dashed square (never templates 2×2).
  void widget
    .createDropdown({
      title: " ",
      tooltip: "Select layout",
      align: "right",
      icon: LAYOUT_GRID_ICON,
      items: buildLayoutMenuItems(wrapped),
    })
    .then((api) => {
      layoutDropdown = api as DropdownApi;
    });

  // Profile person icon → left of Symbol Search (Faraz / TV layout).
  const profile = handlers.getProfile();
  const profileBtn = widget.createButton({
    align: "left",
    useTradingViewStyle: false,
  });
  profileBtn.classList.add("forge-header-profile");
  profileBtn.setAttribute("title", `${profile.displayName} (@${profile.username})`);
  profileBtn.setAttribute("aria-label", "Account menu");
  Object.assign(profileBtn.style, {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "32px",
    height: "32px",
    minWidth: "32px",
    padding: "0",
    margin: "0 2px 0 6px",
    cursor: "pointer",
    borderRadius: "50%",
    overflow: "hidden",
    background: "rgba(120, 123, 134, 0.12)",
    border: "0",
    color: "inherit",
  });
  profileBtn.innerHTML = profilePersonIcon();
  const openProfileMenu = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    // Map iframe button rect → parent viewport so the React menu opens under the icon.
    let top = 40;
    let left = 12;
    let bottom = 72;
    let right = 44;
    try {
      const iframe = (widget as unknown as { _iFrame?: HTMLIFrameElement })._iFrame;
      const btn = profileBtn.getBoundingClientRect();
      const frame = iframe?.getBoundingClientRect();
      const ox = frame?.left ?? 0;
      const oy = frame?.top ?? 0;
      top = oy + btn.top;
      left = ox + btn.left;
      bottom = oy + btn.bottom;
      right = ox + btn.right;
    } catch {
      /* fall through with defaults */
    }
    window.dispatchEvent(
      new CustomEvent("forge:open-profile-menu", {
        detail: { top, left, bottom, right, width: right - left, height: bottom - top },
      }),
    );
  };
  profileBtn.addEventListener("click", openProfileMenu);
  profileBtn.addEventListener("pointerdown", openProfileMenu);

  // Place profile immediately before Symbol Search (Faraz: avatar → search pill).
  // Intercept Symbol Search so Forge Faraz-style picker opens instead of the TV dialog.
  let symInterceptBound: HTMLElement | null = null;
  const openForgeSymbolSearch = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
    window.dispatchEvent(new CustomEvent("forge:open-symbol-search"));
  };
  const placeProfileNearSearch = () => {
    try {
      const doc = (widget as unknown as { _iFrame?: HTMLIFrameElement })._iFrame?.contentDocument;
      if (!doc) return;
      const sym = doc.getElementById("header-toolbar-symbol-search");
      sym?.classList.add("forge-symbol-search-pill");
      if (sym && sym !== symInterceptBound) {
        symInterceptBound?.removeEventListener("click", openForgeSymbolSearch, true);
        symInterceptBound?.removeEventListener("pointerdown", openForgeSymbolSearch, true);
        sym.addEventListener("click", openForgeSymbolSearch, true);
        sym.addEventListener("pointerdown", openForgeSymbolSearch, true);
        symInterceptBound = sym;
      }
      if (!sym || !profileBtn.isConnected) return;
      const parent = sym.parentElement;
      if (parent && profileBtn.parentElement) {
        parent.insertBefore(profileBtn, sym);
      }
    } catch {
      /* iframe may not be ready */
    }
  };
  placeProfileNearSearch();
  window.setTimeout(placeProfileNearSearch, 400);
  window.setTimeout(placeProfileNearSearch, 1_200);

  return {
    updateProfile: (next) => {
      try {
        // Keep person icon; only refresh tooltip with name.
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
