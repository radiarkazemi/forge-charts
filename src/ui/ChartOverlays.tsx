import type { ChartEngine } from "../engine/ChartEngine";
import type { Drawing, RangePreset } from "../engine/types";
import { ChartInspectors } from "./Inspectors";
import { useEngine } from "./useEngine";

const RANGES: RangePreset[] = ["1D", "5D", "1M", "3M", "6M", "YTD", "1Y", "5Y", "ALL"];

export function ChartOverlays({
  engine,
  onAlertDrawing,
}: {
  engine: ChartEngine | null;
  onAlertDrawing?: (drawing: Drawing) => void;
}) {
  const snap = useEngine(engine);
  if (!snap) return null;
  return (
    <>
      <div className="scale-btns">
        <button type="button" onClick={() => engine?.zoom(1)} aria-label="Zoom in">+</button>
        <button type="button" onClick={() => engine?.zoom(-1)} aria-label="Zoom out">−</button>
        <button type="button" className={snap.autoScale ? "on" : ""} onClick={() => engine?.resetPriceScale()} title="Auto scale — double-click / double-tap price axis">
          A
        </button>
        <button type="button" className={snap.logScale ? "on" : ""} onClick={() => engine?.toggle("logScale")}>
          L
        </button>
        <button type="button" className={snap.percentScale ? "on" : ""} onClick={() => engine?.toggle("percentScale")}>
          %
        </button>
      </div>
      <div className="range-bar">
        {RANGES.map((r) => (
          <button key={r} className={snap.rangePreset === r ? "on" : ""} onClick={() => engine?.applyRange(r)}>
            {r}
          </button>
        ))}
        <span className="tz">UTC</span>
      </div>
      <ChartInspectors engine={engine} onAlertDrawing={onAlertDrawing} />
      {snap.replay ? <div className="replay-banner">{snap.replaySelecting ? "Bar Replay · select starting point" : "Bar Replay"}</div> : null}
    </>
  );
}
