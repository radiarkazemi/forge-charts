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
  const [tab, setTab] = useState<"pine" | "tester">("pine");
  const [code, setCode] = useState(`//@version=5
indicator("Forge MA", overlay=true)
len = input.int(20, "Length")
plot(ta.sma(close, len), color=color.blue)
`);
  return (
    <div className={open ? "bottom-dock open" : "bottom-dock"}>
      <div className="dock-tabs">
        <button className={tab === "pine" && open ? "on" : ""} onClick={() => { setTab("pine"); onToggle(); }}>
          Pine Editor
        </button>
        <button className={tab === "tester" && open ? "on" : ""} onClick={() => { setTab("tester"); if (!open) onToggle(); }}>
          Strategy Tester
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
        ) : (
          <div className="tester">
            <p>Strategy tester is a local backtest pane. Connect a strategy next; this shell is ready.</p>
          </div>
        )
      ) : null}
    </div>
  );
}
