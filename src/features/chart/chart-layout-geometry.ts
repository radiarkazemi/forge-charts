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

/**
 * Constrain the primary Charting Library plot to pane 0 so the original
 * top navbar stays full-width while secondary layers sit beside/under it.
 */
export function applyPrimaryLayoutClip(
  container: HTMLElement,
  layout: ChartLayoutId,
): ChromeInsets {
  const iframe = container.querySelector("iframe");
  const doc = iframe?.contentDocument;
  if (!doc?.documentElement) return DEFAULT_CHROME;

  const topEl = doc.querySelector(".layout__area--top") as HTMLElement | null;
  const leftEl = doc.querySelector(".layout__area--left") as HTMLElement | null;
  const centerEl = doc.querySelector(".layout__area--center") as HTMLElement | null;
  const bottomEl = doc.querySelector(".layout__area--bottom") as HTMLElement | null;

  const headerHeight = topEl?.offsetHeight || DEFAULT_CHROME.headerHeight;
  const leftToolbarWidth = leftEl?.offsetWidth ?? 0;
  const chrome: ChromeInsets = { headerHeight, leftToolbarWidth };

  let styleEl = doc.getElementById("forge-primary-layout-clip") as HTMLStyleElement | null;
  if (layout === "s") {
    styleEl?.remove();
    return chrome;
  }

  if (!styleEl) {
    styleEl = doc.createElement("style");
    styleEl.id = "forge-primary-layout-clip";
    doc.head.appendChild(styleEl);
  }

  const slot = contentSlotsFor(layout)[0];
  if (!slot || !centerEl) return chrome;

  const W = doc.documentElement.clientWidth || container.clientWidth;
  const H = doc.documentElement.clientHeight || container.clientHeight;
  const contentW = Math.max(0, W - leftToolbarWidth);
  const contentH = Math.max(0, H - headerHeight);
  const left = leftToolbarWidth + slot.x * contentW;
  const top = headerHeight + slot.y * contentH;
  const width = slot.w * contentW;
  const height = slot.h * contentH;

  // Keep the original header + left drawing toolbar full-size; clip only the plot.
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
    .layout__area--left {
      top: ${headerHeight}px !important;
      bottom: 0 !important;
    }
  `;

  void bottomEl;
  return chrome;
}

export function clearPrimaryLayoutClip(container: HTMLElement): void {
  try {
    container.querySelector("iframe")?.contentDocument?.getElementById("forge-primary-layout-clip")?.remove();
  } catch {
    /* ignore */
  }
}
