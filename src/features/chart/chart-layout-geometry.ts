import type { ChartLayoutId } from "@/application";

/** Normalized slot inside the content box (below header, right of left toolbar). */
export interface ContentSlot {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface ChromeInsets {
  readonly headerHeight: number;
  readonly leftToolbarWidth: number;
  /** Right price-axis gutter reserved so sibling layers don’t cover it. */
  readonly priceAxisWidth: number;
}

export interface PaneRectPx {
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
}

/** Content-area slots matching TradingView multi-chart layouts (fractions 0–1). */
const SLOTS: Record<ChartLayoutId, readonly ContentSlot[]> = {
  s: [{ x: 0, y: 0, w: 1, h: 1 }],
  "2h": [
    { x: 0, y: 0, w: 0.5, h: 1 },
    { x: 0.5, y: 0, w: 0.5, h: 1 },
  ],
  "2v": [
    { x: 0, y: 0, w: 1, h: 0.5 },
    { x: 0, y: 0.5, w: 1, h: 0.5 },
  ],
  "3h": [
    { x: 0, y: 0, w: 1 / 3, h: 1 },
    { x: 1 / 3, y: 0, w: 1 / 3, h: 1 },
    { x: 2 / 3, y: 0, w: 1 / 3, h: 1 },
  ],
  "3v": [
    { x: 0, y: 0, w: 1, h: 1 / 3 },
    { x: 0, y: 1 / 3, w: 1, h: 1 / 3 },
    { x: 0, y: 2 / 3, w: 1, h: 1 / 3 },
  ],
  "3s": [
    { x: 0, y: 0, w: 1, h: 1 / 3 },
    { x: 0, y: 1 / 3, w: 1, h: 1 / 3 },
    { x: 0, y: 2 / 3, w: 1, h: 1 / 3 },
  ],
  "2-1": [
    { x: 0, y: 0, w: 0.5, h: 0.5 },
    { x: 0.5, y: 0, w: 0.5, h: 0.5 },
    { x: 0, y: 0.5, w: 1, h: 0.5 },
  ],
  "1-2": [
    { x: 0, y: 0, w: 1, h: 0.5 },
    { x: 0, y: 0.5, w: 0.5, h: 0.5 },
    { x: 0.5, y: 0.5, w: 0.5, h: 0.5 },
  ],
  "4": [
    { x: 0, y: 0, w: 0.5, h: 0.5 },
    { x: 0.5, y: 0, w: 0.5, h: 0.5 },
    { x: 0, y: 0.5, w: 0.5, h: 0.5 },
    { x: 0.5, y: 0.5, w: 0.5, h: 0.5 },
  ],
};

const DEFAULT_CHROME: ChromeInsets = { headerHeight: 38, leftToolbarWidth: 52, priceAxisWidth: 56 };
const STYLE_ID = "forge-primary-layout-clip";
/** Extra gap between pane plot edges (beyond the reserved price-axis gutter). */
const PANE_GAP = 2;

export function contentSlotsFor(layout: ChartLayoutId): readonly ContentSlot[] {
  return SLOTS[layout] ?? SLOTS.s;
}

function readPriceAxisWidth(doc: Document, fallback: number): number {
  const candidates = doc.querySelectorAll<HTMLElement>(
    [
      ".price-axis",
      ".price-axis-container",
      '[class*="priceAxis"]',
      ".chart-markup-table tr td:last-child",
    ].join(","),
  );
  let best = 0;
  for (const el of candidates) {
    const w = el.offsetWidth;
    // Real TV price axes are roughly 40–90px; ignore tiny/huge false matches.
    if (w >= 36 && w <= 120 && w > best) best = w;
  }
  return best || fallback;
}

function readChrome(doc: Document): ChromeInsets {
  const topEl = doc.querySelector(".layout__area--top") as HTMLElement | null;
  const leftEl = doc.querySelector(".layout__area--left") as HTMLElement | null;
  const centerEl = doc.querySelector(".layout__area--center") as HTMLElement | null;
  // Prefer the real plot top (TV leaves a 2–4px gap under the header).
  // When our multi-clip stylesheet is active, ignore its overridden top.
  const clipped = Boolean(doc.getElementById(STYLE_ID)?.textContent);
  const headerHeight =
    !clipped && centerEl && centerEl.offsetTop > 0
      ? centerEl.offsetTop
      : topEl
        ? topEl.offsetTop + topEl.offsetHeight
        : DEFAULT_CHROME.headerHeight;
  return {
    headerHeight: headerHeight || DEFAULT_CHROME.headerHeight,
    leftToolbarWidth: leftEl?.offsetWidth ?? 0,
    priceAxisWidth: readPriceAxisWidth(doc, DEFAULT_CHROME.priceAxisWidth),
  };
}

/**
 * Pixel rect of a pane inside the full workspace.
 *
 * Left/top panes keep their full slot (price axis stays inside the pane).
 * A neighbor to the right starts after that pane’s price-axis band so y-axis
 * drag on the left chart is never covered by the next layer.
 */
export function paneRectInWorkspace(
  layout: ChartLayoutId,
  paneIndex: number,
  workspace: { width: number; height: number },
  chrome: ChromeInsets = DEFAULT_CHROME,
): PaneRectPx | null {
  const slots = contentSlotsFor(layout);
  const slot = slots[paneIndex];
  if (!slot || workspace.width <= 0 || workspace.height <= 0) return null;

  const contentW = Math.max(0, workspace.width - chrome.leftToolbarWidth);
  const contentH = Math.max(0, workspace.height - chrome.headerHeight);
  const axis = Math.max(40, chrome.priceAxisWidth);

  // If this pane starts to the right of another, clear the previous pane’s y-axis.
  const leftPad = slot.x > 0 ? axis + PANE_GAP : 0;
  const topPad = slot.y > 0 ? PANE_GAP : 0;
  // If another pane sits to the right, this pane keeps its axis; neighbor is padded.
  const rightTrim = 0;
  const bottomTrim = slot.y + slot.h < 1 ? PANE_GAP : 0;

  const left = chrome.leftToolbarWidth + slot.x * contentW + leftPad;
  const top = chrome.headerHeight + slot.y * contentH + topPad;
  const width = slot.w * contentW - leftPad - rightTrim;
  const height = slot.h * contentH - topPad - bottomTrim;

  return {
    left: Math.round(left),
    top: Math.round(top),
    width: Math.max(0, Math.round(width)),
    height: Math.max(0, Math.round(height)),
  };
}

/**
 * Constrain the primary Charting Library plot to pane 0 so the original
 * top navbar stays full-width while secondary layers sit beside/under it.
 *
 * Only injects a stylesheet — never mutates TV's own inline layout styles
 * (clearing those was collapsing the header + leaving a gap at the bottom).
 */
export function applyPrimaryLayoutClip(
  container: HTMLElement,
  layout: ChartLayoutId,
): ChromeInsets | null {
  const iframe = container.querySelector("iframe");
  const doc = iframe?.contentDocument;
  if (!doc?.documentElement || !doc.head) return null;

  if (layout === "s") {
    clearPrimaryLayoutClip(container);
    return readChrome(doc);
  }

  const centerEl = doc.querySelector(".layout__area--center") as HTMLElement | null;
  const topEl = doc.querySelector(".layout__area--top") as HTMLElement | null;
  if (!centerEl || !topEl) return null;

  const chrome = readChrome(doc);
  const slot = contentSlotsFor(layout)[0];
  if (!slot) return chrome;

  const W = doc.documentElement.clientWidth || container.clientWidth;
  const H = doc.documentElement.clientHeight || container.clientHeight;
  if (W < 32 || H < 32) return null;

  const contentW = Math.max(0, W - chrome.leftToolbarWidth);
  const contentH = Math.max(0, H - chrome.headerHeight);
  const left = chrome.leftToolbarWidth + slot.x * contentW;
  const top = chrome.headerHeight + slot.y * contentH;
  // Full slot width — price axis lives inside the primary plot. Secondary layers
  // are positioned with a left pad (see paneRectInWorkspace) so they don’t cover it.
  const width = slot.w * contentW;
  const height = slot.h * contentH - (slot.y + slot.h < 1 ? PANE_GAP : 0);
  if (width < 16 || height < 16) return null;

  let styleEl = doc.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = doc.createElement("style");
    styleEl.id = STYLE_ID;
    doc.head.appendChild(styleEl);
  }
  // Transparent shell so raising primary z-index for header menus does not
  // paint over secondary layers (fixes “second chart disappears” flash).
  const next = `
    html, body {
      background: transparent !important;
    }
    .layout__area--center {
      left: ${left}px !important;
      top: ${top}px !important;
      width: ${width}px !important;
      height: ${height}px !important;
      right: auto !important;
      bottom: auto !important;
      background-color: var(--tv-color-platform-background, #131722) !important;
    }
    .layout__area--bottom {
      left: ${left}px !important;
      width: ${width}px !important;
      right: auto !important;
    }
    .layout__area--top {
      left: 0 !important;
      right: 0 !important;
      width: 100% !important;
      background-color: var(--tv-color-platform-background, #131722) !important;
    }
    .layout__area--left {
      background-color: var(--tv-color-platform-background, #131722) !important;
    }
  `;
  if (styleEl.textContent !== next) styleEl.textContent = next;

  return chrome;
}

/** Remove only our clip stylesheet — leave TradingView inline layout alone. */
export function clearPrimaryLayoutClip(container: HTMLElement): void {
  try {
    const doc = container.querySelector("iframe")?.contentDocument;
    const styleEl = doc?.getElementById(STYLE_ID);
    if (!styleEl) return;
    styleEl.remove();
    try {
      container.querySelector("iframe")?.contentWindow?.dispatchEvent(new Event("resize"));
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new Event("resize"));
  } catch {
    /* ignore */
  }
}

/**
 * Watch the primary CL iframe for open header menus (layout picker, etc.).
 * Left-toolbar drawing flyouts are ignored — they must not hide secondary panes.
 */
export function watchPrimaryMenusOpen(
  container: HTMLElement,
  onChange: (open: boolean) => void,
): () => void {
  let stopped = false;
  let mo: MutationObserver | null = null;
  let last = false;
  let poll = 0;
  let debounce = 0;
  let boundDoc: Document | null = null;

  const isHeaderMenu = (el: Element): boolean => {
    // Drawing toolbar flyouts live under the left area — never treat as “menusOpen”.
    if (el.closest(".layout__area--left")) return false;
    if (el.closest(".drawing-toolbar, [class*='drawingToolbar'], [class*='drawing-toolbar']")) {
      return false;
    }
    // Favorites / floating tool strips near drawings.
    if (el.closest("[class*='floating-toolbar'], [class*='floatingToolbar']")) return false;
    return true;
  };

  const check = () => {
    if (stopped) return;
    const doc = container.querySelector("iframe")?.contentDocument;
    if (!doc) return;

    const nodes = doc.querySelectorAll(
      [
        '[class*="menuWrap"]',
        '[class*="menuBox"]',
        '[data-name="menu-inner"]',
        '[class*="popupMenu"]',
        '[role="menu"]',
        '[data-name="layout-menu"]',
        '[class*="context-menu"]',
      ].join(","),
    );

    let open = false;
    for (const node of nodes) {
      if (!isHeaderMenu(node)) continue;
      const style = doc.defaultView?.getComputedStyle(node);
      if (style && (style.display === "none" || style.visibility === "hidden")) continue;
      open = true;
      break;
    }

    // Dialogs from the top header (layout is usually a menu; keep dialogs too).
    if (!open) {
      const dialog = doc.querySelector(
        '[data-name="indicators-dialog"], [data-name="symbol-search-items-dialog"], [role="dialog"]',
      );
      if (dialog && isHeaderMenu(dialog)) open = true;
    }

    if (open !== last) {
      last = open;
      onChange(open);
    }
  };

  const scheduleCheck = () => {
    window.clearTimeout(debounce);
    debounce = window.setTimeout(check, 48);
  };

  const bind = () => {
    const doc = container.querySelector("iframe")?.contentDocument;
    if (!doc?.body) return false;
    if (boundDoc === doc && mo) return true;
    mo?.disconnect();
    boundDoc = doc;
    // childList only — attribute spam from CL was a major multi-pane lag source.
    mo = new MutationObserver(scheduleCheck);
    mo.observe(doc.body, { childList: true, subtree: true });
    check();
    return true;
  };

  bind();
  // Light attach poll until the iframe document exists, then stop.
  let tries = 0;
  poll = window.setInterval(() => {
    tries += 1;
    if (bind() || tries > 20) {
      window.clearInterval(poll);
      poll = 0;
    }
  }, 500);

  return () => {
    stopped = true;
    window.clearInterval(poll);
    window.clearTimeout(debounce);
    mo?.disconnect();
  };
}

/**
 * Keep the primary plot clipped for as long as `layout` is multi-pane.
 * Single-pane: do not touch the CL layout DOM at all.
 */
export function mountPrimaryLayoutClip(
  container: HTMLElement,
  getLayout: () => ChartLayoutId,
  onChrome: (chrome: ChromeInsets) => void,
): () => void {
  let stopped = false;
  let mo: MutationObserver | null = null;
  let ro: ResizeObserver | null = null;
  let pollTimer = 0;
  let debounce = 0;
  let lastLayout: ChartLayoutId | null = null;
  let lastCss = "";

  const measureChromeOnly = () => {
    const doc = container.querySelector("iframe")?.contentDocument;
    if (!doc?.documentElement) return;
    onChrome(readChrome(doc));
  };

  const apply = () => {
    if (stopped) return;
    const layout = getLayout();
    const layoutChanged = lastLayout !== null && lastLayout !== layout;
    lastLayout = layout;

    if (layout === "s") {
      if (layoutChanged) clearPrimaryLayoutClip(container);
      measureChromeOnly();
      lastCss = "";
      return;
    }

    const chrome = applyPrimaryLayoutClip(container, layout);
    if (chrome) onChrome(chrome);
    const doc = container.querySelector("iframe")?.contentDocument;
    lastCss = doc?.getElementById(STYLE_ID)?.textContent ?? "";
  };

  const schedule = () => {
    window.clearTimeout(debounce);
    debounce = window.setTimeout(apply, 48);
  };

  const bindDocObservers = () => {
    mo?.disconnect();
    ro?.disconnect();
    if (getLayout() === "s") return false;

    const doc = container.querySelector("iframe")?.contentDocument;
    if (!doc?.body) return false;

    mo = new MutationObserver(() => {
      // Only re-apply if TV wiped our stylesheet or restyled the center box.
      const styleEl = doc.getElementById(STYLE_ID);
      if (!styleEl || styleEl.textContent !== lastCss) schedule();
    });
    const center = doc.querySelector(".layout__area--center");
    if (center) {
      mo.observe(center, { attributes: true, attributeFilter: ["style"] });
    }
    mo.observe(doc.head, { childList: true });

    ro = new ResizeObserver(schedule);
    ro.observe(container);
    return true;
  };

  apply();
  bindDocObservers();

  let tries = 0;
  pollTimer = window.setInterval(() => {
    tries += 1;
    apply();
    const ok = bindDocObservers();
    const layout = getLayout();
    const doc = container.querySelector("iframe")?.contentDocument;
    const clipReady = layout === "s" || Boolean(doc?.getElementById(STYLE_ID)?.textContent);
    if ((ok && clipReady) || tries > 24) {
      window.clearInterval(pollTimer);
      pollTimer = 0;
    }
  }, 400);

  return () => {
    stopped = true;
    window.clearTimeout(debounce);
    if (pollTimer) window.clearInterval(pollTimer);
    mo?.disconnect();
    ro?.disconnect();
  };
}
