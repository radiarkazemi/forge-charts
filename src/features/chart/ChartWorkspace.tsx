import Box from "@mui/material/Box";
import { useEffect } from "react";
import { useServices } from "@/app/use-services";
import { useStore } from "@/shared/hooks/useStore";
import { chartPaneArea, getChartLayoutGrid, MAX_CHART_PANES } from "./chart-layouts";
import { layoutSyncBus } from "./layout-sync";
import { TradingViewChart } from "./TradingViewChart";

interface ChartWorkspaceProps {
  readonly onCreateAlert: () => void;
  readonly onOpenProfile: () => void;
}

/**
 * TradingView-style multi-chart workspace.
 * Panes stay mounted (stable keys) so changing layout only updates the CSS grid —
 * widgets are not closed / re-created.
 */
export function ChartWorkspace({ onCreateAlert, onOpenProfile }: ChartWorkspaceProps) {
  const { settings } = useServices();
  const chartLayout = useStore(settings.settings, (s) => s.chartLayout ?? "s");
  const paneSymbols = useStore(settings.settings, (s) => (Array.isArray(s.paneSymbols) ? s.paneSymbols : []));
  const lastSymbol = useStore(settings.settings, (s) => s.lastSymbol || "XAUUSD");
  const layoutSync = useStore(settings.settings, (s) => s.layoutSync);
  const grid = getChartLayoutGrid(chartLayout ?? "s");

  useEffect(() => {
    layoutSyncBus.setFlags(
      layoutSync ?? { symbol: false, interval: false, crosshair: false, time: false, dateRange: false },
    );
  }, [layoutSync]);

  useEffect(() => {
    layoutSyncBus.setActiveCount(grid.count);
    // Reflow after CSS grid / visibility changes so iframes pick up new size.
    const t1 = window.setTimeout(() => layoutSyncBus.reflowVisible(), 50);
    const t2 = window.setTimeout(() => layoutSyncBus.reflowVisible(), 250);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [chartLayout, grid.count]);

  return (
    <Box
      sx={{
        flex: 1,
        minWidth: 0,
        minHeight: 0,
        display: "grid",
        gridTemplateColumns: grid.columns,
        gridTemplateRows: grid.rows,
        gridTemplateAreas: grid.areas,
        gap: "1px",
        bgcolor: "divider",
      }}
    >
      {Array.from({ length: MAX_CHART_PANES }, (_, index) => {
        const visible = index < grid.count;
        const symbol = paneSymbols[index] ?? lastSymbol;
        return (
          <Box
            key={`forge-pane-${index}`}
            sx={{
              gridArea: visible ? chartPaneArea(index) : undefined,
              minWidth: 0,
              minHeight: 0,
              display: visible ? "flex" : "none",
              position: "relative",
            }}
          >
            <TradingViewChart
              onCreateAlert={onCreateAlert}
              onOpenProfile={onOpenProfile}
              paneIndex={index}
              initialSymbol={symbol}
            />
          </Box>
        );
      })}
    </Box>
  );
}
