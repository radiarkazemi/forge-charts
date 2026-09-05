import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createAlert,
  dispatchWebhook,
  evaluateAlerts,
  loadAlerts,
  saveAlerts,
  type AlertFire,
  type PriceAlert,
} from "./data/alerts";
import {
  fetchExternalBars,
  makeExternalSymbol,
  normalizeBars,
  parseInboundMessage,
  postToParent,
  resolveDataUrl,
} from "./data/externalFeed";
import { findSymbol, generateBars } from "./data/feed";
import { fetchHistory, fetchQuotes, subscribeLive } from "./data/market";
import { parseEmbedConfig } from "./embed";
import { ChartEngine } from "./engine/ChartEngine";
import type { Bar, ChartStyle, IndicatorKind, Interval, SymbolInfo } from "./engine/types";
import { CHART_STYLE_KEY } from "./chartStyle";
import { loadJson, saveJson } from "./persist";
import { AlertModal } from "./ui/AlertModal";
import { BottomDock } from "./ui/BottomDock";
import { ChartOverlays } from "./ui/ChartOverlays";
import { ChartPane } from "./ui/ChartPane";
import { ChartToolbar, type DataMode } from "./ui/ChartToolbar";
import { DrawingToolbar } from "./ui/DrawingToolbar";
import { ARRANGEMENTS, LayoutMenu, createLayout, type LayoutArrangement } from "./ui/LayoutMenu";
import { MobileBottomBar, MobileMoreSheet } from "./ui/MobileBottomBar";
import { MobileDrawingSheet } from "./ui/MobileDrawingSheet";
import { IndicatorModal, SettingsModal, SymbolModal } from "./ui/Modals";
import { ProductHeader } from "./ui/ProductHeader";
import { QuickSearchModal } from "./ui/QuickSearchModal";
import { ReplayBar } from "./ui/ReplayBar";
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

function useNarrow(maxWidth = 720): boolean {
  const [narrow, setNarrow] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(`(max-width: ${maxWidth}px)`).matches : false,
  );
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${maxWidth}px)`);
    const onChange = () => setNarrow(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [maxWidth]);
  return narrow;
}

function bootSymbol(boot: ReturnType<typeof parseEmbedConfig>): SymbolInfo {
  if (boot.source === "external") {
    return makeExternalSymbol(
      {
        ticker: boot.symbol,
        name: boot.name,
        exchange: boot.exchange || "CUSTOM",
        pricePrecision: boot.pricePrecision,
      },
      boot.symbol,
    );
  }
  return findSymbol(boot.symbol, boot.exchange);
}

export default function App() {
  const boot = useMemo(() => parseEmbedConfig(), []);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<ChartEngine | null>(null);
  const unsubRef = useRef<() => void>(() => {});
  const prevCloseRef = useRef<number | null>(null);
  const alertsRef = useRef<PriceAlert[]>([]);
  const [engine, setEngine] = useState<ChartEngine | null>(null);
  const [live, setLive] = useState(false);
  const [symbolOpen, setSymbolOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [indOpen, setIndOpen] = useState(false);
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertDraft, setAlertDraft] = useState<{ price: number; name: string; drawingId?: string; drawingKind?: string } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [symbolQuery, setSymbolQuery] = useState("");
  const [widget, setWidget] = useState<WidgetId | null>(boot.chrome.widgets ? "watchlist" : null);
  const [dataMode, setDataMode] = useState<DataMode>("technicals");
  const [bottomOpen, setBottomOpen] = useState(false);
  const [alerts, setAlerts] = useState<PriceAlert[]>(() => loadAlerts());
  const [toast, setToast] = useState<AlertFire | null>(null);
  const [quotes, setQuotes] = useState<Record<string, { price: number; change: number }>>({});
  const [recentSymbols, setRecentSymbols] = useState<SymbolInfo[]>(loadRecentSymbols);
  const [indicatorFavorites, setIndicatorFavorites] = useState<string[]>(() => loadJson(IND_FAV_KEY, []));
  const [recentIndicators, setRecentIndicators] = useState<IndicatorKind[]>(() => loadJson(IND_RECENTS_KEY, ["sma", "rsi"]));
  const [mobileWidgetOpen, setMobileWidgetOpen] = useState(false);
  const [quickSearchOpen, setQuickSearchOpen] = useState(false);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [mobileDrawSheetOpen, setMobileDrawSheetOpen] = useState(false);
  const [arrangement, setArrangement] = useState<LayoutArrangement>("1");
  const [paneSymbols, setPaneSymbols] = useState<string[]>(["XAUUSD"]);
  const [activePane, setActivePane] = useState(0);
  const [secondaryEngines, setSecondaryEngines] = useState<Record<number, ChartEngine | null>>({});
  const paneEnginesRef = useRef<Record<number, ChartEngine | null>>({});
  const snap = useEngine(engine);
  const narrow = useNarrow(720);
  const compact = boot.embed || boot.mobile || narrow;
  const toolbarEngine = activePane === 0 ? engine : secondaryEngines[activePane] ?? engine;
  const toolbarSnap = useEngine(toolbarEngine);

  const showHeader = boot.chrome.header;
  const showToolbar = boot.chrome.toolbar;
  const showDrawings = boot.chrome.drawings;
  const showWidgets = boot.chrome.widgets;
  const showBottom = boot.chrome.bottom;

  useEffect(() => {
    const meta = ARRANGEMENTS.find((a) => a.id === arrangement) ?? ARRANGEMENTS[0];
    setPaneSymbols((prev) => {
      const next = [...prev];
      const fill = snap?.symbol.ticker || boot.symbol || "XAUUSD";
      while (next.length < meta.count) next.push(fill);
      return next.slice(0, meta.count);
    });
    if (activePane >= meta.count) setActivePane(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrangement]);

  useEffect(() => {
    if (!toolbarSnap?.replayPlaying) return;
    const id = window.setInterval(
      () => toolbarEngine?.stepReplay(),
      420 / (toolbarSnap.replaySpeed || 1),
    );
    return () => window.clearInterval(id);
  }, [toolbarEngine, toolbarSnap?.replayPlaying, toolbarSnap?.replaySpeed]);

  useEffect(() => {
    alertsRef.current = alerts;
    saveAlerts(alerts);
  }, [alerts]);

  const onPriceTick = (symbol: SymbolInfo, close: number) => {
    const prev = prevCloseRef.current;
    prevCloseRef.current = close;
    const eng = engineRef.current;
    const drawingLevels: Record<string, number> = {};
    const indicatorValues: Record<string, number> = {};
    if (eng) {
      for (const d of eng.getDrawings()) {
        const px = d.points[0]?.price;
        if (px != null && Number.isFinite(px)) drawingLevels[d.id] = px;
      }
      const idx = eng.getBars().length - 1;
      if (idx >= 0) {
        for (const row of eng.indicatorValuesAt(idx)) {
          const v = row.values.find((x) => x != null);
          if (v != null) indicatorValues[row.id] = v;
        }
      }
    }
    const { alerts: next, fires } = evaluateAlerts(alertsRef.current, {
      symbol: symbol.ticker,
      prevClose: prev,
      nextClose: close,
      drawingLevels,
      indicatorValues,
    });
    if (fires.length) {
      setAlerts(next);
      for (const fire of fires) dispatchWebhook(fire);
      setToast(fires[0]!);
      if (showWidgets) setWidget("alerts");
    }
  };

  const applyBars = (eng: ChartEngine, symbol: SymbolInfo, interval: Interval, bars: Bar[], mode: "symbol" | "interval") => {
    if (mode === "symbol") eng.setSymbol(symbol, bars);
    else eng.setInterval(interval, bars);
    prevCloseRef.current = bars.at(-1)?.close ?? null;
  };

  const attachExternal = async (symbol: SymbolInfo, interval: Interval, mode: "symbol" | "interval") => {
    const eng = engineRef.current;
    if (!eng) return;
    unsubRef.current();
    prevCloseRef.current = null;
    applyBars(eng, symbol, interval, [], mode);
    setLive(false);

    const targetOrigin = boot.parentOrigin || "*";
    postToParent({ type: "requestData", symbol: symbol.ticker, exchange: symbol.exchange, interval }, targetOrigin);

    if (!boot.dataUrl) return;

    const load = async () => {
      try {
        const url = resolveDataUrl(boot.dataUrl!, symbol.ticker, String(interval));
        const payload = await fetchExternalBars(url);
        const nextSymbol = payload.symbol
          ? makeExternalSymbol(payload.symbol, symbol.ticker)
          : symbol;
        if (boot.pricePrecision != null) nextSymbol.pricePrecision = boot.pricePrecision;
        if (boot.name) nextSymbol.name = boot.name;
        const bars = payload.bars;
        const nextInterval = (payload.interval || interval) as Interval;
        applyBars(eng, nextSymbol, nextInterval, bars, mode === "symbol" || payload.symbol ? "symbol" : "interval");
        setLive(!!payload.live || boot.dataRefresh > 0);
      } catch (err) {
        console.warn("external dataUrl failed", err);
        setLive(false);
      }
    };

    await load();
    if (boot.dataRefresh > 0) {
      const id = window.setInterval(() => void load(), boot.dataRefresh * 1000);
      unsubRef.current = () => window.clearInterval(id);
    }
  };

  const attachFeed = async (symbol: SymbolInfo, interval: Interval, mode: "symbol" | "interval") => {
    if (boot.source === "external") {
      await attachExternal(symbol, interval, mode);
      return;
    }
    const eng = engineRef.current;
    if (!eng) return;
    unsubRef.current();
    prevCloseRef.current = null;
    // Show demo bars immediately so the chart is never blank while network loads.
    const placeholder = generateBars(symbol, interval, 200);
    applyBars(eng, symbol, interval, placeholder, mode);
    try {
      const { bars, live: isLive } = await fetchHistory(symbol, interval);
      if (bars.length) {
        applyBars(eng, symbol, interval, bars, mode);
      }
      setLive(isLive);
      unsubRef.current = subscribeLive(symbol, interval, (bar) => {
        eng.upsertBar(bar);
        onPriceTick(symbol, bar.close);
      });
    } catch (err) {
      console.warn("attachFeed failed", err);
      setLive(false);
    }
  };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const symbol = bootSymbol(boot);
    const eng = new ChartEngine(host, symbol);
    engineRef.current = eng;
    setEngine(eng);
    (window as unknown as { __forgeEngine?: ChartEngine }).__forgeEngine = eng;
    if (boot.theme) eng.setTheme(boot.theme);
    void attachFeed(symbol, boot.interval, "interval");
    postToParent(
      {
        type: "ready",
        sourceMode: boot.source,
        symbol: symbol.ticker,
        exchange: symbol.exchange,
        interval: boot.interval,
      },
      boot.parentOrigin || "*",
    );
    return () => {
      unsubRef.current();
      eng.destroy();
      engineRef.current = null;
      const w = window as unknown as { __forgeEngine?: ChartEngine };
      if (w.__forgeEngine === eng) delete w.__forgeEngine;
      setEngine(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (boot.source === "external") return;
    const tick = () => {
      void fetchQuotes().then(setQuotes);
    };
    tick();
    const id = window.setInterval(tick, 5000);
    return () => window.clearInterval(id);
  }, [boot.source]);

  useEffect(() => {
    if (boot.source !== "external") return;
    const allowed = boot.parentOrigin;
    const onMessage = (event: MessageEvent) => {
      if (allowed && event.origin !== allowed) return;
      const msg = parseInboundMessage(event.data);
      if (!msg) return;
      const eng = engineRef.current;
      if (!eng) return;
      const snapNow = eng.getSnapshot();

      if (msg.type === "ping") {
        postToParent({ type: "pong" }, allowed || "*");
        return;
      }
      if (msg.type === "setTheme") {
        eng.setTheme(msg.theme);
        return;
      }
      if (msg.type === "setSymbol") {
        const symbol = makeExternalSymbol(msg.symbol, snapNow.symbol.ticker);
        if (boot.pricePrecision != null) symbol.pricePrecision = boot.pricePrecision;
        void attachFeed(symbol, snapNow.interval, "symbol");
        return;
      }
      if (msg.type === "setInterval") {
        void attachFeed(snapNow.symbol, msg.interval, "interval");
        return;
      }
      if (msg.type === "upsertBar") {
        const bars = normalizeBars([msg.bar]);
        const bar = bars[0];
        if (!bar) return;
        eng.upsertBar(bar);
        setLive(true);
        onPriceTick(snapNow.symbol, bar.close);
        return;
      }
      if (msg.type === "setBars" || msg.type === "setData") {
        const bars = normalizeBars(msg.type === "setBars" ? msg.bars : msg.bars ?? msg.data);
        const symbol = msg.type === "setData" && msg.symbol
          ? makeExternalSymbol(msg.symbol, snapNow.symbol.ticker)
          : snapNow.symbol;
        if (boot.pricePrecision != null) symbol.pricePrecision = boot.pricePrecision;
        const interval = (msg.type === "setData" && msg.interval ? msg.interval : snapNow.interval) as Interval;
        unsubRef.current();
        applyBars(eng, symbol, interval, bars, "symbol");
        setLive(msg.type === "setData" ? !!msg.live : true);
        postToParent(
          { type: "dataApplied", symbol: symbol.ticker, interval, bars: bars.length },
          allowed || "*",
        );
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boot.parentOrigin, boot.pricePrecision, boot.source]);

  useEffect(() => {
    if (!snap?.symbol.ticker) return;
    document.title = boot.embed
      ? `${snap.symbol.ticker} — Forge Chart`
      : `${snap.symbol.ticker} Chart — Forge Superchart`;
  }, [boot.embed, snap?.symbol.ticker]);

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
    if (!boot.embed || !snap?.symbol.ticker) return;
    const url = new URL(window.location.href);
    url.searchParams.set("embed", "1");
    url.searchParams.set("symbol", snap.symbol.ticker);
    url.searchParams.set("exchange", snap.symbol.exchange);
    url.searchParams.set("interval", String(snap.interval));
    url.searchParams.set("theme", snap.theme);
    if (boot.source === "external") {
      url.searchParams.set("source", "external");
      if (boot.dataUrl) url.searchParams.set("dataUrl", boot.dataUrl);
    }
    window.history.replaceState({}, "", `${url.pathname}${url.search}`);
  }, [boot.dataUrl, boot.embed, boot.source, snap?.interval, snap?.symbol.exchange, snap?.symbol.ticker, snap?.theme]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = !!(target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable));
      if ((e.altKey && e.key.toLowerCase() === "i") || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "i" && e.shiftKey)) {
        if (typing) return;
        e.preventDefault();
        setIndOpen(true);
        return;
      }
      if (e.altKey && e.key.toLowerCase() === "a") {
        if (typing) return;
        e.preventDefault();
        setAlertOpen(true);
        return;
      }
      // K-01…K-04 drawing tools (work without canvas focus)
      if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && !typing) {
        const k = e.key.toLowerCase();
        const tool =
          k === "t" ? "trend" : k === "h" ? "hline" : k === "v" ? "vline" : k === "f" ? "fib" : null;
        if (tool) {
          e.preventDefault();
          toolbarEngine?.setTool(tool);
          return;
        }
      }
      if (boot.source === "external") return;
      if (symbolOpen || compareOpen || indOpen || alertOpen || settingsOpen || searchOpen) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (typing) return;
      if (e.key.length === 1 && /[A-Za-z0-9]/.test(e.key)) {
        setSymbolQuery(e.key.toUpperCase());
        setSymbolOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [alertOpen, boot.source, compareOpen, indOpen, searchOpen, settingsOpen, symbolOpen, toolbarEngine]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(id);
  }, [toast]);

  const openCreateAlert = (price?: number) => {
    if (price != null && Number.isFinite(price)) {
      setAlertDraft({
        price,
        name: `${snap?.symbol.ticker ?? "SYM"} @ ${price}`,
      });
    } else {
      setAlertDraft(null);
    }
    setAlertOpen(true);
  };
  
  const syncDrawingsAcrossPanes = useCallback((source: ChartEngine) => {
    const rows = source.getDrawings();
    Object.values(paneEnginesRef.current).forEach((eng) => {
      if (!eng || eng === source) return;
      eng.setDrawings(rows);
    });
  }, []);

  const openDrawingAlert = (drawing: import("./engine/types").Drawing) => {
    const price = drawing.points[0]?.price ?? snap?.last?.close ?? 0;
    setAlertDraft({
      price,
      name: `${snap?.symbol.ticker ?? "SYM"} ${drawing.kind}`,
      drawingId: drawing.id,
      drawingKind: drawing.kind,
    });
    setAlertOpen(true);
  };

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
    setPaneSymbols((prev) => {
      const next = [...prev];
      next[activePane] = symbol.ticker;
      return next;
    });
    if (activePane !== 0) {
      const eng = secondaryEngines[activePane];
      if (eng) {
        // ChartPane watches symbol prop — update is enough via paneSymbols
      }
      setSymbolOpen(false);
      setSearchOpen(false);
      setSymbolQuery("");
      setMobileWidgetOpen(false);
      return;
    }
    const eng = engineRef.current;
    if (!eng) return;
    if (boot.source === "external") {
      const custom = makeExternalSymbol(
        {
          ticker: symbol.ticker,
          name: symbol.name,
          exchange: symbol.exchange === "BINANCE" || symbol.exchange === "FOREXCOM" ? "CUSTOM" : symbol.exchange,
          pricePrecision: boot.pricePrecision ?? symbol.pricePrecision,
          type: symbol.type,
        },
        symbol.ticker,
      );
      void attachFeed(custom, eng.getSnapshot().interval, "symbol");
    } else {
      touchRecent(symbol);
      void attachFeed(symbol, eng.getSnapshot().interval, "symbol");
    }
    setSymbolOpen(false);
    setSearchOpen(false);
    setSymbolQuery("");
    setMobileWidgetOpen(false);
  };

  const loadInterval = (interval: Interval) => {
    if (activePane !== 0) {
      const eng = secondaryEngines[activePane];
      if (!eng) return;
      const sym = eng.getSnapshot().symbol;
      void fetchHistory(sym, interval).then(({ bars }) => {
        eng.setInterval(interval, bars.length ? bars : generateBars(sym, interval, 200));
      });
      return;
    }
    const eng = engineRef.current;
    if (!eng) return;
    void attachFeed(eng.getSnapshot().symbol, interval, "interval");
    if (boot.source === "external") {
      postToParent(
        {
          type: "interval",
          symbol: eng.getSnapshot().symbol.ticker,
          interval,
        },
        boot.parentOrigin || "*",
      );
    }
  };

  const applyDataMode = (mode: DataMode) => {
    setDataMode(mode);
    if (!showWidgets) return;
    if (mode === "technicals") setWidget("data");
    else if (mode === "seasonals") setWidget("calendar");
    else if (mode === "news") setWidget("news");
    else setWidget("ideas");
    if (compact) setMobileWidgetOpen(true);
  };

  useEffect(() => {
    if (!showWidgets) return;
    if (dataMode === "technicals" && widget !== "data" && widget !== "object") setWidget("data");
    if (dataMode === "seasonals" && widget !== "calendar") setWidget("calendar");
    if (dataMode === "news" && widget !== "news") setWidget("news");
    if (dataMode === "ideas" && widget !== "ideas") setWidget("ideas");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataMode, showWidgets]);

  const shellClass = [
    "shell",
    boot.embed ? "embed" : "",
    compact ? "compact" : "",
    boot.mobile ? "force-mobile" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const widgetOverlay = showWidgets && compact && mobileWidgetOpen;

  useEffect(() => {
    if (!engine) return;
    const fingerprint = () =>
      JSON.stringify(
        engine.getDrawings().map((d) => ({
          id: d.id,
          kind: d.kind,
          color: d.color,
          lineWidth: d.lineWidth,
          lineStyle: d.lineStyle,
          visible: d.visible,
          locked: d.locked,
          text: d.text,
          points: d.points,
          visibility: d.visibility,
          fib: d.fib,
        })),
      );
    let last = fingerprint();
    return engine.subscribe(() => {
      const next = fingerprint();
      if (next === last) return;
      last = next;
      syncDrawingsAcrossPanes(engine);
    });
  }, [engine, syncDrawingsAcrossPanes]);

  return (
    <div
      className={shellClass}
      data-theme={snap?.theme ?? boot.theme ?? "dark"}
      data-embed={boot.embed ? "1" : "0"}
      data-header={showHeader ? "1" : "0"}
      data-toolbar={showToolbar && !compact ? "1" : "0"}
      data-drawings={showDrawings ? "1" : "0"}
      data-widgets={showWidgets ? "1" : "0"}
      data-bottom={compact || showBottom ? "1" : "0"}
      data-mobile={compact ? "1" : "0"}
    >
      {showHeader && compact ? (
        <header className="mobile-header">
          <button type="button" className="mobile-header-sym" onClick={() => setSymbolOpen(true)}>
            <b>{snap?.symbol.ticker ?? "XAUUSD"}</b>
            <em>{snap?.symbol.exchange ?? ""}</em>
            {live ? <span className="mobile-live-dot" /> : null}
          </button>
          <span className="mobile-header-price">
            {snap?.last ? snap.last.close.toFixed(snap.symbol.pricePrecision) : "—"}
          </span>
          <span className="spacer" />
          <button type="button" className="mobile-hdr-btn" onClick={() => setQuickSearchOpen(true)} title="Search">⌕</button>
          <button type="button" className="mobile-hdr-btn" onClick={() => setSettingsOpen(true)} title="Settings">⚙</button>
        </header>
      ) : null}
      {showHeader && !compact ? (
        <ProductHeader
          theme={snap?.theme ?? "dark"}
          alertCount={alerts.filter((a) => a.enabled).length}
          symbolLabel={snap?.symbol.ticker}
          onOpenSearch={() => setSearchOpen(true)}
          onOpenQuickSearch={() => setQuickSearchOpen(true)}
          onOpenAlerts={() => {
            if (showWidgets) {
              setWidget("alerts");
              if (compact) setMobileWidgetOpen(true);
            }
          }}
          onOpenSettings={() => setSettingsOpen(true)}
          onToggleTheme={() => engine?.setTheme(snap?.theme === "dark" ? "light" : "dark")}
          onOpenMarkets={() => {
            if (showWidgets) {
              setWidget("watchlist");
              if (compact) setMobileWidgetOpen(true);
            }
          }}
        />
      ) : null}
      {showToolbar && !compact ? (
        <ChartToolbar
          engine={toolbarEngine}
          live={live}
          dataMode={dataMode}
          compact={compact}
          external={boot.source === "external"}
          layoutSlot={
            boot.embed ? null : (
              <LayoutMenu
                arrangement={arrangement}
                symbols={paneSymbols}
                onArrangement={setArrangement}
                onOpenLayout={(layout) => {
                  setArrangement(layout.arrangement);
                  setPaneSymbols(layout.symbols);
                  setActivePane(0);
                  const sym = findSymbol(layout.symbols[0] || "XAUUSD");
                  void attachFeed(sym, engineRef.current?.getSnapshot().interval ?? "15", "symbol");
                }}
                onSaveCurrent={(name) => createLayout(name, arrangement, paneSymbols)}
              />
            )
          }
          onDataMode={applyDataMode}
          onOpenSymbol={() => setSymbolOpen(true)}
          onOpenIndicators={() => setIndOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenSearch={() => setSearchOpen(true)}
          onOpenQuickSearch={() => setQuickSearchOpen(true)}
          onInterval={loadInterval}
          onCompare={() => setCompareOpen(true)}
          onClearCompare={() => toolbarEngine?.setCompare(null, null)}
          onAlert={openCreateAlert}
        />
      ) : null}
      <div className="workspace">
        {showDrawings && !compact ? (
          <div className="draw-rail-slot">
            <DrawingToolbar engine={toolbarEngine} />
          </div>
        ) : null}
        <div className={`chart-grid layout-${compact ? "1" : arrangement}`}>
          <div
            className={activePane === 0 ? "chart-pane active" : "chart-pane"}
            onMouseDown={() => setActivePane(0)}
          >
            <div className="chart-stage">
              <div className="chart-host" ref={hostRef} />
              <ChartOverlays engine={engine} onAlertDrawing={openDrawingAlert} onAlertPrice={(price) => openCreateAlert(price)} />
              <ReplayBar engine={engine} />
            </div>
            {!compact && arrangement !== "1" ? <div className="pane-tag">{snap?.symbol.ticker}</div> : null}
          </div>
          {!boot.embed &&
            !compact &&
            paneSymbols.slice(1).map((ticker, i) => {
              const paneIndex = i + 1;
              return (
                <ChartPane
                  key={`${arrangement}-${paneIndex}-${ticker}`}
                  symbol={findSymbol(ticker)}
                  interval={(toolbarSnap?.interval as Interval) || "15"}
                  theme={snap?.theme}
                  active={activePane === paneIndex}
                  onActivate={() => setActivePane(paneIndex)}
                  onEngine={(eng) => {
                    paneEnginesRef.current[paneIndex] = eng;
                    setSecondaryEngines((prev) => ({ ...prev, [paneIndex]: eng }));
                  }}
                  onPrice={onPriceTick}
                />
              );
            })}
        </div>
        {showWidgets ? (
          <div className={widgetOverlay ? "widget-dock-slot open" : "widget-dock-slot"}>
            <WidgetDock
              engine={toolbarEngine}
              active={widget}
              onActive={(id) => {
                setWidget(id);
                if (compact && id) setMobileWidgetOpen(true);
              }}
              quotes={quotes}
              onPick={loadSymbol}
              alerts={alerts}
              onCreateAlert={openCreateAlert}
              onToggleAlert={(id) =>
                setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, enabled: !a.enabled } : a)))
              }
              onDeleteAlert={(id) => setAlerts((prev) => prev.filter((a) => a.id !== id))}
            />
          </div>
        ) : null}
        {widgetOverlay ? (
          <button
            type="button"
            className="mobile-scrim"
            aria-label="Close panel"
            onClick={() => setMobileWidgetOpen(false)}
          />
        ) : null}
      </div>
      {toast ? (
        <div className="alert-toast" role="status">
          <strong>{toast.name}</strong>
          <span>{toast.message}</span>
          <em>
            {toast.symbol} @ {toast.price}
          </em>
          <button type="button" onClick={() => setToast(null)}>
            ×
          </button>
        </div>
      ) : null}
      {showBottom && !compact ? <BottomDock engine={toolbarEngine} open={bottomOpen} onToggle={() => setBottomOpen((v) => !v)} /> : null}
      {compact ? (
        <MobileBottomBar
          engine={toolbarEngine}
          live={live}
          onOpenSymbol={() => setSymbolOpen(true)}
          onOpenIndicators={() => setIndOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenDrawing={() => setMobileDrawSheetOpen(true)}
          onOpenMore={() => setMobileMoreOpen(true)}
          onInterval={loadInterval}
          onAlert={openCreateAlert}
        />
      ) : null}
      <MobileMoreSheet
        open={mobileMoreOpen}
        onClose={() => setMobileMoreOpen(false)}
        engine={toolbarEngine}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenSearch={() => setQuickSearchOpen(true)}
        onReplay={() => toolbarEngine?.setReplay(!toolbarSnap?.replay)}
        onSnapshot={() => toolbarEngine?.screenshot()}
        onFullscreen={() => {
          if (document.fullscreenElement) document.exitFullscreen?.();
          else document.documentElement.requestFullscreen?.();
        }}
        onOpenWatchlist={
          showWidgets
            ? () => {
                setWidget("watchlist");
                setMobileWidgetOpen(true);
              }
            : undefined
        }
      />
      <MobileDrawingSheet
        open={mobileDrawSheetOpen}
        onClose={() => setMobileDrawSheetOpen(false)}
        engine={toolbarEngine}
      />
      <QuickSearchModal
        open={quickSearchOpen}
        onClose={() => setQuickSearchOpen(false)}
        engine={toolbarEngine}
        onOpenSymbol={() => {
          setQuickSearchOpen(false);
          setSearchOpen(true);
        }}
        onOpenIndicators={() => setIndOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenAlert={openCreateAlert}
        onReplay={() => toolbarEngine?.setReplay(!toolbarSnap?.replay)}
      />
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
          const eng = toolbarEngine ?? engineRef.current;
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
        activeKinds={(toolbarSnap?.indicators ?? snap?.indicators ?? []).map((item) => item.kind)}
        onPick={(kind) => {
          toolbarEngine?.addIndicator(kind);
          touchRecentIndicator(kind);
          setIndOpen(false);
        }}
        onPickTool={(tool) => {
          toolbarEngine?.setTool(tool);
          setIndOpen(false);
        }}
      />
      <AlertModal
        open={alertOpen}
        onClose={() => { setAlertOpen(false); setAlertDraft(null); }}
        symbol={toolbarSnap?.symbol.ticker ?? snap?.symbol.ticker ?? "SYMBOL"}
        exchange={toolbarSnap?.symbol.exchange ?? snap?.symbol.exchange}
        interval={toolbarSnap?.interval ?? snap?.interval}
        precision={toolbarSnap?.symbol.pricePrecision ?? snap?.symbol.pricePrecision ?? 2}
        defaultPrice={alertDraft?.price ?? toolbarSnap?.last?.close ?? snap?.last?.close ?? 0}
        defaultName={alertDraft?.name}
        onCreate={(input) => {
          const alert = createAlert({
            ...input,
            interval: input.interval as Interval | undefined,
            drawingId: alertDraft?.drawingId,
            drawingKind: alertDraft?.drawingKind,
            webhookUrl: input.webhookUrl,
          });
          setAlertDraft(null);
          setAlerts((prev) => [alert, ...prev]);
          if (showWidgets) {
            setWidget("alerts");
            if (compact) setMobileWidgetOpen(true);
          }
        }}
      />
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        theme={toolbarSnap?.theme ?? snap?.theme ?? "dark"}
        onTheme={(t) => toolbarEngine?.setTheme(t)}
        engine={toolbarEngine}
        snap={toolbarSnap ?? snap}
      />
    </div>
  );
}
