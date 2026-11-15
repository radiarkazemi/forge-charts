import type { ChartLayoutId, LayoutSyncSettings, UserProfile } from "@/application";
import { activeProfile, type Settings } from "@/application";
import type { IChartingLibraryWidget, StudyTemplateMetaInfo } from "@/infrastructure/tradingview";
import { CHART_LAYOUT_CHOICES, PHONE_LAYOUT_IDS } from "./chart-layouts";

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

/** TradingView header alert: alarm clock, a bell on each side, two feet. */
const ALERT_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="28" height="28" fill="currentColor"><ellipse cx="8.3" cy="7.1" rx="1.85" ry="2.7" transform="rotate(-32 8.3 7.1)"/><ellipse cx="19.7" cy="7.1" rx="1.85" ry="2.7" transform="rotate(32 19.7 7.1)"/><path d="M9.15 18.7 7.4 22.6h2.7l.85-1.35z"/><path d="M18.85 18.7 20.6 22.6h-2.7l-.85-1.35z"/><path fill-rule="evenodd" d="M14 6.7a6.4 6.4 0 1 0 0 12.8 6.4 6.4 0 0 0 0-12.8zm-.7 1.8v3.9l2.55 1.55.7-1.15-1.9-1.15V8.5h-1.35z"/></svg>';

const REPLAY_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="28" height="28" fill="currentColor"><path d="M13 7.2 5.8 14 13 20.8V7.2zm9 0L14.8 14 22 20.8V7.2z"/></svg>';

const SEARCH_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="28" height="28"><path fill="currentColor" d="M12.5 5a7.5 7.5 0 1 0 4.74 13.3l4.23 4.24 1.06-1.06-4.24-4.23A7.5 7.5 0 0 0 12.5 5zm0 1.5a6 6 0 1 1 0 12 6 6 0 0 1 0-12z"/></svg>';

const CHEVRON_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 8" width="16" height="8"><path fill="currentColor" d="M0 1.475l7.396 6.04.596.485.593-.49L16 1.39 14.807 0 7.393 6.122 8.58 7.02.8 0 0 1.475z"/></svg>';

type SyncKey = keyof LayoutSyncSettings;

export interface SavedLayoutRow {
  readonly id: string | number;
  readonly name: string;
  readonly symbol: string;
  readonly resolution: string;
  readonly timestamp?: number;
}

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
  /** Persist the current chart under the name the user chose. */
  readonly onSaveNamedLayout?: (name?: string) => void;
  /** Name the user gave this layout. Empty until they rename it. */
  readonly currentLayoutName?: () => string;
  readonly onCopyLayout?: (name: string) => void;
  readonly onLoadLayout?: (id: string | number) => void;
  readonly onDownloadChartData?: () => void;
  readonly getSavedLayouts?: () => Promise<SavedLayoutRow[]>;
  readonly isAutosaveOn?: () => boolean;
  readonly setAutosaveOn?: (on: boolean) => void;
  readonly getFavoriteIndicators?: () => string[];
  readonly getStudyTemplates?: () => Promise<StudyTemplateMetaInfo[]>;
  readonly onSaveStudyTemplate?: (name: string) => void;
  readonly onApplyStudyTemplate?: (name: string) => void;
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
    time: "Scroll / move",
    dateRange: "Date range",
    drawings: "Drawings",
    indicators: "Indicators",
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
    indicators: false,
  };
  const syncKeys: SyncKey[] = [
    "symbol",
    "interval",
    "crosshair",
    "time",
    "dateRange",
    "drawings",
    "indicators",
  ];
  const choices = handlers.mobile
    ? CHART_LAYOUT_CHOICES.filter((choice) => PHONE_LAYOUT_IDS.includes(choice.id))
    : CHART_LAYOUT_CHOICES;
  return [
    ...choices.map((choice) => ({
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

  // Desktop header: icon + label, same place as TradingView (after Indicators).
  if (!handlers.mobile) {
    const alertBtn = widget.createButton({ align: "left", useTradingViewStyle: false });
    paintActionButton(alertBtn, ALERT_ICON, "Alert", "Create a price alert");
    alertBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      handlers.onCreateAlert();
    });

    const replayBtn = widget.createButton({ align: "left", useTradingViewStyle: false });
    paintActionButton(replayBtn, REPLAY_ICON, "Replay", "Bar Replay — select a bar and play history forward");
    replayBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      handlers.onEnterBarReplay();
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
  // Click only, after the press finishes. pointerdown opened the menu and the
  // same press closed it, so the account menu needed several clicks.
  profileBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
    window.setTimeout(() => openProfileMenu(e), 40);
  });

  // Place profile immediately before Symbol Search (Faraz: avatar → search pill).
  // Open the Forge symbol list from the header symbol and the chart legend title.
  // Click only — a pointerdown opener mounted the dialog under the finger and it closed at once.
  // Intercept Indicators so Forge TV-style indicators list opens instead of native CL.
  let indInterceptBound: HTMLElement | null = null;
  const openForgeSymbolSearch = (e: Event) => {
    // The click happens inside the chart iframe. `instanceof Element` uses this
    // window’s Element and misses the iframe node, so the list never opened.
    const view = (e.currentTarget as Document | null)?.defaultView;
    const Ctor = view?.Element;
    const target = e.target;
    if (!Ctor || !(target instanceof Ctor)) return;
    // Only the symbol name opens search. A study title must keep its own
    // Hide / Settings / Remove buttons.
    const search = target.closest("#header-toolbar-symbol-search");
    const title = target.closest("[data-name='legend-source-title']");
    const seriesTitle = title?.closest("[data-name='legend-series-item']");
    if (!search && !seriesTitle) return;
    e.preventDefault();
    e.stopPropagation();
    if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent("forge:open-symbol-search"));
    }, 30);
  };
  const openForgeIndicators = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
    window.dispatchEvent(new CustomEvent("forge:open-indicators"));
  };
  const isIndicatorsHeaderBtn = (btn: HTMLElement): boolean => {
    if (btn.getAttribute("data-name") === "open-indicators-dialog") return true;
    const title = (btn.getAttribute("title") || btn.getAttribute("aria-label") || "").trim();
    return title === "Indicators & Strategies" || title === "Indicators";
  };
  const placeProfileNearSearch = () => {
    try {
      const framed = (widget as unknown as { _iFrame?: HTMLIFrameElement })._iFrame;
      const host = (widget as unknown as { _options?: { container?: HTMLElement } })._options?.container;
      const nested = host?.querySelector("iframe");
      const doc =
        framed?.contentDocument ??
        (nested instanceof HTMLIFrameElement ? nested.contentDocument : null);
      if (!doc) return;
      const sym = doc.getElementById("header-toolbar-symbol-search");
      sym?.classList.add("forge-symbol-search-pill");
      if (doc.documentElement.getAttribute("data-forge-symbol-open") !== "1") {
        doc.documentElement.setAttribute("data-forge-symbol-open", "1");
        doc.addEventListener("click", openForgeSymbolSearch, true);
      }
      const indCandidates = Array.from(
        doc.querySelectorAll<HTMLElement>(
          'button[data-name="open-indicators-dialog"], button[title="Indicators"], button[title="Indicators & Strategies"], button[aria-label="Indicators"], button[aria-label="Indicators & Strategies"]',
        ),
      );
      const ind = indCandidates.find(isIndicatorsHeaderBtn) ?? null;
      if (ind && ind !== indInterceptBound) {
        indInterceptBound?.removeEventListener("click", openForgeIndicators, true);
        indInterceptBound?.removeEventListener("pointerdown", openForgeIndicators, true);
        ind.addEventListener("click", openForgeIndicators, true);
        ind.addEventListener("pointerdown", openForgeIndicators, true);
        indInterceptBound = ind;
      }
      mountSaveMenu(doc, widget, handlers);
      watchLayoutLabel(doc, handlers);
      mountIndicatorMenu(doc, widget, handlers);
      fixQuickSearch(doc);
      hideDuplicateSaveLabel(doc);
      if (!sym || !profileBtn.isConnected) return;
      const parent = sym.parentElement;
      const slot = profileBtn.parentElement;
      if (parent && slot && slot !== parent) {
        parent.insertBefore(profileBtn, sym);
        // The library leaves a 37px hole where the profile button was created.
        if (slot.childElementCount === 0 && slot.hasAttribute("data-is-custom-header-element")) {
          const group = slot.parentElement;
          const sep = group?.previousElementSibling ?? null;
          slot.remove();
          if (group && group.childElementCount === 0) {
            group.remove();
            if (sep && String(sep.className).includes("separator")) sep.remove();
          }
        }
      }
    } catch {
      /* iframe may not be ready */
    }
  };
  placeProfileNearSearch();
  window.setTimeout(placeProfileNearSearch, 400);
  window.setTimeout(placeProfileNearSearch, 1_200);
  window.setTimeout(placeProfileNearSearch, 2_400);

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

function paintActionButton(button: HTMLElement, icon: string, label: string, title: string): void {
  button.classList.add("forge-header-action");
  button.setAttribute("title", title);
  button.setAttribute("aria-label", title);
  button.innerHTML = `${icon}<span>${label}</span>`;
  Object.assign(button.style, {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    height: "38px",
    padding: "0 8px",
    margin: "0",
    border: "0",
    background: "transparent",
    color: "inherit",
    cursor: "pointer",
    font: "inherit",
    fontSize: "14px",
    fontWeight: "400",
    whiteSpace: "nowrap",
  });
  const svg = button.querySelector("svg");
  if (svg) {
    svg.setAttribute("width", "20");
    svg.setAttribute("height", "20");
    svg.style.display = "block";
    svg.style.flex = "0 0 auto";
  }
}

function hideDuplicateSaveLabel(doc: Document): void {
  if (doc.getElementById("forge-save-label-style")) return;
  const style = doc.createElement("style");
  style.id = "forge-save-label-style";
  style.textContent = `
    #header-toolbar-save-load [class*="saveString"][class*="hidden"] { display: none !important; }
    .forge-header-action:hover { background: rgba(120, 123, 134, 0.12); }
  `;
  (doc.head || doc.documentElement).appendChild(style);
}

/** The library icon is a funnel that reads as a leaf. Use a magnifying glass. */
function fixQuickSearch(doc: Document): void {
  const buttons = [
    ...doc.querySelectorAll<HTMLElement>("#header-toolbar-quick-search, [data-name='header-toolbar-quick-search']"),
  ];
  for (const button of buttons) {
    if (button.getAttribute("data-forge-search") === "1") continue;
    button.setAttribute("data-forge-search", "1");
    const holder = button.querySelector("span[role='img']") ?? button;
    holder.innerHTML = SEARCH_ICON;
  }
}

function shortSymbol(symbol: string): string {
  const trimmed = symbol.trim();
  const colon = trimmed.lastIndexOf(":");
  return colon >= 0 ? trimmed.slice(colon + 1) : trimmed;
}

function isGenericLayoutName(name: string): boolean {
  return !name.trim() || /^(save|saved|save layout|layout|untitled|unnamed|new layout|radiar|forge|trader)$/i.test(name.trim());
}

function layoutNameOf(widget: IChartingLibraryWidget, handlers: HeaderToolbarHandlers): string {
  const stored = handlers.currentLayoutName?.().trim() || "";
  if (stored && !isGenericLayoutName(stored)) return stored;
  const profileName = handlers.getProfile().displayName?.trim() || "";
  const realProfile = isGenericLayoutName(profileName) ? "" : profileName;
  try {
    const named = widget.layoutName()?.trim() || "";
    if (named && !isGenericLayoutName(named)) return named;
  } catch {
    /* unsaved layout */
  }
  return realProfile || "Layout";
}

/** The library paints “Save” again after a refresh. Put the chosen name back. */
function watchLayoutLabel(doc: Document, handlers: HeaderToolbarHandlers): void {
  const apply = () => {
    const name = handlers.currentLayoutName?.().trim() || "";
    if (!name || isGenericLayoutName(name)) return;
    for (const button of doc.querySelectorAll<HTMLElement>("#header-toolbar-save-load")) {
      const span = button.querySelector<HTMLElement>(".js-button-text span:not([class*='hidden'])");
      if (span && span.textContent !== name) span.textContent = name;
    }
  };
  apply();
  if (doc.documentElement.getAttribute("data-forge-layout-label") === "1") return;
  const buttons = [...doc.querySelectorAll("#header-toolbar-save-load")];
  if (!buttons.length) return;
  doc.documentElement.setAttribute("data-forge-layout-label", "1");
  for (const button of buttons) {
    new MutationObserver(apply).observe(button, { subtree: true, characterData: true, childList: true });
  }
  window.setTimeout(apply, 600);
  window.setTimeout(apply, 1800);
}

function mountSaveMenu(doc: Document, widget: IChartingLibraryWidget, handlers: HeaderToolbarHandlers): void {
  const chevrons = [...doc.querySelectorAll<HTMLElement>('[data-name="save-load-menu"]')].filter(
    (el) => el.getAttribute("data-forge-save-menu") !== "1",
  );
  if (!chevrons.length) return;
  for (const el of chevrons) el.setAttribute("data-forge-save-menu", "1");
  watchLayoutLabel(doc, handlers);
  const chevron = chevrons[chevrons.length - 1]!;
  let menu: HTMLElement | null = null;
  let mode: "list" | "name" = "list";
  let nameAction: "rename" | "copy" | "create" = "rename";

  const close = () => {
    menu?.remove();
    menu = null;
  };

  const saveCurrent = () => {
    handlers.onSaveNamedLayout?.(layoutNameOf(widget, handlers));
  };

  const paint = () => {
    if (!menu) return;
    if (mode === "name") {
      const title = nameAction === "rename" ? "Rename" : nameAction === "copy" ? "Make a copy" : "Create new layout";
      const preset = nameAction === "rename" ? layoutNameOf(widget, handlers) : "";
      menu.innerHTML = `
        <div class="fsm-title">${title}</div>
        <input class="fsm-input" type="text" value="${preset.replace(/"/g, "&quot;")}" placeholder="Layout name" />
        <div class="fsm-actions"><button type="button" data-act="cancel">Cancel</button><button type="button" data-act="confirm">Save</button></div>
      `;
      const input = menu.querySelector<HTMLInputElement>(".fsm-input");
      window.setTimeout(() => input?.focus(), 20);
      return;
    }
    const autosave = handlers.isAutosaveOn?.() !== false;
    void handlers.getSavedLayouts?.().then((rows) => {
      if (!menu || mode !== "list") return;
      const named = rows.filter((row) => !isGenericLayoutName(row.name));
      const recent = (named.length > 0 ? named : rows)
        .slice()
        .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))
        .slice(0, 6)
        .map(
          (row) =>
            `<button type="button" class="fsm-recent" data-act="load" data-id="${String(row.id)}"><span>${row.name}</span><em>${shortSymbol(row.symbol)}, ${row.resolution}</em></button>`,
        )
        .join("");
      const list = menu.querySelector(".fsm-recent-slot");
      if (list) list.innerHTML = recent || `<div class="fsm-empty">No saved layouts yet</div>`;
    });
    menu.innerHTML = `
      <button type="button" class="fsm-item" data-act="save"><span>Save layout</span><kbd>Ctrl + S</kbd></button>
      <div class="fsm-item"><span>Autosave</span><button type="button" class="fsm-switch${autosave ? " is-on" : ""}" data-act="autosave" aria-label="Autosave"></button></div>
      <div class="fsm-item"><span>Share layout</span><button type="button" class="fsm-switch" data-act="share" aria-label="Share layout" disabled></button></div>
      <button type="button" class="fsm-item" data-act="copy">Make a copy…</button>
      <button type="button" class="fsm-item" data-act="rename">Rename…</button>
      <button type="button" class="fsm-item" data-act="download">Download chart data…</button>
      <button type="button" class="fsm-item" data-act="create">Create new layout…</button>
      <div class="fsm-label">RECENTLY USED</div>
      <div class="fsm-recent-slot"></div>
      <button type="button" class="fsm-item" data-act="open">Open layout…</button>
    `;
  };

  const open = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
    if (typeof (event as Event & { stopImmediatePropagation?: () => void }).stopImmediatePropagation === "function") {
      (event as Event & { stopImmediatePropagation: () => void }).stopImmediatePropagation();
    }
    if (menu) {
      close();
      return;
    }
    ensureMenuStyles(doc);
    mode = "list";
    menu = doc.createElement("div");
    menu.className = "forge-save-menu";
    if (doc.documentElement.classList.contains("theme-dark")) menu.classList.add("is-dark");
    const anchor = (event.currentTarget as HTMLElement | null) ?? chevron;
    const box = anchor.getBoundingClientRect();
    menu.style.top = `${Math.round(box.bottom + 4)}px`;
    menu.style.right = `${Math.max(8, Math.round(doc.documentElement.clientWidth - box.right))}px`;
    doc.body.appendChild(menu);
    paint();
  };

  let openedAt = 0;
  const openOnce = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
    if (typeof (event as Event & { stopImmediatePropagation?: () => void }).stopImmediatePropagation === "function") {
      (event as Event & { stopImmediatePropagation: () => void }).stopImmediatePropagation();
    }
    if (Date.now() - openedAt < 350) return;
    openedAt = Date.now();
    open(event);
  };
  for (const el of chevrons) {
    el.addEventListener("pointerdown", openOnce, true);
    el.addEventListener("click", openOnce, true);
  }
  for (const saveBtn of doc.querySelectorAll<HTMLElement>("#header-toolbar-save-load, [aria-label*='Save all charts']")) {
    if (saveBtn.getAttribute("data-forge-save-click") === "1") continue;
    saveBtn.setAttribute("data-forge-save-click", "1");
    saveBtn.addEventListener(
      "click",
      (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
        saveCurrent();
      },
      true,
    );
  }
  doc.addEventListener("click", (event) => {
    if (!menu) return;
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (menu.contains(target)) {
      const act = (target.closest("[data-act]") as HTMLElement | null)?.dataset.act;
      if (act === "save") {
        saveCurrent();
        close();
      } else if (act === "autosave") {
        const next = handlers.isAutosaveOn?.() === false;
        handlers.setAutosaveOn?.(next);
        paint();
      } else if (act === "copy" || act === "rename" || act === "create") {
        nameAction = act;
        mode = "name";
        paint();
      } else if (act === "cancel") {
        mode = "list";
        paint();
      } else if (act === "confirm") {
        const value = menu.querySelector<HTMLInputElement>(".fsm-input")?.value.trim() ?? "";
        if (!value) return;
        if (nameAction === "copy" || nameAction === "create") handlers.onCopyLayout?.(value);
        else handlers.onSaveNamedLayout?.(value);
        close();
      } else if (act === "download") {
        handlers.onDownloadChartData?.();
        close();
      } else if (act === "open") {
        try {
          widget.showLoadChartDialog();
        } catch {
          /* ignore */
        }
        close();
      } else if (act === "load") {
        const id = (target.closest("[data-id]") as HTMLElement | null)?.dataset.id;
        if (id) handlers.onLoadLayout?.(id);
        close();
      }
      return;
    }
    if (!chevrons.some((el) => el.contains(target))) close();
  });
}

function mountIndicatorMenu(doc: Document, widget: IChartingLibraryWidget, handlers: HeaderToolbarHandlers): void {
  const buttons = [...doc.querySelectorAll<HTMLElement>("button")].filter((el) => {
    if (el.getAttribute("data-forge-ind-menu") === "1") return false;
    const title = `${el.getAttribute("title") || ""} ${el.getAttribute("aria-label") || ""} ${el.getAttribute("data-tooltip") || ""}`;
    return /indicator templates/i.test(title);
  });
  if (!buttons.length) return;
  for (const el of buttons) el.setAttribute("data-forge-ind-menu", "1");
  const button = buttons[buttons.length - 1]!;
  button.setAttribute("aria-label", "Indicator templates");
  button.innerHTML = CHEVRON_ICON;
  button.style.width = "22px";
  button.style.minWidth = "22px";
  button.style.padding = "0";
  let menu: HTMLElement | null = null;
  let tab: "indicators" | "templates" = "indicators";

  const close = () => {
    menu?.remove();
    menu = null;
  };

  const paint = () => {
    if (!menu) return;
    const favorites = handlers.getFavoriteIndicators?.() ?? [];
    const favHtml = favorites.length
      ? favorites.map((name) => `<button type="button" class="fim-row" data-study="${name.replace(/"/g, "&quot;")}">${name}</button>`).join("")
      : `<div class="fim-empty">No favorite indicators yet</div>`;
    menu.innerHTML = `
      <div class="fim-tabs">
        <button type="button" class="fim-tab${tab === "indicators" ? " is-on" : ""}" data-tab="indicators">Indicators</button>
        <button type="button" class="fim-tab${tab === "templates" ? " is-on" : ""}" data-tab="templates">Templates</button>
      </div>
      <div class="fim-body"></div>
    `;
    const body = menu.querySelector(".fim-body");
    if (!body) return;
    if (tab === "indicators") {
      body.innerHTML = `<div class="fim-label">FAVORITE INDICATORS</div>${favHtml}`;
      return;
    }
    body.innerHTML = `
      <button type="button" class="fim-row" data-act="save-template">Save indicator template…</button>
      <button type="button" class="fim-row" data-act="open-template">Open template…</button>
      <div class="fim-templates"></div>
    `;
    void handlers.getStudyTemplates?.().then((rows) => {
      const slot = menu?.querySelector(".fim-templates");
      if (!slot) return;
      slot.innerHTML = rows.length
        ? rows.map((row) => `<button type="button" class="fim-row" data-template="${row.name.replace(/"/g, "&quot;")}">${row.name}</button>`).join("")
        : "";
    });
  };

  const open = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
    if (typeof (event as Event & { stopImmediatePropagation?: () => void }).stopImmediatePropagation === "function") {
      (event as Event & { stopImmediatePropagation: () => void }).stopImmediatePropagation();
    }
    if (menu) {
      close();
      return;
    }
    ensureMenuStyles(doc);
    tab = "indicators";
    menu = doc.createElement("div");
    menu.className = "forge-ind-menu";
    if (doc.documentElement.classList.contains("theme-dark")) menu.classList.add("is-dark");
    const anchor = (event.currentTarget as HTMLElement | null) ?? button;
    const box = anchor.getBoundingClientRect();
    menu.style.top = `${Math.round(box.bottom + 4)}px`;
    menu.style.left = `${Math.max(8, Math.round(box.left - 80))}px`;
    doc.body.appendChild(menu);
    paint();
  };

  let openedAt = 0;
  const openOnce = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
    if (typeof (event as Event & { stopImmediatePropagation?: () => void }).stopImmediatePropagation === "function") {
      (event as Event & { stopImmediatePropagation: () => void }).stopImmediatePropagation();
    }
    if (Date.now() - openedAt < 350) return;
    openedAt = Date.now();
    open(event);
  };
  for (const el of buttons) {
    el.innerHTML = CHEVRON_ICON;
    el.style.width = "22px";
    el.style.minWidth = "22px";
    el.style.padding = "0";
    el.addEventListener("pointerdown", openOnce, true);
    el.addEventListener("click", openOnce, true);
  }
  doc.addEventListener("click", (event) => {
    if (!menu) return;
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (menu.contains(target)) {
      const tabBtn = target.closest("[data-tab]") as HTMLElement | null;
      if (tabBtn?.dataset.tab === "indicators" || tabBtn?.dataset.tab === "templates") {
        tab = tabBtn.dataset.tab;
        paint();
        return;
      }
      const study = (target.closest("[data-study]") as HTMLElement | null)?.dataset.study;
      if (study) {
        void widget.activeChart().createStudy(study, false, false).catch(() => null);
        close();
        return;
      }
      const act = (target.closest("[data-act]") as HTMLElement | null)?.dataset.act;
      if (act === "save-template") {
        const name = doc.defaultView?.prompt("Save indicator template", "")?.trim();
        if (name) handlers.onSaveStudyTemplate?.(name);
        close();
        return;
      }
      if (act === "open-template") {
        tab = "templates";
        paint();
        return;
      }
      const template = (target.closest("[data-template]") as HTMLElement | null)?.dataset.template;
      if (template) {
        handlers.onApplyStudyTemplate?.(template);
        close();
      }
      return;
    }
    if (!buttons.some((el) => el.contains(target))) close();
  });
}

function ensureMenuStyles(doc: Document): void {
  if (doc.getElementById("forge-header-menu-style")) return;
  const style = doc.createElement("style");
  style.id = "forge-header-menu-style";
  style.textContent = `
    .forge-save-menu, .forge-ind-menu {
      position: fixed; z-index: 2147483646; min-width: 280px; max-width: 360px;
      background: #fff; color: #131722; border: 1px solid #e0e3eb; border-radius: 6px;
      box-shadow: 0 8px 28px rgba(0,0,0,0.28); padding: 6px 0;
      font-family: -apple-system, BlinkMacSystemFont, Trebuchet MS, Roboto, Ubuntu, sans-serif;
      font-size: 14px; box-sizing: border-box; overflow: hidden;
    }
    .forge-save-menu.is-dark, .forge-ind-menu.is-dark { background: #1e222d; color: #d1d4dc; border-color: #434651; }
    .fsm-item, .fim-row, .fsm-recent {
      width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 12px;
      border: 0; background: transparent; color: inherit; cursor: pointer;
      padding: 8px 16px; text-align: left; font: inherit;
    }
    .fsm-item:hover, .fim-row:hover, .fsm-recent:hover { background: rgba(120,123,134,0.14); }
    .fsm-item kbd { color: #787b86; font-family: inherit; font-size: 12px; }
    .fsm-switch {
      width: 34px; height: 18px; border-radius: 99px; border: 0; padding: 0; cursor: pointer;
      background: #d1d4dc; position: relative;
    }
    .fsm-switch::after {
      content: ""; position: absolute; top: 2px; left: 2px; width: 14px; height: 14px;
      border-radius: 50%; background: #fff; transition: left 0.15s ease;
    }
    .fsm-switch.is-on { background: #2962ff; }
    .fsm-switch.is-on::after { left: 18px; }
    .fsm-switch:disabled { opacity: 0.45; cursor: default; }
    .fsm-label, .fim-label {
      padding: 10px 16px 4px; font-size: 11px; letter-spacing: 0.6px; color: #787b86; font-weight: 600;
    }
    .fsm-recent { flex-direction: column; align-items: flex-start; gap: 2px; }
    .fsm-recent em { font-style: normal; color: #787b86; font-size: 12px; }
    .fsm-empty, .fim-empty { padding: 8px 16px 12px; color: #787b86; }
    .fsm-title { padding: 8px 16px 4px; font-weight: 600; }
    .fsm-input {
      display: block; width: calc(100% - 32px); margin: 8px 16px; box-sizing: border-box;
      border: 1px solid #d1d4dc; border-radius: 6px; padding: 8px 10px; font: inherit; color: inherit;
      background: transparent;
    }
    .forge-save-menu.is-dark .fsm-input { border-color: #434651; }
    .fsm-actions { display: flex; justify-content: flex-end; gap: 8px; padding: 4px 16px 8px; }
    .fsm-actions button { border: 0; background: transparent; color: #2962ff; font: inherit; cursor: pointer; }
    .fim-tabs { display: flex; gap: 6px; padding: 8px 12px 4px; }
    .fim-tab {
      flex: 1; border: 0; border-radius: 8px; padding: 7px 8px; cursor: pointer;
      background: transparent; color: inherit; font: inherit;
    }
    .fim-tab.is-on { background: rgba(120,123,134,0.22); }
  `;
  (doc.head || doc.documentElement).appendChild(style);
}

