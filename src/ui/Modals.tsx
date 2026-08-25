import { useMemo, useState } from "react";
import { INDICATORS } from "../catalog";
import { EXCHANGES, UNIVERSE } from "../data/feed";
import { chartApiBase, readStoredChartApiUrl, storeChartApiUrl } from "../data/config";
import type { IndicatorKind, SymbolInfo, Theme } from "../engine/types";

export function SymbolModal({
  open,
  onClose,
  onPick,
  universe = UNIVERSE,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (s: SymbolInfo) => void;
  universe?: SymbolInfo[];
}) {
  const [q, setQ] = useState("");
  const [exchange, setExchange] = useState<"ALL" | "BINANCE" | "FOREXCOM">("ALL");
  const list = useMemo(() => {
    const query = q.trim().toLowerCase();
    return universe
      .filter((s) => exchange === "ALL" || s.exchange === exchange)
      .filter((s) => !query || `${s.ticker} ${s.name} ${s.exchange} ${s.type}`.toLowerCase().includes(query))
      .slice(0, 400);
  }, [q, exchange, universe]);
  if (!open) return null;
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal tall" onClick={(e) => e.stopPropagation()}>
        <h2>Symbol Search</h2>
        <div className="seg modal-seg">
          <button className={exchange === "ALL" ? "on" : ""} onClick={() => setExchange("ALL")}>
            All
          </button>
          {EXCHANGES.map((id) => (
            <button key={id} className={exchange === id ? "on" : ""} onClick={() => setExchange(id)}>
              {id}
            </button>
          ))}
        </div>
        <input autoFocus placeholder="Search BINANCE or FOREXCOM" value={q} onChange={(e) => setQ(e.target.value)} />
        <ul>
          {list.map((s) => (
            <li key={`${s.exchange}:${s.ticker}`} onClick={() => onPick(s)}>
              <strong>{s.ticker}</strong>
              <span>
                {s.name} · {s.exchange} · {s.type}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function IndicatorModal({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (kind: IndicatorKind) => void;
}) {
  const [q, setQ] = useState("");
  const groups = useMemo(() => {
    const f = INDICATORS.filter((i) => i.label.toLowerCase().includes(q.toLowerCase()));
    return [...new Set(f.map((i) => i.group))].map((g) => ({ g, items: f.filter((i) => i.group === g) }));
  }, [q]);
  if (!open) return null;
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal tall" onClick={(e) => e.stopPropagation()}>
        <h2>Indicators, metrics, and strategies</h2>
        <input autoFocus placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
        {groups.map((g) => (
          <div key={g.g}>
            <h3>{g.g}</h3>
            <ul>
              {g.items.map((k) => (
                <li key={k.id} onClick={() => onPick(k.id)}>
                  <strong>{k.label}</strong>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SettingsModal({
  open,
  onClose,
  theme,
  onTheme,
  onApiChange,
}: {
  open: boolean;
  onClose: () => void;
  theme: Theme;
  onTheme: (t: Theme) => void;
  onApiChange?: () => void;
}) {
  const [apiUrl, setApiUrl] = useState(() => readStoredChartApiUrl());
  if (!open) return null;
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Chart settings</h2>
        <label className="row">
          Theme
          <select value={theme} onChange={(e) => onTheme(e.target.value as Theme)}>
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
        </label>
        <label className="stack">
          Chart API server
          <input
            placeholder="https://your-cp-fetcher-host or leave blank for /cp"
            value={apiUrl}
            onChange={(e) => setApiUrl(e.target.value)}
          />
        </label>
        <p className="hint">
          Connects to your cp_fetcher Chart API for BINANCE and FOREXCOM history, quotes, and realtime.
          Active origin: <code>{apiUrl.trim() || chartApiBase()}</code>
        </p>
        <div className="row">
          <button
            className="primary"
            onClick={() => {
              storeChartApiUrl(apiUrl);
              onApiChange?.();
              onClose();
            }}
          >
            Save & reconnect
          </button>
          <button
            onClick={() => {
              setApiUrl("");
              storeChartApiUrl("");
              onApiChange?.();
            }}
          >
            Clear
          </button>
        </div>
      </div>
    </div>
  );
}
