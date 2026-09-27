/**
 * Full-width toolbar above multi-chart grids. Controls the *selected* pane only
 * (symbol / timeframe / indicators) — not every pane unless sync flags say so.
 */

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import { useEffect, useState, type MouseEvent } from "react";
import { useServices } from "@/app/use-services";
import type { ChartLayoutId } from "@/application";
import type { Interval } from "@/domain";
import { useStore } from "@/shared/hooks/useStore";
import { CHART_LAYOUT_CHOICES } from "./chart-layouts";
import { layoutSyncBus } from "./layout-sync";

const INTERVALS: ReadonlyArray<{ readonly value: Interval; readonly label: string }> = [
  { value: "1", label: "1m" },
  { value: "5", label: "5m" },
  { value: "15", label: "15m" },
  { value: "30", label: "30m" },
  { value: "60", label: "1h" },
  { value: "240", label: "4h" },
  { value: "1D", label: "D" },
  { value: "1W", label: "W" },
  { value: "1M", label: "M" },
  { value: "3M", label: "3M" },
];

export function LayoutTopBar(): null | React.ReactElement {
  const { settings } = useServices();
  const chartLayout = useStore(settings.settings, (s) => s.chartLayout ?? "s");
  const [activePane, setActivePane] = useState(0);
  const [symbol, setSymbol] = useState("XAUUSD");
  const [interval, setInterval] = useState<Interval>("15");
  const [layoutAnchor, setLayoutAnchor] = useState<null | HTMLElement>(null);

  useEffect(() => layoutSyncBus.subscribeActivePane(setActivePane), []);

  useEffect(() => {
    return layoutSyncBus.subscribeActivePaneState((state) => {
      if (state.symbol) setSymbol(state.symbol);
      if (state.interval) setInterval(state.interval);
    });
  }, []);

  // Refresh symbol/interval when the selected pane changes.
  useEffect(() => {
    const st = layoutSyncBus.getPaneState(activePane);
    if (st.symbol) setSymbol(st.symbol);
    if (st.interval) setInterval(st.interval);
  }, [activePane]);

  const applySymbol = () => {
    const bare = symbol.trim().toUpperCase();
    if (!bare) return;
    layoutSyncBus.setActivePaneSymbol(bare);
    settings.setPaneSymbol(layoutSyncBus.getActivePane(), bare);
  };

  const applyInterval = (next: Interval) => {
    setInterval(next);
    layoutSyncBus.setActivePaneInterval(next);
  };

  const openIndicators = () => layoutSyncBus.openIndicatorsOnActive();

  const onLayoutPick = (id: ChartLayoutId) => {
    setLayoutAnchor(null);
    settings.setChartLayout(id);
  };

  return (
    <Box
      sx={{
        flex: "0 0 auto",
        display: "flex",
        alignItems: "center",
        gap: 1,
        px: 1.25,
        py: 0.75,
        minHeight: 44,
        bgcolor: "#131722",
        borderBottom: "1px solid rgba(120,123,134,0.28)",
        overflowX: "auto",
        width: "100%",
      }}
    >
      <TextField
        size="small"
        value={symbol}
        onChange={(e) => setSymbol(e.target.value.toUpperCase())}
        onKeyDown={(e) => {
          if (e.key === "Enter") applySymbol();
        }}
        onBlur={applySymbol}
        sx={{
          width: 120,
          "& .MuiInputBase-root": {
            bgcolor: "#1e222d",
            color: "#d1d4dc",
            fontSize: 13,
            fontWeight: 600,
            height: 32,
          },
          "& fieldset": { borderColor: "rgba(120,123,134,0.35)" },
        }}
        slotProps={{ htmlInput: { "aria-label": "Symbol" } }}
      />

      <Box sx={{ display: "flex", alignItems: "center", gap: 0.25 }}>
        {INTERVALS.map((iv) => {
          const active = interval === iv.value;
          return (
            <ButtonBase
              key={iv.value}
              onClick={() => applyInterval(iv.value)}
              sx={{
                px: 0.9,
                py: 0.45,
                borderRadius: "4px",
                fontSize: 12,
                fontWeight: active ? 700 : 500,
                color: active ? "#fff" : "#b2b5be",
                bgcolor: active ? "#2962ff" : "transparent",
                "&:hover": { bgcolor: active ? "#2962ff" : "rgba(255,255,255,0.06)" },
              }}
            >
              {iv.label}
            </ButtonBase>
          );
        })}
      </Box>

      <Button
        size="small"
        onClick={openIndicators}
        sx={{
          ml: 0.5,
          textTransform: "none",
          color: "#d1d4dc",
          bgcolor: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(120,123,134,0.3)",
          height: 30,
          px: 1.25,
          fontSize: 12,
          "&:hover": { bgcolor: "rgba(255,255,255,0.08)" },
        }}
      >
        Indicators
      </Button>

      <Box sx={{ flex: 1 }} />

      <Box
        sx={{
          fontSize: 11,
          color: "#787b86",
          mr: 1,
          whiteSpace: "nowrap",
        }}
      >
        Chart {activePane + 1}
      </Box>

      <Button
        size="small"
        onClick={(e: MouseEvent<HTMLElement>) => setLayoutAnchor(e.currentTarget)}
        sx={{
          textTransform: "none",
          color: "#d1d4dc",
          minWidth: 0,
          height: 30,
          px: 1,
          fontSize: 12,
          border: "1px solid rgba(120,123,134,0.3)",
        }}
      >
        Layout
      </Button>
      <Menu
        anchorEl={layoutAnchor}
        open={Boolean(layoutAnchor)}
        onClose={() => setLayoutAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
      >
        {CHART_LAYOUT_CHOICES.map((choice) => (
          <MenuItem
            key={choice.id}
            selected={choice.id === chartLayout}
            onClick={() => onLayoutPick(choice.id)}
            dense
          >
            {choice.title} charts ({choice.id})
          </MenuItem>
        ))}
      </Menu>
    </Box>
  );
}
