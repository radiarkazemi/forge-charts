import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import IconButton from "@mui/material/IconButton";
import SvgIcon from "@mui/material/SvgIcon";
import type { SvgIconProps } from "@mui/material/SvgIcon";
import Typography from "@mui/material/Typography";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useServices } from "@/app/use-services";
import { ForgeMark } from "@/brand/ForgeMark";
import type { Interval } from "@/domain";
import { quoteDirection } from "@/domain";
import { useStore } from "@/shared/hooks/useStore";
import { formatPercent, formatPrice } from "@/shared/utils/format";
import {
  MF,
  MOBILE_APP_NAV_HEIGHT,
  MOBILE_HEADER_HEIGHT,
  MOBILE_INDICATOR_ROW_HEIGHT,
  MOBILE_OVERVIEW_HEIGHT,
  MOBILE_STRIP_HEIGHT,
  MOBILE_SYMBOL_ROW_HEIGHT,
  MOBILE_TF_ROW_HEIGHT,
} from "./mobile-forge-theme";

const TF_PILLS: ReadonlyArray<{ readonly value: Interval; readonly label: string }> = [
  { value: "1", label: "1m" },
  { value: "5", label: "5m" },
  { value: "15", label: "15m" },
  { value: "60", label: "1H" },
  { value: "240", label: "4H" },
  { value: "1D", label: "1D" },
];

type IndicatorKey = "ema20" | "ema50" | "vol";

interface MobileForgeShellProps {
  readonly children: ReactNode;
  readonly onOpenWatchlist: () => void;
  readonly onOpenAlerts: () => void;
  readonly onOpenProfile: () => void;
  readonly onOpenExplore: () => void;
  readonly alertCount: number;
  readonly profileInitials: string;
}

function strokeIcon(d: string, viewBox = "0 0 24 24") {
  return function Icon(props: SvgIconProps) {
    return (
      <SvgIcon {...props} viewBox={viewBox} inheritViewBox sx={{ fontSize: 22, ...props.sx }}>
        <path
          d={d}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.7}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </SvgIcon>
    );
  };
}

const SearchIcon = strokeIcon("M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3");
const BellIcon = strokeIcon(
  "M12 22a2 2 0 0 0 2-2h-4a2 2 0 0 0 2 2zM18 16v-5a6 6 0 1 0-12 0v5l-2 2h16l-2-2z",
);
const CandleIcon = strokeIcon("M8 4v3M8 17v3M16 7v2M16 15v2M6 7h4v10H6zM14 9h4v6h-4z");
const GearIcon = strokeIcon(
  "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM19.4 15a1 1 0 0 0 .2 1.1l.1.1a1.5 1.5 0 0 1-2.1 2.1l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V19a1.5 1.5 0 0 1-3 0v-.2a1 1 0 0 0-.6-.9 1 1 0 0 0-1.1.2l-.1.1a1.5 1.5 0 0 1-2.1-2.1l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H5a1.5 1.5 0 0 1 0-3h.2a1 1 0 0 0 .9-.6 1 1 0 0 0-.2-1.1l-.1-.1a1.5 1.5 0 0 1 2.1-2.1l.1.1a1 1 0 0 0 1.1.2 1 1 0 0 0 .6-.9V5a1.5 1.5 0 0 1 3 0v.2a1 1 0 0 0 .6.9 1 1 0 0 0 1.1-.2l.1-.1a1.5 1.5 0 0 1 2.1 2.1l-.1.1a1 1 0 0 0-.2 1.1 1 1 0 0 0 .9.6H19a1.5 1.5 0 0 1 0 3h-.2a1 1 0 0 0-.9.6z",
);
const ExpandIcon = strokeIcon("M9 3H3v6M15 3h6v6M9 21H3v-6M21 15v6h-6");
const EyeIcon = strokeIcon("M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z");
const ChevronIcon = strokeIcon("M6 9l6 6 6-6");
const StarIcon = strokeIcon(
  "M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9 6.8 19.6l1-5.8L3.5 9.7l5.9-.9L12 3.5z",
);
const ChartNavIcon = strokeIcon("M4 19V11l4-3 4 5 4-7 4 4v9");
const CompassIcon = strokeIcon("M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM14.5 9.5l-2 5-5 2 2-5 5-2z");
const ProfileIcon = strokeIcon("M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 20a8 8 0 0 1 16 0");

function bareTicker(symbol: string): string {
  return symbol.includes(":") ? symbol.slice(symbol.lastIndexOf(":") + 1) : symbol;
}

function assetVisual(ticker: string): { bg: string; label: string } {
  const t = bareTicker(ticker).toUpperCase();
  if (t.includes("XAU") || t.includes("GOLD")) return { bg: "#C9A227", label: "Au" };
  if (t.includes("EUR")) return { bg: "#1D4ED8", label: "€" };
  if (t.includes("BTC")) return { bg: "#F59E0B", label: "₿" };
  if (t.includes("ETH")) return { bg: "#6366F1", label: "Ξ" };
  if (t.includes("USD") && t.length <= 6) return { bg: "#0EA5E9", label: t.slice(0, 2) };
  return { bg: "#334155", label: t.slice(0, 2) };
}

/**
 * Full mobile Forge chrome matching the product mockup:
 * header → instrument cards → symbol/price → TF pills → chart → indicators → overview → nav.
 */
export function MobileForgeShell({
  children,
  onOpenWatchlist,
  onOpenAlerts,
  onOpenProfile,
  onOpenExplore,
  alertCount,
  profileInitials,
}: MobileForgeShellProps) {
  const { chart, settings, symbols, quotes } = useServices();
  const symbol = useStore(chart.state, (s) => s.symbol);
  const interval = useStore(chart.state, (s) => s.interval);
  const watchlist = useStore(settings.settings, (s) => s.watchlist);
  const book = useStore(quotes.quotes);
  const [overviewOpen, setOverviewOpen] = useState(true);
  const [legendOpen, setLegendOpen] = useState(true);
  const [indicators, setIndicators] = useState<Record<IndicatorKey, boolean>>({
    ema20: true,
    ema50: true,
    vol: true,
  });
  const [session, setSession] = useState<{ high: number; low: number } | null>(null);

  const bare = bareTicker(symbol);
  const info = symbols.findByTicker(bare) ?? symbols.findByTicker(symbol);
  const quote = book[bare] ?? book[symbol];
  const dir = quoteDirection(quote);
  const changeColor = dir === "up" ? MF.up : dir === "down" ? MF.down : MF.textMuted;

  const cards = useMemo(() => {
    const list = watchlist.length ? [...watchlist] : [symbol];
    if (!list.some((t) => bareTicker(t) === bare)) list.unshift(symbol);
    return list.slice(0, 12);
  }, [watchlist, symbol, bare]);

  useEffect(() => {
    if (!quote?.price) return;
    setSession((prev) => {
      if (!prev) return { high: quote.price, low: quote.price };
      return {
        high: Math.max(prev.high, quote.price),
        low: Math.min(prev.low, quote.price),
      };
    });
  }, [quote?.price, bare]);

  useEffect(() => {
    setSession(null);
  }, [bare]);

  const prevClose =
    quote && Number.isFinite(quote.changePercent)
      ? quote.price / (1 + quote.changePercent / 100)
      : undefined;
  const changeAbs =
    quote && prevClose !== undefined ? quote.price - prevClose : undefined;

  const selectSymbol = (ticker: string) => {
    const s = symbols.findByTicker(bareTicker(ticker)) ?? symbols.findByTicker(ticker);
    if (!s) {
      chart.setSymbol(ticker);
      return;
    }
    chart.setSymbol(`${s.exchange}:${s.ticker}`);
  };

  const toggleIndicator = (key: IndicatorKey) => {
    setIndicators((prev) => {
      const nextOn = !prev[key];
      if (nextOn) {
        if (key === "vol") chart.createStudyFromSnapshot("Volume", {});
        if (key === "ema20") chart.createStudyFromSnapshot("Moving Average Exponential", { length: 20 });
        if (key === "ema50") chart.createStudyFromSnapshot("Moving Average Exponential", { length: 50 });
      }
      return { ...prev, [key]: nextOn };
    });
  };

  const navTabs = [
    { key: "watchlist", label: "Watchlist", Icon: StarIcon, onClick: onOpenWatchlist, active: false },
    { key: "chart", label: "Chart", Icon: ChartNavIcon, onClick: () => undefined, active: true },
    { key: "explore", label: "Explore", Icon: CompassIcon, onClick: onOpenExplore, active: false },
    { key: "alerts", label: "Alerts", Icon: BellIcon, onClick: onOpenAlerts, active: false },
    { key: "profile", label: "Profile", Icon: ProfileIcon, onClick: onOpenProfile, active: false },
  ] as const;

  return (
    <Box
      sx={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        bgcolor: MF.bg,
        color: MF.text,
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <Box
        sx={{
          height: MOBILE_HEADER_HEIGHT,
          px: 1.5,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: `1px solid ${MF.border}`,
          bgcolor: MF.bg,
          pt: "env(safe-area-inset-top, 0px)",
          flexShrink: 0,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
          <ForgeMark theme="dark" size={26} />
          <Typography
            sx={{
              fontWeight: 800,
              fontSize: 18,
              letterSpacing: "0.08em",
              color: MF.text,
              lineHeight: 1,
            }}
          >
            FORGE
          </Typography>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.25 }}>
          <IconButton
            size="small"
            aria-label="Search"
            onClick={() => chart.openSymbolSearch()}
            sx={{ color: MF.textMuted }}
          >
            <SearchIcon />
          </IconButton>
          <IconButton
            size="small"
            aria-label="Notifications"
            onClick={onOpenAlerts}
            sx={{ color: MF.textMuted, position: "relative" }}
          >
            <BellIcon />
            {alertCount > 0 ? (
              <Box
                sx={{
                  position: "absolute",
                  top: 6,
                  right: 6,
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  bgcolor: MF.danger,
                  border: `1.5px solid ${MF.bg}`,
                }}
              />
            ) : null}
          </IconButton>
          <ButtonBase
            onClick={onOpenProfile}
            aria-label="Profile"
            sx={{
              width: 32,
              height: 32,
              ml: 0.5,
              borderRadius: "50%",
              bgcolor: MF.accentSoft,
              border: `1px solid ${MF.borderActive}`,
              color: MF.text,
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            {profileInitials.slice(0, 2).toUpperCase()}
          </ButtonBase>
        </Box>
      </Box>

      {/* Instrument quick switcher */}
      <Box
        sx={{
          height: MOBILE_STRIP_HEIGHT,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          gap: 1,
          px: 1.5,
          overflowX: "auto",
          borderBottom: `1px solid ${MF.border}`,
          "&::-webkit-scrollbar": { display: "none" },
        }}
      >
        {cards.map((ticker) => {
          const t = bareTicker(ticker);
          const active = t === bare;
          const q = book[t] ?? book[ticker];
          const visual = assetVisual(t);
          const d = quoteDirection(q);
          const pctColor = d === "up" ? MF.up : d === "down" ? MF.down : MF.textMuted;
          const precision = symbols.findByTicker(t)?.pricePrecision ?? 2;
          return (
            <ButtonBase
              key={ticker}
              onClick={() => selectSymbol(ticker)}
              sx={{
                flex: "0 0 auto",
                minWidth: 132,
                height: 58,
                px: 1.25,
                borderRadius: "12px",
                bgcolor: MF.card,
                border: active ? `1.5px solid ${MF.borderActive}` : `1px solid ${MF.border}`,
                display: "flex",
                alignItems: "center",
                gap: 1,
                textAlign: "left",
              }}
            >
              <Box
                sx={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  bgcolor: visual.bg,
                  color: "#0B1220",
                  fontWeight: 800,
                  fontSize: 12,
                  display: "grid",
                  placeItems: "center",
                  flexShrink: 0,
                }}
              >
                {visual.label}
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontSize: 12, fontWeight: 700, color: MF.text, lineHeight: 1.2 }}>
                  {t}
                </Typography>
                <Typography sx={{ fontSize: 12, fontWeight: 600, color: MF.text, lineHeight: 1.25 }}>
                  {formatPrice(q?.price, precision)}
                </Typography>
                <Typography sx={{ fontSize: 11, fontWeight: 600, color: pctColor, lineHeight: 1.2 }}>
                  {formatPercent(q?.changePercent)}
                </Typography>
              </Box>
            </ButtonBase>
          );
        })}
      </Box>

      {/* Symbol + price */}
      <Box
        sx={{
          minHeight: MOBILE_SYMBOL_ROW_HEIGHT,
          px: 1.5,
          py: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1.5,
          flexShrink: 0,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, minWidth: 0 }}>
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              bgcolor: assetVisual(bare).bg,
              color: "#0B1220",
              fontWeight: 800,
              fontSize: 14,
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
            }}
          >
            {assetVisual(bare).label}
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: 18, fontWeight: 800, color: MF.text, lineHeight: 1.15 }}>
              {bare}
            </Typography>
            <Typography sx={{ fontSize: 12, color: MF.textMuted, lineHeight: 1.2 }}>
              {info?.name ?? bare}
            </Typography>
          </Box>
        </Box>
        <Box sx={{ textAlign: "right", flexShrink: 0 }}>
          <Typography sx={{ fontSize: 22, fontWeight: 800, color: MF.text, lineHeight: 1.1 }}>
            {formatPrice(quote?.price, info?.pricePrecision ?? 2)}
          </Typography>
          <Typography sx={{ fontSize: 12, fontWeight: 600, color: changeColor, lineHeight: 1.25 }}>
            {changeAbs !== undefined
              ? `${changeAbs >= 0 ? "+" : ""}${formatPrice(Math.abs(changeAbs), info?.pricePrecision ?? 2)} (${formatPercent(quote?.changePercent)})`
              : formatPercent(quote?.changePercent)}
          </Typography>
        </Box>
      </Box>

      {/* Timeframe + chart tools */}
      <Box
        sx={{
          height: MOBILE_TF_ROW_HEIGHT,
          px: 1.25,
          display: "flex",
          alignItems: "center",
          gap: 0.75,
          flexShrink: 0,
          borderBottom: `1px solid ${MF.border}`,
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 0.5,
            flex: 1,
            minWidth: 0,
            overflowX: "auto",
            "&::-webkit-scrollbar": { display: "none" },
          }}
        >
          {TF_PILLS.map((tf) => {
            const on = interval === tf.value;
            return (
              <ButtonBase
                key={tf.value}
                onClick={() => chart.setInterval(tf.value)}
                sx={{
                  flex: "0 0 auto",
                  height: 30,
                  minWidth: 40,
                  px: 1.25,
                  borderRadius: "999px",
                  bgcolor: on ? MF.accentSoft : "transparent",
                  border: on ? `1px solid ${MF.accent}` : "1px solid transparent",
                  color: on ? MF.accent : MF.textMuted,
                  fontWeight: 700,
                  fontSize: 12,
                }}
              >
                {tf.label}
              </ButtonBase>
            );
          })}
        </Box>
        <IconButton
          size="small"
          aria-label="Chart type"
          onClick={() => chart.openChartProperties()}
          sx={{ color: MF.textMuted }}
        >
          <CandleIcon fontSize="small" />
        </IconButton>
        <IconButton
          size="small"
          aria-label="Settings"
          onClick={() => chart.openChartProperties()}
          sx={{ color: MF.textMuted }}
        >
          <GearIcon fontSize="small" />
        </IconButton>
        <IconButton
          size="small"
          aria-label="Fullscreen"
          onClick={() => {
            const el = document.documentElement;
            if (!document.fullscreenElement) void el.requestFullscreen?.();
            else void document.exitFullscreen?.();
          }}
          sx={{ color: MF.textMuted }}
        >
          <ExpandIcon fontSize="small" />
        </IconButton>
      </Box>

      {/* Chart — must be a flex column so the TV iframe gets a real height. */}
      <Box
        sx={{
          flex: "1 1 auto",
          minHeight: 180,
          position: "relative",
          display: "flex",
          flexDirection: "column",
          bgcolor: MF.bg,
          borderBottom: `1px solid ${MF.border}`,
          "& > *": { flex: 1, minHeight: 0, minWidth: 0 },
        }}
      >
        {children}
      </Box>

      {/* Indicator legend */}
      <Box
        sx={{
          minHeight: legendOpen ? MOBILE_INDICATOR_ROW_HEIGHT : 28,
          px: 1.5,
          display: "flex",
          alignItems: "center",
          gap: 1.25,
          flexShrink: 0,
          borderBottom: `1px solid ${MF.border}`,
          bgcolor: MF.surface,
        }}
      >
        {legendOpen ? (
          <>
            {(
              [
                { key: "ema20" as const, label: "EMA 20", color: "#60A5FA" },
                { key: "ema50" as const, label: "EMA 50", color: "#F59E0B" },
                { key: "vol" as const, label: "Vol", color: "#A78BFA" },
              ] as const
            ).map((item) => (
              <ButtonBase
                key={item.key}
                onClick={() => toggleIndicator(item.key)}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 0.5,
                  opacity: indicators[item.key] ? 1 : 0.45,
                  color: MF.text,
                  borderRadius: "6px",
                  px: 0.25,
                }}
              >
                <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: item.color }} />
                <Typography sx={{ fontSize: 12, fontWeight: 600 }}>{item.label}</Typography>
                <EyeIcon sx={{ fontSize: 14, color: MF.textMuted }} />
              </ButtonBase>
            ))}
            <Box sx={{ flex: 1 }} />
          </>
        ) : (
          <Typography sx={{ fontSize: 12, color: MF.textMuted, fontWeight: 600 }}>Indicators</Typography>
        )}
        <IconButton
          size="small"
          aria-label={legendOpen ? "Collapse indicators" : "Expand indicators"}
          onClick={() => setLegendOpen((v) => !v)}
          sx={{ color: MF.textMuted, ml: "auto" }}
        >
          <ChevronIcon sx={{ transform: legendOpen ? "rotate(180deg)" : "none", fontSize: 18 }} />
        </IconButton>
      </Box>

      {/* Market overview */}
      <Box
        sx={{
          flexShrink: 0,
          px: 1.5,
          py: 1,
          bgcolor: MF.surface,
          borderBottom: `1px solid ${MF.border}`,
        }}
      >
        <ButtonBase
          onClick={() => setOverviewOpen((v) => !v)}
          sx={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            mb: overviewOpen ? 1 : 0,
          }}
        >
          <Typography sx={{ fontSize: 13, fontWeight: 700, color: MF.text }}>Market Overview</Typography>
          <ChevronIcon
            sx={{ color: MF.textMuted, fontSize: 18, transform: overviewOpen ? "rotate(180deg)" : "none" }}
          />
        </ButtonBase>
        {overviewOpen ? (
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 1,
              minHeight: MOBILE_OVERVIEW_HEIGHT - 28,
            }}
          >
            <OverviewCell
              label="Today"
              value={
                changeAbs !== undefined
                  ? `${changeAbs >= 0 ? "+" : ""}${formatPrice(Math.abs(changeAbs), info?.pricePrecision ?? 2)} (${formatPercent(quote?.changePercent)})`
                  : formatPercent(quote?.changePercent)
              }
              color={changeColor}
            />
            <OverviewCell
              label="Day High"
              value={formatPrice(session?.high ?? quote?.price, info?.pricePrecision ?? 2)}
            />
            <OverviewCell
              label="Day Low"
              value={formatPrice(session?.low ?? quote?.price, info?.pricePrecision ?? 2)}
            />
          </Box>
        ) : null}
      </Box>

      {/* Bottom app nav */}
      <Box
        component="nav"
        aria-label="Forge app navigation"
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          height: MOBILE_APP_NAV_HEIGHT,
          minHeight: MOBILE_APP_NAV_HEIGHT,
          pb: "env(safe-area-inset-bottom, 0px)",
          bgcolor: MF.surface,
          borderTop: `1px solid ${MF.border}`,
          flexShrink: 0,
          zIndex: 30,
        }}
      >
        {navTabs.map((tab) => (
          <ButtonBase
            key={tab.key}
            onClick={tab.onClick}
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 0.25,
              color: tab.active ? MF.accent : MF.textMuted,
              borderTop: tab.active ? `2px solid ${MF.accent}` : "2px solid transparent",
              "&:active": { bgcolor: "rgba(255,255,255,0.04)" },
            }}
          >
            <tab.Icon sx={{ fontSize: 22 }} />
            <Box component="span" sx={{ fontSize: 10, fontWeight: tab.active ? 700 : 600, lineHeight: 1.1 }}>
              {tab.label}
            </Box>
          </ButtonBase>
        ))}
      </Box>
    </Box>
  );
}

function OverviewCell({
  label,
  value,
  color,
}: {
  readonly label: string;
  readonly value: string;
  readonly color?: string;
}) {
  return (
    <Box
      sx={{
        bgcolor: MF.card,
        borderRadius: "10px",
        border: `1px solid ${MF.border}`,
        px: 1,
        py: 1,
        minWidth: 0,
      }}
    >
      <Typography sx={{ fontSize: 11, color: MF.textMuted, fontWeight: 600, mb: 0.25 }}>{label}</Typography>
      <Typography
        sx={{
          fontSize: 12,
          fontWeight: 700,
          color: color ?? MF.text,
          lineHeight: 1.25,
          wordBreak: "break-word",
        }}
      >
        {value}
      </Typography>
    </Box>
  );
}
