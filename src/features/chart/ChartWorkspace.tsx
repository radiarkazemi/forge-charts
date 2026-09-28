import Box from "@mui/material/Box";
import { useEffect } from "react";
import { useServices } from "@/app/use-services";
import { useStore } from "@/shared/hooks/useStore";
import { getChartLayoutGrid } from "./chart-layouts";
import { layoutSyncBus } from "./layout-sync";
import { TradingViewChart } from "./TradingViewChart";

interface ChartWorkspaceProps {
  readonly onCreateAlert: () => void;
  readonly onOpenProfile: () => void;
}

/**
 * Single Charting Library widget. Multi-pane “layers” use the library’s native
 * setLayout so the original top navbar stays unchanged and charts sit under it.
 */
export function ChartWorkspace({ onCreateAlert, onOpenProfile }: ChartWorkspaceProps) {
  const { settings, chart } = useServices();
  const chartLayout = useStore(settings.settings, (s) => s.chartLayout ?? "s");
  const lastSymbol = useStore(settings.settings, (s) => s.lastSymbol || "XAUUSD");
  const layoutSync = useStore(settings.settings, (s) => s.layoutSync);
  const ready = useStore(chart.state, (s) => s.ready);
  const grid = getChartLayoutGrid(chartLayout ?? "s");

  useEffect(() => {
    layoutSyncBus.setFlags(
      layoutSync ?? {
        symbol: true,
        interval: false,
        crosshair: false,
        time: false,
        dateRange: false,
        drawings: true,
      },
    );
  }, [layoutSync]);

  useEffect(() => {
    layoutSyncBus.setActiveCount(grid.count);
  }, [grid.count]);

  // Apply native multi-chart layout under the original CL header.
  useEffect(() => {
    if (!ready) return;
    const layout = chartLayout ?? "s";
    chart.setLayout(layout);
    const t1 = window.setTimeout(() => chart.setLayout(layout), 600);
    const t2 = window.setTimeout(() => chart.setLayout(layout), 2000);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [ready, chartLayout, chart]);

  return (
    <Box
      sx={{
        flex: 1,
        minWidth: 0,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        bgcolor: "background.default",
      }}
    >
      <TradingViewChart
        onCreateAlert={onCreateAlert}
        onOpenProfile={onOpenProfile}
        paneIndex={0}
        initialSymbol={lastSymbol}
        hideHeader={false}
      />
    </Box>
  );
}
