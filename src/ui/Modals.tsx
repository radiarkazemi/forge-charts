import { Fragment, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { CHART_TYPES, INDICATOR_CATALOG, INDICATOR_TABS, type IndicatorTab } from "../catalog";
import { UNIVERSE } from "../data/feed";
import type { ChartSource, EngineSnapshot, IndicatorKind, SymbolInfo } from "../engine/types";
import type { ChartEngine } from "../engine/ChartEngine";

const SYMBOL_FILTERS = [
  { id: "all", label: "All" },
  { id: "stock", label: "Stocks" },
  { id: "fund", label: "Funds" },
  { id: "future", label: "Futures" },
  { id: "fx", label: "Forex" },
  { id: "crypto", label: "Crypto" },
  { id: "index", label: "Indices" },
  { id: "bond", label: "Bonds" },
  { id: "economy", label: "Economy" },
  { id: "option", label: "Options" },
] as const;

type FilterId = (typeof SYMBOL_FILTERS)[number]["id"];

function highlight(text: string, q: string): ReactNode {
  if (!q) return text;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <mark>{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

function matches(symbol: SymbolInfo, needle: string, kind: FilterId): boolean {
  if (kind !== "all" && symbol.type !== kind) return false;
  if (!needle) return true;
  return `${symbol.ticker} ${symbol.name} ${symbol.exchange} ${symbol.type}`.toLowerCase().includes(needle);
}

export function SymbolModal({
  open,
  onClose,
  onPick,
  title = "Symbol Search",
  initialQuery = "",
  recent = [],
}: {
  open: boolean;
  onClose: () => void;
  onPick: (s: SymbolInfo) => void;
  title?: string;
  initialQuery?: string;
  recent?: SymbolInfo[];
}) {
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<FilterId>("all");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});

  useEffect(() => {
    if (!open) return;
    setQ(initialQuery);
    setKind("all");
    setActive(0);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      const el = inputRef.current;
      if (el) el.setSelectionRange(el.value.length, el.value.length);
    });
  }, [initialQuery, open]);

  const needle = q.trim().toLowerCase();
  const recentRows = useMemo(
    () =>
      recent
        .filter((item, index, arr) => arr.findIndex((s) => s.ticker === item.ticker) === index)
        .filter((s) => matches(s, needle, kind))
        .slice(0, 8),
    [kind, needle, recent],
  );

  const list = useMemo(() => {
    const ranked = UNIVERSE.filter((s) => matches(s, needle, kind)).sort((a, b) => {
      const aTicker = a.ticker.toLowerCase().startsWith(needle) ? 0 : 1;
      const bTicker = b.ticker.toLowerCase().startsWith(needle) ? 0 : 1;
      if (aTicker !== bTicker) return aTicker - bTicker;
      return a.ticker.localeCompare(b.ticker);
    });
    if (needle) return ranked;
    const recentIds = new Set(recentRows.map((s) => s.ticker));
    return ranked.filter((s) => !recentIds.has(s.ticker));
  }, [kind, needle, recentRows]);

  const rows = needle ? list : [...recentRows, ...list];

  useEffect(() => {
    setActive(0);
  }, [kind, q]);

  useEffect(() => {
    const row = rows[active];
    if (!row) return;
    rowRefs.current[row.ticker]?.scrollIntoView({ block: "nearest" });
  }, [active, rows]);

  const pick = (symbol: SymbolInfo) => onPick(symbol);

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(rows.length - 1, i + 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const hit = rows[active];
      if (hit) pick(hit);
    }
  };

  if (!open) return null;
  const showingRecent = !needle && recentRows.length > 0;

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal symbol-modal" onClick={(e) => e.stopPropagation()}>
        <div className="symbol-head">
          <h2>{title}</h2>
          <input
            ref={inputRef}
            autoFocus
            placeholder="Search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
          />
        </div>
        <div className="symbol-tabs">
          {SYMBOL_FILTERS.map((item) => (
            <button key={item.id} type="button" className={kind === item.id ? "on" : ""} onClick={() => setKind(item.id)}>
              {item.label}
            </button>
          ))}
        </div>
        <div className="symbol-table-wrap">
          <table className="symbol-table">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Description</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {showingRecent ? (
                <tr className="symbol-section">
                  <td colSpan={3}>Recents</td>
                </tr>
              ) : null}
              {rows.map((s, i) => (
                <tr
                  key={`${showingRecent && i < recentRows.length ? "r-" : ""}${s.ticker}-${i}`}
                  ref={(node) => {
                    rowRefs.current[s.ticker] = node;
                  }}
                  className={i === active ? "on" : ""}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(s);
                  }}
                >
                  <td>
                    <strong>{highlight(s.ticker, q.trim())}</strong>
                  </td>
                  <td>{highlight(s.name, q.trim())}</td>
                  <td>{s.exchange}</td>
                </tr>
              ))}
              {!rows.length ? (
                <tr className="empty-symbols">
                  <td colSpan={3}>No symbols found.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function IndicatorModal({
  open,
  onClose,
  onPick,
  favorites = [],
  onToggleFavorite,
  recent = [],
}: {
  open: boolean;
  onClose: () => void;
  onPick: (kind: IndicatorKind) => void;
  favorites?: string[];
  onToggleFavorite?: (id: string) => void;
  recent?: IndicatorKind[];
}) {
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<IndicatorTab>("technicals");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});

  useEffect(() => {
    if (!open) return;
    setQ("");
    setTab("technicals");
    setActive(0);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  const needle = q.trim().toLowerCase();
  const favSet = useMemo(() => new Set(favorites), [favorites]);

  const matches = (item: (typeof INDICATOR_CATALOG)[number]) => {
    if (!needle && item.tab !== tab) return false;
    if (!needle) return true;
    const hay = `${item.label} ${item.group} ${item.author ?? ""} ${item.kind ?? ""} ${item.tab}`.toLowerCase();
    return hay.includes(needle);
  };

  const favoriteRows = useMemo(
    () => INDICATOR_CATALOG.filter((item) => item.tab === tab && item.kind && favSet.has(item.id) && matches(item)),
    [favSet, needle, tab],
  );

  const recentRows = useMemo(() => {
    const seen = new Set<string>();
    return recent
      .map((kind) => INDICATOR_CATALOG.find((item) => item.kind === kind && item.tab === "technicals"))
      .filter((item): item is (typeof INDICATOR_CATALOG)[number] => !!item)
      .filter((item) => {
        if (seen.has(item.id)) return false;
        seen.add(item.id);
        return matches(item);
      })
      .slice(0, 8);
  }, [needle, recent, tab]);

  const catalogRows = useMemo(() => {
    const items = INDICATOR_CATALOG.filter((item) => matches(item) && !favSet.has(item.id));
    const recentIds = new Set(recentRows.map((item) => item.id));
    if (!needle && tab === "technicals") {
      return items.filter((item) => !recentIds.has(item.id));
    }
    return items;
  }, [favSet, matches, needle, recentRows, tab]);

  const rows = useMemo(() => {
    if (needle) return INDICATOR_CATALOG.filter((item) => matches(item));
    const out: (typeof INDICATOR_CATALOG)[number][] = [];
    if (favoriteRows.length) out.push(...favoriteRows);
    if (tab === "technicals" && recentRows.length) out.push(...recentRows.filter((item) => !favSet.has(item.id)));
    const used = new Set(out.map((item) => item.id));
    out.push(...catalogRows.filter((item) => !used.has(item.id)));
    return out;
  }, [catalogRows, favoriteRows, favSet, matches, needle, recentRows, tab]);

  const sections = useMemo(() => {
    if (needle) {
      return [...new Set(rows.map((item) => item.group))].map((group) => ({
        title: group,
        items: rows.filter((item) => item.group === group),
      }));
    }
    const chunks: { title: string; items: typeof rows }[] = [];
    if (favoriteRows.length) chunks.push({ title: "Favorites", items: favoriteRows });
    if (tab === "technicals" && recentRows.length) {
      chunks.push({
        title: "Recently used",
        items: recentRows.filter((item) => !favSet.has(item.id)),
      });
    }
    const rest = catalogRows.filter((item) => !favoriteRows.some((f) => f.id === item.id));
    for (const group of [...new Set(rest.map((item) => item.group))]) {
      chunks.push({ title: group, items: rest.filter((item) => item.group === group) });
    }
    return chunks.filter((chunk) => chunk.items.length);
  }, [catalogRows, favoriteRows, favSet, needle, recentRows, rows, tab]);

  const flatRows = useMemo(() => sections.flatMap((section) => section.items), [sections]);

  useEffect(() => {
    setActive(0);
  }, [q, tab]);

  useEffect(() => {
    const row = flatRows[active];
    if (!row) return;
    rowRefs.current[row.id]?.scrollIntoView({ block: "nearest" });
  }, [active, flatRows]);

  const tryPick = (item: (typeof INDICATOR_CATALOG)[number]) => {
    if (!item.kind) return;
    onPick(item.kind);
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(flatRows.length - 1, i + 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const hit = flatRows[active];
      if (hit?.kind) tryPick(hit);
    }
  };

  if (!open) return null;

  let rowIndex = -1;

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal symbol-modal indicator-modal" onClick={(e) => e.stopPropagation()}>
        <div className="symbol-head">
          <h2>Indicators, metrics, and strategies</h2>
          <input
            ref={inputRef}
            autoFocus
            placeholder="Search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
          />
        </div>
        <div className="symbol-tabs">
          {INDICATOR_TABS.map((item) => (
            <button key={item.id} type="button" className={tab === item.id ? "on" : ""} onClick={() => setTab(item.id)}>
              {item.label}
            </button>
          ))}
        </div>
        <div className="symbol-table-wrap">
          <table className="symbol-table indicator-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Category</th>
                <th>Author</th>
                <th className="ind-fav-col" />
              </tr>
            </thead>
            <tbody>
              {sections.map((section) => (
                <Fragment key={`section-${section.title}`}>
                  <tr className="symbol-section">
                    <td colSpan={4}>{section.title}</td>
                  </tr>
                  {section.items.map((item) => {
                    rowIndex += 1;
                    const idx = rowIndex;
                    return (
                      <tr
                        key={item.id}
                        ref={(node) => {
                          rowRefs.current[item.id] = node;
                        }}
                        className={`${idx === active ? "on" : ""}${item.kind ? "" : " ind-disabled"}`}
                        onMouseEnter={() => setActive(idx)}
                        onMouseDown={(e) => {
                          if ((e.target as HTMLElement).closest(".ind-star")) return;
                          e.preventDefault();
                          if (item.kind) tryPick(item);
                        }}
                      >
                        <td>
                          <strong>{highlight(item.label, q.trim())}</strong>
                          {!item.kind ? <span className="ind-badge">Preview</span> : null}
                        </td>
                        <td>{highlight(item.group, q.trim())}</td>
                        <td>{item.author ?? (item.tab === "technicals" ? "Built-in" : "—")}</td>
                        <td className="ind-fav-col">
                          {item.kind ? (
                            <button
                              type="button"
                              className={`ind-star${favSet.has(item.id) ? " on" : ""}`}
                              title={favSet.has(item.id) ? "Remove from favorites" : "Add to favorites"}
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={() => onToggleFavorite?.(item.id)}
                            >
                              {favSet.has(item.id) ? "★" : "☆"}
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
              {!flatRows.length ? (
                <tr className="empty-symbols">
                  <td colSpan={4}>
                    {tab === "invite" ? "No invite-only scripts on this account." : "No indicators found."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function SettingsModal({
  open,
  onClose,
  theme,
  onTheme,
  engine,
  snap,
}: {
  open: boolean;
  onClose: () => void;
  theme: "dark" | "light";
  onTheme: (t: "dark" | "light") => void;
  engine: ChartEngine | null;
  snap: EngineSnapshot | null;
}) {
  if (!open) return null;
  const style = snap?.chartStyle;
  const sourceOptions: ChartSource[] = ["open", "high", "low", "close", "hl2", "hlc3", "ohlc4"];
  const currentType = CHART_TYPES.find((item) => item.id === snap?.chartType);
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Chart settings</h2>
        <label className="row">
          Theme
          <select value={theme} onChange={(e) => onTheme(e.target.value as "dark" | "light")}>
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
        </label>
        <div className="settings-block">
          <h3>Chart Type</h3>
          <p className="hint">{currentType?.label ?? "Chart"} style</p>
          <label className="row">
            Source
            <select value={style?.source ?? "close"} onChange={(e) => engine?.setChartStyle({ source: e.target.value as ChartSource })}>
              {sourceOptions.map((source) => (
                <option key={source} value={source}>
                  {source.toUpperCase()}
                </option>
              ))}
            </select>
          </label>
          <label className="row">
            Up color
            <input type="color" value={style?.upColor ?? "#26a69a"} onChange={(e) => engine?.setChartStyle({ upColor: e.target.value })} />
          </label>
          <label className="row">
            Down color
            <input type="color" value={style?.downColor ?? "#ef5350"} onChange={(e) => engine?.setChartStyle({ downColor: e.target.value })} />
          </label>
          <label className="row">
            Wick up
            <input type="color" value={style?.wickUpColor ?? "#26a69a"} onChange={(e) => engine?.setChartStyle({ wickUpColor: e.target.value })} />
          </label>
          <label className="row">
            Wick down
            <input type="color" value={style?.wickDownColor ?? "#ef5350"} onChange={(e) => engine?.setChartStyle({ wickDownColor: e.target.value })} />
          </label>
          <label className="row">
            Border up
            <input type="color" value={style?.borderUpColor ?? "#26a69a"} onChange={(e) => engine?.setChartStyle({ borderUpColor: e.target.value })} />
          </label>
          <label className="row">
            Border down
            <input type="color" value={style?.borderDownColor ?? "#ef5350"} onChange={(e) => engine?.setChartStyle({ borderDownColor: e.target.value })} />
          </label>
          <label className="row">
            Show wick
            <input type="checkbox" checked={style?.showWick ?? true} onChange={(e) => engine?.setChartStyle({ showWick: e.target.checked })} />
          </label>
          <label className="row">
            Show border
            <input type="checkbox" checked={style?.showBorder ?? true} onChange={(e) => engine?.setChartStyle({ showBorder: e.target.checked })} />
          </label>
        </div>
        <p className="hint">Scale, magnet, and grid are also on the chart overlays and drawing toolbar.</p>
        <button className="primary" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}
