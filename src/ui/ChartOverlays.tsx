import { useState } from "react";
import type { ChartEngine } from "../engine/ChartEngine";
import type { Drawing } from "../engine/types";
import { ChartInspectors } from "./Inspectors";
import { useEngine } from "./useEngine";

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
  const [scaleMore, setScaleMore] = useState(false);
  if (!snap) return null;
  const cv = snap.canvas;
  const showNav = cv.showNavButtons !== false;

  return (
    <>
      {showNav ? (
        <div className="scale-btns">
          <button type="button" onClick={() => engine?.zoom(1)} aria-label="Zoom in">
            +
          </button>
          <button type="button" onClick={() => engine?.zoom(-1)} aria-label="Zoom out">
            −
          </button>
          <button
            type="button"
            className={snap.autoScale ? "on" : ""}
            onClick={() => engine?.resetPriceScale()}
            title="Auto scale — double-click / double-tap price axis"
          >
            A
          </button>
          <button type="button" onClick={() => engine?.fitContent()} title="Reset chart">
            ⌂
          </button>
          <button
            type="button"
            className="scale-more-toggle scale-extra"
            aria-label="More scale options"
            title="More scale options"
            onClick={() => setScaleMore((v) => !v)}
          >
            ⋯
          </button>
          <button
            type="button"
            className={`scale-extra${snap.logScale ? " on" : ""}`}
            onClick={() => engine?.toggle("logScale")}
            title="Log scale"
          >
            L
          </button>
          <button
            type="button"
            className={`scale-extra${snap.percentScale ? " on" : ""}`}
            onClick={() => engine?.toggle("percentScale")}
            title="Percent scale"
          >
            %
          </button>
          <button
            type="button"
            className={`scale-extra${snap.indexedScale ? " on" : ""}`}
            onClick={() => engine?.toggle("indexedScale")}
            title="Indexed to 100"
          >
            100
          </button>
          <button
            type="button"
            className="scale-plus scale-extra"
            title="Create alert at crosshair / last price"
            onClick={() => {
              const price = snap.hover?.close ?? snap.last?.close;
              if (price != null) onAlertPrice?.(price);
            }}
          >
            +
          </button>
          {scaleMore ? (
            <div className="scale-more-menu">
              <button
                type="button"
                className={snap.logScale ? "on" : ""}
                onClick={() => engine?.toggle("logScale")}
                title="Log scale"
              >
                L
              </button>
              <button
                type="button"
                className={snap.percentScale ? "on" : ""}
                onClick={() => engine?.toggle("percentScale")}
                title="Percent scale"
              >
                %
              </button>
              <button
                type="button"
                className={snap.indexedScale ? "on" : ""}
                onClick={() => engine?.toggle("indexedScale")}
                title="Indexed to 100"
              >
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
                Alert
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
      <ChartInspectors engine={engine} onAlertDrawing={onAlertDrawing} onAlertPrice={onAlertPrice} />
      {snap.replay ? (
        <div className="replay-banner">{snap.replaySelecting ? "Bar Replay · select starting point" : "Bar Replay"}</div>
      ) : null}
    </>
  );
}
