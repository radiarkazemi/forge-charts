/**
 * Force the Forge Indicators dialog whenever Charting Library tries to open
 * its native “Indicators” list (header button, shortcuts, legend +, etc.).
 *
 * Layers:
 * 1. Patch chart.executeActionById("insertIndicator")
 * 2. Capture-phase click/pointerdown on the iframe for Indicators controls
 * 3. MutationObserver: if native dialog still appears, close it and open Forge
 */

import type { IChartingLibraryWidget } from "@/infrastructure/tradingview";

const FORGE_OPEN = "forge:open-indicators";
const NATIVE_ALLOW = "forge:allow-native-indicators";

let allowNativeUntil = 0;

/** Permit the next native Indicators dialog (used by “Full library…”). */
export function allowNativeIndicatorsOnce(ms = 4_000): void {
  allowNativeUntil = Date.now() + ms;
  try {
    window.dispatchEvent(new CustomEvent(NATIVE_ALLOW));
  } catch {
    /* ignore */
  }
}

function forgeOpenAllowed(): boolean {
  return Date.now() >= allowNativeUntil;
}

function openForge(): void {
  try {
    window.dispatchEvent(new CustomEvent(FORGE_OPEN));
  } catch {
    /* ignore */
  }
}

function isIndicatorsAction(id: string): boolean {
  const t = id.trim().toLowerCase();
  return (
    t === "insertindicator" ||
    t === "insertindicators" ||
    t === "indicators" ||
    t === "openindicators" ||
    t.includes("insertindicator")
  );
}

function isIndicatorsControl(el: Element | null): boolean {
  if (!el || !(el instanceof HTMLElement)) return false;
  const btn = el.closest(
    "button, [role='button'], a, div[data-name], span[data-name]",
  ) as HTMLElement | null;
  if (!btn) return false;
  const dataName = (btn.getAttribute("data-name") || "").toLowerCase();
  const id = (btn.id || "").toLowerCase();
  const title = (
    btn.getAttribute("title") ||
    btn.getAttribute("aria-label") ||
    ""
  ).trim();
  const text = (btn.textContent || "").replace(/\s+/g, " ").trim();

  if (dataName === "open-indicators-dialog" || dataName === "insert-indicator") return true;
  if (id.includes("indicator")) return true;
  if (/^indicators?(&\s*strategies)?$/i.test(title)) return true;
  if (/^indicators?$/i.test(text) && btn.tagName === "BUTTON") return true;
  // fx / indicators glyph often has data-tooltip
  const tip = (btn.getAttribute("data-tooltip") || "").toLowerCase();
  if (tip.includes("indicator")) return true;
  return false;
}

function looksLikeNativeIndicatorsDialog(root: Element): boolean {
  const name = (root.getAttribute("data-name") || "").toLowerCase();
  const dialogName = (root.getAttribute("data-dialog-name") || "").toLowerCase();
  if (name.includes("indicators-dialog") || name === "indicators") return true;
  if (dialogName.includes("indicator")) return true;
  const text = (root.textContent || "").slice(0, 800);
  // Compact CL dialog: title "Indicators" + column "SCRIPT NAME"
  if (/SCRIPT NAME/i.test(text) && /\bIndicators\b/i.test(text)) return true;
  return false;
}

function closeNativeDialog(doc: Document, node: Element): void {
  try {
    const closeBtn =
      node.querySelector<HTMLElement>(
        'button[aria-label="Close"], button[title="Close"], [data-name="close"], .close-button',
      ) ?? null;
    closeBtn?.click();
  } catch {
    /* ignore */
  }
  try {
    // Escape often dismisses CL dialogs
    doc.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  } catch {
    /* ignore */
  }
  try {
    (node as HTMLElement).style.display = "none";
    (node as HTMLElement).setAttribute("aria-hidden", "true");
  } catch {
    /* ignore */
  }
}

type ExecFn = (id: string, ...rest: unknown[]) => unknown;

function patchExecuteAction(chart: {
  executeActionById?: ExecFn;
  __forgeIndPatched?: boolean;
}): void {
  if (!chart?.executeActionById || chart.__forgeIndPatched) return;
  const original = chart.executeActionById.bind(chart);
  chart.executeActionById = ((id: string, ...rest: unknown[]) => {
    if (isIndicatorsAction(String(id)) && forgeOpenAllowed()) {
      openForge();
      return;
    }
    return original(id, ...rest);
  }) as ExecFn;
  chart.__forgeIndPatched = true;
}

/**
 * Install intercepts on a Charting Library widget. Returns disposer.
 */
export function mountIndicatorsIntercept(widget: IChartingLibraryWidget): () => void {
  let disposed = false;
  let mo: MutationObserver | null = null;
  let poll = 0;
  let attachedDoc: Document | null = null;

  const onPointer = (event: Event) => {
    if (disposed || !forgeOpenAllowed()) return;
    const raw = event.target;
    if (!(raw instanceof Element)) return;
    if (!isIndicatorsControl(raw)) return;
    event.preventDefault();
    event.stopPropagation();
    if (typeof (event as Event & { stopImmediatePropagation?: () => void }).stopImmediatePropagation === "function") {
      (event as Event & { stopImmediatePropagation: () => void }).stopImmediatePropagation();
    }
    openForge();
  };

  const scanNativeDialog = (doc: Document) => {
    if (disposed || !forgeOpenAllowed()) return;
    const candidates = Array.from(
      doc.querySelectorAll<HTMLElement>(
        '[data-name="indicators-dialog"], [data-dialog-name*="Indicator"], [data-dialog-name*="indicator"], [role="dialog"], [class*="dialog"]',
      ),
    );
    for (const el of candidates) {
      if (!looksLikeNativeIndicatorsDialog(el)) continue;
      // Visible?
      const style = doc.defaultView?.getComputedStyle(el);
      if (style && (style.display === "none" || style.visibility === "hidden")) continue;
      closeNativeDialog(doc, el);
      openForge();
      break;
    }
  };

  const attachDoc = (doc: Document) => {
    if (disposed || attachedDoc === doc) return;
    if (attachedDoc) {
      attachedDoc.removeEventListener("click", onPointer, true);
      attachedDoc.removeEventListener("pointerdown", onPointer, true);
      attachedDoc.removeEventListener("mousedown", onPointer, true);
      mo?.disconnect();
      mo = null;
    }
    attachedDoc = doc;
    doc.addEventListener("click", onPointer, true);
    doc.addEventListener("pointerdown", onPointer, true);
    doc.addEventListener("mousedown", onPointer, true);

    mo = new MutationObserver(() => scanNativeDialog(doc));
    mo.observe(doc.body || doc.documentElement, { childList: true, subtree: true });
  };

  const tick = () => {
    if (disposed) return;
    try {
      const chart = widget.activeChart?.() as
        | { executeActionById?: ExecFn; __forgeIndPatched?: boolean }
        | null;
      if (chart) patchExecuteAction(chart);
    } catch {
      /* chart not ready */
    }
    try {
      const iframe = (widget as unknown as { _iFrame?: HTMLIFrameElement })._iFrame;
      const doc = iframe?.contentDocument;
      if (doc?.body) attachDoc(doc);
    } catch {
      /* ignore */
    }
  };

  tick();
  // Chart ready / header paint is async — keep trying briefly.
  const delays = [200, 600, 1200, 2500, 5000];
  for (const d of delays) {
    window.setTimeout(tick, d);
  }
  poll = window.setInterval(tick, 8_000);

  // Also listen on host document (some shells render toolbar outside iframe).
  const hostPointer = (event: Event) => {
    if (disposed || !forgeOpenAllowed()) return;
    const raw = event.target;
    if (!(raw instanceof Element)) return;
    if (!isIndicatorsControl(raw)) return;
    event.preventDefault();
    event.stopPropagation();
    openForge();
  };
  document.addEventListener("click", hostPointer, true);
  document.addEventListener("pointerdown", hostPointer, true);

  return () => {
    disposed = true;
    window.clearInterval(poll);
    document.removeEventListener("click", hostPointer, true);
    document.removeEventListener("pointerdown", hostPointer, true);
    if (attachedDoc) {
      attachedDoc.removeEventListener("click", onPointer, true);
      attachedDoc.removeEventListener("pointerdown", onPointer, true);
      attachedDoc.removeEventListener("mousedown", onPointer, true);
    }
    mo?.disconnect();
    mo = null;
    attachedDoc = null;
  };
}
