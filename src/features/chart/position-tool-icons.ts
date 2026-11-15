/**
 * Long / Short match the chart toolbar: three lines, hollow nodes on the left,
 * L in the upper gap and S in the lower gap. The icon group shows a heart.
 */

const LINES = `<g fill="none" stroke="currentColor" stroke-width="1.35"><path d="M7 7.5h16"/><circle cx="4.7" cy="7.5" r="1.65"/><path d="M7 14h16.2"/><path d="M7 20.5h16"/><circle cx="4.7" cy="20.5" r="1.65"/></g>`;

function iconSvg(body: string, kind: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="28" height="28" data-forge-icon="${kind}">${body}</svg>`;
}

/** L sits between the top and middle lines. */
export const LONG_POSITION_ICON = iconSvg(
  `${LINES}<text x="10.4" y="13.15" fill="currentColor" font-size="8" font-family="Arial,Helvetica,sans-serif" font-weight="700">L</text>`,
  "long",
);

/** S sits between the middle and bottom lines. */
export const SHORT_POSITION_ICON = iconSvg(
  `${LINES}<text x="10.2" y="19.55" fill="currentColor" font-size="8" font-family="Arial,Helvetica,sans-serif" font-weight="700">S</text>`,
  "short",
);

/** Heart replaces the smiley on the icon tool. */
export const HEART_ICON = iconSvg(
  `<path fill="none" stroke="currentColor" stroke-width="1.45" stroke-linejoin="round" d="M14 22.4c-.35 0-7.15-4.15-9.35-8.15C3.1 11.15 3.95 7.35 7.45 6.2c2.05-.7 3.95.15 5.15 1.85 1.2-1.7 3.1-2.55 5.15-1.85 3.5 1.15 4.35 4.95 2.8 8.05C21.15 18.25 14.35 22.4 14 22.4z"/>`,
  "heart",
);

const PATCH_VERSION = "5";

function replaceSvg(root: Element, svgHtml: string, kind: string): void {
  const svg = root.querySelector("svg");
  if (!svg) return;
  if (svg.getAttribute("data-forge-icon") === kind && root.getAttribute("data-forge-pos-icon") === PATCH_VERSION) return;
  svg.outerHTML = svgHtml;
  root.setAttribute("data-forge-pos-icon", PATCH_VERSION);
}

function patchDoc(doc: Document): void {
  const byLabel: Record<string, string> = {
    "Long position": LONG_POSITION_ICON,
    "Short position": SHORT_POSITION_ICON,
  };
  for (const button of doc.querySelectorAll("button")) {
    const label = button.getAttribute("aria-label") || "";
    const svg = byLabel[label];
    if (svg) replaceSvg(button, svg, label === "Long position" ? "long" : "short");
  }
  const rows: Record<string, string> = {
    LineToolRiskRewardLong: LONG_POSITION_ICON,
    LineToolRiskRewardShort: SHORT_POSITION_ICON,
  };
  for (const [name, svg] of Object.entries(rows)) {
    doc.querySelectorAll(`[data-name="${name}"]`).forEach((row) => {
      replaceSvg(row, svg, name === "LineToolRiskRewardLong" ? "long" : "short");
    });
  }

  const iconButton = doc.querySelector('[data-name="linetool-group-font-icons"] button[aria-label="Icon"]');
  const face = iconButton?.querySelector("svg");
  // Only the default smiley. A different icon the user picked stays.
  if (iconButton && face && /9\.95/.test(face.innerHTML)) replaceSvg(iconButton, HEART_ICON, "heart");
}

export function mountPositionToolIconPatcher(container: HTMLElement): () => void {
  const observers: MutationObserver[] = [];
  let iframeObserver: MutationObserver | null = null;
  let cancelled = false;

  const attachFrame = (iframe: HTMLIFrameElement) => {
    try {
      const doc = iframe.contentDocument;
      if (!doc?.body) return;
      // Paint every pass. The chart replaces the iframe body after the first tick,
      // and an observer on the old body never sees the toolbar.
      patchDoc(doc);
      if (iframe.dataset.forgeIconWatch === "1") return;
      iframe.dataset.forgeIconWatch = "1";
      iframe.addEventListener("load", () => attachFrame(iframe));
      const mo = new MutationObserver(() => {
        if (cancelled) return;
        try {
          const next = iframe.contentDocument;
          if (next?.body) patchDoc(next);
        } catch {
          /* ignore */
        }
      });
      mo.observe(doc.documentElement, { childList: true, subtree: true });
      observers.push(mo);
    } catch {
      /* ignore */
    }
  };
  const bindIframes = () => {
    const frames = container.querySelectorAll("iframe");
    frames.forEach((frame) => attachFrame(frame));
    return frames.length > 0;
  };

  if (!bindIframes()) {
    iframeObserver = new MutationObserver(() => {
      if (bindIframes()) iframeObserver?.disconnect();
    });
    iframeObserver.observe(container, { childList: true, subtree: true });
  }
  const poll = window.setInterval(() => {
    if (cancelled) return;
    container.querySelectorAll("iframe").forEach((frame) => attachFrame(frame));
  }, 500);

  return () => {
    cancelled = true;
    window.clearInterval(poll);
    for (const mo of observers) mo.disconnect();
    iframeObserver?.disconnect();
  };
}
