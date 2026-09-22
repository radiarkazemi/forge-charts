import { useEffect, useRef, useState } from "react";
import { findSymbol, generateBars } from "../data/feed";
import { fetchHistory, subscribeLive } from "../data/market";
import { ChartEngine } from "../engine/ChartEngine";
import type { Interval, SymbolInfo } from "../engine/types";
import { ChartOverlays } from "./ChartOverlays";
import { ReplayBar } from "./ReplayBar";

type Props = {
  symbol: SymbolInfo;
  interval: Interval;
  theme?: "dark" | "light";
  active: boolean;
  onActivate: () => void;
  onEngine: (engine: ChartEngine | null) => void;
  onLive?: (live: boolean) => void;
  onPrice?: (symbol: SymbolInfo, close: number) => void;
};

/** One Supercharts chart cell (supports multi-layout grids). */
export function ChartPane({ symbol, interval, theme, active, onActivate, onEngine, onLive, onPrice }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<ChartEngine | null>(null);
  const unsubRef = useRef<() => void>(() => {});
  const [engine, setEngine] = useState<ChartEngine | null>(null);
  const symbolRef = useRef(symbol);
  const intervalRef = useRef(interval);
  const onPriceRef = useRef(onPrice);
  symbolRef.current = symbol;
  intervalRef.current = interval;
  onPriceRef.current = onPrice;

  const attachFeed = async (sym: SymbolInfo, iv: Interval, mode: "symbol" | "interval") => {
    const eng = engineRef.current;
    if (!eng) return;
    unsubRef.current();
    const placeholder = generateBars(sym, iv, 200);
    if (mode === "symbol") eng.setSymbol(sym, placeholder);
    else eng.setInterval(iv, placeholder);
    try {
      const { bars, live } = await fetchHistory(sym, iv);
      if (bars.length) {
        if (mode === "symbol") eng.setSymbol(sym, bars);
        else eng.setInterval(iv, bars);
      }
      onLive?.(live);
      unsubRef.current = subscribeLive(sym, iv, (bar) => {
        eng.upsertBar(bar);
        onPriceRef.current?.(sym, bar.close);
      });
    } catch (err) {
      console.warn("ChartPane feed failed", err);
      onLive?.(false);
    }
  };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const eng = new ChartEngine(host, symbol);
    engineRef.current = eng;
    setEngine(eng);
    onEngine(eng);
    if (theme) eng.setTheme(theme);
    void attachFeed(symbol, interval, "interval");
    return () => {
      unsubRef.current();
      eng.destroy();
      engineRef.current = null;
      setEngine(null);
      onEngine(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const eng = engineRef.current;
    if (!eng) return;
    if (eng.getSnapshot().symbol.ticker !== symbol.ticker || eng.getSnapshot().symbol.exchange !== symbol.exchange) {
      void attachFeed(symbol, intervalRef.current, "symbol");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol.ticker, symbol.exchange]);

  useEffect(() => {
    const eng = engineRef.current;
    if (!eng) return;
    if (eng.getSnapshot().interval !== interval) {
      void attachFeed(symbolRef.current, interval, "interval");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interval]);

  useEffect(() => {
    if (theme) engineRef.current?.setTheme(theme);
  }, [theme]);

  return (
    <div className={active ? "chart-pane active" : "chart-pane"} onMouseDown={onActivate}>
      <div className="chart-stage">
        <div className="chart-host" ref={hostRef} />
        <ChartOverlays engine={engine} />
        <ReplayBar engine={engine} />
      </div>
      <div className="pane-tag">{symbol.ticker}</div>
    </div>
  );
}

export function defaultPaneSymbol(ticker = "XAUUSD"): SymbolInfo {
  return findSymbol(ticker);
}
