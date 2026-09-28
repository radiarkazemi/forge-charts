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

const DEFAULT_CHROME: ChromeInsets = { headerHeight: 38, leftToolbarWidth: 52 };
const STYLE_ID = "forge-primary-layout-clip";

export function contentSlotsFor(layout: ChartLayoutId): readonly ContentSlot[] {
  return SLOTS[layout] ?? SLOTS.s;
}

/** Pixel rect of a pane inside the full workspace (primary widget bounds). */
export function paneRectInWorkspace(
  layout: ChartLayoutId,
  paneIndex: number,
  workspace: { width: number; height: number },
  chrome: ChromeInsets = DEFAULT_CHROME,
  gap = 2,
): PaneRectPx | null {
  const slots = contentSlotsFor(layout);
  const slot = slots[paneIndex];
  if (!slot || workspace.width <= 0 || workspace.height <= 0) return null;

  const contentW = Math.max(0, workspace.width - chrome.leftToolbarWidth);
  const contentH = Math.max(0, workspace.height - chrome.headerHeight);
  const left = chrome.leftToolbarWidth + slot.x * contentW + (slot.x > 0 ? gap / 2 : 0);
  const top = chrome.headerHeight + slot.y * contentH + (slot.y > 0 ? gap / 2 : 0);
  const width = slot.w * contentW - (slot.x > 0 ? gap / 2 : 0) - (slot.x + slot.w < 1 ? gap / 2 : 0);
  const height = slot.h * contentH - (slot.y > 0 ? gap / 2 : 0) - (slot.y + slot.h < 1 ? gap / 2 : 0);

  return {
    left: Math.round(left),
    top: Math.round(top),
    width: Math.max(0, Math.round(width)),
    height: Math.max(0, Math.round(height)),
  };
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
  const width = slot.w * contentW;
  const height = slot.h * contentH;
  if (width < 16 || height < 16) return null;

  let styleEl = doc.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = doc.createElement("style");
    styleEl.id = STYLE_ID;
    doc.head.appendChild(styleEl);
  }
  const next = `
    .layout__area--center {
      left: ${left}px !important;
      top: ${top}px !important;
      width: ${width}px !important;
      height: ${height}px !important;
      right: auto !important;
      bottom: auto !important;
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
    // Ask CL to reflow now that our !important overrides are gone.
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
      // Only clear when leaving a multi layout — never strip TV styles on boot.
      if (layoutChanged) clearPrimaryLayoutClip(container);
      measureChromeOnly();
      return;
    }

    const chrome = applyPrimaryLayoutClip(container, layout);
    if (chrome) onChrome(chrome);
  };

  const schedule = () => {
    window.clearTimeout(debounce);
    debounce = window.setTimeout(apply, 32);
  };

  const bindDocObservers = () => {
    mo?.disconnect();
    ro?.disconnect();
    if (getLayout() === "s") return false;

    const doc = container.querySelector("iframe")?.contentDocument;
    if (!doc?.body) return false;

    // Re-apply clip if TV rewrites layout area geometry; do not observe every style tick.
    mo = new MutationObserver(schedule);
    const center = doc.querySelector(".layout__area--center");
    if (center) {
      mo.observe(center, { attributes: true, attributeFilter: ["style"] });
    }

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
    bindDocObservers();
    const layout = getLayout();
    const doc = container.querySelector("iframe")?.contentDocument;
    const centerReady = Boolean(doc?.querySelector(".layout__area--center"));
    const clipReady = layout === "s" || Boolean(doc?.getElementById(STYLE_ID)?.textContent);
    if ((centerReady && clipReady) || tries > 60) {
      window.clearInterval(pollTimer);
      pollTimer = 0;
    }
  }, 250);

  return () => {
    stopped = true;
    window.clearTimeout(debounce);
    if (pollTimer) window.clearInterval(pollTimer);
    mo?.disconnect();
    ro?.disconnect();
  };
}
