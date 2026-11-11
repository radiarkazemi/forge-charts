import Badge from "@mui/material/Badge";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Drawer from "@mui/material/Drawer";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import SvgIcon from "@mui/material/SvgIcon";
import type { SvgIconProps } from "@mui/material/SvgIcon";
import { useEffect, useState } from "react";
import { useServices } from "@/app/use-services";
import { useStore } from "@/shared/hooks/useStore";
import { MOBILE_APP_NAV_HEIGHT, MOBILE_CHART_BAR_HEIGHT } from "./mobile-chrome";

const BAR_BG = "#131722";
const BAR_BORDER = "#2a2e39";
const IDLE = "#d1d4dc";
const ACTIVE = "#2962FF";

interface MobileBottomBarProps {
  readonly onCreateAlert: () => void;
  readonly onOpenWatchlist: () => void;
  readonly onOpenAlerts: () => void;
}

function strokeIcon(d: string) {
  return function Icon(props: SvgIconProps) {
    return (
      <SvgIcon {...props} viewBox="0 0 28 28" inheritViewBox sx={{ fontSize: 22, ...props.sx }}>
        <path
          d={d}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </SvgIcon>
    );
  };
}

const WatchlistIcon = strokeIcon("M9 5h10a1.5 1.5 0 0 1 1.5 1.5V22l-6.5-3.25L7.5 22V6.5A1.5 1.5 0 0 1 9 5z");
const ChartIcon = strokeIcon("M6 18.5V12l4-3 4 5 4-7v11.5");
const AlertsIcon = strokeIcon("M14 6.5a6 6 0 0 1 6 6v3.5l1.5 2H6.5l1.5-2V12.5a6 6 0 0 1 6-6zM12 22h4");
const MenuIcon = strokeIcon("M7 9h14M7 14h14M7 19h14");

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
export function MobileBottomBar({
  onCreateAlert,
  onOpenWatchlist,
  onOpenAlerts,
}: MobileBottomBarProps) {
  const { chart, settings, alerts, symbols } = useServices();
  const symbol = useStore(chart.state, (s) => s.symbol);
  const sidePanel = useStore(settings.settings, (s) => s.sidePanel);
  const appTheme = useStore(settings.settings, (s) => s.theme);
  const alertCount = useStore(alerts.alerts, (list) => list.filter((a) => a.status === "active").length);
  const [menuOpen, setMenuOpen] = useState(false);
  const [rangeEl, setRangeEl] = useState<HTMLElement | null>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const dark = appTheme === "dark";
  const barBg = dark ? BAR_BG : "#ffffff";
  const barBorder = dark ? BAR_BORDER : "#e0e3eb";
  const barText = dark ? "#d1d4dc" : "#131722";
  const info = symbols.findByTicker(symbol.includes(":") ? symbol.slice(symbol.lastIndexOf(":") + 1) : symbol);
  const clock = sessionClock(info?.timezone || "America/New_York", now);

  const appTabs = [
    {
      key: "watchlist",
      label: "Watchlist",
      Icon: WatchlistIcon,
      onClick: onOpenWatchlist,
      active: sidePanel === "watchlist",
    },
    {
      key: "chart",
      label: "Chart",
      Icon: ChartIcon,
      onClick: () => {
        if (sidePanel) settings.setSidePanel(null);
      },
      active: !sidePanel && !menuOpen,
    },
    {
      key: "alerts",
      label: "Alerts",
      Icon: AlertsIcon,
      onClick: onOpenAlerts,
      active: sidePanel === "alerts",
      badge: alertCount,
    },
    {
      key: "menu",
      label: "Menu",
      Icon: MenuIcon,
      onClick: () => setMenuOpen(true),
      active: menuOpen,
    },
  ] as const;

  return (
    <>
      <Box
        component="nav"
        aria-label="Chart footer"
        sx={{
          flexShrink: 0,
          bgcolor: barBg,
          borderTop: `1px solid ${barBorder}`,
          zIndex: 30,
        }}
      >
        {/* Date Range · session clock — TradingView mobile footer. */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            height: MOBILE_CHART_BAR_HEIGHT,
            px: 1.25,
            gap: 1,
            borderBottom: `1px solid ${barBorder}`,
            color: barText,
          }}
        >
          <ButtonBase
            aria-label="Date range"
            onClick={(e) => setRangeEl(e.currentTarget)}
            sx={{
              height: 28,
              px: 0.5,
              borderRadius: "4px",
              color: "inherit",
              fontSize: 14,
              fontWeight: 500,
              gap: 0.25,
              "&:active": { bgcolor: dark ? "rgba(209,212,220,0.08)" : "rgba(19,23,34,0.06)" },
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
        </Box>
        <Menu
          anchorEl={rangeEl}
          open={Boolean(rangeEl)}
          onClose={() => setRangeEl(null)}
          slotProps={{
            paper: {
              sx: { bgcolor: dark ? "#1e222d" : "#ffffff", color: barText, minWidth: 180 },
            },
          }}
        >
          {DATE_RANGES.map((range) => (
            <MenuItem
              key={range.id}
              sx={{ fontSize: 14 }}
              onClick={() => {
                const end = Date.now();
                const from =
                  range.id === "ytd" ? Date.UTC(new Date().getUTCFullYear(), 0, 1) : end - range.ms;
                chart.showDateRange(from);
                setRangeEl(null);
              }}
            >
              {range.label}
            </MenuItem>
          ))}
        </Menu>

        {/* App tab bar — Watchlist / Chart / Trade / Alerts / Menu */}
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "repeat(5, 1fr)",
            height: MOBILE_APP_NAV_HEIGHT,
            pb: "env(safe-area-inset-bottom, 0px)",
            minHeight: MOBILE_APP_NAV_HEIGHT,
          }}
        >
          {appTabs.map((tab) => (
            <ButtonBase
              key={tab.key}
              onClick={tab.onClick}
              sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 0.25,
                color: tab.active ? ACTIVE : IDLE,
                minWidth: 0,
                "&:active": { bgcolor: "rgba(209,212,220,0.06)" },
              }}
            >
              {"badge" in tab && tab.badge ? (
                <Badge
                  badgeContent={tab.badge}
                  color="error"
                  overlap="circular"
                  sx={{
                    "& .MuiBadge-badge": {
                      fontSize: 9,
                      height: 14,
                      minWidth: 14,
                      top: 2,
                      right: -2,
                    },
                  }}
                >
                  <tab.Icon sx={{ fontSize: 24, color: "inherit" }} />
                </Badge>
              ) : (
                <tab.Icon sx={{ fontSize: 24, color: "inherit" }} />
              )}
              <Box
                component="span"
                sx={{
                  fontSize: 10,
                  lineHeight: 1.1,
                  fontWeight: tab.active ? 700 : 600,
                  maxWidth: "100%",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {tab.label}
              </Box>
            </ButtonBase>
          ))}
        </Box>
      </Box>

      <Drawer
        anchor="bottom"
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        slotProps={{
          paper: {
            sx: {
              bgcolor: "#1e222d",
              borderTopLeftRadius: 12,
              borderTopRightRadius: 12,
              borderTop: `1px solid ${BAR_BORDER}`,
              pb: "calc(12px + env(safe-area-inset-bottom, 0px))",
            },
          },
        }}
      >
        <Box sx={{ width: 36, height: 4, borderRadius: 2, bgcolor: "#434651", mx: "auto", mt: 1, mb: 1.5 }} />
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5, px: 1.5 }}>
          {(
            [
              {
                label: "Indicators",
                run: () => chart.openIndicators(),
              },
              {
                label: "Theme",
                run: () => settings.toggleTheme(),
              },
              {
                label: "Create alert",
                run: onCreateAlert,
              },
              {
                label: "Undo",
                run: () => chart.undo(),
              },
              {
                label: "Redo",
                run: () => chart.redo(),
              },
              {
                label: "Pine Editor",
                run: () => settings.toggleSidePanel("pine"),
              },
              {
                label: "Chart settings",
                run: () => chart.openChartProperties(),
              },
              {
                label: "Account / profile",
                run: () => window.dispatchEvent(new Event("forge:open-profile-menu")),
              },
            ] as const
          ).map((row) => (
            <ButtonBase
              key={row.label}
              onClick={() => {
                row.run();
                setMenuOpen(false);
              }}
              sx={{
                justifyContent: "flex-start",
                px: 1.5,
                py: 1.5,
                borderRadius: "8px",
                color: "#fff",
                fontWeight: 600,
                fontSize: 15,
                "&:active": { bgcolor: "rgba(209,212,220,0.08)" },
              }}
            >
              {row.label}
            </ButtonBase>
          ))}
        </Box>
      </Drawer>
    </>
  );
}
