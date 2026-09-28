import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Drawer from "@mui/material/Drawer";
import { useState } from "react";
import { useServices } from "@/app/use-services";
import type { Interval } from "@/domain";
import { useStore } from "@/shared/hooks/useStore";
import { MOBILE_BOTTOM_BAR_HEIGHT } from "./mobile-chrome";

const QUICK_IV: ReadonlyArray<{ readonly value: Interval; readonly label: string }> = [
  { value: "1", label: "1m" },
  { value: "5", label: "5m" },
  { value: "15", label: "15m" },
  { value: "60", label: "1H" },
  { value: "240", label: "4H" },
  { value: "1D", label: "D" },
  { value: "1W", label: "W" },
];

interface MobileBottomBarProps {
  readonly onCreateAlert: () => void;
  readonly onOpenWatchlist: () => void;
  readonly onOpenTrade: () => void;
}

/**
 * TradingView-style mobile bottom toolbar: Symbol · Interval · Draw · Indicators · More.
 */
export function MobileBottomBar({
  onCreateAlert,
  onOpenWatchlist,
  onOpenTrade,
}: MobileBottomBarProps) {
  const { chart, settings } = useServices();
  const symbol = useStore(chart.state, (s) => s.symbol);
  const interval = useStore(chart.state, (s) => s.interval);
  const [ivOpen, setIvOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const bare = symbol.includes(":") ? symbol.slice(symbol.lastIndexOf(":") + 1) : symbol;
  const ivLabel =
    QUICK_IV.find((x) => x.value === interval)?.label ??
    (interval === "1D" ? "D" : interval === "1W" ? "W" : `${interval}m`);

  const items = [
    {
      key: "symbol",
      label: bare.length > 8 ? `${bare.slice(0, 7)}…` : bare,
      icon: "◈",
      onClick: () => chart.openSymbolSearch(),
    },
    {
      key: "interval",
      label: ivLabel,
      icon: "◷",
      onClick: () => setIvOpen(true),
      active: ivOpen,
    },
    {
      key: "draw",
      label: "Draw",
      icon: "✎",
      onClick: () => chart.toggleDrawingToolbar(),
    },
    {
      key: "indicators",
      label: "Indicators",
      icon: "ƒ",
      onClick: () => chart.openIndicators(),
    },
    {
      key: "more",
      label: "More",
      icon: "⋯",
      onClick: () => setMoreOpen(true),
      active: moreOpen,
    },
  ] as const;

  return (
    <>
      <Box
        component="nav"
        aria-label="Mobile chart tools"
        sx={{
          flexShrink: 0,
          bgcolor: "#131722",
          borderTop: "1px solid #2a2e39",
          pb: "env(safe-area-inset-bottom, 0px)",
          zIndex: 30,
        }}
      >
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "repeat(5, 1fr)",
            height: MOBILE_BOTTOM_BAR_HEIGHT,
            px: 0.25,
          }}
        >
          {items.map((item) => (
            <ButtonBase
              key={item.key}
              onClick={item.onClick}
              sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 0.25,
                color: "active" in item && item.active ? "#fff" : "#d1d4dc",
                minWidth: 0,
                px: 0.5,
                "&:active": { bgcolor: "rgba(209,212,220,0.08)" },
              }}
            >
              <Box component="span" sx={{ fontSize: 18, lineHeight: 1, fontWeight: 600 }}>
                {item.icon}
              </Box>
              <Box
                component="span"
                sx={{
                  fontSize: 10,
                  lineHeight: 1.1,
                  maxWidth: "100%",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  fontWeight: 600,
                }}
              >
                {item.label}
              </Box>
            </ButtonBase>
          ))}
        </Box>
      </Box>

      <Drawer
        anchor="bottom"
        open={ivOpen}
        onClose={() => setIvOpen(false)}
        slotProps={{
          paper: {
            sx: {
              bgcolor: "#1e222d",
              borderTopLeftRadius: 12,
              borderTopRightRadius: 12,
              borderTop: "1px solid #2a2e39",
              pb: "calc(8px + env(safe-area-inset-bottom, 0px))",
            },
          },
        }}
      >
        <Box sx={{ width: 36, height: 4, borderRadius: 2, bgcolor: "#434651", mx: "auto", mt: 1, mb: 1.5 }} />
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, px: 1.5, pb: 1 }}>
          {QUICK_IV.map((iv) => {
            const on = interval === iv.value;
            return (
              <ButtonBase
                key={iv.value}
                onClick={() => {
                  chart.setInterval(iv.value);
                  setIvOpen(false);
                }}
                sx={{
                  minWidth: 56,
                  height: 40,
                  px: 1.5,
                  borderRadius: "6px",
                  bgcolor: on ? "rgba(41,98,255,0.18)" : "#2a2e39",
                  color: on ? "#2962FF" : "#d1d4dc",
                  fontWeight: 700,
                  fontSize: 13,
                  border: on ? "1px solid #2962FF" : "1px solid transparent",
                }}
              >
                {iv.label}
              </ButtonBase>
            );
          })}
        </Box>
      </Drawer>

      <Drawer
        anchor="bottom"
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        slotProps={{
          paper: {
            sx: {
              bgcolor: "#1e222d",
              borderTopLeftRadius: 12,
              borderTopRightRadius: 12,
              borderTop: "1px solid #2a2e39",
              pb: "calc(12px + env(safe-area-inset-bottom, 0px))",
            },
          },
        }}
      >
        <Box sx={{ width: 36, height: 4, borderRadius: 2, bgcolor: "#434651", mx: "auto", mt: 1, mb: 1.5 }} />
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 1,
            px: 1.5,
          }}
        >
          {(
            [
              { label: "Alert", icon: "🔔", run: onCreateAlert },
              { label: "Watchlist", icon: "▤", run: onOpenWatchlist },
              {
                label: "Trade",
                icon: "⇄",
                run: onOpenTrade,
              },
              {
                label: "Object tree",
                icon: "☰",
                run: () => chart.openObjectTree(),
              },
              {
                label: "Theme",
                icon: "◐",
                run: () => settings.toggleTheme(),
              },
              {
                label: "Undo",
                icon: "↺",
                run: () => chart.undo(),
              },
              {
                label: "Redo",
                icon: "↻",
                run: () => chart.redo(),
              },
              {
                label: "Snapshot",
                icon: "📷",
                run: () => chart.takeScreenshot(),
              },
              {
                label: "Settings",
                icon: "⚙",
                run: () => chart.openChartProperties(),
              },
            ] as const
          ).map((action) => (
            <ButtonBase
              key={action.label}
              onClick={() => {
                action.run();
                setMoreOpen(false);
              }}
              sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 0.75,
                py: 1.5,
                borderRadius: "8px",
                bgcolor: "#2a2e39",
                color: "#d1d4dc",
                "&:active": { bgcolor: "#363a45" },
              }}
            >
              <Box component="span" sx={{ fontSize: 20, lineHeight: 1 }}>
                {action.icon}
              </Box>
              <Box component="span" sx={{ fontSize: 11, fontWeight: 600 }}>
                {action.label}
              </Box>
            </ButtonBase>
          ))}
        </Box>
      </Drawer>
    </>
  );
}
