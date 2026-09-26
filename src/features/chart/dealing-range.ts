/**
 * ICT / SMC Dealing Range — Fib Retracement styled as:
 *   0.0 Discount (range low when drawn low→high)
 *   0.5 EQ / equilibrium
 *   1.0 Premium (range high)
 * Upper half of the range = premium, lower half = discount.
 *
 * Charting Library cannot register a new left-toolbar tool, so we:
 *  1) Seed a drawing template named "Dealing Range"
 *  2) Inject a menu row under Pitchfan in the Fib flyout
 *  3) Activate via selectLineTool("fib_retracement") + applyOverrides
 */

import type { KeyValueStorage } from "@/application";
import type { IChartingLibraryWidget } from "@/infrastructure/tradingview";

const TOOL_NAME = "LineToolFibRetracement";
const TEMPLATE_NAME = "Dealing Range";
const SEED_KEY = "forge.dealingRange.template.v1";

/** Overrides applied when Dealing Range mode is active. */
export const DEALING_RANGE_OVERRIDES: Record<string, string | number | boolean> = {
  "linetoolfibretracement.coeffsAsPercents": false,
  "linetoolfibretracement.extendLines": false,
  "linetoolfibretracement.extendLinesLeft": false,
  "linetoolfibretracement.fillBackground": true,
  "linetoolfibretracement.showCoeffs": true,
  "linetoolfibretracement.showPrices": true,
  "linetoolfibretracement.showText": true,
  "linetoolfibretracement.transparency": 80,
  "linetoolfibretracement.horzLabelsAlign": "left",
  "linetoolfibretracement.labelFontSize": 12,
  // 0 — Discount
  "linetoolfibretracement.level1.coeff": 0,
  "linetoolfibretracement.level1.color": "#26a69a",
  "linetoolfibretracement.level1.text": "Discount",
  "linetoolfibretracement.level1.visible": true,
  // hide standard fib fractions
  "linetoolfibretracement.level2.visible": false,
  "linetoolfibretracement.level3.visible": false,
  // 0.5 — EQ
  "linetoolfibretracement.level4.coeff": 0.5,
  "linetoolfibretracement.level4.color": "#ff9800",
  "linetoolfibretracement.level4.text": "EQ",
  "linetoolfibretracement.level4.visible": true,
  "linetoolfibretracement.level5.visible": false,
  "linetoolfibretracement.level6.visible": false,
  // 1.0 — Premium
  "linetoolfibretracement.level7.coeff": 1,
  "linetoolfibretracement.level7.color": "#ef5350",
  "linetoolfibretracement.level7.text": "Premium",
  "linetoolfibretracement.level7.visible": true,
  "linetoolfibretracement.level8.visible": false,
  "linetoolfibretracement.level9.visible": false,
  "linetoolfibretracement.level10.visible": false,
  "linetoolfibretracement.level11.visible": false,
  "linetoolfibretracement.level12.visible": false,
  "linetoolfibretracement.level13.visible": false,
  "linetoolfibretracement.level14.visible": false,
  "linetoolfibretracement.level15.visible": false,
  "linetoolfibretracement.level16.visible": false,
  "linetoolfibretracement.level17.visible": false,
  "linetoolfibretracement.level18.visible": false,
  "linetoolfibretracement.level19.visible": false,
  "linetoolfibretracement.level20.visible": false,
  "linetoolfibretracement.level21.visible": false,
  "linetoolfibretracement.level22.visible": false,
  "linetoolfibretracement.level23.visible": false,
  "linetoolfibretracement.level24.visible": false,
};

const DRAWING_TEMPLATES_KEY = "forge.tv.drawingTemplates";

/** Persist Dealing Range as a Fib Retracement drawing template (once). */
export function seedDealingRangeTemplate(storage: KeyValueStorage): void {
  try {
    if (storage.get<string>(SEED_KEY, "") === "1") return;
    const all = storage.get<Record<string, Record<string, string>>>(DRAWING_TEMPLATES_KEY, {});
    const toolBucket = { ...(all[TOOL_NAME] ?? {}) };
    toolBucket[TEMPLATE_NAME] = JSON.stringify(DEALING_RANGE_OVERRIDES);
    storage.set(DRAWING_TEMPLATES_KEY, { ...all, [TOOL_NAME]: toolBucket });
    storage.set(SEED_KEY, "1");
  } catch {
    /* ignore */
  }
}

/** Activate Dealing Range draw mode on the active chart. */
export async function activateDealingRange(widget: IChartingLibraryWidget): Promise<void> {
  try {
    widget.applyOverrides(DEALING_RANGE_OVERRIDES);
  } catch {
    /* ignore */
  }
  try {
    await widget.selectLineTool("fib_retracement");
  } catch {
    /* chart not ready */
  }
}

/**
 * Monochrome TV-style icon (28×28, fill=currentColor) — Premium / EQ / Discount
 * bands as horizontal lines with endpoint nodes, matching Fib Retracement language.
 */
const DEALING_RANGE_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="28" height="28"><g fill="currentColor" fill-rule="nonzero"><path d="M3 6h22v-1H3z"/><path d="M3 14h22v-1H3z"/><path d="M3 22h22v-1H3z"/><path d="M3 6v15h1V6z"/><path d="M3.5 23a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm0 1a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z"/><path d="M24.5 7a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm0 1a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z"/><path d="M24.5 15a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm0 1a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z"/></g></svg>';

/**
 * Inject "Dealing Range" under Pitchfan in the Fibonacci flyout (CL has no API for this).
 * Best-effort DOM patch inside the chart iframe — clones a native row so icon/theme match.
 */
export function mountDealingRangeFlyoutInjector(
  container: HTMLElement,
  onActivate: () => void,
): () => void {
  let observer: MutationObserver | null = null;
  let iframeObserver: MutationObserver | null = null;
  let cancelled = false;

  const inject = (doc: Document) => {
    if (cancelled) return;
    // Already injected?
    if (doc.querySelector("[data-forge-dealing-range]")) return;

    // Prefer the native Pitchfan menuitem (correct classes + icon wrapper).
    const pitchfanRow =
      (doc.querySelector('[data-name="LineToolPitchfan"]') as HTMLElement | null) ??
      (() => {
        const label = Array.from(doc.querySelectorAll("div,span,button,a,li")).find((el) => {
          const t = (el.textContent ?? "").trim();
          return t === "Pitchfan" || t.startsWith("Pitchfan");
        });
        if (!label) return null;
        let row: HTMLElement | null = label as HTMLElement;
        for (let i = 0; i < 6 && row; i += 1) {
          if (row.getAttribute("data-role") === "menuitem" || row.getAttribute("role") === "menuitem") {
            return row;
          }
          if ((row.textContent ?? "").includes("Pitchfan") && row.querySelector("svg") && row.childElementCount <= 6) {
            return row;
          }
          row = row.parentElement;
        }
        return row;
      })();
    if (!pitchfanRow || !pitchfanRow.parentElement) return;

    const item = pitchfanRow.cloneNode(true) as HTMLElement;
    item.setAttribute("data-forge-dealing-range", "1");
    item.setAttribute("data-name", "ForgeDealingRange");
    item.removeAttribute("data-tooltip");
    item.removeAttribute("aria-keyshortcuts");

    const iconHost = item.querySelector(".icon-jFqVJoPk, [class*='icon-']") ?? item.querySelector("svg")?.parentElement;
    if (iconHost) {
      iconHost.innerHTML = DEALING_RANGE_ICON;
    } else {
      const svg = item.querySelector("svg");
      if (svg) svg.outerHTML = DEALING_RANGE_ICON;
    }

    // Replace label text while keeping hotkey / layout spans intact when present.
    const walker = doc.createTreeWalker(item, NodeFilter.SHOW_TEXT);
    let replaced = false;
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const value = node.textContent ?? "";
      if (value.includes("Pitchfan")) {
        node.textContent = value.replace(/Pitchfan/g, "Dealing Range");
        replaced = true;
        break;
      }
    }
    if (!replaced) {
      item.appendChild(doc.createTextNode("Dealing Range"));
    }

    item.addEventListener(
      "click",
      (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        onActivate();
        try {
          doc.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        } catch {
          /* ignore */
        }
      },
      true,
    );

    if (pitchfanRow.nextSibling) pitchfanRow.parentElement.insertBefore(item, pitchfanRow.nextSibling);
    else pitchfanRow.parentElement.appendChild(item);
  };

  const watchDoc = (doc: Document) => {
    inject(doc);
    observer?.disconnect();
    observer = new MutationObserver(() => inject(doc));
    observer.observe(doc.body ?? doc.documentElement, { childList: true, subtree: true });
  };

  const bindIframe = () => {
    const iframe = container.querySelector("iframe");
    if (!iframe) return false;
    const attach = () => {
      try {
        const doc = iframe.contentDocument;
        if (doc?.body) watchDoc(doc);
      } catch {
        /* cross-origin — should not happen for CL iframe */
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
