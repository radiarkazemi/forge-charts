/**
 * TradingView Long / Short position icons — two parallel lines with end nodes
 * and L / S centered between them (matches tradingview.com Forecasting flyout).
 */

/** TV-style Long position. */
export const LONG_POSITION_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="28" height="28" fill="none"><g fill="currentColor" fill-rule="evenodd"><path d="M5.5 8a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM3 9.5A2.5 2.5 0 0 1 7.95 9h12.1a2.5 2.5 0 1 1 0 1H7.95A2.5 2.5 0 0 1 3 9.5zM22.5 8a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z"/><path d="M5.5 17a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM3 18.5a2.5 2.5 0 0 1 4.95-.5h12.1a2.5 2.5 0 1 1 0 1H7.95a2.5 2.5 0 0 1-4.95-.5zM22.5 17a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z"/><text x="14" y="16.2" text-anchor="middle" fill="currentColor" font-size="9" font-family="Trebuchet MS,Arial,sans-serif" font-weight="700">L</text></g></svg>';

/** TV-style Short position. */
export const SHORT_POSITION_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="28" height="28" fill="none"><g fill="currentColor" fill-rule="evenodd"><path d="M5.5 8a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM3 9.5A2.5 2.5 0 0 1 7.95 9h12.1a2.5 2.5 0 1 1 0 1H7.95A2.5 2.5 0 0 1 3 9.5zM22.5 8a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z"/><path d="M5.5 17a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM3 18.5a2.5 2.5 0 0 1 4.95-.5h12.1a2.5 2.5 0 1 1 0 1H7.95a2.5 2.5 0 0 1-4.95-.5zM22.5 17a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z"/><text x="14" y="16.2" text-anchor="middle" fill="currentColor" font-size="9" font-family="Trebuchet MS,Arial,sans-serif" font-weight="700">S</text></g></svg>';

const ICON_BY_TOOL: Record<string, string> = {
  LineToolRiskRewardLong: LONG_POSITION_ICON,
  LineToolRiskRewardShort: SHORT_POSITION_ICON,
};

function patchIconHost(host: Element, svgHtml: string): void {
  // Always refresh so icon updates after deploy / theme patches.
  const prev = host.getAttribute("data-forge-pos-icon");
  if (prev === "2") return;
  const svg = host.querySelector("svg");
  if (svg) svg.outerHTML = svgHtml;
  else host.insertAdjacentHTML("afterbegin", svgHtml);
  host.setAttribute("data-forge-pos-icon", "2");
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

/** Keep Long/Short flyout icons on the TradingView two-line L/S artwork. */
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
