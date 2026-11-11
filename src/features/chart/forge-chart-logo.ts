/**
 * Bottom-left chart mark. Icon only — the geometric F already in the brand
 * sheet (`public/brand/forge-mark-dark.svg`). No wordmark.
 */

import type { IChartingLibraryWidget } from "@/infrastructure/tradingview";

const HOST_ATTR = "data-forge-chart-logo";

/** Codebase mark (light fill) — matches AuthGate / brand sheet lockup. */
const MARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="22" height="22" aria-hidden="true" fill="none"><g transform="skewX(-12) translate(5 0)" fill="currentColor"><path d="M12 10h14l-8 44H4z"/><path d="M26 10h30l-5 14H21z"/><path d="M23 32h24l-5 14H18z"/></g></svg>`;

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
  height: 28px;
  width: 28px;
  padding: 0;
  justify-content: center;
  border-radius: 6px;
  text-decoration: none;
  color: #f5f7fb;
  opacity: 0.88;
  overflow: visible;
  pointer-events: auto;
  transition: opacity 0.15s ease, background-color 0.2s ease, box-shadow 0.2s ease;
}
html.theme-light a[${HOST_ATTR}],
.theme-light a[${HOST_ATTR}] {
  color: #0b0e14;
}
a[${HOST_ATTR}]:hover {
  opacity: 1;
  background: rgba(15, 20, 30, 0.55);
  box-shadow: 0 2px 10px rgba(15, 20, 30, 0.18);
}
html.theme-light a[${HOST_ATTR}]:hover,
.theme-light a[${HOST_ATTR}]:hover {
  background: rgba(255, 255, 255, 0.92);
}
a[${HOST_ATTR}] svg { display: block; flex-shrink: 0; color: inherit; }
`;
  doc.head.appendChild(style);
}

function findPaneHost(doc: Document): HTMLElement | null {
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
        link.removeAttribute("title");
        link.setAttribute("aria-label", "Forge");
        link.innerHTML = MARK_SVG;
      } else {
        link.innerHTML = MARK_SVG;
        link.removeAttribute("title");
        link.setAttribute("aria-label", "Forge");
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
