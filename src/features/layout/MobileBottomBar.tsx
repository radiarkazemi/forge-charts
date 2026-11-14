import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import SvgIcon from "@mui/material/SvgIcon";
import { useEffect, useState } from "react";
import { useServices } from "@/app/use-services";
import { useStore } from "@/shared/hooks/useStore";
import { MOBILE_CHART_BAR_HEIGHT } from "./mobile-chrome";

const BAR_BG = "#101010";

interface MobileBottomBarProps {
  readonly onCreateAlert?: () => void;
  readonly onOpenWatchlist?: () => void;
  readonly onOpenAlerts?: () => void;
}

const DATE_RANGES = [
  { id: "1d", label: "1 day", ms: 86_400_000 },
  { id: "5d", label: "5 days", ms: 5 * 86_400_000 },
  { id: "1m", label: "1 month", ms: 30 * 86_400_000 },
  { id: "3m", label: "3 months", ms: 90 * 86_400_000 },
  { id: "6m", label: "6 months", ms: 182 * 86_400_000 },
  { id: "ytd", label: "Year to date", ms: 0 },
  { id: "1y", label: "1 year", ms: 365 * 86_400_000 },
  { id: "5y", label: "5 years", ms: 5 * 365 * 86_400_000 },
  { id: "all", label: "All", ms: 20 * 365 * 86_400_000 },
] as const;

function sessionClock(timeZone: string, now: Date): string {
  let time = "00:00:00";
  try {
    time = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).format(now);
  } catch {
    time = new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
      timeZone: "UTC",
    }).format(now);
  }
  let zone = "UTC";
  try {
    zone =
      new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "shortOffset" })
        .formatToParts(now)
        .find((part) => part.type === "timeZoneName")?.value ?? "UTC";
  } catch {
    zone = "UTC";
  }
  const offset = zone.replace("GMT", "UTC").replace(":00", "");
  return `${time} ${offset === "UTC+0" || offset === "UTC-0" ? "UTC" : offset}`;
}

/**
 * TradingView mobile chrome:
 * 1) Chart footer — Date Range · session clock
 * 2) App tab bar — Watchlist · Chart · Alerts · Menu
 */
export function MobileBottomBar(_props: MobileBottomBarProps) {
  const { chart, symbols } = useServices();
  const symbol = useStore(chart.state, (s) => s.symbol);
  const [rangeEl, setRangeEl] = useState<HTMLElement | null>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const info = symbols.findByTicker(symbol.includes(":") ? symbol.slice(symbol.lastIndexOf(":") + 1) : symbol);
  const clock = sessionClock(info?.timezone || "America/New_York", now);

  return (
    <Box
      component="nav"
      aria-label="Chart footer"
      sx={{
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        height: MOBILE_CHART_BAR_HEIGHT,
        boxSizing: "content-box",
        pb: "env(safe-area-inset-bottom, 0px)",
        px: 1.25,
        gap: 1,
        bgcolor: BAR_BG,
        color: "#ffffff",
        zIndex: 30,
      }}
    >
      <ButtonBase
        aria-label="Date range"
        onClick={(e) => setRangeEl(e.currentTarget)}
        sx={{
          height: 28,
          px: 0.25,
          borderRadius: "4px",
          color: "inherit",
          fontSize: 14,
          fontWeight: 500,
          gap: 0.25,
        }}
      >
        Date Range
        <SvgIcon viewBox="0 0 16 16" sx={{ fontSize: 16 }}>
          <path d="M4 6.2 8 10l4-3.8" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
        </SvgIcon>
      </ButtonBase>
      <Box sx={{ flex: 1 }} />
      <Box
        component="span"
        sx={{
          fontSize: 13,
          fontWeight: 500,
          fontVariantNumeric: "tabular-nums",
          letterSpacing: 0.1,
          whiteSpace: "nowrap",
        }}
      >
        {clock}
      </Box>
      <Menu
        anchorEl={rangeEl}
        open={Boolean(rangeEl)}
        onClose={() => setRangeEl(null)}
        slotProps={{ paper: { sx: { bgcolor: "#1c1c1c", color: "#ffffff", minWidth: 180 } } }}
      >
        {DATE_RANGES.map((range) => (
          <MenuItem
            key={range.id}
            sx={{ fontSize: 14 }}
            onClick={() => {
              const end = Date.now();
              const from = range.id === "ytd" ? Date.UTC(new Date().getUTCFullYear(), 0, 1) : end - range.ms;
              chart.showDateRange(from);
              setRangeEl(null);
            }}
          >
            {range.label}
          </MenuItem>
        ))}
      </Menu>
    </Box>
  );
}
