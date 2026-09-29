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

  // Primary plot is clipped to its full slot with the price axis pinned on the
  // slot’s trailing edge — neighbors only need a hairline gap, not a second
  // axis-width gutter (that was leaving a dead black band between panes).
  const leftPad = slot.x > 0 ? PANE_GAP : 0;
  const topPad = slot.y > 0 ? PANE_GAP : 0;
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
 * CL still lays out the chart table at full iframe width even when
 * `.layout__area--center` is clipped. Pin each real price-axis column to the
 * clipped pane’s right edge so the left layer keeps a usable y-scale.
 */
function pinPrimaryPriceAxes(doc: Document): void {
  const center = doc.querySelector(".layout__area--center") as HTMLElement | null;
  if (!center) return;
  const cr = center.getBoundingClientRect();
  if (cr.width < 32) return;

  const axes = doc.querySelectorAll<HTMLElement>(".chart-markup-table.price-axis-container");
  for (const main of axes) {
    // Skip empty left stubs and time-axis corner cells.
    if (main.offsetHeight < 40 || main.offsetWidth < 20) {
      if (main.dataset.forgeAxisPin) {
        main.style.removeProperty("transform");
        main.style.removeProperty("z-index");
        main.style.removeProperty("background");
        delete main.dataset.forgeAxisPin;
      }
      continue;
    }

    const cs = doc.defaultView?.getComputedStyle(main);
    let currentTx = 0;
    const t = cs?.transform;
    if (t && t !== "none") {
      const m = t.match(/matrix\(([^)]+)\)/);
      const parts = m?.[1]?.split(",") ?? [];
      currentTx = parseFloat(parts[4] ?? "0") || 0;
    }

    const mr = main.getBoundingClientRect();
    const naturalLeft = mr.left - currentTx;
    const dx = Math.round(cr.right - mr.width - naturalLeft);
    if (Math.abs(dx - currentTx) < 0.5 && main.dataset.forgeAxisPin === "1") continue;

    main.style.setProperty("transform", `translateX(${dx}px)`, "important");
    main.style.setProperty("z-index", "30", "important");
    main.style.setProperty("background", "var(--tv-color-platform-background, #131722)", "important");
    main.dataset.forgeAxisPin = "1";
  }
}

function clearPrimaryPriceAxisPins(doc: Document | null | undefined): void {
  if (!doc) return;
  for (const main of doc.querySelectorAll<HTMLElement>(".chart-markup-table.price-axis-container")) {
    if (!main.dataset.forgeAxisPin) continue;
    main.style.removeProperty("transform");
    main.style.removeProperty("z-index");
    main.style.removeProperty("background");
    delete main.dataset.forgeAxisPin;
  }
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
  // Full slot width — price axis is pinned to this edge (see pinPrimaryPriceAxes).
  // Secondary layers use a left pad so they don’t cover the pinned scale.
  const width = slot.w * contentW;
  const height = slot.h * contentH - (slot.y + slot.h < 1 ? PANE_GAP : 0);
  if (width < 16 || height < 16) return null;

  // Iframe element must stay see-through so raised z-index for header menus
  // does not paint a solid sheet over secondary layers.
  try {
    iframe?.style.setProperty("background", "transparent", "important");
    iframe?.setAttribute("allowtransparency", "true");
  } catch {
    /* ignore */
  }

  let styleEl = doc.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = doc.createElement("style");
    styleEl.id = STYLE_ID;
    doc.head.appendChild(styleEl);
  }
  // Transparent shell + overflow clip: CL’s chart-container stays ~full width
  // internally; without overflow:hidden it bleeds into the secondary slot when
  // the primary host is raised above layers for open header menus.
  const next = `
    html, body {
      background: transparent !important;
    }
    .js-rootresizer__contents,
    .layout-with-border-radius {
      background: transparent !important;
    }
    .layout__area--center {
      left: ${left}px !important;
      top: ${top}px !important;
      width: ${width}px !important;
      height: ${height}px !important;
      right: auto !important;
      bottom: auto !important;
      overflow: hidden !important;
      background-color: var(--tv-color-platform-background, #131722) !important;
    }
    .layout__area--center .chart-container-border {
      background-color: transparent !important;
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
  if (styleEl.textContent !== next) {
    styleEl.textContent = next;
  }

  pinPrimaryPriceAxes(doc);

  return {
    ...chrome,
    // Prefer the real pinned axis width so secondary left-pad clears it.
    priceAxisWidth: readPriceAxisWidth(doc, chrome.priceAxisWidth),
  };
}

/** Remove only our clip stylesheet — leave TradingView inline layout alone. */
export function clearPrimaryLayoutClip(container: HTMLElement): void {
  try {
    const iframe = container.querySelector("iframe");
    const doc = iframe?.contentDocument;
    clearPrimaryPriceAxisPins(doc);
    doc?.getElementById(STYLE_ID)?.remove();
    // Multi-pane forced the iframe transparent; restore for single-pane fill.
    try {
      iframe?.style.removeProperty("background");
    } catch {
      /* ignore */
    }
    try {
      iframe?.contentWindow?.dispatchEvent(new Event("resize"));
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new Event("resize"));
  } catch {
    /* ignore */
  }
}

/** Menu/dialog hole in parent (workspace) coordinates — punch through secondary layers. */
export interface MenuHoleRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface PrimaryMenuState {
  readonly open: boolean;
  /** Bounding box of the open header menu/dialog in workspace/page coords. */
  readonly hole: MenuHoleRect | null;
}

/**
 * Watch the primary CL iframe for open header menus (layout picker, etc.).
 * Left-toolbar drawing flyouts are ignored — they must not affect layers.
 *
 * Important: never raise the primary iframe above secondary panes. Iframe
 * transparency does not reveal sibling layers underneath — that paints the
 * workspace background (black flash). Instead we report a hole rect so
 * secondaries can clip-path around the menu while staying visually on top.
 */
export function watchPrimaryMenusOpen(
  container: HTMLElement,
  onChange: (state: PrimaryMenuState) => void,
): () => void {
  let stopped = false;
  let mo: MutationObserver | null = null;
  let lastKey = "";
  let poll = 0;
  let debounce = 0;
  let boundDoc: Document | null = null;

  const isDrawingChrome = (el: Element): boolean => {
    if (el.closest(".layout__area--left")) return true;
    if (
      el.closest(
        [
          ".drawing-toolbar",
          "[class*='drawingToolbar']",
          "[class*='drawing-toolbar']",
          "[class*='floating-toolbar']",
          "[class*='floatingToolbar']",
          "[data-name='drawing-toolbar']",
          "[class*='toolbox']",
          "[class*='Toolbar'][class*='drawing']",
        ].join(","),
      )
    ) {
      return true;
    }
    const name = (el.getAttribute("data-name") || "").toLowerCase();
    if (name.includes("drawing") || name.includes("line-tool") || name.includes("linetool")) return true;
    return false;
  };

  const isHeaderMenu = (el: Element): boolean => !isDrawingChrome(el);

  const visibleBox = (node: Element, doc: Document): DOMRect | null => {
    const style = doc.defaultView?.getComputedStyle(node);
    if (style && (style.display === "none" || style.visibility === "hidden" || style.opacity === "0")) {
      return null;
    }
    const r = node.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) return null;
    return r;
  };

  const check = () => {
    if (stopped) return;
    const iframe = container.querySelector("iframe");
    const doc = iframe?.contentDocument;
    if (!doc || !iframe) return;

    const candidates: Element[] = [
      ...doc.querySelectorAll(
        [
          '[class*="menuWrap"]',
          '[class*="menuBox"]',
          '[data-name="menu-inner"]',
          '[class*="popupMenu"]',
          '[role="menu"]',
          '[data-name="layout-menu"]',
          '[class*="context-menu"]',
          '[data-name="indicators-dialog"]',
          '[data-name="symbol-search-items-dialog"]',
          '[role="dialog"]',
        ].join(","),
      ),
    ];

    let best: DOMRect | null = null;
    for (const node of candidates) {
      if (!isHeaderMenu(node)) continue;
      const r = visibleBox(node, doc);
      if (!r) continue;
      if (!best || r.width * r.height > best.width * best.height) best = r;
    }

    const open = Boolean(best);
    let hole: MenuHoleRect | null = null;
    if (best) {
      const ir = iframe.getBoundingClientRect();
      // Pad so shadows / submenu edges aren’t clipped.
      const pad = 6;
      hole = {
        left: Math.round(ir.left + best.left - pad),
        top: Math.round(ir.top + best.top - pad),
        width: Math.round(best.width + pad * 2),
        height: Math.round(best.height + pad * 2),
      };
    }

    const key = open
      ? `1:${hole?.left}:${hole?.top}:${hole?.width}:${hole?.height}`
      : "0";
    if (key === lastKey) return;
    lastKey = key;
    onChange({ open, hole });
  };

  const scheduleCheck = () => {
    window.clearTimeout(debounce);
    debounce = window.setTimeout(check, 80);
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

/** CSS clip-path that keeps a layer visible except for a rectangular hole. */
export function clipPathExcludingHole(
  layer: { left: number; top: number; width: number; height: number },
  hole: MenuHoleRect | null,
): string | undefined {
  if (!hole || layer.width < 8 || layer.height < 8) return undefined;
  const hl = hole.left - layer.left;
  const ht = hole.top - layer.top;
  const hr = hl + hole.width;
  const hb = ht + hole.height;
  // No overlap — nothing to punch.
  if (hr <= 0 || hb <= 0 || hl >= layer.width || ht >= layer.height) return undefined;
  const l = Math.max(0, hl);
  const t = Math.max(0, ht);
  const r = Math.min(layer.width, hr);
  const b = Math.min(layer.height, hb);
  if (r - l < 4 || b - t < 4) return undefined;
  // evenodd: outer ring minus inner hole (coords relative to the layer box).
  return `polygon(evenodd, 0px 0px, ${layer.width}px 0px, ${layer.width}px ${layer.height}px, 0px ${layer.height}px, 0px 0px, ${l}px ${t}px, ${l}px ${b}px, ${r}px ${b}px, ${r}px ${t}px, ${l}px ${t}px)`;
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
  let pinTimer = 0;
  let debounce = 0;
  let lastCss = "";

  const measureChromeOnly = () => {
    const doc = container.querySelector("iframe")?.contentDocument;
    if (!doc?.documentElement) return;
    onChrome(readChrome(doc));
  };

  const apply = () => {
    if (stopped) return;
    const layout = getLayout();

    if (layout === "s") {
      // Always clear — effect remounts reset lastLayout to null, so a
      // “layoutChanged” guard would leave the half-width clip stuck on.
      clearPrimaryLayoutClip(container);
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
    debounce = window.setTimeout(apply, 64);
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

  // Light pin keep-alive — CL occasionally rebuilds axis nodes after tool/layout UI.
  // Avoid rAF; 500ms is enough and much cheaper for multi-pane.
  pinTimer = window.setInterval(() => {
    if (stopped || getLayout() === "s") return;
    const doc = container.querySelector("iframe")?.contentDocument;
    if (!doc?.getElementById(STYLE_ID)) return;
    pinPrimaryPriceAxes(doc);
  }, 500);

  return () => {
    stopped = true;
    window.clearTimeout(debounce);
    if (pollTimer) window.clearInterval(pollTimer);
    if (pinTimer) window.clearInterval(pinTimer);
    mo?.disconnect();
    ro?.disconnect();
    // Tear-down while switching to single-pane must drop the clip immediately
    // (the replacement mount may start with lastLayout=null and layout "s").
    if (getLayout() === "s") clearPrimaryLayoutClip(container);
  };
}
