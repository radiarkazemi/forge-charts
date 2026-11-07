/**
 * Force the Forge Indicators dialog whenever Charting Library tries to open
 * its native “Indicators” / SCRIPT NAME list (header button, shortcuts, etc.).
 */

import type { IChartingLibraryWidget } from "@/infrastructure/tradingview";

const FORGE_OPEN = "forge:open-indicators";

let allowNativeUntil = 0;
let lastForgeOpenAt = 0;

/** Permit the next native Indicators dialog (used by “Full library…”). */
export function allowNativeIndicatorsOnce(ms = 5_000): void {
  allowNativeUntil = Date.now() + ms;
  try {
    document.body.classList.add("forge-allow-native-indicators");
    window.setTimeout(() => {
      document.body.classList.remove("forge-allow-native-indicators");
      try {
        const iframe = document.querySelector("iframe") as HTMLIFrameElement | null;
        iframe?.contentDocument?.body?.classList.remove("forge-allow-native-indicators");
      } catch {
        /* ignore */
      }
    }, ms);
    const iframe = document.querySelector("iframe") as HTMLIFrameElement | null;
    iframe?.contentDocument?.body?.classList.add("forge-allow-native-indicators");
  } catch {
    /* ignore */
  }
}

function forgeOpenAllowed(): boolean {
  return Date.now() >= allowNativeUntil;
}

function openForge(): void {
  const now = Date.now();
  if (now - lastForgeOpenAt < 250) return;
  lastForgeOpenAt = now;
  try {
    document.body.classList.add("forge-indicators-picker-open");
    const iframe = document.querySelector("iframe") as HTMLIFrameElement | null;
    iframe?.contentDocument?.body?.classList.add("forge-indicators-picker-open");
  } catch {
    /* ignore */
  }
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
  if (!el || !(el instanceof Element)) return false;
  let node: Element | null = el;
  for (let i = 0; i < 8 && node; i += 1) {
    if (!(node instanceof HTMLElement)) {
      node = node.parentElement;
      continue;
    }
    const dataName = (node.getAttribute("data-name") || "").toLowerCase();
    const id = (node.id || "").toLowerCase();
    const title = (
      node.getAttribute("title") ||
      node.getAttribute("aria-label") ||
      node.getAttribute("data-tooltip") ||
      ""
    ).trim();
    const text = (node.textContent || "").replace(/\s+/g, " ").trim().slice(0, 40);

    if (
      dataName === "open-indicators-dialog" ||
      dataName === "insert-indicator" ||
      dataName === "indicators" ||
      dataName.includes("indicator")
    ) {
      return true;
    }
    if (id.includes("indicator")) return true;
    if (/indicators?/i.test(title) && !/template/i.test(title)) return true;
    if (/^indicators?$/i.test(text) && (node.tagName === "BUTTON" || node.getAttribute("role") === "button")) {
      return true;
    }
    node = node.parentElement;
  }
  return false;
}

function looksLikeNativeIndicatorsDialog(root: Element): boolean {
  const name = (root.getAttribute("data-name") || "").toLowerCase();
  const dialogName = (root.getAttribute("data-dialog-name") || "").toLowerCase();
  if (name.includes("indicators-dialog") || name === "indicators") return true;
  if (dialogName.includes("indicator")) return true;
  const text = (root.textContent || "").slice(0, 1200);
  if (/SCRIPT NAME/i.test(text) && /\bIndicators\b/i.test(text)) return true;
  return false;
}

function hideElement(el: HTMLElement): void {
  el.style.setProperty("display", "none", "important");
  el.style.setProperty("visibility", "hidden", "important");
  el.style.setProperty("opacity", "0", "important");
  el.style.setProperty("pointer-events", "none", "important");
  el.style.setProperty("width", "0", "important");
  el.style.setProperty("height", "0", "important");
  el.style.setProperty("overflow", "hidden", "important");
  el.setAttribute("aria-hidden", "true");
  el.setAttribute("data-forge-suppressed", "1");
}

function hideNativeDialog(doc: Document, node: Element): void {
  try {
    // Hide the matched node and climb to the outer CL dialog chrome so we
    // never leave an empty white shell on the chart.
    let cur: HTMLElement | null = node as HTMLElement;
    for (let i = 0; i < 6 && cur; i += 1) {
      hideElement(cur);
      const cls = cur.className?.toString?.() ?? "";
      const role = cur.getAttribute("role") || "";
      const dataName = cur.getAttribute("data-name") || "";
      if (
        role === "dialog" ||
        /tv-dialog|dialog-overlay|modal/i.test(cls) ||
        /dialog/i.test(dataName)
      ) {
        break;
      }
      cur = cur.parentElement;
    }
    // Also hide common overlay siblings behind the dialog.
    const overlays = doc.querySelectorAll<HTMLElement>(
      '[class*="overlay"], [class*="backdrop"], [class*="dimmer"], [data-name*="overlay"]',
    );
    for (const o of overlays) {
      if (o.getAttribute("data-forge-suppressed") === "1") continue;
      // Only kill overlays that appeared with the indicators dialog (large full-screen).
      const r = o.getBoundingClientRect();
      if (r.width > 200 && r.height > 200) hideElement(o);
    }
  } catch {
    /* ignore */
  }
  try {
    const closeBtn = node.querySelector<HTMLElement>(
      'button[aria-label="Close"], button[title="Close"], [data-name="close"], [class*="close"]',
    );
    closeBtn?.click();
  } catch {
    /* ignore */
  }
}

type ExecFn = (id: string, ...rest: unknown[]) => unknown;

const patchedCharts = new WeakSet<object>();

function patchExecuteAction(chart: object): void {
  if (patchedCharts.has(chart)) return;
  const rec = chart as { executeActionById?: ExecFn };
  if (typeof rec.executeActionById !== "function") return;
  const original = rec.executeActionById.bind(chart);
  rec.executeActionById = ((id: string, ...rest: unknown[]) => {
    if (isIndicatorsAction(String(id)) && forgeOpenAllowed()) {
      openForge();
      return undefined;
    }
    return original(id, ...rest);
  }) as ExecFn;
  patchedCharts.add(chart);
}

/**
 * Install intercepts on a Charting Library widget. Returns disposer.
 */
export function mountIndicatorsIntercept(widget: IChartingLibraryWidget): () => void {
  let disposed = false;
  let mo: MutationObserver | null = null;
  let poll = 0;
  let attachedDoc: Document | null = null;

  const suppressNative = (doc: Document) => {
    if (disposed || !forgeOpenAllowed()) return;
    const candidates = Array.from(
      doc.querySelectorAll<HTMLElement>(
        '[data-name="indicators-dialog"], [data-dialog-name*="Indicator"], [data-dialog-name*="indicator"], [role="dialog"], [class*="dialog"], [class*="modal"]',
      ),
    );
    let hit = false;
    for (const el of candidates) {
      if (el.getAttribute("data-forge-suppressed") === "1") continue;
      if (!looksLikeNativeIndicatorsDialog(el)) continue;
      const style = doc.defaultView?.getComputedStyle(el);
      if (style && style.display === "none") continue;
      hideNativeDialog(doc, el);
      hit = true;
    }
    if (hit) openForge();
  };

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
    // Kill native dialog if it still races open.
    window.setTimeout(() => {
      if (attachedDoc) suppressNative(attachedDoc);
    }, 0);
    window.setTimeout(() => {
      if (attachedDoc) suppressNative(attachedDoc);
    }, 80);
    window.setTimeout(() => {
      if (attachedDoc) suppressNative(attachedDoc);
    }, 200);
  };

  const attachDoc = (doc: Document) => {
    if (disposed) return;
    if (attachedDoc === doc) return;
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

    mo = new MutationObserver(() => suppressNative(doc));
    mo.observe(doc.body || doc.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style", "data-name"],
    });
  };

  const tick = () => {
    if (disposed) return;
    try {
      const chart = widget.activeChart?.() as object | null;
      if (chart) patchExecuteAction(chart);
    } catch {
      /* chart not ready */
    }
    try {
      // Some builds expose executeActionById on the widget itself.
      patchExecuteAction(widget as unknown as object);
    } catch {
      /* ignore */
    }
    try {
      const iframe = (widget as unknown as { _iFrame?: HTMLIFrameElement })._iFrame;
      const doc = iframe?.contentDocument;
      if (doc?.body) {
        attachDoc(doc);
        if (forgeOpenAllowed()) suppressNative(doc);
      }
    } catch {
      /* ignore */
    }
  };

  tick();
  for (const d of [100, 300, 700, 1500, 3000, 6000]) {
    window.setTimeout(tick, d);
  }
  poll = window.setInterval(tick, 4_000);

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
