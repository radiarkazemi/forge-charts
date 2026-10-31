/**
 * Inject Forge brand mark into the Charting Library iframe (bottom-left of the
 * chart pane — same slot as TradingView / Faraz widget logo).
 */

import type { IChartingLibraryWidget } from "@/infrastructure/tradingview";

const HOST_ATTR = "data-forge-chart-logo";

const MARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="18" height="18" aria-hidden="true"><g transform="skewX(-12) translate(5 0)" fill="currentColor"><path d="M12 10h14l-8 44H4z"/><path d="M26 10h30l-5 14H21z"/><path d="M23 32h24l-5 14H18z"/></g></svg>`;

function ensureStyle(doc: Document): void {
  if (doc.getElementById("forge-chart-logo-style")) return;
  const style = doc.createElement("style");
  style.id = "forge-chart-logo-style";
  style.textContent = `
a[${HOST_ATTR}] {
  position: absolute;
  left: 10px;
  bottom: 28px;
  z-index: 8;
  display: inline-flex;
  align-items: center;
  height: 26px;
  max-width: 26px;
  padding: 0 4px;
  gap: 0;
  border-radius: 6px;
  text-decoration: none;
  color: inherit;
  opacity: 0.72;
  overflow: hidden;
  pointer-events: auto;
  transition: max-width 0.28s cubic-bezier(0.2, 0.8, 0.2, 1),
    padding 0.28s ease, gap 0.28s ease, opacity 0.15s ease,
    background-color 0.2s ease, box-shadow 0.2s ease;
}
a[${HOST_ATTR}]:hover {
  max-width: 108px;
  gap: 6px;
  padding: 0 9px 0 4px;
  opacity: 1;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 2px 10px rgba(15, 20, 30, 0.12);
}
a[${HOST_ATTR}] .forge-logo-text {
  opacity: 0;
  transform: translateX(-4px);
  white-space: nowrap;
  font: 700 12px/1 "Trebuchet MS", "Segoe UI", sans-serif;
  letter-spacing: 0.02em;
  transition: opacity 0.18s ease 0.04s, transform 0.28s ease;
}
a[${HOST_ATTR}]:hover .forge-logo-text {
  opacity: 1;
  transform: translateX(0);
}
a[${HOST_ATTR}] svg { display: block; flex-shrink: 0; }
`;
  doc.head.appendChild(style);
}

function findPaneHost(doc: Document): HTMLElement | null {
  // Prefer the chart canvas stack (inside the pane), never the page chrome.
  const candidates = [
    doc.querySelector<HTMLElement>(".chart-container"),
    doc.querySelector<HTMLElement>(".chart-gui-wrapper"),
    doc.querySelector<HTMLElement>('[class*="chart-container"]'),
    doc.querySelector<HTMLElement>(".layout__area--center"),
  ];
  for (const el of candidates) {
    if (!el) continue;
    const style = doc.defaultView?.getComputedStyle(el);
    if (style && style.position === "static") {
      el.style.position = "relative";
    }
    return el;
  }
  return null;
}

/** Mount (or re-mount) the Forge logo inside the CL iframe chart pane. */
export function mountForgeChartLogo(widget: IChartingLibraryWidget): () => void {
  let cancelled = false;
  let observer: MutationObserver | null = null;
  let tries = 0;

  const place = () => {
    if (cancelled) return;
    try {
      const iframe = (widget as unknown as { _iFrame?: HTMLIFrameElement })._iFrame;
      const doc = iframe?.contentDocument;
      if (!doc?.body) {
        if (tries++ < 40) window.setTimeout(place, 250);
        return;
      }
      ensureStyle(doc);
      const host = findPaneHost(doc);
      if (!host) {
        if (tries++ < 40) window.setTimeout(place, 250);
        return;
      }
      let link = doc.querySelector<HTMLAnchorElement>(`a[${HOST_ATTR}]`);
      if (!link) {
        link = doc.createElement("a");
        link.setAttribute(HOST_ATTR, "1");
        link.href = "https://forgechart.ir";
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.title = "Forge";
        link.setAttribute("aria-label", "Forge");
        link.innerHTML = `${MARK_SVG}<span class="forge-logo-text">Forge</span>`;
      }
      if (link.parentElement !== host) host.appendChild(link);

      if (!observer) {
        observer = new MutationObserver(() => {
          if (cancelled) return;
          if (!doc.querySelector(`a[${HOST_ATTR}]`)) place();
        });
        observer.observe(doc.body, { childList: true, subtree: true });
      }
    } catch {
      if (tries++ < 40) window.setTimeout(place, 250);
    }
  };

  place();
  window.setTimeout(place, 800);
  window.setTimeout(place, 2_000);

  return () => {
    cancelled = true;
    observer?.disconnect();
    observer = null;
    try {
      const iframe = (widget as unknown as { _iFrame?: HTMLIFrameElement })._iFrame;
      const doc = iframe?.contentDocument;
      doc?.querySelectorAll(`a[${HOST_ATTR}]`).forEach((el) => el.remove());
      doc?.getElementById("forge-chart-logo-style")?.remove();
    } catch {
      /* ignore */
    }
  };
}
