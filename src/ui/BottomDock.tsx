import { useMemo, useState } from "react";
import type { ChartEngine } from "../engine/ChartEngine";
import { runPineSubset, runStrategy, type StrategyReport } from "../engine/pineRuntime";

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
  const [logs, setLogs] = useState<string[]>(["[info] Pine subset runtime ready"]);
  const [strategyId, setStrategyId] = useState<"ma_cross" | "rsi_revert" | "macd_trend" | "donchian_break">("ma_cross");
  const [testerTab, setTesterTab] = useState<"overview" | "performance" | "trades" | "ratios" | "properties">("overview");

  const report: StrategyReport | null = useMemo(() => {
    if (!engine || tab !== "tester") return null;
    const bars = engine.getBars?.() ?? [];
    if (bars.length < 40) return null;
    return runStrategy(bars, strategyId);
  }, [engine, strategyId, tab, open]);

  const compile = () => {
    const result = runPineSubset(code);
    setLogs((prev) => [...result.logs, ...prev].slice(0, 80));
    for (const kind of result.addKinds) engine?.addIndicator(kind);
    if (result.strategyId) {
      setStrategyId(result.strategyId);
      setTab("tester");
    }
  };

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
              <button className="primary" type="button" onClick={compile}>
                Add to chart
              </button>
              <span>Subset runtime — maps ta.* plots + strategy.* onto Forge studies / tester.</span>
            </div>
          </div>
        ) : tab === "tester" ? (
          <div className="tester">
            <div className="tester-tabs">
              {(["overview", "performance", "trades", "ratios", "properties"] as const).map((id) => (
                <button key={id} type="button" className={testerTab === id ? "on" : ""} onClick={() => setTesterTab(id)}>
                  {id[0]!.toUpperCase() + id.slice(1)}
                </button>
              ))}
            </div>
            <div className="pine-actions" style={{ marginBottom: 8 }}>
              <label>
                Strategy{" "}
                <select value={strategyId} onChange={(e) => setStrategyId(e.target.value as typeof strategyId)}>
                  <option value="ma_cross">MA Cross</option>
                  <option value="rsi_revert">RSI Reversion</option>
                  <option value="macd_trend">MACD Trend</option>
                  <option value="donchian_break">Donchian Breakout</option>
                </select>
              </label>
            </div>
            {!report ? (
              <p className="hint">Load a symbol with enough bars to run the backtest.</p>
            ) : testerTab === "trades" ? (
              <ul className="objects">
                {report.trades.slice(0, 40).map((t, i) => (
                  <li key={`${t.entryTime}-${i}`}>
                    {t.side} {t.entry.toFixed(2)} → {t.exit.toFixed(2)} · {t.pnlPct >= 0 ? "+" : ""}
                    {t.pnlPct.toFixed(2)}%
                  </li>
                ))}
                {!report.trades.length ? <li className="muted">No trades</li> : null}
              </ul>
            ) : testerTab === "properties" ? (
              <ul className="objects">
                <li>Initial capital — 10,000</li>
                <li>Order size — 100% equity</li>
                <li>Commission — 0 (local subset)</li>
                <li>Strategy — {report.name}</li>
              </ul>
            ) : (
              <ul className="objects">
                <li>
                  Net profit — {report.netProfit >= 0 ? "+" : ""}
                  {report.netProfit.toFixed(2)} ({report.netProfitPct.toFixed(2)}%)
                </li>
                <li>Max drawdown — {report.maxDrawdownPct.toFixed(2)}%</li>
                <li>Total trades — {report.totalTrades}</li>
                <li>Win rate — {report.winRate.toFixed(1)}%</li>
                <li>
                  Profit factor — {Number.isFinite(report.profitFactor) ? report.profitFactor.toFixed(2) : "∞"}
                </li>
                <li>Avg trade — {report.avgTradePct.toFixed(2)}%</li>
              </ul>
            )}
          </div>
        ) : tab === "replay" ? (
          <div className="tester">
            <p>Replay Trading dock — use the on-chart Replay bar, or start selection here.</p>
            <div className="pine-actions">
              <button className="primary" type="button" onClick={() => engine?.setReplay(true)}>
                Start replay
              </button>
              <button type="button" onClick={() => engine?.setReplay(false)}>
                Exit
              </button>
              <button type="button" onClick={() => engine?.beginReplaySelect?.()}>
                Select bar
              </button>
            </div>
          </div>
        ) : (
          <div className="tester">
            <p>Pine logs / profiler</p>
            <ul className="objects">
              {logs.map((line, i) => (
                <li key={`${i}-${line.slice(0, 12)}`} className="muted">
                  {line}
                </li>
              ))}
            </ul>
          </div>
        )
      ) : null}
    </div>
  );
}
