import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { ChartEngine } from "../engine/ChartEngine";
import { runPineSubset, runStrategy, type StrategyReport } from "../engine/pineRuntime";
import { loadJson, saveJson } from "../persist";
import { ScreenerPanel } from "./MarketPanels";
import { RangeStrip } from "./RangeStrip";
import { TradingPanel } from "./TradingPanel";
import { useEngine } from "./useEngine";

type PineScriptTab = { id: string; title: string; code: string };
type StrategyId = "ma_cross" | "rsi_revert" | "macd_trend" | "donchian_break";
type DockTab = "screener" | "pine" | "tester" | "replay" | "trading" | "logs";

const PINE_KEY = "forge.pineScripts";
const DEFAULT_SCRIPT = `//@version=5
indicator("Forge MA", overlay=true)
len = input.int(20, "Length")
plot(ta.sma(close, len), color=color.blue)
`;

const PINE_TEMPLATES: Array<{ title: string; code: string }> = [
  { title: "SMA", code: DEFAULT_SCRIPT },
  {
    title: "RSI",
    code: `//@version=5
indicator("Forge RSI")
len = input.int(14, "Length")
plot(ta.rsi(close, len), color=color.purple)
hline(70)
hline(30)
`,
  },
  {
    title: "MA Cross strategy",
    code: `//@version=5
strategy("Forge MA Cross", overlay=true)
f = ta.sma(close, 9)
s = ta.sma(close, 21)
plot(f, color=color.blue)
plot(s, color=color.orange)
if ta.crossover(f, s)
    strategy.entry("L", strategy.long)
if ta.crossunder(f, s)
    strategy.close("L")
`,
  },
];

function loadScripts(): PineScriptTab[] {
  const saved = loadJson<PineScriptTab[]>(PINE_KEY, []);
  if (saved.length) return saved;
  return [{ id: "script-1", title: "Script 1", code: DEFAULT_SCRIPT }];
}

function EquityCurve({ equity }: { equity: number[] }) {
  if (equity.length < 2) return <p className="hint">Not enough equity points to draw a curve.</p>;
  const w = 640;
  const h = 120;
  const min = Math.min(...equity);
  const max = Math.max(...equity);
  const span = Math.max(1e-9, max - min);
  const pts = equity
    .map((v, i) => {
      const x = (i / (equity.length - 1)) * (w - 8) + 4;
      const y = h - 8 - ((v - min) / span) * (h - 16);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const last = equity[equity.length - 1]!;
  const up = last >= equity[0]!;
  return (
    <div className="equity-curve">
      <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Strategy equity curve">
        <polyline fill="none" stroke={up ? "#089981" : "#f23645"} strokeWidth="2" points={pts} />
      </svg>
      <div className="equity-meta">
        <span>
          Start {equity[0]!.toFixed(0)} → End {last.toFixed(0)}
        </span>
        <span className={up ? "up" : "down"}>
          {up ? "+" : ""}
          {(((last - equity[0]!) / Math.max(1e-9, equity[0]!)) * 100).toFixed(2)}%
        </span>
      </div>
    </div>
  );
}

export function BottomDock({
  engine,
  open,
  onToggle,
  rangeSlot,
  quotes = {},
  onPickSymbol,
}: {
  engine: ChartEngine | null;
  open: boolean;
  onToggle: () => void;
  rangeSlot?: ReactNode;
  quotes?: Record<string, { price: number; change: number }>;
  onPickSymbol?: (ticker: string, exchange: string) => void;
}) {
  const [tab, setTab] = useState<DockTab>("pine");
  const [scripts, setScripts] = useState<PineScriptTab[]>(loadScripts);
  const [activeScript, setActiveScript] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);
  const [strategyId, setStrategyId] = useState<StrategyId>("ma_cross");
  const [testerTab, setTesterTab] = useState<
    "overview" | "performance" | "trades" | "ratios" | "equity" | "properties"
  >("overview");
  const [compileMsg, setCompileMsg] = useState<string | null>(null);
  const snap = useEngine(engine);
  const lastPrice = snap?.last?.close ?? snap?.hover?.close ?? 0;

  useEffect(() => {
    saveJson(PINE_KEY, scripts);
  }, [scripts]);

  useEffect(() => {
    const onOpen = (ev: Event) => {
      const detail = (ev as CustomEvent<{ strategyId?: StrategyId; tab?: DockTab }>).detail;
      if (detail?.strategyId) setStrategyId(detail.strategyId);
      if (detail?.tab) setTab(detail.tab);
      else setTab("tester");
    };
    window.addEventListener("forge:open-tester", onOpen);
    window.addEventListener("forge:open-dock", onOpen);
    return () => {
      window.removeEventListener("forge:open-tester", onOpen);
      window.removeEventListener("forge:open-dock", onOpen);
    };
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

  const addScriptTab = (template?: { title: string; code: string }) => {
    const n = scripts.length + 1;
    const title = template?.title ?? `Script ${n}`;
    const nextCode = template?.code ?? DEFAULT_SCRIPT;
    setScripts((prev) => [...prev, { id: `script-${Date.now()}`, title, code: nextCode }]);
    setActiveScript(scripts.length);
  };

  const closeScriptTab = (index: number) => {
    if (scripts.length <= 1) return;
    setScripts((prev) => prev.filter((_, i) => i !== index));
    setActiveScript((cur) => {
      if (cur === index) return Math.max(0, index - 1);
      if (cur > index) return cur - 1;
      return cur;
    });
  };

  const renameScriptTab = (index: number) => {
    const cur = scripts[index];
    if (!cur) return;
    const title = window.prompt("Script name", cur.title)?.trim();
    if (!title) return;
    setScripts((prev) => prev.map((s, i) => (i === index ? { ...s, title } : s)));
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

  const openTab = (id: DockTab) => {
    setTab(id);
    if (!open) onToggle();
  };

  return (
    <div className={open ? "bottom-dock open" : "bottom-dock"}>
      <div className="dock-chrome">
        {rangeSlot ?? <RangeStrip engine={engine} />}
        <div className="dock-tabs">
          {(
            [
              ["screener", "Screener"],
              ["pine", "Pine Editor"],
              ["tester", "Strategy Tester"],
              ["replay", "Replay Trading"],
              ["trading", "Trading"],
              ["logs", "Pine Logs"],
            ] as const
          ).map(([id, label]) => (
            <button key={id} type="button" className={tab === id && open ? "on" : ""} onClick={() => openTab(id)}>
              {label}
            </button>
          ))}
          <span className="spacer" />
          <button className="tb-btn" onClick={onToggle}>
            {open ? "▾" : "▴"}
          </button>
        </div>
      </div>
      {open ? (
        tab === "screener" ? (
          <div className="dock-screener">
            <ScreenerPanel
              quotes={quotes}
              onPick={(ticker, exchange) => {
                onPickSymbol?.(ticker, exchange);
              }}
            />
          </div>
        ) : tab === "pine" ? (
          <div className="pine">
            <div className="pine-script-tabs">
              {scripts.map((s, i) => (
                <span key={s.id} className={i === activeScript ? "pine-tab on" : "pine-tab"}>
                  <button type="button" onClick={() => setActiveScript(i)} onDoubleClick={() => renameScriptTab(i)}>
                    {s.title}
                  </button>
                  {scripts.length > 1 ? (
                    <button type="button" className="pine-tab-close" title="Close tab" onClick={() => closeScriptTab(i)}>
                      ×
                    </button>
                  ) : null}
                </span>
              ))}
              <button type="button" className="pine-add-tab" onClick={() => addScriptTab()} title="New script tab">
                +
              </button>
              <label className="pine-template">
                Template
                <select
                  defaultValue=""
                  onChange={(e) => {
                    const t = PINE_TEMPLATES.find((x) => x.title === e.target.value);
                    e.target.value = "";
                    if (t) addScriptTab(t);
                  }}
                >
                  <option value="" disabled>
                    Insert…
                  </option>
                  {PINE_TEMPLATES.map((t) => (
                    <option key={t.title} value={t.title}>
                      {t.title}
                    </option>
                  ))}
                </select>
              </label>
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
              {(["overview", "performance", "trades", "ratios", "equity", "properties"] as const).map((id) => (
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
            ) : testerTab === "equity" ? (
              <EquityCurve equity={report.equity} />
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
            <p>
              Replay Trading dock — practice fills on historical bars. Start replay, then use the Trading tab for paper
              orders at the replay price.
            </p>
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
              <button type="button" onClick={() => setTab("trading")}>
                Open trading ticket
              </button>
            </div>
          </div>
        ) : tab === "trading" ? (
          <TradingPanel
            symbol={snap?.symbol.ticker ?? "SYM"}
            lastPrice={lastPrice || 0}
            precision={snap?.symbol.pricePrecision ?? 2}
          />
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
