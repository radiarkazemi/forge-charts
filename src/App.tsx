import { useEffect, useRef, useState } from "react";
import { findSymbol } from "./data/feed";
import { fetchHistory, fetchQuotes, subscribeLive } from "./data/market";
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
  const [engine, setEngine] = useState<ChartEngine | null>(null);
  const [live, setLive] = useState(false);
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
    const { bars, live: isLive } = await fetchHistory(symbol, interval);
    if (mode === "symbol") eng.setSymbol(symbol, bars);
    else eng.setInterval(interval, bars);
    setLive(isLive);
    unsubRef.current = subscribeLive(symbol, interval, (bar) => eng.upsertBar(bar));
  };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const symbol = findSymbol("XAUUSD");
    const eng = new ChartEngine(host, symbol);
    engineRef.current = eng;
    setEngine(eng);
    void attachFeed(symbol, "15", "interval");
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
      void fetchQuotes().then(setQuotes);
    };
    tick();
    const id = window.setInterval(tick, 5000);
    return () => window.clearInterval(id);
  }, []);

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

  return (
    <div className="shell" data-theme={snap?.theme ?? "dark"}>
      <header className="product-header">
        <div className="logo">F</div>
        <b>Forge</b>
        <nav>
          <span>Products</span>
          <span>Community</span>
          <span>Markets</span>
          <span>Brokers</span>
          <span>More</span>
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
            setAlerts((a) => [`${s.symbol.ticker} @ ${last.close.toFixed(s.symbol.pricePrecision)}`, ...a]);
          }
          setWidget("alerts");
        }}
      />
      <div className="workspace">
        <DrawingToolbar engine={engine} />
        <div className="chart-stage">
          <div className="chart-host" ref={hostRef} />
          <ChartOverlays engine={engine} />
        </div>
        <WidgetDock
          engine={engine}
          active={widget}
          onActive={setWidget}
          quotes={quotes}
          onPick={loadSymbol}
          alerts={alerts}
        />
      </div>
      <BottomDock engine={engine} open={bottomOpen} onToggle={() => setBottomOpen((v) => !v)} />
      <SymbolModal open={symbolOpen || searchOpen} onClose={() => { setSymbolOpen(false); setSearchOpen(false); }} onPick={loadSymbol} />
      <SymbolModal
        open={compareOpen}
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
      />
    </div>
  );
}
