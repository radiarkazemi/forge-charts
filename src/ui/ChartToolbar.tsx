import { useState } from "react";
import { CHART_TYPES, INTERVALS, QUICK_INTERVALS } from "../catalog";
import type { ChartEngine } from "../engine/ChartEngine";
import type { Interval } from "../engine/types";
import { useEngine } from "./useEngine";

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

  return (
    <div className="chart-toolbar">
      <button className="symbol-chip" onClick={onOpenSymbol} title="Symbol Search">
        <span className={live ? "live-dot on" : "live-dot"} />
        <b>{snap?.symbol.ticker ?? "XAUUSD"}</b>
      </button>
      <button className="tb-icon" title="Compare" onClick={onCompare}>
        +
      </button>
      <div className="menu-wrap" onMouseLeave={() => setIvOpen(false)}>
        <button className="tb-btn strong" onClick={() => setIvOpen((v) => !v)}>
          {INTERVALS.find((i) => i.id === snap?.interval)?.short ?? "15m"}
          <span className="caret">▾</span>
        </button>
        {ivOpen ? (
          <div className="menu">
            {INTERVALS.map((i) => (
              <button
                key={i.id}
                className={i.id === snap?.interval ? "on" : ""}
                onClick={() => {
                  onInterval(i.id);
                  setIvOpen(false);
                }}
              >
                {i.short}
                <em>{i.label}</em>
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div className="seg">
        {QUICK_INTERVALS.map((id) => {
          const item = INTERVALS.find((i) => i.id === id);
          return (
            <button key={id} className={snap?.interval === id ? "on" : ""} onClick={() => onInterval(id)}>
              {item?.short}
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
            {CHART_TYPES.map((t) => (
              <button
                key={t.id}
                className={t.id === snap?.chartType ? "on" : ""}
                onClick={() => {
                  engine?.setChartType(t.id);
                  setTypeOpen(false);
                }}
              >
                {t.label}
              </button>
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
