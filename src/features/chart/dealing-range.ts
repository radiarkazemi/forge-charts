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

const DEALING_RANGE_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="18" height="18"><rect x="4" y="5" width="20" height="8" rx="1" fill="#ef5350" opacity="0.45"/><rect x="4" y="13" width="20" height="8" rx="1" fill="#26a69a" opacity="0.45"/><path d="M4 14h20" stroke="#ff9800" stroke-width="1.5"/><path d="M4 5h20M4 21h20" stroke="currentColor" stroke-width="1.2"/></svg>';

/**
 * Inject "Dealing Range" under Pitchfan in the Fibonacci flyout (CL has no API for this).
 * Best-effort DOM patch inside the chart iframe.
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

    // Find Pitchfan row by visible text.
    const candidates = Array.from(doc.querySelectorAll("div,span,button,a,li"));
    const pitchfan = candidates.find((el) => {
      const t = (el.textContent ?? "").trim();
      return t === "Pitchfan" || t.startsWith("Pitchfan");
    });
    if (!pitchfan) return;

    // Climb to a list-item-ish row.
    let row: HTMLElement | null = pitchfan as HTMLElement;
    for (let i = 0; i < 6 && row; i += 1) {
      const parent: HTMLElement | null = row.parentElement;
      if (!parent) break;
      if (parent.childElementCount >= 2 && parent !== doc.body) {
        // Prefer the row that only contains this tool label.
        if ((row.textContent ?? "").includes("Pitchfan") && row.childElementCount <= 6) break;
      }
      row = parent;
    }
    if (!row || !row.parentElement) return;

    const item = doc.createElement("div");
    item.setAttribute("data-forge-dealing-range", "1");
    item.setAttribute("role", "menuitem");
    item.style.cssText =
      "display:flex;align-items:center;gap:10px;padding:6px 12px;cursor:pointer;color:inherit;font:inherit;user-select:none;";
    item.innerHTML = `${DEALING_RANGE_ICON}<span>Dealing Range</span>`;
    item.addEventListener("mouseenter", () => {
      item.style.background = "rgba(255,255,255,0.06)";
    });
    item.addEventListener("mouseleave", () => {
      item.style.background = "transparent";
    });
    item.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      onActivate();
      // Close open menus by clicking elsewhere.
      try {
        doc.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      } catch {
        /* ignore */
      }
    });

    if (row.nextSibling) row.parentElement.insertBefore(item, row.nextSibling);
    else row.parentElement.appendChild(item);
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
