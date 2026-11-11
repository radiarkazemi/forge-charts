import ButtonBase from "@mui/material/ButtonBase";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import SvgIcon from "@mui/material/SvgIcon";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";
import { useEffect, useState } from "react";
import { useServices } from "@/app/use-services";
import { OrderTicketPanel } from "@/features/demo-trading/OrderTicketPanel";
import { useStore } from "@/shared/hooks/useStore";

/** Quote currency shown at the top of the mobile price scale. */
function quoteCurrency(symbol: string): string {
  const ticker = symbol.includes(":") ? symbol.slice(symbol.lastIndexOf(":") + 1) : symbol;
  const bare = ticker.toUpperCase();
  if (bare.endsWith("USDT")) return "USDT";
  if (bare.endsWith("USDC")) return "USDC";
  const quotes = ["USD", "EUR", "JPY", "GBP", "AUD", "CHF", "CAD", "NZD", "TRY", "IRT"];
  for (const quote of quotes) {
    if (bare.endsWith(quote) && bare.length > quote.length) return quote;
  }
  return "USD";
}

/**
 * TradingView mobile price scale chrome:
 * “USD ▾” at the top of the axis, “%” at the bottom-left of the time scale,
 * purple lightning just above the footer on the right.
 */
export function MobilePriceRail() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const { chart, demoTrading, settings } = useServices();
  const symbol = useStore(chart.state, (s) => s.symbol);
  const ready = useStore(chart.state, (s) => s.ready);
  const appTheme = useStore(settings.settings, (s) => s.theme);
  const [currencyEl, setCurrencyEl] = useState<HTMLElement | null>(null);
  const [percentOn, setPercentOn] = useState(false);

  const dark = appTheme === "dark";
  const text = dark ? "#d1d4dc" : "#131722";
  const menuBg = dark ? "#1e222d" : "#ffffff";
  const currency = quoteCurrency(symbol);

  useEffect(() => {
    if (!isMobile || !ready) return;
    try {
      chart.getWidget()?.currencyAndUnitVisibility().setValue("alwaysOff" as never);
    } catch {
      /* widget still attaching */
    }
  }, [chart, isMobile, ready, symbol]);

  if (!isMobile) return null;

  return (
    <>
      <ButtonBase
        aria-label="Price currency"
        onClick={(e) => setCurrencyEl(e.currentTarget)}
        sx={{
          position: "absolute",
          top: 2,
          right: 4,
          zIndex: 5,
          height: 28,
          minWidth: 52,
          px: 0.5,
          color: text,
          fontSize: 13,
          fontWeight: 600,
          letterSpacing: 0.2,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: 0.25,
          borderRadius: "4px",
          "&:active": { bgcolor: dark ? "rgba(209,212,220,0.08)" : "rgba(19,23,34,0.06)" },
        }}
      >
        {currency}
        <SvgIcon viewBox="0 0 16 16" sx={{ fontSize: 14, opacity: 0.85 }}>
          <path d="M4 6.2 8 10l4-3.8" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
        </SvgIcon>
      </ButtonBase>
      <Menu
        anchorEl={currencyEl}
        open={Boolean(currencyEl)}
        onClose={() => setCurrencyEl(null)}
        slotProps={{
          paper: {
            sx: {
              bgcolor: menuBg,
              color: text,
              minWidth: 120,
              mt: 0.5,
            },
          },
        }}
      >
        <MenuItem selected sx={{ fontSize: 14, fontWeight: 600 }} onClick={() => setCurrencyEl(null)}>
          {currency}
        </MenuItem>
      </Menu>

      <ButtonBase
        aria-label="Percentage scale"
        onClick={() => {
          chart.togglePercentageScale();
          setPercentOn((v) => !v);
        }}
        sx={{
          position: "absolute",
          left: 46,
          bottom: 2,
          zIndex: 5,
          width: 32,
          height: 26,
          color: percentOn ? "#2962FF" : text,
          fontSize: 15,
          fontWeight: 800,
          borderRadius: "4px",
          "&:active": { bgcolor: dark ? "rgba(209,212,220,0.08)" : "rgba(19,23,34,0.06)" },
        }}
      >
        %
      </ButtonBase>

      <ButtonBase
        aria-label="Trade"
        onClick={() => demoTrading.setTicketOpen(true)}
        sx={{
          position: "absolute",
          right: 58,
          bottom: 2,
          zIndex: 5,
          width: 32,
          height: 32,
          borderRadius: "50%",
          bgcolor: "#8B5CF6",
          color: "#fff",
          boxShadow: "0 1px 4px rgba(19, 23, 34, 0.28)",
          "&:active": { bgcolor: "#7C4FE0" },
        }}
      >
        <SvgIcon viewBox="0 0 24 24" sx={{ fontSize: 18 }}>
          <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" fill="currentColor" />
        </SvgIcon>
      </ButtonBase>
      <OrderTicketPanel mobile />
    </>
  );
}
