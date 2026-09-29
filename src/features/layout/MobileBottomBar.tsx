import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Drawer from "@mui/material/Drawer";
import SvgIcon from "@mui/material/SvgIcon";
import type { SvgIconProps } from "@mui/material/SvgIcon";
import { useState } from "react";
import { useServices } from "@/app/use-services";
import type { Interval } from "@/domain";
import { useStore } from "@/shared/hooks/useStore";
import { MOBILE_APP_NAV_HEIGHT, MOBILE_CHART_BAR_HEIGHT } from "./mobile-chrome";

const QUICK_IV: ReadonlyArray<{ readonly value: Interval; readonly label: string }> = [
  { value: "1", label: "1m" },
  { value: "5", label: "5m" },
  { value: "15", label: "15m" },
  { value: "30", label: "30m" },
  { value: "60", label: "1H" },
  { value: "240", label: "4H" },
  { value: "1D", label: "D" },
  { value: "1W", label: "W" },
];

const BAR_BG = "#131722";
const BAR_BORDER = "#2a2e39";
const IDLE = "#d1d4dc";
const ACTIVE = "#2962FF";

interface MobileBottomBarProps {
  readonly onCreateAlert: () => void;
  readonly onOpenWatchlist: () => void;
  readonly onOpenTrade: () => void;
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
const TradeIcon = strokeIcon("M8 11.5h12M16.5 8 20 11.5 16.5 15M20 16.5H8M11.5 20 8 16.5 11.5 13");
const AlertsIcon = strokeIcon("M14 6.5a6 6 0 0 1 6 6v3.5l1.5 2H6.5l1.5-2V12.5a6 6 0 0 1 6-6zM12 22h4");
const MenuIcon = strokeIcon("M7 9h14M7 14h14M7 19h14");

/**
 * TradingView mobile chrome:
 * 1) Chart tools bar — Symbol · Interval · Draw · Indicators · More
 * 2) App tab bar — Watchlist · Chart · Trade · Alerts · Menu
 */
export function MobileBottomBar({
  onCreateAlert,
  onOpenWatchlist,
  onOpenTrade,
  onOpenAlerts,
}: MobileBottomBarProps) {
  const { chart, settings } = useServices();
  const symbol = useStore(chart.state, (s) => s.symbol);
  const interval = useStore(chart.state, (s) => s.interval);
  const [ivOpen, setIvOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const bare = symbol.includes(":") ? symbol.slice(symbol.lastIndexOf(":") + 1) : symbol;
  const ivLabel =
    QUICK_IV.find((x) => x.value === interval)?.label ??
    (interval === "1D" ? "D" : interval === "1W" ? "W" : `${interval}m`);

  const chartActions = [
    {
      key: "draw",
      label: "Draw",
      Icon: DrawIcon,
      onClick: () => chart.toggleDrawingToolbar(),
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
    { key: "watchlist", label: "Watchlist", Icon: WatchlistIcon, onClick: onOpenWatchlist, active: false },
    { key: "chart", label: "Chart", Icon: ChartIcon, onClick: () => undefined, active: true },
    { key: "trade", label: "Trade", Icon: TradeIcon, onClick: onOpenTrade, active: false },
    { key: "alerts", label: "Alerts", Icon: AlertsIcon, onClick: onOpenAlerts, active: false },
    { key: "menu", label: "Menu", Icon: MenuIcon, onClick: () => setMenuOpen(true), active: menuOpen },
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
        {/* Chart control bar — matches TV mobile quick actions under the plot. */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            height: MOBILE_CHART_BAR_HEIGHT,
            px: 1,
            gap: 0.5,
            borderBottom: `1px solid ${BAR_BORDER}`,
          }}
        >
          <ButtonBase
            onClick={() => chart.openSymbolSearch()}
            sx={{
              color: "#fff",
              fontWeight: 700,
              fontSize: 14,
              px: 0.75,
              py: 0.5,
              borderRadius: "6px",
              maxWidth: "42%",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              "&:active": { bgcolor: "rgba(209,212,220,0.08)" },
            }}
          >
            {bare.length > 10 ? `${bare.slice(0, 9)}…` : bare}
          </ButtonBase>
          <ButtonBase
            onClick={() => setIvOpen(true)}
            sx={{
              color: IDLE,
              fontWeight: 700,
              fontSize: 13,
              px: 0.75,
              py: 0.5,
              borderRadius: "6px",
              "&:active": { bgcolor: "rgba(209,212,220,0.08)" },
            }}
          >
            {ivLabel}
          </ButtonBase>
          <Box sx={{ flex: 1 }} />
          {chartActions.map((item) => (
            <ButtonBase
              key={item.key}
              onClick={item.onClick}
              aria-label={item.label}
              title={item.label}
              sx={{
                width: 40,
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
              <tab.Icon sx={{ fontSize: 24, color: "inherit" }} />
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
        open={ivOpen}
        onClose={() => setIvOpen(false)}
        slotProps={{
          paper: {
            sx: {
              bgcolor: "#1e222d",
              borderTopLeftRadius: 12,
              borderTopRightRadius: 12,
              borderTop: `1px solid ${BAR_BORDER}`,
              pb: "calc(8px + env(safe-area-inset-bottom, 0px))",
            },
          },
        }}
      >
        <Box sx={{ width: 36, height: 4, borderRadius: 2, bgcolor: "#434651", mx: "auto", mt: 1, mb: 1.5 }} />
        <Box sx={{ px: 2, pb: 1, color: "#fff", fontWeight: 700, fontSize: 15 }}>Interval</Box>
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
                  color: on ? ACTIVE : IDLE,
                  fontWeight: 700,
                  fontSize: 13,
                  border: on ? `1px solid ${ACTIVE}` : "1px solid transparent",
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
              { label: "Object tree", run: () => chart.openObjectTree() },
              { label: "Undo", run: () => chart.undo() },
              { label: "Redo", run: () => chart.redo() },
              { label: "Snapshot", run: () => chart.takeScreenshot() },
              { label: "Settings", run: () => chart.openChartProperties() },
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
