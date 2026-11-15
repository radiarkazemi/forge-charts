/**
 * Long / Short match the menu icons at 1px: hollow rings on the top and
 * bottom lines, a longer middle line, L in the tall upper gap and S in the
 * tall lower gap. The icon tool is a 1px heart outline.
 */

function iconSvg(body: string, kind: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="28" height="28" data-forge-icon="${kind}">${body}</svg>`;
}

/** Middle line starts at the ring center and runs to the same right edge. */
function positionLines(middleY: number): string {
  return `<g fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="butt"><circle cx="5.5" cy="6.5" r="2"/><path d="M7 6.5H25"/><path d="M5 ${middleY}H25"/><circle cx="5.5" cy="22.5" r="2"/><path d="M7 22.5H25"/></g>`;
}

/** Crisp 1px L, centered in the tall upper gap. */
const LONG_MARK = `<path fill="currentColor" d="M13 9h1v5H17v1H13z"/>`;

/** Filled S outline, centered in the tall lower gap. */
const SHORT_MARK = `<path fill="currentColor" d="M17.36 18.31Q17.36 19.09 16.75 19.52Q16.14 19.95 15.03 19.95Q12.97 19.95 12.64 18.52L13.38 18.37Q13.51 18.88 13.93 19.12Q14.34 19.35 15.06 19.35Q15.8 19.35 16.2 19.1Q16.6 18.85 16.6 18.35Q16.6 18.08 16.48 17.91Q16.35 17.73 16.12 17.62Q15.89 17.51 15.58 17.43Q15.26 17.36 14.88 17.27Q14.21 17.12 13.86 16.97Q13.52 16.83 13.32 16.64Q13.12 16.46 13.01 16.22Q12.91 15.97 12.91 15.66Q12.91 14.93 13.46 14.54Q14.01 14.15 15.05 14.15Q16.01 14.15 16.51 14.44Q17.02 14.74 17.23 15.45L16.47 15.58Q16.35 15.13 16 14.93Q15.65 14.73 15.04 14.73Q14.36 14.73 14.01 14.95Q13.65 15.17 13.65 15.62Q13.65 15.88 13.79 16.05Q13.93 16.22 14.19 16.34Q14.45 16.45 15.22 16.63Q15.48 16.69 15.74 16.75Q16 16.81 16.23 16.9Q16.47 16.98 16.68 17.1Q16.88 17.21 17.03 17.38Q17.19 17.55 17.27 17.78Q17.36 18.01 17.36 18.31Z"/>`;

/** Middle line sits low, so the L has the tall gap above it. */
export const LONG_POSITION_ICON = iconSvg(`${positionLines(17.5)}${LONG_MARK}`, "long");

/** Middle line sits high, so the S has the tall gap below it. */
export const SHORT_POSITION_ICON = iconSvg(`${positionLines(11.5)}${SHORT_MARK}`, "short");

/** 1px outline. Same heart as before, drawn at the icon's own pixel size. */
export const HEART_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="28" height="28" data-forge-icon="heart"><path fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" d="M22.17 16.33c1.74-1.7 3.5-3.75 3.5-6.42A6.42 6.42 0 0 0 19.25 3.5c-2.05 0-3.5.58-5.25 2.33-1.75-1.75-3.2-2.33-5.25-2.33A6.42 6.42 0 0 0 2.33 9.92c0 2.67 1.75 4.73 3.5 6.42l8.17 8.17Z"/></svg>`;

const PATCH_VERSION = "8";

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
  // The default smiley, and our own heart so a better outline can replace the old one.
  // A different icon the user picked stays.
  if (iconButton && face && (/9\.95/.test(face.innerHTML) || face.getAttribute("data-forge-icon") === "heart")) {
    replaceSvg(iconButton, HEART_ICON, "heart");
  }
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
