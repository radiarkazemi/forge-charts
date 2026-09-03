import { useState } from "react";
import type { ChartEngine } from "../engine/ChartEngine";
import type { Interval } from "../engine/types";
import { useEngine } from "./useEngine";

type Props = {
  engine: ChartEngine | null;
  live: boolean;
  onOpenSymbol: () => void;
  onOpenIndicators: () => void;
  onOpenSettings: () => void;
  onOpenDrawing: () => void;
  onOpenMore: () => void;
  onInterval: (interval: Interval) => void;
  onAlert: () => void;
};

const QUICK_IV: Array<{ id: Interval; label: string }> = [
  { id: "1", label: "1m" },
  { id: "5", label: "5m" },
  { id: "15", label: "15m" },
  { id: "60", label: "1H" },
  { id: "240", label: "4H" },
  { id: "1D", label: "D" },
  { id: "1W", label: "W" },
];

/**
 * TradingView-style bottom toolbar for mobile.
 * Primary row: symbol, interval, draw, indicators, more.
 * Optional: quick interval strip above it.
 */
export function MobileBottomBar({
  engine,
  live,
  onOpenSymbol,
  onOpenIndicators,
  onOpenDrawing,
  onOpenMore,
  onInterval,
  onAlert,
}: Props) {
  const snap = useEngine(engine);
  const [ivOpen, setIvOpen] = useState(false);

  return (
    <nav className="mobile-bottom-bar" aria-label="Chart tools">
      {ivOpen ? (
        <div className="mobile-iv-strip">
          {QUICK_IV.map((iv) => (
            <button
              key={iv.id}
              type="button"
              className={snap?.interval === iv.id ? "on" : ""}
              onClick={() => {
                onInterval(iv.id);
                setIvOpen(false);
              }}
            >
              {iv.label}
            </button>
          ))}
        </div>
      ) : null}
      <div className="mobile-bar-row">
        <button type="button" className="mobile-bar-btn" onClick={onOpenSymbol}>
          <span className="mobile-bar-icon">📊</span>
          <span className="mobile-bar-label">{snap?.symbol.ticker ?? "Symbol"}</span>
          {live ? <span className="mobile-live-dot" /> : null}
        </button>
        <button
          type="button"
          className={ivOpen ? "mobile-bar-btn on" : "mobile-bar-btn"}
          onClick={() => setIvOpen((v) => !v)}
        >
          <span className="mobile-bar-icon">⏱</span>
          <span className="mobile-bar-label">{snap?.interval ?? "15"}</span>
        </button>
        <button type="button" className="mobile-bar-btn" onClick={onOpenDrawing}>
          <span className="mobile-bar-icon">✎</span>
          <span className="mobile-bar-label">Draw</span>
        </button>
        <button type="button" className="mobile-bar-btn" onClick={onOpenIndicators}>
          <span className="mobile-bar-icon">ƒx</span>
          <span className="mobile-bar-label">Indicators</span>
        </button>
        <button type="button" className="mobile-bar-btn" onClick={onAlert}>
          <span className="mobile-bar-icon">🔔</span>
          <span className="mobile-bar-label">Alert</span>
        </button>
        <button type="button" className="mobile-bar-btn" onClick={onOpenMore}>
          <span className="mobile-bar-icon">⋯</span>
          <span className="mobile-bar-label">More</span>
        </button>
      </div>
    </nav>
  );
}

type MoreSheetProps = {
  open: boolean;
  onClose: () => void;
  engine: ChartEngine | null;
  onOpenSettings: () => void;
  onOpenSearch: () => void;
  onReplay: () => void;
  onSnapshot: () => void;
  onFullscreen: () => void;
};

export function MobileMoreSheet({
  open,
  onClose,
  engine,
  onOpenSettings,
  onOpenSearch,
  onReplay,
  onSnapshot,
  onFullscreen,
}: MoreSheetProps) {
  if (!open) return null;
  const run = (fn: () => void) => {
    fn();
    onClose();
  };
  return (
    <div className="bottom-sheet-bg" onMouseDown={onClose} onTouchStart={onClose}>
      <div
        className="bottom-sheet"
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
      >
        <div className="bottom-sheet-handle" />
        <div className="bottom-sheet-grid">
          <button type="button" onClick={() => run(onOpenSettings)}>
            <span>⚙</span>Settings
          </button>
          <button type="button" onClick={() => run(onOpenSearch)}>
            <span>⌕</span>Search
          </button>
          <button type="button" onClick={() => run(onReplay)}>
            <span>▶</span>Replay
          </button>
          <button type="button" onClick={() => run(onSnapshot)}>
            <span>📷</span>Snapshot
          </button>
          <button type="button" onClick={() => run(onFullscreen)}>
            <span>⛶</span>Fullscreen
          </button>
          <button type="button" onClick={() => run(() => engine?.undo())}>
            <span>↺</span>Undo
          </button>
          <button type="button" onClick={() => run(() => engine?.redo())}>
            <span>↻</span>Redo
          </button>
          <button
            type="button"
            onClick={() =>
              run(() =>
                engine?.setTheme(engine.getSnapshot().theme === "dark" ? "light" : "dark"),
              )
            }
          >
            <span>◑</span>Theme
          </button>
        </div>
      </div>
    </div>
  );
}
