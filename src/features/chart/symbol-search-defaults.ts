/**
 * TradingView Symbol Search remembers the last exchange chip (often NASDAQ).
 * Our catalog only has four NASDAQ demo names, so the dialog looks “empty”
 * while XAUUSD / Iran gold / crypto sit under All exchanges.
 *
 * Clear sticky filters once and force “All exchanges” whenever the dialog opens.
 */

const PURGE_KEY = "forge.symbolSearch.exchangeReset.v1";

/** Drop Charting Library keys that persist a non-empty exchange filter. */
export function purgeStickySymbolSearchFilters(): void {
  if (typeof localStorage === "undefined") return;
  try {
    if (localStorage.getItem(PURGE_KEY) === "1") return;
  } catch {
    return;
  }
  const drop: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key) continue;
      const lower = key.toLowerCase();
      if (
        /symbol.?search/.test(lower) ||
        /symbolsearch/.test(lower) ||
        (/exchange/.test(lower) && /filter|search|ss[_-]/.test(lower))
      ) {
        drop.push(key);
      }
    }
    for (const key of drop) {
      try {
        localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
    }
    localStorage.setItem(PURGE_KEY, "1");
  } catch {
    /* ignore */
  }
}

function isSymbolSearchDialog(root: ParentNode): boolean {
  // Prefer explicit dialog chrome.
  const text = (root.textContent ?? "").slice(0, 400);
  return /Symbol Search/i.test(text) && /All types|All exchanges|SYMBOL/i.test(text);
}

function clickAllExchanges(doc: Document): boolean {
  // Button / menuitem that selects the empty exchange value.
  const candidates = Array.from(
    doc.querySelectorAll<HTMLElement>("button,div,span,a,[role='option'],[role='menuitem'],[data-name]"),
  );
  for (const el of candidates) {
    const name = (el.getAttribute("data-name") ?? "").toLowerCase();
    const t = (el.textContent ?? "").trim();
    if (name.includes("all") && name.includes("exchange")) {
      el.click();
      return true;
    }
    if (/^all exchanges$/i.test(t) || /^all$/i.test(t) && /exchange/i.test(el.parentElement?.textContent ?? "")) {
      el.click();
      return true;
    }
  }
  // Exchange filter control currently showing NASDAQ / BINANCE / etc. — open then pick All.
  const filterBtn = candidates.find((el) => {
    const t = (el.textContent ?? "").trim();
    return /^(NASDAQ|BINANCE|FOREXCOM|FXPRO|IRAN|TVC|SP|NYSE)$/i.test(t);
  });
  if (filterBtn) {
    filterBtn.click();
    const all = Array.from(doc.querySelectorAll<HTMLElement>("button,div,span,[role='option'],[role='menuitem']")).find(
      (el) => /^all exchanges$/i.test((el.textContent ?? "").trim()),
    );
    if (all) {
      all.click();
      return true;
    }
  }
  return false;
}

/**
 * When Symbol Search mounts, force the exchange chip back to All exchanges.
 * Best-effort DOM patch inside the chart iframe + host document.
 */
export function mountSymbolSearchExchangeReset(container: HTMLElement): () => void {
  let cancelled = false;
  let lastResetAt = 0;

  const tryReset = (doc: Document) => {
    if (cancelled) return;
    const now = Date.now();
    if (now - lastResetAt < 400) return;
    const dialog =
      (doc.querySelector('[data-name="symbol-search-items-dialog"]') as HTMLElement | null) ??
      (doc.querySelector('[data-dialog-name="Symbol Search"]') as HTMLElement | null) ??
      Array.from(doc.querySelectorAll<HTMLElement>('[role="dialog"],[data-name*="dialog"]')).find((el) =>
        isSymbolSearchDialog(el),
      );
    if (!dialog) return;
    // Already on All exchanges?
    const chip = (dialog.textContent ?? "").match(/\b(NASDAQ|BINANCE|FOREXCOM|FXPRO|IRAN|TVC|SP)\b/);
    const hasAll = /All exchanges/i.test(dialog.textContent ?? "");
    if (!chip && hasAll) return;
    if (clickAllExchanges(doc) || clickAllExchanges(dialog.ownerDocument)) {
      lastResetAt = now;
    }
  };

  const scan = () => {
    if (cancelled) return;
    tryReset(document);
    const iframe = container.querySelector("iframe");
    try {
      const idoc = iframe?.contentDocument;
      if (idoc) tryReset(idoc);
    } catch {
      /* cross-origin */
    }
  };

  const observer = new MutationObserver(scan);
  observer.observe(container, { childList: true, subtree: true });
  const timer = window.setInterval(scan, 800);
  scan();

  return () => {
    cancelled = true;
    observer.disconnect();
    window.clearInterval(timer);
  };
}
