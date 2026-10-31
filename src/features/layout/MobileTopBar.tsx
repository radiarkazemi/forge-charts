import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import SvgIcon from "@mui/material/SvgIcon";
import { useMemo, useRef } from "react";
import { useServices } from "@/app/use-services";
import type { Interval } from "@/domain";
import { useStore } from "@/shared/hooks/useStore";
import { MOBILE_TOP_BAR_HEIGHT } from "./mobile-chrome";

const QUICK_IV: ReadonlyArray<{ readonly value: Interval; readonly label: string }> = [
  { value: "5S", label: "5s" },
  { value: "1", label: "1m" },
  { value: "5", label: "5m" },
  { value: "15", label: "15m" },
  { value: "30", label: "30m" },
  { value: "60", label: "1h" },
  { value: "240", label: "4h" },
  { value: "1D", label: "D" },
  { value: "1W", label: "W" },
];

function PersonIcon() {
  return (
    <SvgIcon viewBox="0 0 28 28" inheritViewBox sx={{ fontSize: 18 }}>
      <path
        d="M14 14a4.25 4.25 0 1 0 0-8.5 4.25 4.25 0 0 0 0 8.5Zm0 1.75c-3.6 0-7.25 1.8-7.25 4.25V22h14.5v-2c0-2.45-3.65-4.25-7.25-4.25Z"
        fill="currentColor"
      />
    </SvgIcon>
  );
}

function SearchIcon() {
  return (
    <SvgIcon viewBox="0 0 28 28" inheritViewBox sx={{ fontSize: 15, opacity: 0.72, flexShrink: 0 }}>
      <path
        d="M12.5 6.5a6 6 0 1 0 3.8 10.65l3.77 3.78 1.41-1.41-3.78-3.77A6 6 0 0 0 12.5 6.5Zm0 2a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z"
        fill="currentColor"
      />
    </SvgIcon>
  );
}

function PlusIcon() {
  return (
    <SvgIcon viewBox="0 0 28 28" inheritViewBox sx={{ fontSize: 18 }}>
      <path d="M14 7v14M7 14h14" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
    </SvgIcon>
  );
}

/**
 * Faraz-style mobile top chrome: profile · symbol pill · + · scrollable TFs.
 */
export function MobileTopBar() {
  const { chart, settings, symbols } = useServices();
  const symbol = useStore(chart.state, (s) => s.symbol);
  const interval = useStore(chart.state, (s) => s.interval);
  const appTheme = useStore(settings.settings, (s) => s.theme);
  const language = useStore(settings.settings, (s) => s.language);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const dark = appTheme === "dark";
  const bg = dark ? "#131722" : "#ffffff";
  const border = dark ? "#2a2e39" : "rgba(120,123,134,0.22)";
  const text = dark ? "#d1d4dc" : "#131722";
  const muted = dark ? "#787b86" : "#6a6d78";
  const pillBg = dark ? "rgba(120,123,134,0.16)" : "rgba(120,123,134,0.12)";
  const activeBg = dark ? "rgba(41,98,255,0.22)" : "rgba(41,98,255,0.14)";
  const active = "#2962FF";

  const display = useMemo(() => {
    const bare = symbol.includes(":") ? symbol.slice(symbol.lastIndexOf(":") + 1) : symbol;
    const ex = symbol.includes(":") ? symbol.slice(0, symbol.indexOf(":")).toUpperCase() : "";
    const info =
      (ex ? symbols.findByTicker(bare, ex) : undefined) ?? symbols.findByTicker(bare);
    const iran = (info?.exchange ?? ex).toUpperCase() === "IRAN" || (info?.exchange ?? ex).toUpperCase() === "TGJU";
    // Iran: show Farsi title when available (Faraz legend style).
    if (iran && info?.name && /[\u0600-\u06FF]/.test(info.name)) {
      return language === "en" && bare.length <= 10 ? bare : info.name;
    }
    return bare.length > 12 ? `${bare.slice(0, 11)}…` : bare;
  }, [symbol, symbols, language]);

  return (
    <Box
      component="header"
      aria-label="Mobile chart header"
      sx={{
        flexShrink: 0,
        height: MOBILE_TOP_BAR_HEIGHT,
        pt: "env(safe-area-inset-top, 0px)",
        minHeight: MOBILE_TOP_BAR_HEIGHT,
        bgcolor: bg,
        borderBottom: `1px solid ${border}`,
        display: "flex",
        alignItems: "center",
        gap: 0.5,
        px: 0.75,
        zIndex: 30,
        overflow: "hidden",
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
          bgcolor: pillBg,
          color: text,
          flexShrink: 0,
          "&:active": { opacity: 0.85 },
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
          gap: 0.6,
          height: 32,
          maxWidth: "42%",
          minWidth: 72,
          px: 1.25,
          borderRadius: "999px",
          bgcolor: pillBg,
          color: text,
          flex: "0 1 auto",
          overflow: "hidden",
          "&:active": { opacity: 0.9 },
        }}
      >
        <SearchIcon />
        <Box
          component="span"
          sx={{
            fontWeight: 700,
            fontSize: 13,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            minWidth: 0,
          }}
        >
          {display}
        </Box>
      </ButtonBase>

      <ButtonBase
        onClick={() => chart.openSymbolSearch()}
        aria-label="Add symbol"
        sx={{
          width: 30,
          height: 30,
          borderRadius: "50%",
          color: muted,
          flexShrink: 0,
          "&:active": { bgcolor: pillBg },
        }}
      >
        <PlusIcon />
      </ButtonBase>

      <Box
        ref={scrollRef}
        sx={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          alignItems: "center",
          gap: 0.25,
          overflowX: "auto",
          overflowY: "hidden",
          WebkitOverflowScrolling: "touch",
          scrollbarWidth: "none",
          "&::-webkit-scrollbar": { display: "none" },
          maskImage: "linear-gradient(90deg, #000 0%, #000 calc(100% - 18px), transparent 100%)",
        }}
      >
        {QUICK_IV.map((iv) => {
          const on = interval === iv.value;
          return (
            <ButtonBase
              key={iv.value}
              onClick={() => chart.setInterval(iv.value)}
              sx={{
                flex: "0 0 auto",
                height: 30,
                minWidth: 36,
                px: 1,
                borderRadius: "8px",
                color: on ? active : text,
                bgcolor: on ? activeBg : "transparent",
                fontWeight: 700,
                fontSize: 13,
                "&:active": { opacity: 0.85 },
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
