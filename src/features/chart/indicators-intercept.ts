/**
 * Indicators UX: when CL opens its Indicators list (or the header button is
 * clicked), paint a TradingView-style Forge picker as a fixed overlay INSIDE
 * the chart iframe — so it always appears where the user is looking.
 *
 * Native CL “SCRIPT NAME” dialogs are removed from the DOM (not merely hidden),
 * which avoids the blank white shell.
 */

import type { IChartingLibraryWidget } from "@/infrastructure/tradingview";
import { ALL_INDICATORS, type ForgeIndicatorEntry } from "./forge-indicators-catalog";

const ROOT_ID = "forge-indicators-overlay";
const STYLE_ID = "forge-indicators-overlay-style";

let allowNativeUntil = 0;

/** Permit the next native Indicators dialog (used by “Full library…”). */
export function allowNativeIndicatorsOnce(ms = 6_000): void {
  allowNativeUntil = Date.now() + ms;
  try {
    document.body.classList.add("forge-allow-native-indicators");
    const iframe = document.querySelector("iframe") as HTMLIFrameElement | null;
    iframe?.contentDocument?.body?.classList.add("forge-allow-native-indicators");
    window.setTimeout(() => {
      document.body.classList.remove("forge-allow-native-indicators");
      try {
        iframe?.contentDocument?.body?.classList.remove("forge-allow-native-indicators");
      } catch {
        /* ignore */
      }
    }, ms);
  } catch {
    /* ignore */
  }
}

function forgeReplaceAllowed(): boolean {
  return Date.now() >= allowNativeUntil;
}

function isIndicatorsAction(id: string): boolean {
  const t = id.trim().toLowerCase();
  return t.includes("insertindicator") || t === "indicators" || t === "openindicators";
}

function isIndicatorsControl(el: Element | null): boolean {
  if (!el) return false;
  let node: Element | null = el;
  for (let i = 0; i < 8 && node; i += 1) {
    if (!(node instanceof HTMLElement)) {
      node = node.parentElement;
      continue;
    }
    const dataName = (node.getAttribute("data-name") || "").toLowerCase();
    const id = (node.id || "").toLowerCase();
    const title = (
      node.getAttribute("title") ||
      node.getAttribute("aria-label") ||
      node.getAttribute("data-tooltip") ||
      ""
    ).trim();
    const text = (node.textContent || "").replace(/\s+/g, " ").trim().slice(0, 48);
    if (dataName.includes("indicator") || id.includes("indicator")) return true;
    if (/indicators?/i.test(title) && !/template/i.test(title)) return true;
    if (/^indicators?$/i.test(text) && (node.tagName === "BUTTON" || node.getAttribute("role") === "button")) {
      return true;
    }
    node = node.parentElement;
  }
  return false;
}

function looksLikeNativeIndicatorsDialog(root: Element): boolean {
  if (root.id === ROOT_ID || root.closest?.(`#${ROOT_ID}`)) return false;
  const name = (root.getAttribute("data-name") || "").toLowerCase();
  const dialogName = (root.getAttribute("data-dialog-name") || "").toLowerCase();
  if (name.includes("indicators-dialog") || name === "indicators") return true;
  if (dialogName.includes("indicator")) return true;
  const text = (root.textContent || "").slice(0, 1200);
  if (/SCRIPT NAME/i.test(text) && /\bIndicators\b/i.test(text)) return true;
  return false;
}

function removeNativeDialogs(doc: Document): void {
  const candidates = Array.from(
    doc.querySelectorAll<HTMLElement>(
      '[data-name="indicators-dialog"], [data-dialog-name*="Indicator"], [data-dialog-name*="indicator"], [role="dialog"], [class*="tv-dialog"], [class*="dialog"]',
    ),
  );
  for (const el of candidates) {
    if (el.id === ROOT_ID || el.closest(`#${ROOT_ID}`)) continue;
    if (!looksLikeNativeIndicatorsDialog(el) && !/SCRIPT NAME/i.test(el.textContent || "")) {
      // Still remove outer shells that wrap an indicators dialog child.
      if (!el.querySelector?.('[data-name="indicators-dialog"]')) continue;
    }
    try {
      // Climb to outermost dialog chrome, then remove.
      let kill: HTMLElement = el;
      let p = el.parentElement;
      for (let i = 0; i < 5 && p && p !== doc.body; i += 1) {
        const cls = p.className?.toString?.() ?? "";
        const role = p.getAttribute("role") || "";
        if (role === "dialog" || /tv-dialog|modal|overlay/i.test(cls)) {
          kill = p;
        }
        p = p.parentElement;
      }
      kill.remove();
    } catch {
      /* ignore */
    }
  }
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function rowHtml(entry: ForgeIndicatorEntry, q = ""): string {
  return `<button type="button" class="fi-row" data-study-id="${esc(entry.studyId)}" data-study-name="${esc(entry.name)}" title="${esc(entry.shortDescription)}">
    <span class="fi-name">${highlightName(entry.name, q)}</span>
    <span class="fi-author">${esc(entry.author)}</span>
    <span class="fi-meta">${esc(entry.usesLabel)}</span>
  </button>`;
}

function isPhoneChart(doc: Document): boolean {
  return Boolean(doc.defaultView?.matchMedia("(max-width: 900px)").matches);
}

function ensureStyles(doc: Document): void {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
#${ROOT_ID} {
  position: fixed; inset: 0; z-index: 2147483646;
  display: flex; align-items: center; justify-content: center;
  font-family: -apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, Ubuntu, sans-serif;
  background: rgba(0,0,0,0.45);
}
#${ROOT_ID} .fi-panel {
  width: min(860px, 94vw); height: min(680px, 86vh);
  background: #fff; color: #131722;
  border-radius: 8px; border: 1px solid #e0e3eb;
  box-shadow: 0 16px 48px rgba(0,0,0,0.28);
  display: flex; flex-direction: column; overflow: hidden;
}
#${ROOT_ID}.fi-dark .fi-panel { background: #1e222d; color: #d1d4dc; border-color: #2a2e39; }
#${ROOT_ID} .fi-head {
  display: flex; align-items: center; gap: 8px;
  padding: 12px 16px; border-bottom: 1px solid #e0e3eb; flex-shrink: 0;
}
#${ROOT_ID}.fi-dark .fi-head { border-bottom-color: #2a2e39; }
#${ROOT_ID} .fi-title { flex: 1; font-weight: 700; font-size: 16px; }
#${ROOT_ID} .fi-close {
  border: 0; background: transparent; color: #787b86; cursor: pointer;
  width: 32px; height: 32px; border-radius: 6px; font-size: 20px; line-height: 1;
}
#${ROOT_ID} .fi-close:hover { background: rgba(120,123,134,0.12); color: inherit; }
#${ROOT_ID} .fi-body { display: flex; flex: 1; min-height: 0; }
#${ROOT_ID} .fi-side {
  width: 220px; flex-shrink: 0; background: #f0f3fa; border-right: 1px solid #e0e3eb;
  overflow-y: auto; padding: 10px 8px 8px;
}
#${ROOT_ID}.fi-dark .fi-side { background: #131722; border-right-color: #2a2e39; }
#${ROOT_ID} .fi-side-h {
  padding: 4px 8px; margin: 8px 0 4px; font-size: 10.5px; font-weight: 700;
  letter-spacing: 0.6px; color: #787b86; text-transform: uppercase;
}
#${ROOT_ID} .fi-nav {
  width: 100%; display: flex; align-items: center; gap: 8px;
  border: 0; border-radius: 6px; padding: 8px; margin-bottom: 2px;
  background: transparent; color: inherit; cursor: pointer; font-size: 13px; font-weight: 500; text-align: left;
}
#${ROOT_ID} .fi-nav svg { width: 18px; height: 18px; flex: 0 0 18px; }
#${ROOT_ID} .fi-nav .fi-chev { display: none; }
#${ROOT_ID} .fi-nav.is-active { background: rgba(41,98,255,0.14); color: #2962ff; font-weight: 700; }
#${ROOT_ID}.fi-dark .fi-nav.is-active { background: rgba(41,98,255,0.22); color: #8ab4ff; }
#${ROOT_ID} .fi-nav:hover { background: rgba(19,23,34,0.04); }
#${ROOT_ID}.fi-dark .fi-nav:hover { background: rgba(209,212,220,0.06); }
#${ROOT_ID} .fi-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
#${ROOT_ID} .fi-search-wrap { padding: 12px 16px 8px; flex-shrink: 0; }
#${ROOT_ID} .fi-search {
  width: 100%; box-sizing: border-box; border-radius: 10px; border: 1px solid #e0e3eb;
  padding: 10px 12px 10px 36px; font-size: 15px; background: #f7f8fa url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%238b8b8b' stroke-width='2'><circle cx='11' cy='11' r='7'/><path d='m20 20-3.5-3.5'/></svg>") 12px 50% no-repeat;
  color: inherit; outline: none;
}
#${ROOT_ID}.fi-dark .fi-search { background-color: #1a1a1a; border-color: #2a2a2a; color: #f2f2f2; }
#${ROOT_ID} .fi-search:focus { border-color: #2962ff; }
#${ROOT_ID} .fi-list { flex: 1; overflow-y: auto; padding: 4px 0 12px; }
#${ROOT_ID} .fi-sec {
  padding: 10px 16px 4px; font-size: 11px; font-weight: 700; letter-spacing: 0.5px; color: #787b86;
}
#${ROOT_ID} .fi-row {
  width: 100%; display: flex; align-items: center; gap: 12px;
  border: 0; background: transparent; color: inherit; cursor: pointer;
  padding: 9px 16px; text-align: left; font-size: 13.5px;
}
#${ROOT_ID} .fi-row:hover { background: rgba(19,23,34,0.04); }
#${ROOT_ID}.fi-dark .fi-row:hover { background: rgba(209,212,220,0.06); }
#${ROOT_ID} .fi-name {
  flex: 1 1 auto; min-width: 0; font-weight: 600;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
#${ROOT_ID} .fi-name mark { background: transparent; color: #2962ff; font-weight: 700; padding: 0; }
#${ROOT_ID}.fi-dark .fi-name mark { color: #8ab4ff; }
#${ROOT_ID} .fi-author {
  flex: 0 0 88px; width: 88px; color: #2962ff; font-size: 12.5px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: right;
}
#${ROOT_ID}.fi-dark .fi-author { color: #8ab4ff; }
#${ROOT_ID} .fi-meta {
  flex: 0 0 52px; width: 52px; color: #787b86; font-size: 12px; text-align: right;
  font-variant-numeric: tabular-nums; white-space: nowrap;
}
#${ROOT_ID} .fi-foot {
  border-top: 1px solid #e0e3eb; padding: 8px 12px; flex-shrink: 0;
}
#${ROOT_ID}.fi-dark .fi-foot { border-top-color: #2a2e39; }
#${ROOT_ID} .fi-full {
  border: 1px solid #e0e3eb; background: transparent; color: #787b86;
  border-radius: 6px; padding: 8px 10px; font-size: 12px; font-weight: 600; cursor: pointer; width: 100%;
}
#${ROOT_ID}.fi-dark .fi-full { border-color: #2a2e39; }
#${ROOT_ID} .fi-full:hover { color: inherit; border-color: #2962ff; }
#${ROOT_ID} .fi-empty { padding: 32px 16px; text-align: center; color: #787b86; }

/* Phone: category list, then the chosen group. Desktop keeps the two panes. */
#${ROOT_ID}.fi-phone { align-items: stretch; }
#${ROOT_ID}.fi-phone .fi-panel {
  width: 100%; max-width: none; height: 100%; margin: 0;
  border-radius: 0; border: 0; box-shadow: none;
}
#${ROOT_ID}.fi-phone.fi-dark .fi-panel { background: #000; color: #f2f2f2; border-color: transparent; }
#${ROOT_ID}.fi-phone .fi-body { flex-direction: column; }
#${ROOT_ID}.fi-phone .fi-side {
  width: auto; flex: 1; background: transparent; border-right: 0; padding: 8px 0 24px;
}
#${ROOT_ID}.fi-phone .fi-side-h {
  padding: 16px 16px 6px; margin: 0; font-size: 11px; font-weight: 600; letter-spacing: 0.8px; color: #8b8b8b;
}
#${ROOT_ID}.fi-phone .fi-nav {
  border-radius: 0; padding: 13px 16px; margin: 0; font-size: 16px; gap: 14px;
}
#${ROOT_ID}.fi-phone .fi-nav svg { width: 22px; height: 22px; flex-basis: 22px; }
#${ROOT_ID}.fi-phone .fi-nav .fi-chev { display: block; margin-left: auto; opacity: 0.7; width: 18px; height: 18px; flex-basis: 18px; }
#${ROOT_ID}.fi-phone .fi-nav.is-active { background: transparent; color: inherit; font-weight: 500; }
#${ROOT_ID}.fi-phone .fi-search {
  border-radius: 10px; font-size: 15px; padding: 10px 12px 10px 36px;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%238b8b8b' stroke-width='2'><circle cx='11' cy='11' r='7'/><path d='m20 20-3.5-3.5'/></svg>");
  background-repeat: no-repeat; background-position: 12px 50%;
}
`;
  (doc.head || doc.documentElement).appendChild(style);
}

type NavId =
  | "favorites"
  | "myScripts"
  | "purchased"
  | "technicals"
  | "fundamentals"
  | "editorsPicks"
  | "top"
  | "trending"
  | "marketplace";

const STUDY_NAVS = new Set<NavId>(["favorites", "myScripts", "technicals", "editorsPicks", "top", "trending"]);

const CHEV = `<svg class="fi-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m9 6 6 6-6 6"/></svg>`;

function homeIcon(id: NavId): string {
  const p = `viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"`;
  switch (id) {
    case "favorites":
      return `<svg ${p}><path d="m12 3 2.4 5.2 5.6.7-4.2 3.8 1.1 5.6L12 15.8 7.1 18.3 8.2 12.7 4 8.9l5.6-.7L12 3z"/></svg>`;
    case "myScripts":
      return `<svg ${p}><circle cx="12" cy="8" r="3"/><path d="M5 19c1.2-3 3.4-4.5 7-4.5S17.8 16 19 19"/></svg>`;
    case "purchased":
      return `<svg ${p}><rect x="4" y="7" width="16" height="12" rx="1.5"/><path d="M8 7V6a4 4 0 0 1 8 0v1"/></svg>`;
    case "technicals":
      return `<svg ${p}><path d="M4 16l5-5 3 3 8-8"/><path d="M14 6h6v6"/></svg>`;
    case "fundamentals":
      return `<svg ${p}><path d="M5 19V9M10 19V5M15 19v-7M20 19V8"/></svg>`;
    case "editorsPicks":
      return `<svg ${p}><path d="M6 4h9a2 2 0 0 1 2 2v14l-6.5-3L4 20V6a2 2 0 0 1 2-2z"/></svg>`;
    case "top":
      return `<svg ${p}><path d="M5 19V9M10 19V5M15 19v-7M20 19V8"/></svg>`;
    case "trending":
      return `<svg ${p}><path d="M12 3s2 3 2 6a2 2 0 0 1-4 0c0-1 .5-2 1-3-2 1-4 3.5-4 6a5 5 0 0 0 10 0c0-4-3-7-5-9z"/></svg>`;
    default:
      return `<svg ${p}><path d="M6 8h12l-1 11H7L6 8z"/><path d="M9 8V7a3 3 0 0 1 6 0v1"/></svg>`;
  }
}

const DESKTOP_GROUPS: readonly { heading: string; items: readonly { id: NavId; label: string }[] }[] = [
  {
    heading: "PERSONAL",
    items: [
      { id: "favorites", label: "Favorites" },
      { id: "myScripts", label: "My scripts" },
    ],
  },
  {
    heading: "BUILT-IN",
    items: [{ id: "technicals", label: "Technicals" }],
  },
  {
    heading: "COMMUNITY",
    items: [
      { id: "editorsPicks", label: "Editors' picks" },
      { id: "top", label: "Top" },
      { id: "trending", label: "Trending" },
    ],
  },
];

const HOME_GROUPS: readonly { heading: string; items: readonly { id: NavId; label: string }[] }[] = [
  {
    heading: "PERSONAL",
    items: [
      { id: "favorites", label: "Favorites" },
      { id: "myScripts", label: "My scripts" },
      { id: "purchased", label: "Purchased" },
    ],
  },
  {
    heading: "BUILT-IN",
    items: [
      { id: "technicals", label: "Technicals" },
      { id: "fundamentals", label: "Fundamentals" },
    ],
  },
  {
    heading: "COMMUNITY",
    items: [
      { id: "editorsPicks", label: "Editors' picks" },
      { id: "top", label: "Top" },
      { id: "trending", label: "Trending" },
      { id: "marketplace", label: "Marketplace" },
    ],
  },
];

function filterEntries(nav: NavId, q: string): ForgeIndicatorEntry[] {
  const query = q.trim().toLowerCase();
  return ALL_INDICATORS.filter((e) => {
    if (query) {
      const hay = `${e.name} ${e.author} ${e.shortDescription} ${e.tags.join(" ")}`.toLowerCase();
      if (!hay.includes(query)) return false;
    }
    if (nav === "favorites") return e.favorite;
    if (nav === "myScripts") return e.section === "forge";
    if (nav === "technicals" || nav === "editorsPicks" || nav === "top" || nav === "trending") return true;
    return false;
  });
}

function highlightName(name: string, q: string): string {
  if (!q.trim()) return esc(name);
  const lower = name.toLowerCase();
  const qq = q.trim().toLowerCase();
  const idx = lower.indexOf(qq);
  if (idx < 0) return esc(name);
  return `${esc(name.slice(0, idx))}<mark>${esc(name.slice(idx, idx + qq.length))}</mark>${esc(name.slice(idx + qq.length))}`;
}

function paintList(listEl: HTMLElement, nav: NavId, q: string): void {
  const items = filterEntries(nav, q);
  const forge = items.filter((e) => e.section === "forge");
  const builtin = items.filter((e) => e.section === "builtin");
  const parts: string[] = [];
  if (forge.length) {
    const sec =
      nav === "editorsPicks" || nav === "top" || nav === "trending" ? "COMMUNITY" : "MY SCRIPTS";
    parts.push(`<div class="fi-sec">${sec}</div>`);
    parts.push(forge.map((e) => rowHtml(e, q)).join(""));
  }
  if (
    builtin.length &&
    (nav === "technicals" || nav === "top" || nav === "trending" || nav === "editorsPicks" || q.trim())
  ) {
    parts.push(`<div class="fi-sec">TECHNICALS</div>`);
    parts.push(builtin.map((e) => rowHtml(e, q)).join(""));
  }
  listEl.innerHTML = parts.length ? parts.join("") : `<div class="fi-empty">No indicators found</div>`;
}

async function addStudy(widget: IChartingLibraryWidget, studyId: string, name: string): Promise<void> {
  try {
    const chart = widget.activeChart();
    const tryCreate = async (id: string) => {
      try {
        const entity = await chart.createStudy(id, false, false);
        return entity != null;
      } catch {
        return false;
      }
    };
    if (await tryCreate(studyId)) return;
    if (name !== studyId && (await tryCreate(name))) return;
    if (studyId.includes("@")) {
      const bare = studyId.split("@")[0]!;
      await tryCreate(bare);
    }
  } catch {
    /* chart not ready */
  }
}

function closeOverlay(doc: Document): void {
  doc.getElementById(ROOT_ID)?.remove();
}

/** Drop the pane pin and stretch the category list over the whole phone screen. */
function coverPhoneViewport(doc: Document, root: HTMLElement): void {
  const view = doc.defaultView;
  if (!view) return;
  const place = () => {
    const width = view.innerWidth;
    const height = view.innerHeight;
    if (width < 8 || height < 8) return;
    root.style.left = "0px";
    root.style.top = "0px";
    root.style.width = `${width}px`;
    root.style.height = `${height}px`;
    const panel = root.querySelector<HTMLElement>(".fi-panel");
    if (!panel) return;
    delete panel.dataset.forgePin;
    delete panel.dataset.forgePinLock;
    delete panel.dataset.forgePinScroll;
    panel.style.removeProperty("--forge-pin-left");
    panel.style.removeProperty("--forge-pin-top");
    panel.style.removeProperty("--forge-pin-max-w");
    panel.style.removeProperty("--forge-pin-max-h");
    panel.style.setProperty("position", "relative", "important");
    panel.style.setProperty("left", "0", "important");
    panel.style.setProperty("top", "0", "important");
    panel.style.setProperty("width", `${width}px`, "important");
    panel.style.setProperty("min-width", `${width}px`, "important");
    panel.style.setProperty("max-width", "none", "important");
    panel.style.setProperty("height", `${height}px`, "important");
  };
  place();
  view.requestAnimationFrame(place);
}

function navButtons(groups: typeof DESKTOP_GROUPS, active: NavId | null, chevron: boolean): string {
  return groups
    .map(
      (group) =>
        `<div class="fi-side-h">${group.heading}</div>` +
        group.items
          .map((item) => {
            const on = item.id === active ? " is-active" : "";
            const tail = chevron ? CHEV : "";
            return `<button type="button" class="fi-nav${on}" data-nav="${item.id}">${homeIcon(item.id)}<span>${item.label}</span>${tail}</button>`;
          })
          .join(""),
    )
    .join("");
}

function openOverlay(doc: Document, widget: IChartingLibraryWidget): void {
  ensureStyles(doc);
  removeNativeDialogs(doc);

  let root = doc.getElementById(ROOT_ID) as HTMLElement | null;
  if (!root) {
    root = doc.createElement("div");
    root.id = ROOT_ID;
    doc.body.appendChild(root);
  }

  const phone = isPhoneChart(doc);
  // Match chart chrome: light chart in screenshots → light panel.
  const dark =
    doc.documentElement.classList.contains("theme-dark") ||
    doc.body.classList.contains("theme-dark") ||
    !!doc.querySelector(".theme-dark");
  root.className = `${dark ? "fi-dark" : ""} ${phone ? "fi-phone" : ""}`.trim();

  if (!phone) {
    openDesktopOverlay(doc, widget, root);
    return;
  }

  let nav: NavId | null = null;
  let query = "";

  const homeHtml = navButtons(HOME_GROUPS, null, true);

  const paint = () => {
    const title = root.querySelector(".fi-title");
    const body = root.querySelector(".fi-side");
    if (!title || !body) return;
    if (query.trim()) {
      title.textContent = "Indicators, metrics, and strategies";
      body.innerHTML = `<div class="fi-list"></div>`;
      paintList(body.querySelector(".fi-list") as HTMLElement, "technicals", query);
      return;
    }
    if (!nav) {
      title.textContent = "Indicators, metrics, and strategies";
      body.innerHTML = homeHtml;
      return;
    }
    const label = HOME_GROUPS.flatMap((g) => g.items).find((item) => item.id === nav)?.label ?? "Indicators";
    title.textContent = label;
    if (!STUDY_NAVS.has(nav)) {
      body.innerHTML = `<div class="fi-empty">Nothing here yet</div>`;
      return;
    }
    body.innerHTML = `<div class="fi-list"></div>`;
    paintList(body.querySelector(".fi-list") as HTMLElement, nav, "");
  };

  root.innerHTML = `
    <div class="fi-panel" role="dialog" aria-label="Indicators, metrics, and strategies">
      <div class="fi-head">
        <button type="button" class="fi-close fi-back" aria-label="Back" hidden>‹</button>
        <div class="fi-title">Indicators, metrics, and strategies</div>
        <button type="button" class="fi-close" aria-label="Close">×</button>
      </div>
      <div class="fi-search-wrap"><input class="fi-search" type="search" placeholder="Search" /></div>
      <div class="fi-side"></div>
    </div>
  `;
  paint();
  const searchEl = root.querySelector(".fi-search") as HTMLInputElement;
  const backBtn = root.querySelector(".fi-back") as HTMLButtonElement;
  const syncBack = () => {
    backBtn.hidden = !nav && !query.trim();
  };
  syncBack();

  root.onclick = (ev) => {
    const t = ev.target as HTMLElement | null;
    if (!t) return;
    if (t.classList.contains("fi-back")) {
      nav = null;
      query = "";
      searchEl.value = "";
      paint();
      syncBack();
      return;
    }
    if (t === root || (t.classList.contains("fi-close") && !t.classList.contains("fi-back"))) {
      closeOverlay(doc);
      return;
    }
    const navBtn = t.closest(".fi-nav") as HTMLElement | null;
    if (navBtn?.dataset.nav) {
      nav = navBtn.dataset.nav as NavId;
      paint();
      syncBack();
      return;
    }
    const row = t.closest(".fi-row") as HTMLElement | null;
    if (row?.dataset.studyId) {
      void addStudy(widget, row.dataset.studyId, row.dataset.studyName || row.dataset.studyId);
      closeOverlay(doc);
    }
  };

  searchEl.oninput = () => {
    query = searchEl.value;
    if (query.trim()) nav = null;
    paint();
    syncBack();
  };
  coverPhoneViewport(doc, root);

  // Also notify React shell (optional parallel UI) — overlay is source of truth.
  try {
    window.dispatchEvent(new CustomEvent("forge:open-indicators"));
  } catch {
    /* ignore */
  }
}

function openDesktopOverlay(doc: Document, widget: IChartingLibraryWidget, root: HTMLElement): void {
  let nav: NavId = "favorites";
  let query = "";

  root.innerHTML = `
    <div class="fi-panel" role="dialog" aria-label="Indicators, metrics, and strategies">
      <div class="fi-head">
        <div class="fi-title">Indicators, metrics, and strategies</div>
        <button type="button" class="fi-close" aria-label="Close">×</button>
      </div>
      <div class="fi-body">
        <div class="fi-side">
          ${navButtons(DESKTOP_GROUPS, "favorites", false)}
          <div class="fi-foot"><button type="button" class="fi-full">Full library…</button></div>
        </div>
        <div class="fi-main">
          <div class="fi-search-wrap"><input class="fi-search" type="search" placeholder="Search" /></div>
          <div class="fi-list"></div>
        </div>
      </div>
    </div>
  `;

  const listEl = root.querySelector(".fi-list") as HTMLElement;
  const searchEl = root.querySelector(".fi-search") as HTMLInputElement;
  paintList(listEl, nav, query);
  window.setTimeout(() => searchEl?.focus(), 30);

  root.onclick = (ev) => {
    const t = ev.target as HTMLElement | null;
    if (!t) return;
    if (t === root || t.classList.contains("fi-close")) {
      closeOverlay(doc);
      return;
    }
    const navBtn = t.closest(".fi-nav") as HTMLElement | null;
    if (navBtn?.dataset.nav) {
      nav = navBtn.dataset.nav as NavId;
      root.querySelectorAll(".fi-nav").forEach((b) => b.classList.remove("is-active"));
      navBtn.classList.add("is-active");
      paintList(listEl, nav, query);
      return;
    }
    const row = t.closest(".fi-row") as HTMLElement | null;
    if (row?.dataset.studyId) {
      void addStudy(widget, row.dataset.studyId, row.dataset.studyName || row.dataset.studyId);
      closeOverlay(doc);
      return;
    }
    if (t.classList.contains("fi-full")) {
      closeOverlay(doc);
      allowNativeIndicatorsOnce();
      window.setTimeout(() => {
        try {
          widget.activeChart().executeActionById("insertIndicator");
        } catch {
          /* ignore */
        }
      }, 40);
    }
  };

  searchEl.oninput = () => {
    query = searchEl.value;
    paintList(listEl, nav, query);
  };
}

type ExecFn = (id: string, ...rest: unknown[]) => unknown;
const patched = new WeakSet<object>();

function patchExecuteAction(chart: object, widget: IChartingLibraryWidget, getDoc: () => Document | null): void {
  if (patched.has(chart)) return;
  const rec = chart as { executeActionById?: ExecFn };
  if (typeof rec.executeActionById !== "function") return;
  const original = rec.executeActionById.bind(chart);
  rec.executeActionById = ((id: string, ...rest: unknown[]) => {
    if (isIndicatorsAction(String(id)) && forgeReplaceAllowed()) {
      const doc = getDoc();
      if (doc) openOverlay(doc, widget);
      return undefined;
    }
    return original(id, ...rest);
  }) as ExecFn;
  patched.add(chart);
}

/**
 * Install intercepts on a Charting Library widget. Returns disposer.
 */
export function mountIndicatorsIntercept(widget: IChartingLibraryWidget): () => void {
  let disposed = false;
  let mo: MutationObserver | null = null;
  let poll = 0;
  let attachedDoc: Document | null = null;

  const getDoc = () => {
    try {
      return (widget as unknown as { _iFrame?: HTMLIFrameElement })._iFrame?.contentDocument ?? null;
    } catch {
      return null;
    }
  };

  const onNativeAppeared = (doc: Document) => {
    if (disposed || !forgeReplaceAllowed()) return;
    // If native SCRIPT NAME dialog appears, kill it and show our overlay.
    const hit = Array.from(
      doc.querySelectorAll<HTMLElement>(
        '[data-name="indicators-dialog"], [data-dialog-name*="Indicator"], [role="dialog"], [class*="tv-dialog"]',
      ),
    ).some((el) => looksLikeNativeIndicatorsDialog(el) || /SCRIPT NAME/i.test(el.textContent || ""));
    if (!hit) return;
    openOverlay(doc, widget);
  };

  const onPointer = (event: Event) => {
    if (disposed || !forgeReplaceAllowed()) return;
    const view = attachedDoc?.defaultView;
    const Ctor = view?.Element;
    const raw = event.target;
    if (!Ctor || !(raw instanceof Ctor)) return;
    if (raw.closest?.(`#${ROOT_ID}`)) return;
    if (!isIndicatorsControl(raw)) return;
    event.preventDefault();
    event.stopPropagation();
    if (typeof (event as Event & { stopImmediatePropagation?: () => void }).stopImmediatePropagation === "function") {
      (event as Event & { stopImmediatePropagation: () => void }).stopImmediatePropagation();
    }
    const doc = attachedDoc || getDoc();
    if (doc) openOverlay(doc, widget);
  };

  const attachDoc = (doc: Document) => {
    if (disposed || attachedDoc === doc) return;
    if (attachedDoc) {
      attachedDoc.removeEventListener("click", onPointer, true);
      attachedDoc.removeEventListener("pointerdown", onPointer, true);
      attachedDoc.removeEventListener("mousedown", onPointer, true);
      mo?.disconnect();
    }
    attachedDoc = doc;
    doc.addEventListener("click", onPointer, true);
    doc.addEventListener("pointerdown", onPointer, true);
    doc.addEventListener("mousedown", onPointer, true);
    mo = new MutationObserver(() => onNativeAppeared(doc));
    mo.observe(doc.body || doc.documentElement, { childList: true, subtree: true });
  };

  const tick = () => {
    if (disposed) return;
    try {
      const chart = widget.activeChart?.() as object | null;
      if (chart) patchExecuteAction(chart, widget, getDoc);
    } catch {
      /* ignore */
    }
    try {
      patchExecuteAction(widget as unknown as object, widget, getDoc);
    } catch {
      /* ignore */
    }
    const doc = getDoc();
    if (doc?.body) attachDoc(doc);
  };

  tick();
  for (const d of [100, 400, 1000, 2500, 5000]) window.setTimeout(tick, d);
  poll = window.setInterval(tick, 5000);

  return () => {
    disposed = true;
    window.clearInterval(poll);
    if (attachedDoc) {
      attachedDoc.removeEventListener("click", onPointer, true);
      attachedDoc.removeEventListener("pointerdown", onPointer, true);
      attachedDoc.removeEventListener("mousedown", onPointer, true);
      closeOverlay(attachedDoc);
    }
    mo?.disconnect();
    mo = null;
    attachedDoc = null;
  };
}
