import Box from "@mui/material/Box";
import { useServices } from "@/app/use-services";
import { useStore } from "@/shared/hooks/useStore";
import { chartPaneArea, getChartLayoutGrid } from "./chart-layouts";
import { TradingViewChart } from "./TradingViewChart";

interface ChartWorkspaceProps {
  readonly onCreateAlert: () => void;
}

/**
 * One or more chart panes in a TradingView-style layout grid.
 * Advanced Charts is single-widget only, so Forge mounts N widgets when the user
 * picks 2 / 3 / 4 charts from the Layout control.
 */
export function ChartWorkspace({ onCreateAlert }: ChartWorkspaceProps) {
  const { settings } = useServices();
  const chartLayout = useStore(settings.settings, (s) => s.chartLayout);
  const paneSymbols = useStore(settings.settings, (s) => s.paneSymbols);
  const lastSymbol = useStore(settings.settings, (s) => s.lastSymbol);
  const grid = getChartLayoutGrid(chartLayout);

  const symbols = Array.from({ length: grid.count }, (_, i) => paneSymbols[i] ?? lastSymbol);

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
      {symbols.map((symbol, index) => (
        <Box
          key={`${chartLayout}-${index}`}
          sx={{
            gridArea: chartPaneArea(index),
            minWidth: 0,
            minHeight: 0,
            display: "flex",
            position: "relative",
          }}
        >
          <TradingViewChart onCreateAlert={onCreateAlert} paneIndex={index} initialSymbol={symbol} />
        </Box>
      ))}
    </Box>
  );
}
