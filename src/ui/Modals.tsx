import { useMemo, useState } from "react";
import { INDICATORS } from "../catalog";
import { UNIVERSE } from "../data/feed";
import type { IndicatorKind, SymbolInfo } from "../engine/types";

export function SymbolModal({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (s: SymbolInfo) => void;
}) {
  const [q, setQ] = useState("");
  const list = useMemo(
    () => UNIVERSE.filter((s) => `${s.ticker} ${s.name} ${s.exchange}`.toLowerCase().includes(q.toLowerCase())),
    [q],
  );
  if (!open) return null;
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal tall" onClick={(e) => e.stopPropagation()}>
        <h2>Symbol Search</h2>
        <input autoFocus placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
        <ul>
          {list.map((s) => (
            <li key={s.ticker} onClick={() => onPick(s)}>
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
}: {
  open: boolean;
  onClose: () => void;
  theme: "dark" | "light";
  onTheme: (t: "dark" | "light") => void;
}) {
  if (!open) return null;
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
        <p className="hint">Scale, magnet, and grid are also on the chart overlays and drawing toolbar.</p>
        <button className="primary" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}
