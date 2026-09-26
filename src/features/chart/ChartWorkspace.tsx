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
 * Active pane: blue ring + star badge. Drawings sync by absolute time/price.
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
            {isActive ? (
              <Box
                aria-hidden
                title="Active chart"
                sx={{
                  position: "absolute",
                  left: 10,
                  bottom: 36,
                  zIndex: 5,
                  width: 18,
                  height: 18,
                  pointerEvents: "none",
                  color: "#2962FF",
                  filter: "drop-shadow(0 0 2px rgba(0,0,0,0.6))",
                }}
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                  <path d="M12 2.5l2.9 6.1 6.7.9-4.9 4.6 1.3 6.6L12 17.8 5.9 20.7l1.3-6.6L2.4 9.5l6.7-.9L12 2.5z" />
                </svg>
              </Box>
            ) : null}
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
