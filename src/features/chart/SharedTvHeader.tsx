/**
 * Full-width TradingView-style header for multi-pane layouts.
 * Matches the Charting Library top toolbar look and controls the *active* pane
 * (select a chart, then change TF / symbol / indicators).
 */

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Tooltip from "@mui/material/Tooltip";
import { useEffect, useState, type MouseEvent } from "react";
import { useServices } from "@/app/use-services";
import { activeProfile, type ChartLayoutId } from "@/application";
import type { Interval } from "@/domain";
import { useStore } from "@/shared/hooks/useStore";
import { CHART_LAYOUT_CHOICES } from "./chart-layouts";
import { layoutSyncBus } from "./layout-sync";

const BAR_BG = "#131722";
const BAR_BORDER = "rgba(120, 123, 134, 0.28)";
const TEXT = "#d1d4dc";
const MUTED = "#b2b5be";
const ACTIVE = "#2962FF";
const HOVER = "rgba(255,255,255,0.06)";
const FONT = '"Trebuchet MS","Segoe UI",Tahoma,sans-serif';

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

const LAYOUT_GRID_ICON = (
  <svg viewBox="0 0 28 28" width="20" height="20" fill="none" aria-hidden>
    <rect
      x="5"
      y="5"
      width="18"
      height="18"
      rx="1"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeDasharray="3 2.5"
      strokeLinecap="round"
    />
    <path d="M14 6.2v15.6M6.2 14h15.6" stroke="currentColor" strokeWidth="1.15" opacity="0.75" />
  </svg>
);

interface SharedTvHeaderProps {
  readonly onCreateAlert: () => void;
  readonly onOpenProfile: () => void;
}

export function SharedTvHeader({ onCreateAlert, onOpenProfile }: SharedTvHeaderProps) {
  const { settings } = useServices();
  const chartLayout = useStore(settings.settings, (s) => s.chartLayout ?? "s");
  const profile = useStore(settings.settings, (s) => activeProfile(s));
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

  useEffect(() => {
    const st = layoutSyncBus.getPaneState(activePane);
    if (st.symbol) setSymbol(st.symbol);
    if (st.interval) setInterval(st.interval);
  }, [activePane]);

  const bare = symbol.includes(":") ? symbol.slice(symbol.lastIndexOf(":") + 1) : symbol;
  const initial = (profile.avatarInitial || "F").slice(0, 2);
  const avatarColor = profile.avatarColor || "#9c27b0";

  const applyInterval = (next: Interval) => {
    setInterval(next);
    layoutSyncBus.setActivePaneInterval(next);
  };

  const onLayoutPick = (id: ChartLayoutId) => {
    setLayoutAnchor(null);
    settings.setChartLayout(id);
  };

  return (
    <Box
      component="header"
      aria-label="Chart toolbar"
      sx={{
        flex: "0 0 auto",
        display: "flex",
        alignItems: "center",
        gap: 0.25,
        px: 0.75,
        height: 38,
        minHeight: 38,
        bgcolor: BAR_BG,
        borderBottom: `1px solid ${BAR_BORDER}`,
        overflowX: "auto",
        overflowY: "hidden",
        width: "100%",
        fontFamily: FONT,
        scrollbarWidth: "none",
        "&::-webkit-scrollbar": { display: "none" },
      }}
    >
      <Tooltip title="Change symbol">
        <ButtonBase
          onClick={() => layoutSyncBus.openSymbolSearchOnActive()}
          sx={{
            display: "inline-flex",
            alignItems: "center",
            gap: 0.6,
            height: 28,
            px: 0.9,
            borderRadius: "4px",
            color: TEXT,
            fontWeight: 700,
            fontSize: 13,
            "&:hover": { bgcolor: HOVER },
          }}
        >
          <Box component="span" sx={{ fontSize: 14, opacity: 0.85, lineHeight: 1 }}>
            ⌕
          </Box>
          {bare}
        </ButtonBase>
      </Tooltip>

      <Hairline />

      <Box sx={{ display: "flex", alignItems: "center", gap: 0.1 }}>
        {INTERVALS.map((iv) => {
          const on = interval === iv.value;
          return (
            <ButtonBase
              key={iv.value}
              onClick={() => applyInterval(iv.value)}
              sx={{
                px: 0.75,
                height: 26,
                borderRadius: "4px",
                fontSize: 12,
                fontWeight: on ? 700 : 500,
                color: on ? "#fff" : MUTED,
                bgcolor: on ? ACTIVE : "transparent",
                "&:hover": { bgcolor: on ? ACTIVE : HOVER, color: on ? "#fff" : TEXT },
              }}
            >
              {iv.label}
            </ButtonBase>
          );
        })}
      </Box>

      <Hairline />

      <HeaderBtn title="Indicators" onClick={() => layoutSyncBus.openIndicatorsOnActive()}>
        Indicators
      </HeaderBtn>
      <HeaderBtn title="Create alert" onClick={onCreateAlert}>
        Alert
      </HeaderBtn>
      <HeaderBtn
        title="Bar Replay"
        onClick={() => window.dispatchEvent(new CustomEvent("forge:enter-bar-replay"))}
      >
        Replay
      </HeaderBtn>

      <Hairline />

      <IconHeaderBtn title="Undo" onClick={() => layoutSyncBus.undoOnActive()} label="↺" />
      <IconHeaderBtn title="Redo" onClick={() => layoutSyncBus.redoOnActive()} label="↻" />

      <Tooltip title="Select layout">
        <IconButton
          size="small"
          onClick={(e: MouseEvent<HTMLElement>) => setLayoutAnchor(e.currentTarget)}
          sx={{ color: TEXT, borderRadius: "4px", width: 30, height: 28, "&:hover": { bgcolor: HOVER } }}
        >
          {LAYOUT_GRID_ICON}
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={layoutAnchor}
        open={Boolean(layoutAnchor)}
        onClose={() => setLayoutAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
      >
        {CHART_LAYOUT_CHOICES.map((choice) => (
          <MenuItem
            key={choice.id}
            selected={choice.id === chartLayout}
            onClick={() => onLayoutPick(choice.id)}
            dense
          >
            {choice.title} · {choice.id}
          </MenuItem>
        ))}
      </Menu>

      <Box sx={{ flex: 1, minWidth: 8 }} />

      <Box sx={{ fontSize: 11, color: "#787b86", px: 1, whiteSpace: "nowrap", userSelect: "none" }}>
        Chart {activePane + 1}
      </Box>

      <HeaderBtn title="Chart settings" onClick={() => layoutSyncBus.openChartPropertiesOnActive()}>
        Settings
      </HeaderBtn>
      <HeaderBtn title="Snapshot" onClick={() => layoutSyncBus.takeScreenshotOnActive()}>
        Snapshot
      </HeaderBtn>

      <Button
        size="small"
        onClick={() => layoutSyncBus.takeScreenshotOnActive()}
        sx={{
          ml: 0.25,
          textTransform: "none",
          bgcolor: ACTIVE,
          color: "#fff",
          fontWeight: 700,
          fontSize: 12,
          height: 28,
          px: 1.5,
          borderRadius: "4px",
          "&:hover": { bgcolor: "#1e53e5" },
        }}
      >
        Publish
      </Button>

      <Tooltip title="Account">
        <ButtonBase
          onClick={onOpenProfile}
          sx={{
            ml: 0.5,
            width: 28,
            height: 28,
            borderRadius: "50%",
            bgcolor: avatarColor,
            color: "#fff",
            fontWeight: 700,
            fontSize: 12,
            flexShrink: 0,
          }}
        >
          {initial}
        </ButtonBase>
      </Tooltip>
    </Box>
  );
}

function Hairline() {
  return (
    <Box
      aria-hidden
      sx={{ width: 1, height: 18, mx: 0.4, bgcolor: "rgba(120,123,134,0.35)", flexShrink: 0 }}
    />
  );
}

function HeaderBtn({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: string;
}) {
  return (
    <Tooltip title={title}>
      <ButtonBase
        onClick={onClick}
        sx={{
          height: 28,
          px: 1,
          borderRadius: "4px",
          color: TEXT,
          fontSize: 12,
          fontWeight: 600,
          whiteSpace: "nowrap",
          "&:hover": { bgcolor: HOVER },
        }}
      >
        {children}
      </ButtonBase>
    </Tooltip>
  );
}

function IconHeaderBtn({ title, onClick, label }: { title: string; onClick: () => void; label: string }) {
  return (
    <Tooltip title={title}>
      <IconButton
        size="small"
        onClick={onClick}
        sx={{ color: TEXT, borderRadius: "4px", width: 28, height: 28, fontSize: 15, "&:hover": { bgcolor: HOVER } }}
      >
        {label}
      </IconButton>
    </Tooltip>
  );
}
