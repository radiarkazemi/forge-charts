/**
 * TradingView Long / Short position icons — horizontal line with end nodes + L/S.
 * Charting Library ships mirrored dashed-line icons that look nearly identical;
 * we patch the CL icon bundle and also swap DOM SVGs when the flyout opens.
 */

/** TV-style Long position (line + nodes + L). */
export const LONG_POSITION_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="28" height="28" fill="none"><path fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" d="M5.5 8a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM3 9.5A2.5 2.5 0 0 1 7.95 9h12.1a2.5 2.5 0 1 1 0 1H7.95A2.5 2.5 0 0 1 3 9.5zM22.5 8a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z"/><text x="8.5" y="22" fill="currentColor" font-size="10" font-family="Trebuchet MS,Arial,sans-serif" font-weight="600">L</text></svg>';

/** TV-style Short position (line + nodes + S). */
export const SHORT_POSITION_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="28" height="28" fill="none"><path fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" d="M5.5 8a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM3 9.5A2.5 2.5 0 0 1 7.95 9h12.1a2.5 2.5 0 1 1 0 1H7.95A2.5 2.5 0 0 1 3 9.5zM22.5 8a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z"/><text x="8.5" y="22" fill="currentColor" font-size="10" font-family="Trebuchet MS,Arial,sans-serif" font-weight="600">S</text></svg>';

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
