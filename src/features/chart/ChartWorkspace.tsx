import Box from "@mui/material/Box";
import { useEffect, useState } from "react";
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
 *
 * Active pane gets a blue focus ring (TV sample). Drawings sync across panes
 * by absolute time/price so a 4H trend line maps onto the matching 15m candles.
 */
export function ChartWorkspace({ onCreateAlert, onOpenProfile }: ChartWorkspaceProps) {
  const { settings } = useServices();
  const chartLayout = useStore(settings.settings, (s) => s.chartLayout ?? "s");
  const paneSymbols = useStore(settings.settings, (s) => (Array.isArray(s.paneSymbols) ? s.paneSymbols : []));
  const lastSymbol = useStore(settings.settings, (s) => s.lastSymbol || "XAUUSD");
  const layoutSync = useStore(settings.settings, (s) => s.layoutSync);
  const grid = getChartLayoutGrid(chartLayout ?? "s");
  const [activePane, setActivePane] = useState(0);

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
    // Reflow after CSS grid / visibility changes so iframes pick up new size.
    const t1 = window.setTimeout(() => layoutSyncBus.reflowVisible(), 50);
    const t2 = window.setTimeout(() => layoutSyncBus.reflowVisible(), 250);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [chartLayout, grid.count]);

  useEffect(() => layoutSyncBus.subscribeActivePane(setActivePane), []);

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
        gap: "2px",
        bgcolor: "#2a2e39",
        p: "2px",
      }}
    >
      {Array.from({ length: MAX_CHART_PANES }, (_, index) => {
        const visible = index < grid.count;
        const symbol = paneSymbols[index] ?? lastSymbol;
        const isActive = visible && grid.count > 1 && activePane === index;
        return (
          <Box
            key={`forge-pane-${index}`}
            onPointerDownCapture={() => {
              if (visible) layoutSyncBus.focusPane(index);
            }}
            sx={{
              gridArea: visible ? chartPaneArea(index) : undefined,
              minWidth: 0,
              minHeight: 0,
              display: visible ? "flex" : "none",
              position: "relative",
              outline: isActive ? "2px solid #2962FF" : "2px solid transparent",
              outlineOffset: "-2px",
              zIndex: isActive ? 2 : 1,
              transition: "outline-color 120ms ease",
              bgcolor: "background.default",
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
