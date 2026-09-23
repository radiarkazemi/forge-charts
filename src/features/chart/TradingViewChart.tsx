import { useRef } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Tooltip from "@mui/material/Tooltip";
import { useServices } from "@/app/use-services";
import { useStore } from "@/shared/hooks/useStore";
import { useChartAlertLines } from "./useChartAlertLines";
import { useTradingViewWidget } from "./useTradingViewWidget";

interface TradingViewChartProps {
  readonly onCreateAlert: () => void;
}

export function TradingViewChart({ onCreateAlert }: TradingViewChartProps) {
  const { chart, datafeed, saveLoadAdapter, storage, settings, alerts, quotes, config } = useServices();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const theme = useStore(settings.settings, (s) => s.theme);
  const { ready, error, symbol } = useStore(chart.state);
  const source = useStore(datafeed.source);
  const alertCount = useStore(alerts.alerts, (list) => list.filter((a) => a.status === "active").length);
  const quote = useStore(quotes.quotes, (book) => book[symbol]);

  useTradingViewWidget(containerRef, {
    controller: chart,
    datafeed,
    saveLoadAdapter,
    storage,
    libraryPath: config.tvLibraryPath,
    initialSymbol: settings.settings.get().lastSymbol,
    initialInterval: settings.settings.get().lastInterval,
    theme,
    alertCount,
    onCreateAlert,
    onToggleTheme: () => settings.toggleTheme(),
    onOpenAlertsPanel: () => settings.setSidePanel("alerts"),
    onOpenWatchlist: () => settings.setSidePanel("watchlist"),
    getLastPrice: () => quote?.price ?? null,
  });
  useChartAlertLines(chart, alerts);

  return (
    <Box sx={{ position: "relative", flex: 1, minWidth: 0, minHeight: 0, bgcolor: "background.default" }}>
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

      {ready && source?.isSynthetic ? (
        <Tooltip title="No live provider covers this symbol; showing deterministic demo data.">
          <Chip
            size="small"
            color="warning"
            variant="outlined"
            label="Demo data"
            sx={{ position: "absolute", left: 56, bottom: 44, zIndex: 2 }}
          />
        </Tooltip>
      ) : null}
    </Box>
  );
}
