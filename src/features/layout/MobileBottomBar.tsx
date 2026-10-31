import Badge from "@mui/material/Badge";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Drawer from "@mui/material/Drawer";
import SvgIcon from "@mui/material/SvgIcon";
import type { SvgIconProps } from "@mui/material/SvgIcon";
import { useState } from "react";
import { useServices } from "@/app/use-services";
import { useStore } from "@/shared/hooks/useStore";
import { MOBILE_APP_NAV_HEIGHT, MOBILE_CHART_BAR_HEIGHT } from "./mobile-chrome";

const BAR_BG = "#131722";
const BAR_BORDER = "#2a2e39";
const IDLE = "#d1d4dc";
const ACTIVE = "#2962FF";
const MUTED = "#787b86";

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

const DrawIcon = strokeIcon("M7 19.5 17.5 9l2.5 2.5L9.5 22H7v-2.5zM16.5 8l2-2 2.5 2.5-2 2-2.5-2.5z");
const IndicatorsIcon = strokeIcon("M5.5 18.5v-4M10.5 18.5V9.5M15.5 18.5v-7M20.5 18.5V7.5");
const MoreIcon = strokeIcon("M8 14h.01M14 14h.01M20 14h.01");
const WatchlistIcon = strokeIcon("M9 5h10a1.5 1.5 0 0 1 1.5 1.5V22l-6.5-3.25L7.5 22V6.5A1.5 1.5 0 0 1 9 5z");
const ChartIcon = strokeIcon("M6 18.5V12l4-3 4 5 4-7v11.5");
const AlertsIcon = strokeIcon("M14 6.5a6 6 0 0 1 6 6v3.5l1.5 2H6.5l1.5-2V12.5a6 6 0 0 1 6-6zM12 22h4");
const MenuIcon = strokeIcon("M7 9h14M7 14h14M7 19h14");

function formatPrice(price: number | undefined, precision = 2): string {
  if (price == null || !Number.isFinite(price)) return "";
  return price.toLocaleString(undefined, {
    minimumFractionDigits: Math.min(precision, 5),
    maximumFractionDigits: Math.min(Math.max(precision, 2), 5),
  });
}

/**
 * TradingView mobile chrome:
 * 1) Chart tools bar — Symbol · Interval · Draw · Indicators · More
 * 2) App tab bar — Watchlist · Chart · Alerts · Menu
 */
export function MobileBottomBar({
  onCreateAlert,
  onOpenWatchlist,
  onOpenAlerts,
}: MobileBottomBarProps) {
  const { chart, settings, quotes, alerts } = useServices();
  const symbol = useStore(chart.state, (s) => s.symbol);
  const sidePanel = useStore(settings.settings, (s) => s.sidePanel);
  const quote = useStore(quotes.quotes, (book) => book[symbol]);
  const alertCount = useStore(alerts.alerts, (list) => list.filter((a) => a.status === "active").length);
  const [moreOpen, setMoreOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [drawOpen, setDrawOpen] = useState(false);

  const priceLabel = formatPrice(quote?.price);
  const change = quote?.changePercent;
  const changeColor =
    change == null || !Number.isFinite(change) ? MUTED : change > 0 ? "#26a69a" : change < 0 ? "#ef5350" : MUTED;

  const chartActions = [
    {
      key: "draw",
      label: "Draw",
      Icon: DrawIcon,
      active: drawOpen,
      onClick: () => {
        chart.toggleDrawingToolbar();
        setDrawOpen((v) => !v);
      },
    },
    {
      key: "indicators",
      label: "Indicators",
      Icon: IndicatorsIcon,
      onClick: () => chart.openIndicators(),
    },
    {
      key: "more",
      label: "More",
      Icon: MoreIcon,
      onClick: () => setMoreOpen(true),
      active: moreOpen,
    },
  ] as const;

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
        aria-label="Mobile chart tools"
        sx={{
          flexShrink: 0,
          bgcolor: BAR_BG,
          borderTop: `1px solid ${BAR_BORDER}`,
          zIndex: 30,
        }}
      >
        {/* Chart tools — symbol/TF live in MobileTopBar (Faraz scroll chrome). */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-around",
            height: MOBILE_CHART_BAR_HEIGHT,
            px: 1,
            gap: 0.25,
            borderBottom: `1px solid ${BAR_BORDER}`,
          }}
        >
          {priceLabel ? (
            <Box
              component="span"
              sx={{
                color: changeColor,
                fontWeight: 700,
                fontSize: 12,
                fontVariantNumeric: "tabular-nums",
                px: 1,
                mr: "auto",
                maxWidth: "40%",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {priceLabel}
            </Box>
          ) : (
            <Box sx={{ flex: 1 }} />
          )}
          {chartActions.map((item) => (
            <ButtonBase
              key={item.key}
              onClick={item.onClick}
              aria-label={item.label}
              title={item.label}
              sx={{
                width: 44,
                height: 36,
                borderRadius: "8px",
                color: "active" in item && item.active ? ACTIVE : IDLE,
                "&:active": { bgcolor: "rgba(209,212,220,0.08)" },
              }}
            >
              <item.Icon />
            </ButtonBase>
          ))}
        </Box>

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
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
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
              { label: "Alert", run: onCreateAlert },
              { label: "Compare", run: () => chart.openSymbolSearch() },
              { label: "Object tree", run: () => chart.openObjectTree() },
              { label: "Undo", run: () => chart.undo() },
              { label: "Redo", run: () => chart.redo() },
              { label: "Snapshot", run: () => chart.takeScreenshot() },
              { label: "Settings", run: () => chart.openChartProperties() },
              {
                label: "Replay",
                run: () => window.dispatchEvent(new Event("forge:enter-bar-replay")),
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
                alignItems: "center",
                justifyContent: "center",
                py: 1.75,
                borderRadius: "8px",
                bgcolor: "#2a2e39",
                color: IDLE,
                fontSize: 13,
                fontWeight: 600,
                "&:active": { bgcolor: "#363a45" },
              }}
            >
              {action.label}
            </ButtonBase>
          ))}
        </Box>
      </Drawer>

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
                label: "Theme",
                run: () => settings.toggleTheme(),
              },
              {
                label: "Create alert",
                run: onCreateAlert,
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
