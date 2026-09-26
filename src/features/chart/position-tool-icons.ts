/**
 * TradingView Long / Short position icons — horizontal line with end nodes + L/S.
 * Charting Library ships mirrored dashed-line icons that look nearly identical;
 * we patch the CL icon bundle and also swap DOM SVGs when the flyout opens.
 */

/** TV-style Long position (line + nodes + L). */
export const LONG_POSITION_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="28" height="28" fill="none"><path fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" d="M5.5 8a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM3 9.5A2.5 2.5 0 0 1 7.95 9h12.1a2.5 2.5 0 1 1 0 1H7.95A2.5 2.5 0 0 1 3 9.5zM22.5 8a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z"/><path fill="currentColor" d="M8.75 14.25h1.2v5.1H14.6v1.15H8.75z"/></svg>';

/** TV-style Short position (line + nodes + S). */
export const SHORT_POSITION_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="28" height="28" fill="none"><path fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" d="M5.5 8a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM3 9.5A2.5 2.5 0 0 1 7.95 9h12.1a2.5 2.5 0 1 1 0 1H7.95A2.5 2.5 0 0 1 3 9.5zM22.5 8a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z"/><path fill="currentColor" d="M12.35 14.1c-1.55 0-2.7.72-2.95 1.85l1.12.35c.18-.55.72-.95 1.75-.95.95 0 1.55.4 1.55 1.05 0 .55-.4.9-1.35 1.2l-.85.28c-1.45.48-2.25 1.2-2.25 2.4 0 1.4 1.2 2.3 3 2.3 1.5 0 2.65-.65 2.95-1.8l-1.15-.35c-.22.6-.85 1-1.82 1-1.05 0-1.72-.45-1.72-1.15 0-.55.38-.9 1.32-1.2l.9-.3c1.55-.52 2.35-1.25 2.35-2.55 0-1.5-1.25-2.38-3.05-2.38z"/></svg>';

const ICON_BY_TOOL: Record<string, string> = {
  LineToolRiskRewardLong: LONG_POSITION_ICON,
  LineToolRiskRewardShort: SHORT_POSITION_ICON,
};

function patchIconHost(host: Element, svgHtml: string): void {
  if (host.getAttribute("data-forge-pos-icon") === "1") return;
  const svg = host.querySelector("svg");
  if (svg) {
    svg.outerHTML = svgHtml;
  } else {
    host.insertAdjacentHTML("afterbegin", svgHtml);
  }
  host.setAttribute("data-forge-pos-icon", "1");
}

function patchDoc(doc: Document): void {
  for (const [name, svg] of Object.entries(ICON_BY_TOOL)) {
    const rows = doc.querySelectorAll(`[data-name="${name}"]`);
    rows.forEach((row) => {
      const iconHost =
        row.querySelector(".icon-jFqVJoPk, [class*='icon-']") ?? row.querySelector("svg")?.parentElement ?? row;
      if (iconHost) patchIconHost(iconHost, svg);
    });
  }
}

/**
 * Keep Long/Short flyout (+ toolbar group) icons on the TradingView L/S artwork.
 */
export function mountPositionToolIconPatcher(container: HTMLElement): () => void {
  let observer: MutationObserver | null = null;
  let iframeObserver: MutationObserver | null = null;
  let cancelled = false;

  const watchDoc = (doc: Document) => {
    patchDoc(doc);
    observer?.disconnect();
    observer = new MutationObserver(() => {
      if (!cancelled) patchDoc(doc);
    });
    observer.observe(doc.body ?? doc.documentElement, { childList: true, subtree: true });
  };

  const bindIframe = (): boolean => {
    const iframe = container.querySelector("iframe");
    if (!iframe) return false;
    const attach = () => {
      try {
        const doc = iframe.contentDocument;
        if (doc?.body) watchDoc(doc);
      } catch {
        /* ignore */
      }
    };
    if (iframe.contentDocument?.readyState === "complete") attach();
    else iframe.addEventListener("load", attach);
    return true;
  };

  if (!bindIframe()) {
    iframeObserver = new MutationObserver(() => {
      if (bindIframe()) iframeObserver?.disconnect();
    });
    iframeObserver.observe(container, { childList: true, subtree: true });
  }

  return () => {
    cancelled = true;
    observer?.disconnect();
    iframeObserver?.disconnect();
  };
}
