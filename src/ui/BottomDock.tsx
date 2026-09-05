import { useEffect, useMemo, useState } from "react";
import type { ChartEngine } from "../engine/ChartEngine";
import { runPineSubset, runStrategy, type StrategyReport } from "../engine/pineRuntime";
import { loadJson, saveJson } from "../persist";

type PineScriptTab = { id: string; title: string; code: string };
type StrategyId = "ma_cross" | "rsi_revert" | "macd_trend" | "donchian_break";

const PINE_KEY = "forge.pineScripts";
const DEFAULT_SCRIPT = `//@version=5
indicator("Forge MA", overlay=true)
len = input.int(20, "Length")
plot(ta.sma(close, len), color=color.blue)
`;

function loadScripts(): PineScriptTab[] {
  const saved = loadJson<PineScriptTab[]>(PINE_KEY, []);
  if (saved.length) return saved;
  return [{ id: "script-1", title: "Script 1", code: DEFAULT_SCRIPT }];
}

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
  const [scripts, setScripts] = useState<PineScriptTab[]>(loadScripts);
  const [activeScript, setActiveScript] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);
  const [strategyId, setStrategyId] = useState<StrategyId>("ma_cross");
  const [testerTab, setTesterTab] = useState<"overview" | "performance" | "trades" | "ratios" | "properties">("overview");
  const [compileMsg, setCompileMsg] = useState<string | null>(null);

  useEffect(() => {
    saveJson(PINE_KEY, scripts);
  }, [scripts]);

  useEffect(() => {
    const onOpen = (ev: Event) => {
      const detail = (ev as CustomEvent<{ strategyId?: StrategyId }>).detail;
      if (detail?.strategyId) setStrategyId(detail.strategyId);
      setTab("tester");
    };
    window.addEventListener("forge:open-tester", onOpen);
    return () => window.removeEventListener("forge:open-tester", onOpen);
  }, []);

  const code = scripts[activeScript]?.code ?? DEFAULT_SCRIPT;

  const report: StrategyReport | null = useMemo(() => {
    if (!engine || tab !== "tester") return null;
    const bars = engine.getBars?.() ?? [];
    if (bars.length < 40) return null;
    return runStrategy(bars, strategyId);
  }, [engine, strategyId, tab, open]);

  const setCode = (next: string) => {
    setScripts((prev) => prev.map((s, i) => (i === activeScript ? { ...s, code: next } : s)));
  };

  const addScriptTab = () => {
    const n = scripts.length + 1;
    setScripts((prev) => [...prev, { id: `script-${Date.now()}`, title: `Script ${n}`, code: DEFAULT_SCRIPT }]);
    setActiveScript(scripts.length);
  };

  const compile = () => {
    const result = runPineSubset(code);
    const stamp = new Date().toISOString().slice(11, 19);
    const stamped = result.logs.map((line) => `[${stamp}] ${line}`);
    setLogs((prev) => [...stamped, ...prev].slice(0, 120));
    setCompileMsg(result.message);
    if (!result.ok) {
      setTab("logs");
      return;
    }
    for (const kind of result.addKinds) engine?.addIndicator(kind);
    if (result.strategyId) {
      setStrategyId(result.strategyId);
      setTab("tester");
    }
  };

  return (
    <div className={open ? "bottom-dock open" : "bottom-dock"}>
      <div className="dock-tabs">
        <button
          className={tab === "pine" && open ? "on" : ""}
          onClick={() => {
            setTab("pine");
            if (!open) onToggle();
            else if (tab !== "pine") setTab("pine");
          }}
        >
          Pine Editor
        </button>
        <button
          className={tab === "tester" && open ? "on" : ""}
          onClick={() => {
            setTab("tester");
            if (!open) onToggle();
          }}
        >
          Strategy Tester
        </button>
        <button
          className={tab === "replay" && open ? "on" : ""}
          onClick={() => {
            setTab("replay");
            if (!open) onToggle();
          }}
        >
          Replay Trading
        </button>
        <button
          className={tab === "logs" && open ? "on" : ""}
          onClick={() => {
            setTab("logs");
            if (!open) onToggle();
          }}
        >
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
            <div className="pine-script-tabs">
              {scripts.map((s, i) => (
                <button key={s.id} type="button" className={i === activeScript ? "on" : ""} onClick={() => setActiveScript(i)}>
                  {s.title}
                </button>
              ))}
              <button type="button" className="pine-add-tab" onClick={addScriptTab} title="New script tab">
                +
              </button>
            </div>
            <textarea value={code} onChange={(e) => setCode(e.target.value)} spellCheck={false} />
            <div className="pine-actions">
              <button className="primary" type="button" onClick={compile}>
                Add to chart
              </button>
              <button
                type="button"
                onClick={() => {
                  saveJson(PINE_KEY, scripts);
                  setLogs((prev) => [`[info] saved ${scripts.length} script tab(s)`, ...prev].slice(0, 120));
                }}
              >
                Save
              </button>
              <span>{compileMsg ?? "Subset runtime — maps ta.* plots + strategy.* onto Forge studies / tester."}</span>
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
                <select value={strategyId} onChange={(e) => setStrategyId(e.target.value as StrategyId)}>
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
                <li>Pyramiding — off</li>
                <li>Strategy — {report.name}</li>
              </ul>
            ) : testerTab === "overview" ? (
              <ul className="objects">
                <li>
                  Net profit — {report.netProfit >= 0 ? "+" : ""}
                  {report.netProfit.toFixed(2)} ({report.netProfitPct.toFixed(2)}%)
                </li>
                <li>Max drawdown — {report.maxDrawdownPct.toFixed(2)}%</li>
                <li>Total trades — {report.totalTrades}</li>
                <li>
                  Long / short — {report.longTrades} / {report.shortTrades}
                </li>
                <li>Win rate — {report.winRate.toFixed(1)}%</li>
              </ul>
            ) : testerTab === "performance" ? (
              <ul className="objects">
                <li>
                  Net profit — {report.netProfit >= 0 ? "+" : ""}
                  {report.netProfit.toFixed(2)} ({report.netProfitPct.toFixed(2)}%)
                </li>
                <li>
                  Profit factor — {Number.isFinite(report.profitFactor) ? report.profitFactor.toFixed(2) : "∞"}
                </li>
                <li>Avg trade — {report.avgTradePct.toFixed(2)}%</li>
                <li>Avg win — {report.avgWinPct.toFixed(2)}%</li>
                <li>Avg loss — {report.avgLossPct.toFixed(2)}%</li>
                <li>Max drawdown — {report.maxDrawdownPct.toFixed(2)}%</li>
              </ul>
            ) : (
              <ul className="objects">
                <li>Payoff ratio — {Number.isFinite(report.payoffRatio) ? report.payoffRatio.toFixed(2) : "∞"}</li>
                <li>Expectancy — {report.expectancyPct.toFixed(2)}%</li>
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
            <p>Pine logs / profiler — compile and runtime events</p>
            <ul className="objects">
              {logs.length ? (
                logs.map((line, i) => (
                  <li key={`${i}-${line.slice(0, 12)}`} className="muted">
                    {line}
                  </li>
                ))
              ) : (
                <li className="muted">No events yet — compile a script from Pine Editor.</li>
              )}
            </ul>
          </div>
        )
      ) : null}
    </div>
  );
}
