/**
 * TradingView Long / Short — three parallel lines, hollow nodes on outer left ends,
 * L in the upper gap / S in the lower gap.
 */

const OUTER_LINE = (y: number) =>
  `M6 ${y}h17.5M4.75 ${y}a1.75 1.75 0 1 1 3.5 0a1.75 1.75 0 0 1-3.5 0`;

const MID_LINE = "M5 14h18.5";

/** TV-style Long position (L between top and mid). */
export const LONG_POSITION_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="28" height="28" fill="none"><g stroke="currentColor" stroke-width="1.35" fill="none"><path d="${OUTER_LINE(7.5)}"/><path d="${MID_LINE}"/><path d="${OUTER_LINE(20.5)}"/></g><text x="11.5" y="12.6" fill="currentColor" font-size="7.5" font-family="Trebuchet MS,Arial,sans-serif" font-weight="700">L</text></svg>`;

/** TV-style Short position (S between mid and bottom). */
export const SHORT_POSITION_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="28" height="28" fill="none"><g stroke="currentColor" stroke-width="1.35" fill="none"><path d="${OUTER_LINE(7.5)}"/><path d="${MID_LINE}"/><path d="${OUTER_LINE(20.5)}"/></g><text x="11.5" y="21.4" fill="currentColor" font-size="7.5" font-family="Trebuchet MS,Arial,sans-serif" font-weight="700">S</text></svg>`;

const ICON_BY_TOOL: Record<string, string> = {
  LineToolRiskRewardLong: LONG_POSITION_ICON,
  LineToolRiskRewardShort: SHORT_POSITION_ICON,
};

const PATCH_VERSION = "4";

function patchIconHost(host: Element, svgHtml: string): void {
  if (host.getAttribute("data-forge-pos-icon") === PATCH_VERSION) return;
  const svg = host.querySelector("svg");
  if (svg) svg.outerHTML = svgHtml;
  else host.insertAdjacentHTML("afterbegin", svgHtml);
  host.setAttribute("data-forge-pos-icon", PATCH_VERSION);
}

function patchDoc(doc: Document): void {
  for (const [name, svg] of Object.entries(ICON_BY_TOOL)) {
    doc.querySelectorAll(`[data-name="${name}"]`).forEach((row) => {
      const iconHost =
        row.querySelector(".icon-jFqVJoPk, [class*='icon-']") ?? row.querySelector("svg")?.parentElement ?? row;
      if (iconHost) patchIconHost(iconHost, svg);
    });
  }
}

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
