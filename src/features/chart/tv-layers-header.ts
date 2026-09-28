import type { Interval } from "@/domain";
import { layoutSyncBus } from "./layout-sync";

/**
 * TradingView-like multi-chart header bridge.
 *
 * Advanced Charts has one header per widget. For multi-pane layers we keep the
 * original CL header UI, but intercept Symbol / Interval / Indicators clicks and
 * apply them only to the active pane — same as tradingview.com Supercharts.
 */

const INTERVAL_RE = /^(?:[1-9]\d*[SRL]?|[1-9]\d*[DWM]|[1-9]\d*)$/i;

const INTERVAL_TITLE_MAP: ReadonlyArray<{ readonly match: RegExp; readonly value: Interval }> = [
  { match: /^1 minute$/i, value: "1" },
  { match: /^5 minutes$/i, value: "5" },
  { match: /^15 minutes$/i, value: "15" },
  { match: /^30 minutes$/i, value: "30" },
  { match: /^1 hour$/i, value: "60" },
  { match: /^2 hours$/i, value: "120" },
  { match: /^3 hours$/i, value: "180" },
  { match: /^4 hours$/i, value: "240" },
  { match: /^1 day$/i, value: "1D" },
  { match: /^1 week$/i, value: "1W" },
  { match: /^1 month$/i, value: "1M" },
  { match: /^3 months$/i, value: "3M" },
  { match: /^6 months$/i, value: "6M" },
  { match: /^12 months$/i, value: "12M" },
];

const INTERVAL_TEXT_MAP: Record<string, Interval> = {
  "1m": "1",
  "5m": "5",
  "15m": "15",
  "30m": "30",
  "1h": "60",
  "2h": "120",
  "3h": "180",
  "4h": "240",
  D: "1D",
  W: "1W",
  M: "1M",
  "3M": "3M",
  "6M": "6M",
  "12M": "12M",
};

function isIntervalValue(raw: string): raw is Interval {
  return INTERVAL_RE.test(raw);
}

/** Quick-pick toolbar buttons ship `data-value` + role=radio in CL. */
function parseQuickIntervalButton(btn: HTMLElement): Interval | null {
  // Never steal the dropdown toggle (opens the full interval menu).
  if (
    btn.getAttribute("aria-haspopup") === "true" ||
    btn.getAttribute("aria-expanded") != null ||
    btn.className.includes("isOpened")
  ) {
    return null;
  }

  const dataValue = btn.getAttribute("data-value");
  if (dataValue && isIntervalValue(dataValue)) return dataValue;

  // Favorite quick buttons: role=radio with a known title/hint.
  if (btn.getAttribute("role") === "radio") {
    const title = (btn.getAttribute("title") || btn.getAttribute("aria-label") || "").trim();
    for (const row of INTERVAL_TITLE_MAP) {
      if (row.match.test(title)) return row.value;
    }
    const text = (btn.textContent || "").replace(/\s+/g, " ").trim();
    if (text && INTERVAL_TEXT_MAP[text]) return INTERVAL_TEXT_MAP[text];
  }

  return null;
}

function parseMenuInterval(item: HTMLElement): Interval | null {
  const dataValue = item.getAttribute("data-value");
  if (dataValue && isIntervalValue(dataValue)) return dataValue;

  const title = (item.getAttribute("title") || item.textContent || "").replace(/\s+/g, " ").trim();
  for (const row of INTERVAL_TITLE_MAP) {
    if (row.match.test(title)) return row.value;
  }
  return null;
}

function isSymbolSearchButton(btn: HTMLElement): boolean {
  if (btn.id === "header-toolbar-symbol-search") return true;
  const title = (btn.getAttribute("title") || btn.getAttribute("aria-label") || "").trim();
  return title === "Symbol Search";
}

function isIndicatorsButton(btn: HTMLElement): boolean {
  if (btn.getAttribute("data-name") === "open-indicators-dialog") return true;
  const title = (btn.getAttribute("title") || "").trim();
  return title === "Indicators & Strategies" || title === "Indicators";
}

function labelForInterval(interval: Interval): string {
  const entries = Object.entries(INTERVAL_TEXT_MAP);
  for (const [label, value] of entries) {
    if (value === interval) return label;
  }
  return String(interval);
}

function syncHeaderChrome(doc: Document, symbol: string, interval: Interval): void {
  const bare = symbol.includes(":") ? symbol.slice(symbol.lastIndexOf(":") + 1) : symbol;
  const symBtn = doc.getElementById("header-toolbar-symbol-search");
  if (symBtn) {
    const text = symBtn.querySelector(".js-button-text");
    if (text) text.textContent = bare || symbol;
  }

  const buttons = doc.querySelectorAll<HTMLElement>("button[data-value], button[role='radio']");
  for (const btn of buttons) {
    const parsed = parseQuickIntervalButton(btn);
    if (!parsed) continue;
    const active = parsed === interval;
    btn.classList.toggle("isActive-GwQQdU8S", active);
    if (active) btn.setAttribute("aria-pressed", "true");
    else btn.removeAttribute("aria-pressed");
    if (btn.getAttribute("role") === "radio") {
      btn.setAttribute("aria-checked", active ? "true" : "false");
    }
  }

  // Also refresh the resolution menu button label when present.
  const menuBtn = doc.querySelector<HTMLElement>(
    '[data-name="time-interval-desktop"], [data-name="time-interval"] button, #header-toolbar-intervals button',
  );
  if (menuBtn) {
    const label = menuBtn.querySelector(".js-button-text, [class*='value']");
    if (label) label.textContent = labelForInterval(interval);
  }
}

function stop(event: Event): void {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
}

function applyIntervalToActive(interval: Interval): void {
  layoutSyncBus.applyHeaderInterval(interval);
}

/**
 * Install capture-phase interceptors on the primary CL iframe header.
 * Returns a disposer.
 */
export function mountTvLayersHeader(container: HTMLElement): () => void {
  let disposed = false;
  let attachedDoc: Document | null = null;
  let unsubPane: (() => void) | null = null;
  let mo: MutationObserver | null = null;
  let poll = 0;
  /** Dedupe mousedown+click on the same control within one gesture. */
  let lastRouteKey = "";
  let lastRouteAt = 0;

  const shouldRoute = (): boolean => layoutSyncBus.getActiveCount() > 1;

  const once = (key: string): boolean => {
    const now = Date.now();
    if (key === lastRouteKey && now - lastRouteAt < 400) return false;
    lastRouteKey = key;
    lastRouteAt = now;
    return true;
  };

  const onPointer = (event: Event) => {
    if (disposed || !shouldRoute()) return;

    const raw = event.target;
    if (!(raw instanceof Element)) return;
    const btn = raw.closest("button");
    if (!btn || !(btn instanceof HTMLElement)) return;

    const active = layoutSyncBus.getActivePane();

    if (isSymbolSearchButton(btn)) {
      // Pane 0: let the native dialog run. Other panes: open on the active widget.
      if (active === 0) return;
      stop(event);
      if (once(`sym:${active}`)) layoutSyncBus.openSymbolSearchOnActive();
      return;
    }

    if (isIndicatorsButton(btn)) {
      if (active === 0) return;
      stop(event);
      if (once(`ind:${active}`)) layoutSyncBus.openIndicatorsOnActive();
      return;
    }

    const interval = parseQuickIntervalButton(btn);
    if (!interval) return;

    // Interval sync ON or active primary → native CL change (+ bus sync).
    if (active === 0 || layoutSyncBus.getFlags().interval === true) return;

    stop(event);
    if (!once(`tf:${active}:${interval}`)) return;
    applyIntervalToActive(interval);
    if (attachedDoc) {
      const st = layoutSyncBus.getPaneState(layoutSyncBus.getActivePane());
      syncHeaderChrome(attachedDoc, st.symbol, interval);
    }
  };

  // Interval dropdown / dialog menu items.
  const onMenuPointer = (event: Event) => {
    if (disposed || !shouldRoute()) return;
    const active = layoutSyncBus.getActivePane();
    if (active === 0 || layoutSyncBus.getFlags().interval === true) return;

    const raw = event.target;
    if (!(raw instanceof Element)) return;
    const item =
      raw.closest<HTMLElement>("[data-value]") ||
      raw.closest<HTMLElement>('[role="menuitem"]') ||
      raw.closest<HTMLElement>('[role="option"]');
    if (!item) return;

    const interval = parseMenuInterval(item);
    if (!interval) return;

    stop(event);
    if (!once(`menu:${active}:${interval}`)) return;
    applyIntervalToActive(interval);
    if (attachedDoc) {
      const st = layoutSyncBus.getPaneState(layoutSyncBus.getActivePane());
      syncHeaderChrome(attachedDoc, st.symbol, interval);
    }
  };

  const EVENT_TYPES = ["pointerdown", "mousedown", "touchstart", "click"] as const;

  const detach = () => {
    if (!attachedDoc) return;
    for (const type of EVENT_TYPES) {
      attachedDoc.removeEventListener(type, onPointer, true);
      attachedDoc.removeEventListener(type, onMenuPointer, true);
    }
    attachedDoc = null;
  };

  const attach = () => {
    const iframe = container.querySelector("iframe");
    const doc = iframe?.contentDocument;
    if (!doc?.body) return false;
    if (attachedDoc === doc) return true;
    detach();
    attachedDoc = doc;
    // Capture on every pointer family — CL/React may handle mousedown before click.
    for (const type of EVENT_TYPES) {
      doc.addEventListener(type, onPointer, true);
      doc.addEventListener(type, onMenuPointer, true);
    }

    unsubPane?.();
    unsubPane = layoutSyncBus.subscribeActivePaneState((state) => {
      if (layoutSyncBus.getActiveCount() < 2) return;
      if (attachedDoc) syncHeaderChrome(attachedDoc, state.symbol, state.interval);
    });
    return true;
  };

  attach();
  mo = new MutationObserver(() => {
    attach();
  });
  mo.observe(container, { childList: true, subtree: true });
  poll = window.setInterval(() => attach(), 1500);

  return () => {
    disposed = true;
    window.clearInterval(poll);
    mo?.disconnect();
    unsubPane?.();
    detach();
  };
}
