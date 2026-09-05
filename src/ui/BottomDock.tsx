import { useState } from "react";
import type { ChartEngine } from "../engine/ChartEngine";

export function BottomDock({
  engine,
  open,
  onToggle,
}: {
  engine: ChartEngine | null;
  open: boolean;
  onToggle: () => void;
}) {
  const [tab, setTab] = useState<"pine" | "tester" | "replay" | "logs">("pine");
  const [code, setCode] = useState(`//@version=5
indicator("Forge MA", overlay=true)
len = input.int(20, "Length")
plot(ta.sma(close, len), color=color.blue)
`);
  return (
    <div className={open ? "bottom-dock open" : "bottom-dock"}>
      <div className="dock-tabs">
        <button className={tab === "pine" && open ? "on" : ""} onClick={() => { setTab("pine"); if (!open) onToggle(); else if (tab !== "pine") setTab("pine"); }}>
          Pine Editor
        </button>
        <button className={tab === "tester" && open ? "on" : ""} onClick={() => { setTab("tester"); if (!open) onToggle(); }}>
          Strategy Tester
        </button>
        <button className={tab === "replay" && open ? "on" : ""} onClick={() => { setTab("replay"); if (!open) onToggle(); }}>
          Replay Trading
        </button>
        <button className={tab === "logs" && open ? "on" : ""} onClick={() => { setTab("logs"); if (!open) onToggle(); }}>
          Pine Logs
        </button>
        <span className="spacer" />
        <button className="tb-btn" onClick={onToggle}>
          {open ? "▾" : "▴"}
        </button>
      </div>
      {open ? (
        tab === "pine" ? (
          <div className="pine">
            <textarea value={code} onChange={(e) => setCode(e.target.value)} spellCheck={false} />
            <div className="pine-actions">
              <button
                className="primary"
                onClick={() => {
                  if (/sma/i.test(code)) engine?.addIndicator("sma");
                  else if (/rsi/i.test(code)) engine?.addIndicator("rsi");
                  else if (/macd/i.test(code)) engine?.addIndicator("macd");
                  else engine?.addIndicator("ema");
                }}
              >
                Add to chart
              </button>
              <span>Subset runtime — maps SMA / RSI / MACD / EMA onto the Forge engine.</span>
            </div>
          </div>
        ) : tab === "tester" ? (
          <div className="tester">
            <div className="tester-tabs">
              <span className="on">Overview</span>
              <span>Performance</span>
              <span>Trades</span>
              <span>Ratios</span>
              <span>Properties</span>
            </div>
            <p>Strategy tester shell — Overview / Performance / Trades / Ratios / Properties ready for a strategy runtime.</p>
            <ul className="objects">
              <li>Net profit — —</li>
              <li>Max drawdown — —</li>
              <li>Total trades — 0</li>
            </ul>
          </div>
        ) : tab === "replay" ? (
          <div className="tester">
            <p>Replay Trading dock — use the on-chart Replay bar, or start selection here.</p>
            <div className="pine-actions">
              <button className="primary" type="button" onClick={() => engine?.setReplay(true)}>Start replay</button>
              <button type="button" onClick={() => engine?.setReplay(false)}>Exit</button>
              <button type="button" onClick={() => engine?.beginReplaySelect?.()}>Select bar</button>
            </div>
          </div>
        ) : (
          <div className="tester">
            <p>Pine logs / profiler shell.</p>
            <ul className="objects">
              <li className="muted">[info] Script compiled (stub)</li>
              <li className="muted">[prof] runtime 0.0ms</li>
            </ul>
          </div>
        )
      ) : null}
    </div>
  );
}
