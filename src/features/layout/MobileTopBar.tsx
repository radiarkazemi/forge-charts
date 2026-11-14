import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import SvgIcon from "@mui/material/SvgIcon";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServices } from "@/app/use-services";
import type { Interval } from "@/domain";
import { useStore } from "@/shared/hooks/useStore";
import { MOBILE_TOP_BAR_HEIGHT } from "./mobile-chrome";

const CHROME = "#101010";
const PILL = "#2a2a2a";
const ACTIVE = "#303030";
const TEXT = "#ffffff";
const MUTED = "#c8cdd6";

/** Visible preset matches the reference; the rest sit to the right and scroll into view. */
const QUICK_IV: ReadonlyArray<{ readonly value: Interval; readonly label: string }> = [
  { value: "1", label: "1m" },
  { value: "5", label: "5m" },
  { value: "15", label: "15m" },
  { value: "30", label: "30m" },
  { value: "60", label: "1h" },
  { value: "120", label: "2h" },
  { value: "240", label: "4h" },
  { value: "1D", label: "D" },
  { value: "1W", label: "W" },
  { value: "1M", label: "M" },
  { value: "5S", label: "5s" },
  { value: "10S", label: "10s" },
  { value: "15S", label: "15s" },
  { value: "30S", label: "30s" },
];

const CHART_TYPES = [
  { id: 1, label: "Candles" },
  { id: 0, label: "Bars" },
  { id: 2, label: "Line" },
  { id: 3, label: "Area" },
  { id: 8, label: "Heikin Ashi" },
] as const;

function PersonIcon() {
  return (
    <SvgIcon viewBox="0 0 28 28" inheritViewBox sx={{ fontSize: 18 }}>
      <circle cx="14" cy="10" r="3.4" fill="none" stroke="currentColor" strokeWidth={1.6} />
      <path
        d="M7.2 21.2c.9-3.3 3.3-5 6.8-5s5.9 1.7 6.8 5"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
      />
    </SvgIcon>
  );
}

function CandleIcon() {
  return (
    <SvgIcon viewBox="0 0 28 28" inheritViewBox sx={{ fontSize: 20 }}>
      <path
        d="M9 6.5v15M9 9.5h2.2v7H6.8v-7H9zM18.5 5v18M18.5 8.5h2.2v9h-4.4v-9h2.2z"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
    </SvgIcon>
  );
}

function PlusIcon() {
  return (
    <SvgIcon viewBox="0 0 28 28" inheritViewBox sx={{ fontSize: 18 }}>
      <circle cx="14" cy="14" r="8.2" fill="none" stroke="currentColor" strokeWidth={1.5} />
      <path d="M14 10.2v7.6M10.2 14h7.6" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
    </SvgIcon>
  );
}

/**
 * Mobile chart header matching the TradingView reference:
 * profile, symbol, chart type and compare stay fixed; intervals scroll sideways.
 */
export function MobileTopBar() {
  const { chart, symbols } = useServices();
  const symbol = useStore(chart.state, (s) => s.symbol);
  const interval = useStore(chart.state, (s) => s.interval);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [typeEl, setTypeEl] = useState<HTMLElement | null>(null);

  const display = useMemo(() => {
    const bare = symbol.includes(":") ? symbol.slice(symbol.lastIndexOf(":") + 1) : symbol;
    const ex = symbol.includes(":") ? symbol.slice(0, symbol.indexOf(":")).toUpperCase() : "";
    const info = (ex ? symbols.findByTicker(bare, ex) : undefined) ?? symbols.findByTicker(bare);
    const iran = (info?.exchange ?? ex).toUpperCase() === "IRAN" || (info?.exchange ?? ex).toUpperCase() === "TGJU";
    if (iran && info?.name && /[\u0600-\u06FF]/.test(info.name)) return info.name;
    return bare.length > 12 ? `${bare.slice(0, 11)}…` : bare;
  }, [symbol, symbols]);

  useEffect(() => {
    const root = scrollRef.current;
    const active = root?.querySelector<HTMLElement>("[data-active='1']");
    if (!root || !active) return;
    const left = active.offsetLeft - root.clientWidth / 2 + active.clientWidth / 2;
    root.scrollTo({ left: Math.max(0, left) });
  }, [interval]);

  return (
    <Box
      component="header"
      aria-label="Mobile chart header"
      sx={{
        flexShrink: 0,
        height: MOBILE_TOP_BAR_HEIGHT,
        pt: "env(safe-area-inset-top, 0px)",
        minHeight: MOBILE_TOP_BAR_HEIGHT,
        boxSizing: "content-box",
        bgcolor: CHROME,
        display: "flex",
        alignItems: "center",
        gap: 0.25,
        pl: 0.5,
        pr: 0.25,
        zIndex: 30,
        overflow: "hidden",
        color: TEXT,
      }}
    >
      <ButtonBase
        onClick={(e) => {
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
          window.dispatchEvent(
            new CustomEvent("forge:open-profile-menu", {
              detail: { top: r.top, left: r.left, bottom: r.bottom, right: r.right },
            }),
          );
        }}
        aria-label="Profile"
        sx={{
          width: 32,
          height: 32,
          borderRadius: "50%",
          bgcolor: PILL,
          color: TEXT,
          flexShrink: 0,
        }}
      >
        <PersonIcon />
      </ButtonBase>

      <ButtonBase
        onClick={() => chart.openSymbolSearch()}
        aria-label="Symbol search"
        sx={{
          display: "inline-flex",
          alignItems: "center",
          height: 30,
          maxWidth: 132,
          minWidth: 64,
          px: 1.1,
          borderRadius: "999px",
          bgcolor: PILL,
          color: TEXT,
          flex: "0 1 auto",
          overflow: "hidden",
        }}
      >
        <Box
          component="span"
          sx={{
            fontWeight: 700,
            fontSize: 13,
            letterSpacing: 0.2,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {display}
        </Box>
      </ButtonBase>

      <ButtonBase
        aria-label="Chart type"
        onClick={(e) => setTypeEl(e.currentTarget)}
        sx={{ width: 32, height: 32, borderRadius: "6px", color: TEXT, flexShrink: 0 }}
      >
        <CandleIcon />
      </ButtonBase>
      <Menu
        anchorEl={typeEl}
        open={Boolean(typeEl)}
        onClose={() => setTypeEl(null)}
        slotProps={{ paper: { sx: { bgcolor: "#1c1c1c", color: TEXT, minWidth: 160 } } }}
      >
        {CHART_TYPES.map((row) => (
          <MenuItem
            key={row.id}
            sx={{ fontSize: 14 }}
            onClick={() => {
              chart.setChartType(row.id);
              setTypeEl(null);
            }}
          >
            {row.label}
          </MenuItem>
        ))}
      </Menu>

      <ButtonBase
        aria-label="Compare"
        onClick={() => chart.openCompare()}
        sx={{ width: 32, height: 32, borderRadius: "50%", color: TEXT, flexShrink: 0 }}
      >
        <PlusIcon />
      </ButtonBase>

      <Box sx={{ width: "1px", height: 18, bgcolor: "#3a3a3a", mx: 0.25, flexShrink: 0 }} />

      <Box
        ref={scrollRef}
        aria-label="Intervals"
        sx={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          alignItems: "center",
          gap: 0.25,
          overflowX: "auto",
          overflowY: "hidden",
          WebkitOverflowScrolling: "touch",
          touchAction: "pan-x",
          overscrollBehaviorX: "contain",
          scrollbarWidth: "none",
          "&::-webkit-scrollbar": { display: "none" },
        }}
      >
        {QUICK_IV.map((iv) => {
          const on = interval === iv.value;
          return (
            <ButtonBase
              key={iv.value}
              data-active={on ? "1" : "0"}
              onClick={() => chart.setInterval(iv.value)}
              sx={{
                flex: "0 0 auto",
                height: 28,
                minWidth: 36,
                px: 1,
                borderRadius: "6px",
                color: on ? TEXT : MUTED,
                bgcolor: on ? ACTIVE : "transparent",
                fontWeight: 600,
                fontSize: 13,
              }}
            >
              {iv.label}
            </ButtonBase>
          );
        })}
      </Box>
    </Box>
  );
}
