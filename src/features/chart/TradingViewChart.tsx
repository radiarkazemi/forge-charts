import { useEffect, useMemo, useRef, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Tooltip from "@mui/material/Tooltip";
import { useServices } from "@/app/use-services";
import { activeProfile } from "@/application";
import { ChartController } from "@/features/chart/chart-controller";
import { useStore } from "@/shared/hooks/useStore";
import { BarReplayToolbar } from "./bar-replay/BarReplayToolbar";
import type { HeaderToolbarApi } from "./header-toolbar";
import { layoutSyncBus } from "./layout-sync";
import { useChartAlertLines } from "./useChartAlertLines";
import { useDealingRangesStudy } from "./useDealingRangesStudy";
import { useTradingViewWidget } from "./useTradingViewWidget";
import {
  QuickTradeOverlay,
  TradeLinesOverlay,
  CandleCountdownOverlay,
  useDemoChartLines,
} from "@/features/demo-trading";

interface TradingViewChartProps {
  readonly onCreateAlert: () => void;
  readonly onOpenProfile: () => void;
  /** 0 = primary (alerts, Forge header, shared controller). */
  readonly paneIndex?: number;
  readonly initialSymbol?: string;
  /** Multi-layout: hide Charting Library header on secondary panes. */
  readonly hideHeader?: boolean;
}

export function TradingViewChart({
  onCreateAlert,
  onOpenProfile,
  paneIndex = 0,
  initialSymbol,
  hideHeader = false,
}: TradingViewChartProps) {
  const { chart, barReplay, datafeed, saveLoadAdapter, storage, settings, alerts, quotes, config, demoTrading, demoSpace } =
    useServices();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const headerApiRef = useRef<HeaderToolbarApi | null>(null);
  const theme = useStore(settings.settings, (s) => s.theme);
  const profile = useStore(settings.settings, (s) => activeProfile(s));
  const replayActive = useStore(barReplay.state, (s) => s.active);
  const [forceReplayUi, setForceReplayUi] = useState(false);
  const isPrimary = paneIndex === 0;

  const localController = useMemo(
    () => (isPrimary ? null : new ChartController(initialSymbol ?? "XAUUSD", settings.settings.get().lastInterval)),
    // One controller per secondary pane lifetime; symbol updates via setSymbol.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pane identity only
    [isPrimary, paneIndex],
  );
  const controller = isPrimary ? chart : (localController as ChartController);

  const { ready, error, symbol } = useStore(controller.state);
  const source = useStore(datafeed.source);
  const alertCount = useStore(alerts.alerts, (list) => list.filter((a) => a.status === "active").length);
  const quote = useStore(quotes.quotes, (book) => book[symbol]);

  const symbolForPane =
    initialSymbol ??
    settings.settings.get().paneSymbols[paneIndex] ??
    settings.settings.get().lastSymbol;

  useEffect(() => {
    const unregister = layoutSyncBus.register(paneIndex, controller);
    controller.setSyncHooks({
      onSymbolChanged: (ticker) => {
        if (paneIndex === 0) {
          // Shared CL header symbol search → active pane (restore primary if needed).
          const active = layoutSyncBus.getActivePane();
          layoutSyncBus.handlePrimarySymbolChanged(ticker);
          const applied = layoutSyncBus.getPaneState(active).symbol || ticker;
          settings.setPaneSymbol(active, applied);
          if (active === 0) {
            settings.rememberChart(applied, settings.settings.get().lastInterval);
          }
          return;
        }
        settings.setPaneSymbol(paneIndex, ticker);
        layoutSyncBus.recordPaneSymbol(paneIndex, ticker);
        layoutSyncBus.notifySymbol(paneIndex, ticker);
      },
      onIntervalChanged: (interval) => {
        if (paneIndex === 0) {
          // Shared CL header TF buttons → active pane (not always pane 0).
          const active = layoutSyncBus.getActivePane();
          layoutSyncBus.handlePrimaryIntervalChanged(interval);
          if (active === 0) {
            settings.rememberChart(settings.settings.get().lastSymbol, interval);
          }
          return;
        }
        layoutSyncBus.recordPaneInterval(paneIndex, interval);
        layoutSyncBus.notifyInterval(paneIndex, interval);
      },
      onVisibleRangeChanged: (from, to) => layoutSyncBus.notifyVisibleRange(paneIndex, from, to),
      onCrosshairMoved: (time) => layoutSyncBus.notifyCrosshair(paneIndex, time),
    });
    return () => {
      unregister();
      controller.setSyncHooks({});
    };
  }, [controller, paneIndex, settings]);

  // Primary left toolbar → shared tool for all panes in the layout.
  useEffect(() => {
    if (!ready || !isPrimary) return;
    const sync = () => {
      layoutSyncBus.notifyToolSelected(paneIndex, controller.selectedLineTool());
    };
    sync();
    return controller.onSelectedLineToolChanged(sync);
  }, [controller, isPrimary, paneIndex, ready]);

  // After a pane is ready, seed drawings from the primary onto new panes.
  useEffect(() => {
    if (!ready) return;
    layoutSyncBus.notifyPaneReady(paneIndex);
  }, [paneIndex, ready]);

  // Phones: collapse left drawing toolbar so candles go edge-to-edge.
  useEffect(() => {
    if (!ready || !isPrimary) return;
    if (typeof window === "undefined" || !window.matchMedia("(max-width: 900px)").matches) return;
    const t1 = window.setTimeout(() => controller.ensureDrawingToolbarCollapsed(), 200);
    const t2 = window.setTimeout(() => controller.ensureDrawingToolbarCollapsed(), 800);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [ready, isPrimary, controller]);

  // Click / touch on any pane focuses it (React shell — iframe uses mouse_down too).
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !ready) return;
    const onPointer = () => layoutSyncBus.focusPane(paneIndex);
    el.addEventListener("pointerdown", onPointer, true);
    return () => el.removeEventListener("pointerdown", onPointer, true);
  }, [paneIndex, ready]);

  // Apply symbol without remounting the widget (TradingView in-place behavior).
  useEffect(() => {
    if (!ready || !symbolForPane) return;
    const current = controller.state.get().symbol;
    const bare = symbolForPane.includes(":")
      ? symbolForPane.slice(symbolForPane.lastIndexOf(":") + 1)
      : symbolForPane;
    if (current !== bare && current !== symbolForPane) {
      controller.setSymbol(symbolForPane);
    }
  }, [controller, ready, symbolForPane]);

  // Keep corner avatar in sync when the active profile changes.
  useEffect(() => {
    headerApiRef.current?.updateProfile(profile);
  }, [profile]);

  useEffect(() => {
    if (!replayActive) setForceReplayUi(false);
  }, [replayActive]);

  useEffect(() => {
    if (!isPrimary) return;
    return () => {
      barReplay.pause();
    };
  }, [isPrimary, barReplay]);

  // Layout / replay bridge (original CL header stays on the primary pane).
  useEffect(() => {
    if (!isPrimary) return;
    const onReplay = () => {
      setForceReplayUi(true);
      const w = chart.getWidget() ?? controller.getWidget();
      if (w) barReplay.attach(w, datafeed);
      void barReplay.enter();
    };
    window.addEventListener("forge:enter-bar-replay", onReplay);
    return () => window.removeEventListener("forge:enter-bar-replay", onReplay);
  }, [isPrimary, barReplay, chart, controller, datafeed]);

  useTradingViewWidget(containerRef, {
    controller,
    datafeed,
    saveLoadAdapter,
    storage,
    libraryPath: config.tvLibraryPath,
    initialSymbol: symbolForPane,
    initialInterval: settings.settings.get().lastInterval,
    theme,
    alertCount,
    isPrimary,
    paneIndex,
    hideHeader,
    onCreateAlert,
    onOpenProfile,
    getProfile: () => activeProfile(settings.settings.get()),
    onEnterBarReplay: () => {
      setForceReplayUi(true);
      const w = chart.getWidget();
      if (w) barReplay.attach(w, datafeed);
      void barReplay.enter();
    },
    onToggleTheme: () => settings.toggleTheme(),
    onOpenAlertsPanel: () => settings.setSidePanel("alerts"),
    onOpenWatchlist: () => settings.setSidePanel("watchlist"),
    onOpenObjectTree: () => chart.openObjectTree(),
    onSetChartLayout: (layout) => settings.setChartLayout(layout),
    onToggleLayoutSync: (key) => settings.toggleLayoutSync(key),
    getLayoutSync: () => settings.settings.get().layoutSync,
    onSymbolChanged: (index, ticker) => settings.setPaneSymbol(index, ticker),
    getLastPrice: () => quote?.price ?? null,
    onHeaderReady: (api) => {
      headerApiRef.current = api;
      api.updateProfile(activeProfile(settings.settings.get()));
    },
    onWidgetReady: (widget) => {
      if (isPrimary) {
        barReplay.attach(widget, datafeed);
        demoSpace.attach(widget, datafeed, demoTrading);
      }
    },
  });

  useChartAlertLines(isPrimary ? controller : null, alerts);
  useDemoChartLines(isPrimary);
  useDealingRangesStudy(isPrimary);

  const showReplayToolbar = isPrimary && (replayActive || forceReplayUi);

  return (
    <Box
      sx={{
        position: "relative",
        flex: 1,
        minWidth: 0,
        minHeight: 0,
        width: "100%",
        height: "100%",
        bgcolor: "background.default",
        borderRight: isPrimary ? 0 : 1,
        borderBottom: 1,
        borderColor: "divider",
        overflow: "hidden",
      }}
    >
      <Box ref={containerRef} sx={{ position: "absolute", inset: 0 }} />

      {isPrimary ? <QuickTradeOverlay containerRef={containerRef} /> : null}
      {isPrimary ? <TradeLinesOverlay containerRef={containerRef} /> : null}
      {isPrimary ? <CandleCountdownOverlay /> : null}

      {showReplayToolbar ? <BarReplayToolbar controller={barReplay} forceVisible={forceReplayUi} /> : null}

      {!ready && !error ? (
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            bgcolor: "background.default",
            zIndex: 2,
          }}
        >
          <CircularProgress size={36} />
        </Box>
      ) : null}

      {error ? (
        <Alert severity="error" sx={{ position: "absolute", top: 8, left: 8, right: 8, zIndex: 3 }}>
          {error}
        </Alert>
      ) : null}

      {ready && isPrimary && source?.isSynthetic ? (
        <Tooltip title="No live provider covers this symbol; showing deterministic demo data.">
          <Chip
            size="small"
            color="warning"
            variant="outlined"
            label="Demo data"
            sx={{
              position: "absolute",
              left: { xs: 8, sm: 56 },
              bottom: { xs: 12, sm: 44 },
              zIndex: 2,
            }}
          />
        </Tooltip>
      ) : null}
    </Box>
  );
}
