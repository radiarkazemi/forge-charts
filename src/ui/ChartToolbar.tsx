import { useEffect, useRef, useState } from "react";
import { CHART_TYPES, DEFAULT_FAVORITE_INTERVALS, INTERVAL_GROUPS, intervalMeta } from "../catalog";
import { makeIntervalId } from "../data/interval";
import type { ChartEngine } from "../engine/ChartEngine";
import type { ChartType, Interval } from "../engine/types";
import { loadJson, saveJson } from "../persist";
import { useEngine } from "./useEngine";

const FAV_KEY = "forge.intervalFavorites";
const TYPE_FAV_KEY = "forge.chartTypeFavorites";
const CUSTOM_UNITS = [
  { id: "S", label: "seconds" },
  { id: "m", label: "minutes" },
  { id: "H", label: "hours" },
  { id: "D", label: "days" },
  { id: "W", label: "weeks" },
  { id: "M", label: "months" },
  { id: "R", label: "range" },
] as const;
const DEFAULT_FAVORITE_TYPES: ChartType[] = ["candle", "heikin", "line", "area", "renko", "pnf"];

type Props = {
  engine: ChartEngine | null;
  live: boolean;
  onOpenSymbol: () => void;
  onOpenIndicators: () => void;
  onOpenSettings: () => void;
  onOpenSearch: () => void;
  onInterval: (interval: Interval) => void;
  onCompare: () => void;
  onAlert: () => void;
};

export function ChartToolbar({
  engine,
  live,
  onOpenSymbol,
  onOpenIndicators,
  onOpenSettings,
  onOpenSearch,
  onInterval,
  onCompare,
  onAlert,
}: Props) {
  const snap = useEngine(engine);
  const [ivOpen, setIvOpen] = useState(false);
  const [typeOpen, setTypeOpen] = useState(false);
  const [favorites, setFavorites] = useState<Interval[]>(() => loadJson(FAV_KEY, DEFAULT_FAVORITE_INTERVALS));
  const [typeFavorites, setTypeFavorites] = useState<ChartType[]>(() => loadJson(TYPE_FAV_KEY, DEFAULT_FAVORITE_TYPES));
  const [customOpen, setCustomOpen] = useState(false);
  const [customN, setCustomN] = useState("7");
  const [customUnit, setCustomUnit] = useState<(typeof CUSTOM_UNITS)[number]["id"]>("m");
  const ivRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    saveJson(FAV_KEY, favorites);
  }, [favorites]);

  useEffect(() => {
    saveJson(TYPE_FAV_KEY, typeFavorites);
  }, [typeFavorites]);

  useEffect(() => {
    if (!ivOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!ivRef.current?.contains(e.target as Node)) {
        setIvOpen(false);
        setCustomOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [ivOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (e.key === ",") {
        e.preventDefault();
        setIvOpen((v) => !v);
        setTypeOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const current = intervalMeta(snap?.interval ?? "15");
  const quick = favorites.length ? favorites : DEFAULT_FAVORITE_INTERVALS;

  const choose = (id: Interval) => {
    onInterval(id);
    setIvOpen(false);
    setCustomOpen(false);
  };

  const toggleFav = (id: Interval) => {
    setFavorites((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const addCustom = () => {
    const n = Number(customN);
    if (!Number.isFinite(n) || n < 1) return;
    const id = makeIntervalId(n, customUnit);
    setFavorites((prev) => (prev.includes(id) ? prev : [...prev, id]));
    choose(id);
  };

  const toggleTypeFav = (id: ChartType) => {
    setTypeFavorites((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const typeGroups = [...new Set(CHART_TYPES.map((item) => item.group))].map((group) => ({
    group,
    items: CHART_TYPES.filter((item) => item.group === group),
  }));

  return (
    <div className="chart-toolbar">
      <button className="symbol-chip" onClick={onOpenSymbol} title="Symbol Search">
        <span className={live ? "live-dot on" : "live-dot"} />
        <b>{snap?.symbol.ticker ?? "XAUUSD"}</b>
      </button>
      <button className="tb-icon" title="Compare" onClick={onCompare}>
        +
      </button>
      <div className="menu-wrap" ref={ivRef}>
        <button
          className={ivOpen ? "tb-btn strong on" : "tb-btn strong"}
          title="Interval"
          onClick={() => {
            setIvOpen((v) => !v);
            setTypeOpen(false);
          }}
        >
          {current.short}
          <span className="caret">▾</span>
        </button>
        {ivOpen ? (
          <div className="menu iv-menu">
            {INTERVAL_GROUPS.map((group) => (
              <div key={group.id} className="iv-sec">
                <div className="iv-head">{group.title}</div>
                {group.items.map((item) => {
                  const starred = favorites.includes(item.id);
                  return (
                    <div key={item.id} className={item.id === snap?.interval ? "iv-row on" : "iv-row"}>
                      <button type="button" onClick={() => choose(item.id)}>
                        <b>{item.short}</b>
                        <em>{item.label}</em>
                      </button>
                      <button
                        type="button"
                        className={starred ? "star on" : "star"}
                        title={starred ? "Remove from favorites" : "Add to favorites"}
                        onClick={() => toggleFav(item.id)}
                      >
                        ★
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
            <div className="iv-sec">
              <button type="button" className="iv-custom-toggle" onClick={() => setCustomOpen((v) => !v)}>
                Add custom interval…
              </button>
              {customOpen ? (
                <div className="iv-custom">
                  <input
                    type="number"
                    min={1}
                    value={customN}
                    onChange={(e) => setCustomN(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") addCustom();
                    }}
                  />
                  <select value={customUnit} onChange={(e) => setCustomUnit(e.target.value as typeof customUnit)}>
                    {CUSTOM_UNITS.map((unit) => (
                      <option key={unit.id} value={unit.id}>
                        {unit.label}
                      </option>
                    ))}
                  </select>
                  <button type="button" className="primary" onClick={addCustom}>
                    Add
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
      <div className="seg">
        {quick.map((id) => {
          const item = intervalMeta(id);
          return (
            <button key={id} className={snap?.interval === id ? "on" : ""} onClick={() => onInterval(id)}>
              {item.short}
            </button>
          );
        })}
      </div>
      <div className="menu-wrap" onMouseLeave={() => setTypeOpen(false)}>
        <button className="tb-icon" title="Chart type" onClick={() => setTypeOpen((v) => !v)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <rect x="4" y="10" width="4" height="10" />
            <rect x="10" y="4" width="4" height="16" />
            <rect x="16" y="8" width="4" height="12" />
          </svg>
        </button>
        {typeOpen ? (
          <div className="menu wide">
            {typeFavorites.length ? (
              <div className="iv-sec">
                <div className="iv-head">Favorites</div>
                {typeFavorites.map((id) => {
                  const t = CHART_TYPES.find((item) => item.id === id);
                  if (!t) return null;
                  return (
                    <div key={t.id} className={t.id === snap?.chartType ? "iv-row on" : "iv-row"}>
                      <button
                        type="button"
                        onClick={() => {
                          engine?.setChartType(t.id);
                          setTypeOpen(false);
                        }}
                      >
                        <b>{t.label}</b>
                        <em>{t.group}</em>
                      </button>
                      <button type="button" className="star on" onClick={() => toggleTypeFav(t.id)}>
                        ★
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : null}
            {typeGroups.map(({ group, items }) => (
              <div key={group} className="iv-sec">
                <div className="iv-head">{group}</div>
                {items.map((t) => {
                  const starred = typeFavorites.includes(t.id);
                  return (
                    <div key={t.id} className={t.id === snap?.chartType ? "iv-row on" : "iv-row"}>
                      <button
                        type="button"
                        onClick={() => {
                          engine?.setChartType(t.id);
                          setTypeOpen(false);
                        }}
                      >
                        <b>{t.label}</b>
                        <em>{t.group}</em>
                      </button>
                      <button type="button" className={starred ? "star on" : "star"} onClick={() => toggleTypeFav(t.id)}>
                        ★
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        ) : null}
      </div>
      <button className="tb-btn accent" onClick={onOpenIndicators} title="Indicators">
        Indicators
      </button>
      <button className="tb-icon" title="Indicator templates" onClick={onOpenIndicators}>
        ▦
      </button>
      <button className="tb-btn" onClick={onAlert} title="Alert">
        Alert
      </button>
      <button className={snap?.replay ? "tb-btn on" : "tb-btn"} onClick={() => engine?.setReplay(!snap?.replay)} title="Replay">
        Replay
      </button>
      <button className="tb-icon" disabled={!snap?.canUndo} onClick={() => engine?.undo()} title="Undo">
        ↺
      </button>
      <button className="tb-icon" disabled={!snap?.canRedo} onClick={() => engine?.redo()} title="Redo">
        ↻
      </button>
      <button className="tb-icon" title="Select layout">
        ⊞
      </button>
      <span className="spacer" />
      <button className="tb-icon" title="Quick search" onClick={onOpenSearch}>
        ⌕
      </button>
      <button className="tb-icon" title="Settings" onClick={onOpenSettings}>
        ⚙
      </button>
      <button className="tb-icon" title="Fullscreen" onClick={() => document.documentElement.requestFullscreen?.()}>
        ⛶
      </button>
      <button className="tb-icon" title="Take a snapshot" onClick={() => engine?.screenshot()}>
        ⌗
      </button>
    </div>
  );
}
