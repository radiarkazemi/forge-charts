import { useEffect, useMemo, useRef } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Tooltip from "@mui/material/Tooltip";
import { useServices } from "@/app/use-services";
import { ChartController } from "@/features/chart/chart-controller";
import { useStore } from "@/shared/hooks/useStore";
import { layoutSyncBus } from "./layout-sync";
import { useChartAlertLines } from "./useChartAlertLines";
import { useTradingViewWidget } from "./useTradingViewWidget";

interface TradingViewChartProps {
  readonly onCreateAlert: () => void;
  /** 0 = primary (alerts, Forge header, shared controller). */
  readonly paneIndex?: number;
  readonly initialSymbol?: string;
}

export function TradingViewChart({ onCreateAlert, paneIndex = 0, initialSymbol }: TradingViewChartProps) {
  const { chart, datafeed, saveLoadAdapter, storage, settings, alerts, quotes, config } = useServices();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const theme = useStore(settings.settings, (s) => s.theme);
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
        settings.setPaneSymbol(paneIndex, ticker);
        layoutSyncBus.notifySymbol(paneIndex, ticker);
      },
      onIntervalChanged: (interval) => {
        if (paneIndex === 0) settings.rememberChart(settings.settings.get().lastSymbol, interval);
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
    onCreateAlert,
    onToggleTheme: () => settings.toggleTheme(),
    onOpenAlertsPanel: () => settings.setSidePanel("alerts"),
    onOpenWatchlist: () => settings.setSidePanel("watchlist"),
    onOpenObjectTree: () => chart.openObjectTree(),
    onSetChartLayout: (layout) => settings.setChartLayout(layout),
    onToggleLayoutSync: (key) => settings.toggleLayoutSync(key),
    getLayoutSync: () => settings.settings.get().layoutSync,
    onSymbolChanged: (index, ticker) => settings.setPaneSymbol(index, ticker),
    getLastPrice: () => quote?.price ?? null,
  });

  useChartAlertLines(isPrimary ? controller : null, alerts);

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
      }}
    >
      <Box ref={containerRef} sx={{ position: "absolute", inset: 0 }} />

      {!ready && !error ? (
        <Box sx={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", pointerEvents: "none" }}>
          <CircularProgress size={28} />
        </Box>
      ) : null}

      {error ? (
        <Box sx={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", p: 3 }}>
          <Alert severity="error" variant="outlined" sx={{ maxWidth: 520 }}>
            {error}. Make sure the TradingView Charting Library is available at <code>{config.tvLibraryPath}</code>.
          </Alert>
        </Box>
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
              bottom: { xs: 72, sm: 44 },
              zIndex: 2,
            }}
          />
        </Tooltip>
      ) : null}
    </Box>
  );
}
