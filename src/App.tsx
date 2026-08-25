import { useEffect, useMemo, useRef, useState } from "react";
import { findSymbol, UNIVERSE } from "./data/feed";
import { fetchHistory, fetchQuotes, loadCatalog, subscribeLive } from "./data/market";
import { ChartEngine } from "./engine/ChartEngine";
import type { Interval, SymbolInfo } from "./engine/types";
import { BottomDock } from "./ui/BottomDock";
import { ChartOverlays } from "./ui/ChartOverlays";
import { ChartToolbar } from "./ui/ChartToolbar";
import { DrawingToolbar } from "./ui/DrawingToolbar";
import { IndicatorModal, SettingsModal, SymbolModal } from "./ui/Modals";
import { useEngine } from "./ui/useEngine";
import { WidgetDock, type WidgetId } from "./ui/WidgetDock";

export default function App() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<ChartEngine | null>(null);
  const unsubRef = useRef<() => void>(() => {});
  const feedGen = useRef(0);
  const [engine, setEngine] = useState<ChartEngine | null>(null);
  const [live, setLive] = useState(false);
  const [status, setStatus] = useState("Loading BINANCE + FOREXCOM…");
  const [universe, setUniverse] = useState<SymbolInfo[]>(UNIVERSE);
  const [symbolOpen, setSymbolOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [indOpen, setIndOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [widget, setWidget] = useState<WidgetId | null>("watchlist");
  const [bottomOpen, setBottomOpen] = useState(false);
  const [alerts, setAlerts] = useState<string[]>([]);
  const [quotes, setQuotes] = useState<Record<string, { price: number; change: number }>>({});
  const snap = useEngine(engine);

  const attachFeed = async (symbol: SymbolInfo, interval: Interval, mode: "symbol" | "interval") => {
    const eng = engineRef.current;
    if (!eng) return;
    unsubRef.current();
    const gen = ++feedGen.current;
    setStatus(`Loading ${symbol.exchange}:${symbol.ticker}…`);
    const { bars, live: isLive, source: feed } = await fetchHistory(symbol, interval);
    if (gen !== feedGen.current || engineRef.current !== eng) return;
    if (mode === "symbol") eng.setSymbol(symbol, bars);
    else eng.setInterval(interval, bars);
    setLive(isLive);
    setStatus(isLive ? `${symbol.exchange} · live ${feed}` : `${symbol.exchange} · demo fallback`);
    unsubRef.current = subscribeLive(symbol, interval, (bar) => {
      if (gen !== feedGen.current) return;
      const last = eng.getSnapshot().last;
      if (last && (bar.close > last.close * 8 || bar.close < last.close / 8)) return;
      eng.upsertBar(bar);
    });
  };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const symbol = findSymbol("BTCUSDT", "BINANCE");
    const eng = new ChartEngine(host, symbol);
    engineRef.current = eng;
    setEngine(eng);
    void (async () => {
      const catalog = await loadCatalog();
      setUniverse(catalog);
      const next = catalog.find((s) => s.ticker === "BTCUSDT" && s.exchange === "BINANCE") ?? catalog[0] ?? symbol;
      await attachFeed(next, "15", "symbol");
    })();
    return () => {
      unsubRef.current();
      eng.destroy();
      engineRef.current = null;
      setEngine(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const tick = () => {
      void fetchQuotes(universe).then(setQuotes);
    };
    tick();
    const id = window.setInterval(tick, 6000);
    return () => window.clearInterval(id);
  }, [universe]);

  useEffect(() => {
    if (!snap?.replayPlaying) return;
    const id = window.setInterval(() => engineRef.current?.stepReplay(), 420 / (snap.replaySpeed || 1));
    return () => window.clearInterval(id);
  }, [snap?.replayPlaying, snap?.replaySpeed]);

  const loadSymbol = (symbol: SymbolInfo) => {
    const eng = engineRef.current;
    if (!eng) return;
    void attachFeed(symbol, eng.getSnapshot().interval, "symbol");
    setSymbolOpen(false);
    setSearchOpen(false);
  };

  const loadInterval = (interval: Interval) => {
    const eng = engineRef.current;
    if (!eng) return;
    void attachFeed(eng.getSnapshot().symbol, interval, "interval");
  };

  const counts = useMemo(() => {
    const binance = universe.filter((s) => s.exchange === "BINANCE").length;
    const forex = universe.filter((s) => s.exchange === "FOREXCOM").length;
    return { binance, forex };
  }, [universe]);

  return (
    <div className="shell" data-theme={snap?.theme ?? "dark"}>
      <header className="product-header">
        <div className="logo">F</div>
        <b>Forge</b>
        <nav>
          <span>BINANCE {counts.binance}</span>
          <span>FOREXCOM {counts.forex}</span>
        </nav>
        <span className="spacer" />
        <button onClick={() => setSearchOpen(true)}>Search</button>
        <button onClick={() => engine?.setTheme(snap?.theme === "dark" ? "light" : "dark")}>
          {snap?.theme === "dark" ? "Light" : "Dark"}
        </button>
      </header>
      <ChartToolbar
        engine={engine}
        live={live}
        onOpenSymbol={() => setSymbolOpen(true)}
        onOpenIndicators={() => setIndOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenSearch={() => setSearchOpen(true)}
        onInterval={loadInterval}
        onCompare={() => setCompareOpen(true)}
        onAlert={() => {
          const s = engine?.getSnapshot();
          if (s?.last) {
            const last = s.last;
            setAlerts((a) => [`${s.symbol.exchange}:${s.symbol.ticker} @ ${last.close.toFixed(s.symbol.pricePrecision)}`, ...a]);
          }
          setWidget("alerts");
        }}
      />
      <div className="workspace">
        <DrawingToolbar engine={engine} />
        <div className="chart-stage">
          <div className="chart-host" ref={hostRef} />
          <div className={`chart-status ${live ? "on" : ""}`}>{status}</div>
          <ChartOverlays engine={engine} />
        </div>
        <WidgetDock
          engine={engine}
          active={widget}
          onActive={setWidget}
          quotes={quotes}
          universe={universe}
          onPick={loadSymbol}
          alerts={alerts}
        />
      </div>
      <BottomDock engine={engine} open={bottomOpen} onToggle={() => setBottomOpen((v) => !v)} />
      <SymbolModal
        open={symbolOpen || searchOpen}
        universe={universe}
        onClose={() => {
          setSymbolOpen(false);
          setSearchOpen(false);
        }}
        onPick={loadSymbol}
      />
      <SymbolModal
        open={compareOpen}
        universe={universe}
        onClose={() => setCompareOpen(false)}
        onPick={(s) => {
          const eng = engineRef.current;
          if (!eng) return;
          void fetchHistory(s, eng.getSnapshot().interval).then(({ bars }) => eng.setCompare(s.ticker, bars));
          setCompareOpen(false);
        }}
      />
      <IndicatorModal
        open={indOpen}
        onClose={() => setIndOpen(false)}
        onPick={(kind) => {
          engine?.addIndicator(kind);
          setIndOpen(false);
        }}
      />
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        theme={snap?.theme ?? "dark"}
        onTheme={(t) => engine?.setTheme(t)}
        onApiChange={() => {
          const eng = engineRef.current;
          if (!eng) return;
          void loadCatalog().then((catalog) => {
            setUniverse(catalog);
            const cur = eng.getSnapshot();
            return attachFeed(cur.symbol, cur.interval, "interval");
          });
        }}
      />
    </div>
  );
}
