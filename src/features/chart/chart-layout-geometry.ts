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

function setImportant(el: HTMLElement, prop: string, value: string): void {
  el.style.setProperty(prop, value, "important");
}

function readChrome(doc: Document): ChromeInsets {
  const topEl = doc.querySelector(".layout__area--top") as HTMLElement | null;
  const leftEl = doc.querySelector(".layout__area--left") as HTMLElement | null;
  return {
    headerHeight: topEl?.offsetHeight || DEFAULT_CHROME.headerHeight,
    leftToolbarWidth: leftEl?.offsetWidth ?? 0,
  };
}

/**
 * Constrain the primary Charting Library plot to pane 0 so the original
 * top navbar stays full-width while secondary layers sit beside/under it.
 * Returns null when the iframe / layout DOM is not ready yet.
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
  const bottomEl = doc.querySelector(".layout__area--bottom") as HTMLElement | null;
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

  // CSS sheet (survives some TV recalculations) + inline !important (wins immediately).
  let styleEl = doc.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = doc.createElement("style");
    styleEl.id = STYLE_ID;
    doc.head.appendChild(styleEl);
  }
  styleEl.textContent = `
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

  setImportant(centerEl, "left", `${left}px`);
  setImportant(centerEl, "top", `${top}px`);
  setImportant(centerEl, "width", `${width}px`);
  setImportant(centerEl, "height", `${height}px`);
  setImportant(centerEl, "right", "auto");
  setImportant(centerEl, "bottom", "auto");

  if (bottomEl) {
    setImportant(bottomEl, "left", `${left}px`);
    setImportant(bottomEl, "width", `${width}px`);
    setImportant(bottomEl, "right", "auto");
  }

  return chrome;
}

export function clearPrimaryLayoutClip(container: HTMLElement): void {
  try {
    const doc = container.querySelector("iframe")?.contentDocument;
    if (!doc) return;
    doc.getElementById(STYLE_ID)?.remove();
    const centerEl = doc.querySelector(".layout__area--center") as HTMLElement | null;
    const bottomEl = doc.querySelector(".layout__area--bottom") as HTMLElement | null;
    for (const el of [centerEl, bottomEl]) {
      if (!el) continue;
      for (const prop of ["left", "top", "width", "height", "right", "bottom"]) {
        el.style.removeProperty(prop);
      }
    }
  } catch {
    /* ignore */
  }
}

/**
 * Keep the primary plot clipped for as long as `layout` is multi-pane.
 * Retries until the CL iframe layout areas exist, then re-applies on resize
 * and when TradingView overwrites inline styles.
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

  const apply = () => {
    if (stopped) return;
    const layout = getLayout();
    if (layout === "s") {
      clearPrimaryLayoutClip(container);
      onChrome(DEFAULT_CHROME);
      return;
    }
    const chrome = applyPrimaryLayoutClip(container, layout);
    if (chrome) onChrome(chrome);
  };

  const schedule = () => {
    window.clearTimeout(debounce);
    debounce = window.setTimeout(apply, 16);
  };

  const bindDocObservers = () => {
    mo?.disconnect();
    ro?.disconnect();
    const doc = container.querySelector("iframe")?.contentDocument;
    if (!doc?.body) return false;

    mo = new MutationObserver(schedule);
    mo.observe(doc.body, {
      attributes: true,
      attributeFilter: ["style", "class"],
      subtree: true,
      childList: true,
    });

    ro = new ResizeObserver(schedule);
    ro.observe(container);
    const center = doc.querySelector(".layout__area--center");
    if (center) ro.observe(center);
    return true;
  };

  apply();
  bindDocObservers();

  // Poll until layout DOM is ready (CL iframe mounts asynchronously).
  let tries = 0;
  pollTimer = window.setInterval(() => {
    tries += 1;
    apply();
    bindDocObservers();
    const doc = container.querySelector("iframe")?.contentDocument;
    const ready = Boolean(doc?.querySelector(".layout__area--center") && doc.getElementById(STYLE_ID)?.textContent);
    if (ready || tries > 60) {
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
