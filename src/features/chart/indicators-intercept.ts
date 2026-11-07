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
  width: 188px; flex-shrink: 0; background: #f0f3fa; border-right: 1px solid #e0e3eb;
  overflow-y: auto; padding: 10px 8px;
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
#${ROOT_ID} .fi-nav.is-active { background: rgba(41,98,255,0.14); color: #2962ff; font-weight: 700; }
#${ROOT_ID}.fi-dark .fi-nav.is-active { background: rgba(41,98,255,0.22); color: #8ab4ff; }
#${ROOT_ID} .fi-nav:hover { background: rgba(19,23,34,0.04); }
#${ROOT_ID}.fi-dark .fi-nav:hover { background: rgba(209,212,220,0.06); }
#${ROOT_ID} .fi-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
#${ROOT_ID} .fi-search-wrap { padding: 12px 16px 8px; flex-shrink: 0; }
#${ROOT_ID} .fi-search {
  width: 100%; box-sizing: border-box; border-radius: 8px; border: 1px solid #e0e3eb;
  padding: 10px 12px; font-size: 13px; background: #f7f8fa; color: inherit; outline: none;
}
#${ROOT_ID}.fi-dark .fi-search { background: rgba(120,123,134,0.1); border-color: #2a2e39; color: #d1d4dc; }
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
`;
  (doc.head || doc.documentElement).appendChild(style);
}

type NavId = "favorites" | "myScripts" | "technicals" | "editorsPicks" | "top" | "trending";

function filterEntries(nav: NavId, q: string): ForgeIndicatorEntry[] {
  const query = q.trim().toLowerCase();
  return ALL_INDICATORS.filter((e) => {
    if (query) {
      const hay = `${e.name} ${e.author} ${e.shortDescription} ${e.tags.join(" ")}`.toLowerCase();
      if (!hay.includes(query)) return false;
    }
    if (nav === "favorites") return e.favorite;
    if (nav === "myScripts") return e.section === "forge";
    if (nav === "technicals") return true;
    return true;
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

function openOverlay(doc: Document, widget: IChartingLibraryWidget): void {
  ensureStyles(doc);
  removeNativeDialogs(doc);

  let root = doc.getElementById(ROOT_ID) as HTMLElement | null;
  if (!root) {
    root = doc.createElement("div");
    root.id = ROOT_ID;
    doc.body.appendChild(root);
  }

  // Match chart chrome: light chart in screenshots → light panel.
  const dark =
    doc.documentElement.classList.contains("theme-dark") ||
    doc.body.classList.contains("theme-dark") ||
    !!doc.querySelector(".theme-dark");
  root.className = dark ? "fi-dark" : "";

  let nav: NavId = "favorites";
  let query = "";

  root.innerHTML = `
    <div class="fi-panel" role="dialog" aria-label="Indicators">
      <div class="fi-head">
        <div class="fi-title">Indicators, metrics, and strategies</div>
        <button type="button" class="fi-close" aria-label="Close">×</button>
      </div>
      <div class="fi-body">
        <div class="fi-side">
          <div class="fi-side-h">PERSONAL</div>
          <button type="button" class="fi-nav is-active" data-nav="favorites">★ Favorites</button>
          <button type="button" class="fi-nav" data-nav="myScripts">👤 My scripts</button>
          <div class="fi-side-h">BUILT-IN</div>
          <button type="button" class="fi-nav" data-nav="technicals">📈 Technicals</button>
          <div class="fi-side-h">COMMUNITY</div>
          <button type="button" class="fi-nav" data-nav="editorsPicks">🏅 Editors' picks</button>
          <button type="button" class="fi-nav" data-nav="top">📊 Top</button>
          <button type="button" class="fi-nav" data-nav="trending">🔥 Trending</button>
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

  // Also notify React shell (optional parallel UI) — overlay is source of truth.
  try {
    window.dispatchEvent(new CustomEvent("forge:open-indicators"));
  } catch {
    /* ignore */
  }
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
    const raw = event.target;
    if (!(raw instanceof Element)) return;
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
