import { useEffect, useRef, useState } from "react";
import { findSymbol } from "./data/feed";
import { fetchHistory, fetchQuotes, subscribeLive } from "./data/market";
import { ChartEngine } from "./engine/ChartEngine";
import type { ChartStyle, IndicatorKind, Interval, SymbolInfo } from "./engine/types";
import { CHART_STYLE_KEY } from "./chartStyle";
import { loadJson, saveJson } from "./persist";
import { BottomDock } from "./ui/BottomDock";
import { ChartOverlays } from "./ui/ChartOverlays";
import { ChartToolbar, type DataMode } from "./ui/ChartToolbar";
import { DrawingToolbar } from "./ui/DrawingToolbar";
import { IndicatorModal, SettingsModal, SymbolModal } from "./ui/Modals";
import { ProductHeader } from "./ui/ProductHeader";
import { useEngine } from "./ui/useEngine";
import { WidgetDock, type WidgetId } from "./ui/WidgetDock";

const RECENTS_KEY = "forge.recentSymbols";
const IND_FAV_KEY = "forge.indicatorFavorites";
const IND_RECENTS_KEY = "forge.recentIndicators";

function loadRecentSymbols(): SymbolInfo[] {
  const tickers = loadJson<string[]>(RECENTS_KEY, ["XAUUSD", "BTCUSD", "AAPL"]);
  const unique = [...new Set(tickers)];
  return unique.map((ticker) => findSymbol(ticker)).slice(0, 10);
}

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
  const [symbolQuery, setSymbolQuery] = useState("");
  const [widget, setWidget] = useState<WidgetId | null>("watchlist");
  const [dataMode, setDataMode] = useState<DataMode>("technicals");
  const [bottomOpen, setBottomOpen] = useState(false);
  const [alerts, setAlerts] = useState<string[]>([]);
  const [quotes, setQuotes] = useState<Record<string, { price: number; change: number }>>({});
  const [recentSymbols, setRecentSymbols] = useState<SymbolInfo[]>(loadRecentSymbols);
  const [indicatorFavorites, setIndicatorFavorites] = useState<string[]>(() => loadJson(IND_FAV_KEY, []));
  const [recentIndicators, setRecentIndicators] = useState<IndicatorKind[]>(() => loadJson(IND_RECENTS_KEY, ["sma", "rsi"]));
  const snap = useEngine(engine);

  const attachFeed = async (symbol: SymbolInfo, interval: Interval, mode: "symbol" | "interval") => {
    const eng = engineRef.current;
    if (!eng) return;
    unsubRef.current();
    // Show demo bars immediately so the chart is never blank while network loads.
    const placeholder = (await import("./data/feed")).generateBars(symbol, interval, 200);
    if (mode === "symbol") eng.setSymbol(symbol, placeholder);
    else eng.setInterval(interval, placeholder);
    try {
      const { bars, live: isLive } = await fetchHistory(symbol, interval);
      if (bars.length) {
        if (mode === "symbol") eng.setSymbol(symbol, bars);
        else eng.setInterval(interval, bars);
      }
      setLive(isLive);
      unsubRef.current = subscribeLive(symbol, interval, (bar) => eng.upsertBar(bar));
    } catch (err) {
      console.warn("attachFeed failed", err);
      setLive(false);
    }
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

  useEffect(() => {
    if (!snap?.symbol.ticker) return;
    document.title = `${snap.symbol.ticker} Chart — Forge Superchart`;
  }, [snap?.symbol.ticker]);

  useEffect(() => {
    saveJson(
      RECENTS_KEY,
      recentSymbols.map((s) => s.ticker),
    );
  }, [recentSymbols]);

  useEffect(() => {
    saveJson(IND_FAV_KEY, indicatorFavorites);
  }, [indicatorFavorites]);

  useEffect(() => {
    saveJson(IND_RECENTS_KEY, recentIndicators);
  }, [recentIndicators]);

  useEffect(() => {
    const eng = engineRef.current;
    if (!eng) return;
    const saved = loadJson<ChartStyle | null>(CHART_STYLE_KEY, null);
    if (saved) eng.applyChartStyle(saved);
  }, [engine]);

  useEffect(() => {
    if (!snap?.chartStyle) return;
    saveJson(CHART_STYLE_KEY, snap.chartStyle);
  }, [snap?.chartStyle]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (symbolOpen || compareOpen || indOpen || settingsOpen || searchOpen) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (e.key.length === 1 && /[A-Za-z0-9]/.test(e.key)) {
        setSymbolQuery(e.key.toUpperCase());
        setSymbolOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [compareOpen, indOpen, searchOpen, settingsOpen, symbolOpen]);

  const touchRecentIndicator = (kind: IndicatorKind) => {
    setRecentIndicators((prev) => [kind, ...prev.filter((item) => item !== kind)].slice(0, 12));
  };

  const toggleIndicatorFavorite = (id: string) => {
    setIndicatorFavorites((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [id, ...prev]));
  };

  const touchRecent = (symbol: SymbolInfo) => {
    setRecentSymbols((prev) => [symbol, ...prev.filter((item) => item.ticker !== symbol.ticker)].slice(0, 10));
  };

  const loadSymbol = (symbol: SymbolInfo) => {
    const eng = engineRef.current;
    if (!eng) return;
    touchRecent(symbol);
    void attachFeed(symbol, eng.getSnapshot().interval, "symbol");
    setSymbolOpen(false);
    setSearchOpen(false);
    setSymbolQuery("");
  };

  const loadInterval = (interval: Interval) => {
    const eng = engineRef.current;
    if (!eng) return;
    void attachFeed(eng.getSnapshot().symbol, interval, "interval");
  };

  const applyDataMode = (mode: DataMode) => {
    setDataMode(mode);
    if (mode === "technicals") setWidget("data");
    else if (mode === "seasonals") setWidget("calendar");
    else if (mode === "news") setWidget("news");
    else setWidget("ideas");
  };

  return (
    <div className="shell" data-theme={snap?.theme ?? "dark"}>
      <ProductHeader
        theme={snap?.theme ?? "dark"}
        alertCount={alerts.length}
        symbolLabel={snap?.symbol.ticker}
        onOpenSearch={() => setSearchOpen(true)}
        onOpenAlerts={() => setWidget("alerts")}
        onOpenSettings={() => setSettingsOpen(true)}
        onToggleTheme={() => engine?.setTheme(snap?.theme === "dark" ? "light" : "dark")}
        onOpenMarkets={() => setWidget("watchlist")}
      />
      <ChartToolbar
        engine={engine}
        live={live}
        dataMode={dataMode}
        onDataMode={applyDataMode}
        onOpenSymbol={() => setSymbolOpen(true)}
        onOpenIndicators={() => setIndOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenSearch={() => setSearchOpen(true)}
        onInterval={loadInterval}
        onCompare={() => setCompareOpen(true)}
        onClearCompare={() => engineRef.current?.setCompare(null, null)}
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
      <SymbolModal
        open={symbolOpen || searchOpen}
        onClose={() => {
          setSymbolOpen(false);
          setSearchOpen(false);
          setSymbolQuery("");
        }}
        onPick={loadSymbol}
        initialQuery={symbolQuery}
        recent={recentSymbols}
      />
      <SymbolModal
        open={compareOpen}
        onClose={() => setCompareOpen(false)}
        title="Compare symbols"
        recent={recentSymbols.filter((item) => item.ticker !== (snap?.symbol.ticker ?? ""))}
        onPick={(s) => {
          const eng = engineRef.current;
          if (!eng) return;
          touchRecent(s);
          void fetchHistory(s, eng.getSnapshot().interval).then(({ bars }) => eng.setCompare(s.ticker, bars));
          setCompareOpen(false);
        }}
      />
      <IndicatorModal
        open={indOpen}
        onClose={() => setIndOpen(false)}
        favorites={indicatorFavorites}
        onToggleFavorite={toggleIndicatorFavorite}
        recent={recentIndicators}
        onPick={(kind) => {
          engine?.addIndicator(kind);
          touchRecentIndicator(kind);
          setIndOpen(false);
        }}
      />
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        theme={snap?.theme ?? "dark"}
        onTheme={(t) => engine?.setTheme(t)}
        engine={engine}
        snap={snap}
      />
    </div>
  );
}
