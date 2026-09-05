import { Fragment, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { CHART_TYPES, INDICATOR_CATALOG, INDICATOR_ROLE_FILTERS, INDICATOR_TABS, type IndicatorTab } from "../catalog";
import { UNIVERSE } from "../data/feed";
import type { ChartSource, EngineSnapshot, IndicatorKind, SymbolInfo, Tool } from "../engine/types";
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
  onPickTool,
  onPickStrategy,
  favorites = [],
  onToggleFavorite,
  recent = [],
  activeKinds = [],
}: {
  open: boolean;
  onClose: () => void;
  onPick: (kind: IndicatorKind) => void;
  onPickTool?: (tool: Tool) => void;
  onPickStrategy?: (strategyId: string) => void;
  favorites?: string[];
  onToggleFavorite?: (id: string) => void;
  recent?: IndicatorKind[];
  activeKinds?: IndicatorKind[];
}) {
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<IndicatorTab>("technicals");
  const [role, setRole] = useState<(typeof INDICATOR_ROLE_FILTERS)[number]["id"]>("all");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});

  useEffect(() => {
    if (!open) return;
    setQ("");
    setTab("technicals");
    setRole("all");
    setActive(0);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  const needle = q.trim().toLowerCase();
  const favSet = useMemo(() => new Set(favorites), [favorites]);
  const onChart = useMemo(() => new Set(activeKinds), [activeKinds]);

  const tabCounts = useMemo(() => {
    const counts: Record<IndicatorTab, number> = {
      technicals: 0,
      financials: 0,
      community: 0,
      invite: 0,
      patterns: 0,
    };
    for (const item of INDICATOR_CATALOG) counts[item.tab] += 1;
    return counts;
  }, []);

  const roleFilters = useMemo(() => {
    if (tab === "technicals") {
      return INDICATOR_ROLE_FILTERS.filter((item) => item.id === "all" || item.id === "indicator" || item.id === "strategy");
    }
    if (tab === "financials") {
      return INDICATOR_ROLE_FILTERS.filter((item) => item.id === "all" || item.id === "metric");
    }
    if (tab === "patterns") {
      return INDICATOR_ROLE_FILTERS.filter((item) => item.id === "all" || item.id === "pattern");
    }
    return INDICATOR_ROLE_FILTERS.filter((item) => item.id === "all" || item.id === "script");
  }, [tab]);

  useEffect(() => {
    if (!roleFilters.some((item) => item.id === role)) setRole("all");
  }, [role, roleFilters]);

  const matchesItem = (item: (typeof INDICATOR_CATALOG)[number]) => {
    if (!needle && item.tab !== tab) return false;
    if (role !== "all" && item.role !== role) return false;
    if (!needle) return true;
    const hay = `${item.label} ${item.group} ${item.author ?? ""} ${item.kind ?? ""} ${item.tab} ${item.role}`.toLowerCase();
    return hay.includes(needle);
  };

  const favoriteRows = useMemo(
    () => INDICATOR_CATALOG.filter((item) => favSet.has(item.id) && matchesItem(item)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [favSet, needle, role, tab],
  );

  const recentRows = useMemo(() => {
    if (tab !== "technicals" && !needle) return [];
    const seen = new Set<string>();
    return recent
      .map((kind) => INDICATOR_CATALOG.find((item) => item.kind === kind))
      .filter((item): item is (typeof INDICATOR_CATALOG)[number] => !!item)
      .filter((item) => {
        if (seen.has(item.id)) return false;
        seen.add(item.id);
        return matchesItem(item);
      })
      .slice(0, 8);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needle, recent, role, tab]);

  const catalogRows = useMemo(() => {
    const items = INDICATOR_CATALOG.filter((item) => matchesItem(item) && !favSet.has(item.id));
    if (!needle && tab === "technicals") {
      const recentIds = new Set(recentRows.map((item) => item.id));
      return items.filter((item) => !recentIds.has(item.id));
    }
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [favSet, needle, recentRows, role, tab]);

  const sections = useMemo(() => {
    if (needle) {
      return [...new Set(INDICATOR_CATALOG.filter(matchesItem).map((item) => item.group))].map((group) => ({
        title: group,
        items: INDICATOR_CATALOG.filter((item) => matchesItem(item) && item.group === group),
      }));
    }
    const chunks: { title: string; items: (typeof INDICATOR_CATALOG)[number][] }[] = [];
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogRows, favoriteRows, favSet, needle, recentRows, role, tab]);

  const flatRows = useMemo(() => sections.flatMap((section) => section.items), [sections]);

  useEffect(() => {
    setActive(0);
  }, [q, tab, role]);

  useEffect(() => {
    const row = flatRows[active];
    if (!row) return;
    rowRefs.current[row.id]?.scrollIntoView({ block: "nearest" });
  }, [active, flatRows]);

  const strategyMap: Record<string, string> = {
    "strat:ma-cross": "ma_cross",
    "strat:rsi-revert": "rsi_revert",
    "strat:macd-trend": "macd_trend",
    "strat:breakout": "donchian_break",
  };

  const actionable = (item: (typeof INDICATOR_CATALOG)[number]) => {
    if (item.tab === "invite") return false;
    return !!(item.kind || item.tool || strategyMap[item.id]);
  };

  const tryPick = (item: (typeof INDICATOR_CATALOG)[number]) => {
    if (item.tab === "invite") return;
    if (item.kind) {
      onPick(item.kind);
      return;
    }
    if (item.tool) {
      onPickTool?.(item.tool);
      return;
    }
    const sid = strategyMap[item.id];
    if (sid) onPickStrategy?.(sid);
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
      if (hit && actionable(hit)) tryPick(hit);
    }
  };

  if (!open) return null;

  let rowIndex = -1;
  const emptyHint =
    tab === "invite"
      ? "Invite-only scripts stay locked until an access grant is available. Nothing here can be added to the chart."
      : tab === "financials"
        ? "No matching financial metrics. Demo series use price-derived studies until a fundamentals feed lands."
        : tab === "community"
          ? "No matching community scripts. Listed scripts import as built-in study stand-ins (publish/sync remains OUT)."
          : "No indicators found.";

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal symbol-modal indicator-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Indicators">
        <div className="symbol-head ind-head">
          <div className="ind-head-row">
            <h2>Indicators, metrics, and strategies</h2>
            <button type="button" className="ind-close" onClick={onClose} title="Close">
              ✕
            </button>
          </div>
          <div className="ind-search">
            <input
              ref={inputRef}
              autoFocus
              placeholder="Search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={onKey}
            />
            {q ? (
              <button type="button" className="ind-clear" onClick={() => setQ("")} title="Clear search">
                Clear
              </button>
            ) : null}
          </div>
        </div>
        <div className="symbol-tabs">
          {INDICATOR_TABS.map((item) => (
            <button key={item.id} type="button" className={tab === item.id ? "on" : ""} onClick={() => setTab(item.id)}>
              {item.label}
              <span className="ind-tab-count">{tabCounts[item.id]}</span>
            </button>
          ))}
        </div>
        <div className="ind-role-row">
          {roleFilters.map((item) => (
            <button key={item.id} type="button" className={role === item.id ? "on" : ""} onClick={() => setRole(item.id)}>
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
                    const canAct = actionable(item);
                    const alreadyOn = !!(item.kind && onChart.has(item.kind));
                    return (
                      <tr
                        key={item.id}
                        ref={(node) => {
                          rowRefs.current[item.id] = node;
                        }}
                        className={`${idx === active ? "on" : ""}${canAct ? "" : " ind-disabled"}`}
                        onMouseEnter={() => setActive(idx)}
                        onMouseDown={(e) => {
                          if ((e.target as HTMLElement).closest(".ind-star")) return;
                          e.preventDefault();
                          if (canAct) tryPick(item);
                        }}
                      >
                        <td>
                          <strong>{highlight(item.label, q.trim())}</strong>
                          {alreadyOn ? <span className="ind-badge on-chart">On chart</span> : null}
                          {item.tab === "invite" ? <span className="ind-badge locked">Locked</span> : null}
                          {item.tab !== "invite" && !canAct ? <span className="ind-badge">Preview</span> : null}
                          {item.tool && !item.kind ? <span className="ind-badge arm">Draw</span> : null}
                          {item.role === "strategy" ? <span className="ind-badge strat">Strategy</span> : null}
                          {item.role === "metric" && item.kind ? <span className="ind-badge metric">Demo</span> : null}
                          {item.role === "metric" && !item.kind ? <span className="ind-badge metric">Metric</span> : null}
                          {item.role === "script" && item.kind ? <span className="ind-badge">Import</span> : null}
                        </td>
                        <td>{highlight(item.group, q.trim())}</td>
                        <td>{item.author ?? (item.tab === "technicals" ? "Built-in" : item.tab === "patterns" ? "Built-in" : "—")}</td>
                        <td className="ind-fav-col">
                          <button
                            type="button"
                            className={`ind-star${favSet.has(item.id) ? " on" : ""}`}
                            title={favSet.has(item.id) ? "Remove from favorites" : "Add to favorites"}
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={() => onToggleFavorite?.(item.id)}
                          >
                            {favSet.has(item.id) ? "★" : "☆"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
              {!flatRows.length ? (
                <tr className="empty-symbols">
                  <td colSpan={4}>{emptyHint}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="ind-footer">
          <span>Click to add · ★ favorite · Alt+I open · Esc close</span>
          <span>{flatRows.length} shown</span>
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
  const [tab, setTab] = useState<"symbol" | "status" | "scales" | "canvas">("symbol");
  if (!open) return null;
  const style = snap?.chartStyle;
  const cv = snap?.canvas;
  const sourceOptions: ChartSource[] = ["open", "high", "low", "close", "hl2", "hlc3", "ohlc4"];
  const currentType = CHART_TYPES.find((item) => item.id === snap?.chartType);
  const TABS: Array<{ id: typeof tab; label: string }> = [
    { id: "symbol", label: "Symbol" },
    { id: "status", label: "Status line" },
    { id: "scales", label: "Scales" },
    { id: "canvas", label: "Canvas" },
  ];
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal tall settings-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Chart settings</h2>
        <div className="ind-tab-row">
          {TABS.map((t) => (
            <button key={t.id} type="button" className={tab === t.id ? "on" : ""} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === "symbol" ? (
          <div className="settings-tab-body">
            <label className="row">
              Theme
              <select value={theme} onChange={(e) => onTheme(e.target.value as "dark" | "light")}>
                <option value="dark">Dark</option>
                <option value="light">Light</option>
              </select>
            </label>
            <h3>{currentType?.label ?? "Chart"} style</h3>
            <label className="row">
              Source
              <select value={style?.source ?? "close"} onChange={(e) => engine?.setChartStyle({ source: e.target.value as ChartSource })}>
                {sourceOptions.map((source) => (
                  <option key={source} value={source}>{source.toUpperCase()}</option>
                ))}
              </select>
            </label>
            <label className="row">Up color <input type="color" value={style?.upColor ?? "#26a69a"} onChange={(e) => engine?.setChartStyle({ upColor: e.target.value })} /></label>
            <label className="row">Down color <input type="color" value={style?.downColor ?? "#ef5350"} onChange={(e) => engine?.setChartStyle({ downColor: e.target.value })} /></label>
            <label className="row">Wick up <input type="color" value={style?.wickUpColor ?? "#26a69a"} onChange={(e) => engine?.setChartStyle({ wickUpColor: e.target.value })} /></label>
            <label className="row">Wick down <input type="color" value={style?.wickDownColor ?? "#ef5350"} onChange={(e) => engine?.setChartStyle({ wickDownColor: e.target.value })} /></label>
            <label className="row">Border up <input type="color" value={style?.borderUpColor ?? "#26a69a"} onChange={(e) => engine?.setChartStyle({ borderUpColor: e.target.value })} /></label>
            <label className="row">Border down <input type="color" value={style?.borderDownColor ?? "#ef5350"} onChange={(e) => engine?.setChartStyle({ borderDownColor: e.target.value })} /></label>
            <label className="row check-row"><input type="checkbox" checked={style?.showWick ?? true} onChange={(e) => engine?.setChartStyle({ showWick: e.target.checked })} /> Show wicks</label>
            <label className="row check-row"><input type="checkbox" checked={style?.showBorder ?? true} onChange={(e) => engine?.setChartStyle({ showBorder: e.target.checked })} /> Show borders</label>
          </div>
        ) : null}

        {tab === "status" ? (
          <div className="settings-tab-body">
            <h3>Status line</h3>
            <label className="row check-row"><input type="checkbox" checked={cv?.showOhlc ?? true} onChange={(e) => engine?.setCanvasSettings({ showOhlc: e.target.checked })} /> Show OHLC values</label>
            <label className="row check-row"><input type="checkbox" checked={cv?.showBarChange ?? true} onChange={(e) => engine?.setCanvasSettings({ showBarChange: e.target.checked })} /> Show bar change %</label>
            <label className="row check-row"><input type="checkbox" checked={cv?.showVolumeLegend ?? true} onChange={(e) => engine?.setCanvasSettings({ showVolumeLegend: e.target.checked })} /> Show volume</label>
          </div>
        ) : null}

        {tab === "scales" ? (
          <div className="settings-tab-body">
            <h3>Price scale</h3>
            <label className="row check-row"><input type="checkbox" checked={snap?.logScale ?? false} onChange={() => engine?.toggle("logScale")} /> Logarithmic</label>
            <label className="row check-row"><input type="checkbox" checked={snap?.percentScale ?? false} onChange={() => engine?.toggle("percentScale")} /> Percent</label>
            <label className="row check-row"><input type="checkbox" checked={snap?.indexedScale ?? false} onChange={() => engine?.toggle("indexedScale")} /> Indexed to 100</label>
            <label className="row check-row"><input type="checkbox" checked={cv?.invertScale ?? false} onChange={(e) => engine?.setCanvasSettings({ invertScale: e.target.checked })} /> Invert scale</label>
            <label className="row check-row"><input type="checkbox" checked={cv?.lockRatio ?? false} onChange={(e) => engine?.setCanvasSettings({ lockRatio: e.target.checked })} /> Lock price-to-bar ratio</label>
            <label className="row check-row"><input type="checkbox" checked={cv?.scalePriceOnly ?? false} onChange={(e) => engine?.setCanvasSettings({ scalePriceOnly: e.target.checked })} /> Scale price chart only</label>
            <label className="row check-row"><input type="checkbox" checked={cv?.leftScale ?? false} onChange={(e) => engine?.setCanvasSettings({ leftScale: e.target.checked })} /> Left price scale</label>
            <label className="row check-row"><input type="checkbox" checked={cv?.rightScale ?? true} onChange={(e) => engine?.setCanvasSettings({ rightScale: e.target.checked })} /> Right price scale</label>
            <h3>Labels & overlays</h3>
            <label className="row check-row"><input type="checkbox" checked={cv?.showCountdown ?? true} onChange={(e) => engine?.setCanvasSettings({ showCountdown: e.target.checked })} /> Countdown to bar close</label>
            <label className="row check-row"><input type="checkbox" checked={cv?.showHighLow ?? true} onChange={(e) => engine?.setCanvasSettings({ showHighLow: e.target.checked })} /> High/low price labels</label>
            <label className="row check-row"><input type="checkbox" checked={cv?.showPrevDayClose ?? true} onChange={(e) => engine?.setCanvasSettings({ showPrevDayClose: e.target.checked })} /> Previous day close line</label>
            <label className="row check-row"><input type="checkbox" checked={cv?.volumeOverlay ?? true} onChange={(e) => engine?.setCanvasSettings({ volumeOverlay: e.target.checked })} /> Volume overlay on main pane</label>
            <label className="row check-row"><input type="checkbox" checked={cv?.sessionBreaks ?? false} onChange={(e) => engine?.setCanvasSettings({ sessionBreaks: e.target.checked })} /> Session breaks</label>
            <label className="row check-row"><input type="checkbox" checked={cv?.showEvents ?? false} onChange={(e) => engine?.setCanvasSettings({ showEvents: e.target.checked })} /> Events on time scale</label>
            <h3>Time scale</h3>
            <label className="row check-row"><input type="checkbox" checked={cv?.pinLeft ?? false} onChange={(e) => engine?.setCanvasSettings({ pinLeft: e.target.checked })} /> Pin chart left when changing interval</label>
            <label className="row">
              Timezone
              <select value={cv?.timezone ?? "UTC"} onChange={(e) => engine?.setCanvasSettings({ timezone: e.target.value })}>
                {["UTC","America/New_York","America/Chicago","America/Los_Angeles","Europe/London","Europe/Berlin","Asia/Tokyo","Asia/Singapore","Australia/Sydney","Exchange"].map((z) => (
                  <option key={z} value={z === "Exchange" ? "UTC" : z}>{z}</option>
                ))}
              </select>
            </label>
            <label className="row">
              Date format
              <select value={cv?.dateFormat ?? "default"} onChange={(e) => engine?.setCanvasSettings({ dateFormat: e.target.value as "default" | "ymd" | "dmy" | "mdy" })}>
                <option value="default">Default</option>
                <option value="ymd">YYYY-MM-DD</option>
                <option value="dmy">DD/MM/YYYY</option>
                <option value="mdy">MM/DD/YYYY</option>
              </select>
            </label>
          </div>
        ) : null}

        {tab === "canvas" ? (
          <div className="settings-tab-body">
            <h3>Background</h3>
            <label className="row">Background <input type="color" value={cv?.bgColor || (theme === "dark" ? "#131722" : "#ffffff")} onChange={(e) => engine?.setCanvasSettings({ bgColor: e.target.value })} /></label>
            <h3>Grid</h3>
            <label className="row">
              Grid
              <select
                value={cv?.gridMode ?? (snap?.showGrid ? "both" : "none")}
                onChange={(e) => {
                  const gridMode = e.target.value as "both" | "vert" | "horiz" | "none";
                  engine?.setCanvasSettings({ gridMode });
                  if ((snap?.showGrid ?? true) !== (gridMode !== "none")) engine?.toggle("showGrid");
                }}
              >
                <option value="both">Both</option>
                <option value="vert">Vertical</option>
                <option value="horiz">Horizontal</option>
                <option value="none">None</option>
              </select>
            </label>
            <label className="row">Grid color <input type="color" value={cv?.gridColor || (theme === "dark" ? "#2a2e39" : "#e0e3eb")} onChange={(e) => engine?.setCanvasSettings({ gridColor: e.target.value })} /></label>
            <h3>Crosshair</h3>
            <label className="row">Crosshair color <input type="color" value={cv?.crosshairColor || (theme === "dark" ? "#758696" : "#9598a1")} onChange={(e) => engine?.setCanvasSettings({ crosshairColor: e.target.value })} /></label>
            <label className="row">
              Crosshair style
              <select value={cv?.crosshairStyle ?? "dashed"} onChange={(e) => engine?.setCanvasSettings({ crosshairStyle: e.target.value as "solid" | "dashed" | "dotted" })}>
                <option value="solid">Solid</option>
                <option value="dashed">Dashed</option>
                <option value="dotted">Dotted</option>
              </select>
            </label>
            <label className="row">
              Crosshair width
              <select value={cv?.crosshairWidth ?? 1} onChange={(e) => engine?.setCanvasSettings({ crosshairWidth: Number(e.target.value) })}>
                {[1, 2, 3, 4].map((w) => (
                  <option key={w} value={w}>{w}</option>
                ))}
              </select>
            </label>
            <label className="row check-row"><input type="checkbox" checked={cv?.showTrackerBox ?? true} onChange={(e) => engine?.setCanvasSettings({ showTrackerBox: e.target.checked })} /> OHLC tracker box</label>
            <label className="row check-row"><input type="checkbox" checked={cv?.showLastPriceLine ?? true} onChange={(e) => engine?.setCanvasSettings({ showLastPriceLine: e.target.checked })} /> Current price line</label>
            <h3>Watermark</h3>
            <label className="row check-row"><input type="checkbox" checked={cv?.showWatermark ?? true} onChange={(e) => engine?.setCanvasSettings({ showWatermark: e.target.checked })} /> Show symbol watermark</label>
            <label className="row">
              Opacity
              <input type="range" min="0" max="0.3" step="0.01" value={cv?.watermarkOpacity ?? 0.07} onChange={(e) => engine?.setCanvasSettings({ watermarkOpacity: Number(e.target.value) })} />
            </label>
            <h3>Panes & margins</h3>
            <label className="row check-row"><input type="checkbox" checked={cv?.showPaneButtons ?? true} onChange={(e) => engine?.setCanvasSettings({ showPaneButtons: e.target.checked })} /> Show pane buttons</label>
            <label className="row">Top margin
              <input type="range" min="0" max="0.4" step="0.01" value={cv?.marginTop ?? 0.08} onChange={(e) => engine?.setCanvasSettings({ marginTop: Number(e.target.value) })} />
            </label>
            <label className="row">Bottom margin
              <input type="range" min="0" max="0.4" step="0.01" value={cv?.marginBottom ?? 0.08} onChange={(e) => engine?.setCanvasSettings({ marginBottom: Number(e.target.value) })} />
            </label>
            <label className="row">Right margin
              <input type="range" min="0" max="0.4" step="0.01" value={cv?.marginRight ?? 0.05} onChange={(e) => engine?.setCanvasSettings({ marginRight: Number(e.target.value) })} />
            </label>
            <h3>Navigation</h3>
            <label className="row check-row"><input type="checkbox" checked={cv?.showNavButtons ?? true} onChange={(e) => engine?.setCanvasSettings({ showNavButtons: e.target.checked })} /> Show zoom / scale buttons</label>
          </div>
        ) : null}

        <button className="primary" onClick={onClose}>Done</button>
      </div>
    </div>
  );
}
