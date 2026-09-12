import { useState } from "react";
import type { ChartEngine } from "../engine/ChartEngine";
import type { RangePreset } from "../engine/types";
import { useEngine } from "./useEngine";

const RANGES: RangePreset[] = ["1D", "5D", "1M", "3M", "6M", "YTD", "1Y", "5Y", "ALL"];

export function RangeStrip({
  engine,
  compact,
}: {
  engine: ChartEngine | null;
  compact?: boolean;
}) {
  const snap = useEngine(engine);
  const [goOpen, setGoOpen] = useState(false);
  const [goValue, setGoValue] = useState("");
  if (!snap) return null;
  const cv = snap.canvas;

  const goToDate = () => {
    const raw = goValue.trim();
    if (!raw || !engine) return;
    const ms = Date.parse(raw.includes("T") ? raw : `${raw}T00:00:00Z`);
    if (!Number.isFinite(ms)) return;
    engine.scrollToTime(Math.floor(ms / 1000), "center");
    setGoOpen(false);
  };

  return (
    <div className={compact ? "dock-range compact" : "dock-range"}>
      {RANGES.map((r) => (
        <button key={r} type="button" className={snap.rangePreset === r ? "on" : ""} onClick={() => engine?.applyRange(r)}>
          {r}
        </button>
      ))}
      {!compact ? (
        <>
          <button type="button" className={goOpen ? "on" : ""} onClick={() => setGoOpen((v) => !v)} title="Go to date">
            Go
          </button>
          <button
            type="button"
            className={cv.adjustData ? "on" : ""}
            title="Adjusted / unadjusted series (dividends & splits)"
            onClick={() => engine?.setCanvasSettings({ adjustData: !cv.adjustData })}
          >
            ADJ
          </button>
          <span className="tz">{cv.timezone || "UTC"}</span>
        </>
      ) : null}
      {goOpen && !compact ? (
        <div className="goto-date dock-goto">
          <input
            type="datetime-local"
            value={goValue}
            onChange={(e) => setGoValue(e.target.value)}
            aria-label="Go to date"
          />
          <button type="button" className="primary" onClick={goToDate}>
            Go
          </button>
        </div>
      ) : null}
    </div>
  );
}
