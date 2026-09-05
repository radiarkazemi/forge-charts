import { useState } from "react";
import type { ChartEngine } from "../engine/ChartEngine";
import type { Drawing, RangePreset } from "../engine/types";
import { ChartInspectors } from "./Inspectors";
import { useEngine } from "./useEngine";

const RANGES: RangePreset[] = ["1D", "5D", "1M", "3M", "6M", "YTD", "1Y", "5Y", "ALL"];

export function ChartOverlays({
  engine,
  onAlertDrawing,
  onAlertPrice,
}: {
  engine: ChartEngine | null;
  onAlertDrawing?: (drawing: Drawing) => void;
  onAlertPrice?: (price: number) => void;
}) {
  const snap = useEngine(engine);
  const [goOpen, setGoOpen] = useState(false);
  const [goValue, setGoValue] = useState("");
  if (!snap) return null;
  const cv = snap.canvas;
  const showNav = cv.showNavButtons !== false;

  const goToDate = () => {
    const raw = goValue.trim();
    if (!raw || !engine) return;
    const ms = Date.parse(raw.includes("T") ? raw : `${raw}T00:00:00Z`);
    if (!Number.isFinite(ms)) return;
    engine.scrollToTime(Math.floor(ms / 1000), "center");
    setGoOpen(false);
  };

  return (
    <>
      {showNav ? (
        <div className="scale-btns">
          <button type="button" onClick={() => engine?.panByBars(-Math.max(8, Math.floor(40)))} aria-label="Scroll left" title="Scroll left">
            ‹
          </button>
          <button type="button" onClick={() => engine?.zoom(1)} aria-label="Zoom in">
            +
          </button>
          <button type="button" onClick={() => engine?.zoom(-1)} aria-label="Zoom out">
            −
          </button>
          <button type="button" onClick={() => engine?.panByBars(Math.max(8, Math.floor(40)))} aria-label="Scroll right" title="Scroll right">
            ›
          </button>
          <button
            type="button"
            className={snap.autoScale ? "on" : ""}
            onClick={() => engine?.resetPriceScale()}
            title="Auto scale — double-click / double-tap price axis"
          >
            A
          </button>
          <button type="button" className={snap.logScale ? "on" : ""} onClick={() => engine?.toggle("logScale")} title="Log scale">
            L
          </button>
          <button type="button" className={snap.percentScale ? "on" : ""} onClick={() => engine?.toggle("percentScale")} title="Percent scale">
            %
          </button>
          <button type="button" className={snap.indexedScale ? "on" : ""} onClick={() => engine?.toggle("indexedScale")} title="Indexed to 100">
            100
          </button>
          <button
            type="button"
            className="scale-plus"
            title="Create alert at crosshair / last price"
            onClick={() => {
              const price = snap.hover?.close ?? snap.last?.close;
              if (price != null) onAlertPrice?.(price);
            }}
          >
            +
          </button>
          <button type="button" onClick={() => engine?.fitContent()} title="Reset chart">
            ⌂
          </button>
        </div>
      ) : null}
      <div className="range-bar">
        {RANGES.map((r) => (
          <button key={r} className={snap.rangePreset === r ? "on" : ""} onClick={() => engine?.applyRange(r)}>
            {r}
          </button>
        ))}
        <button type="button" className={goOpen ? "on" : ""} onClick={() => setGoOpen((v) => !v)} title="Go to date">
          📅
        </button>
        <span className="tz">{cv.timezone || "UTC"}</span>
      </div>
      {goOpen ? (
        <div className="goto-date">
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
      <ChartInspectors engine={engine} onAlertDrawing={onAlertDrawing} onAlertPrice={onAlertPrice} />
      {snap.replay ? (
        <div className="replay-banner">{snap.replaySelecting ? "Bar Replay · select starting point" : "Bar Replay"}</div>
      ) : null}
    </>
  );
}
