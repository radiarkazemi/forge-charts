import Box from "@mui/material/Box";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import type { CSSProperties } from "react";
import { useServices } from "@/app/use-services";
import { useStore } from "@/shared/hooks/useStore";

/**
 * TradingView broker Buy/Sell overlay — exact compact scale.
 */
export function QuickTradeOverlay() {
  const { demoTrading, chart, quotes } = useServices();
  const snap = useStore(demoTrading.state);
  const symbol = useStore(chart.state, (s) => s.symbol);
  const quote = useStore(quotes.quotes, (q) => q[symbol]);
  const mid = snap.space.lastPrice ?? quote?.price ?? null;
  const q = demoTrading.quotes(mid);

  if (!snap.dockOpen && !snap.ticketOpen && !snap.space.active) return null;

  const bare = symbol.includes(":") ? symbol.slice(symbol.lastIndexOf(":") + 1) : symbol;

  const trade = (side: "buy" | "sell") => {
    if (mid == null) return;
    demoTrading.setSide(side);
    demoTrading.setTicketOpen(true);
    const result = demoTrading.placeOrder({ side, type: "market", mid, symbol: bare });
    if (!result.ok) window.alert(result.message);
  };

  const btn: CSSProperties = {
    border: 0,
    cursor: "pointer",
    width: 78,
    height: 36,
    borderRadius: 2,
    color: "#fff",
    textAlign: "center",
    fontFamily: "Trebuchet MS, Segoe UI, sans-serif",
    padding: "2px 4px",
    lineHeight: 1.05,
  };

  return (
    <Box
      sx={{
        position: "absolute",
        top: 36,
        left: 46,
        zIndex: 6,
        display: "flex",
        flexDirection: "column",
        gap: "2px",
        pointerEvents: "auto",
      }}
    >
      <Box sx={{ display: "flex", alignItems: "stretch", gap: "1px" }}>
        <button type="button" onClick={() => trade("sell")} style={{ ...btn, background: "#f23645" }}>
          <div style={{ fontWeight: 700, fontSize: 12 }}>{q?.bid.toFixed(2) ?? "—"}</div>
          <div style={{ fontWeight: 600, fontSize: 9, opacity: 0.95 }}>SELL</div>
        </button>
        <Box
          sx={{
            alignSelf: "center",
            minWidth: 24,
            px: "3px",
            py: "1px",
            bgcolor: "#131722",
            color: "#b2b5be",
            fontSize: 10,
            fontWeight: 700,
            border: "1px solid #2a2e39",
            lineHeight: 1.2,
            textAlign: "center",
            fontFamily: "Trebuchet MS, Segoe UI, sans-serif",
          }}
        >
          {(q?.spreadPoints ?? snap.instrument.spreadPoints).toFixed(1)}
        </Box>
        <button type="button" onClick={() => trade("buy")} style={{ ...btn, background: "#2962ff" }}>
          <div style={{ fontWeight: 700, fontSize: 12 }}>{q?.ask.toFixed(2) ?? "—"}</div>
          <div style={{ fontWeight: 600, fontSize: 9, opacity: 0.95 }}>BUY</div>
        </button>
      </Box>
      <Select
        size="small"
        value={snap.qty}
        onChange={(e) => demoTrading.setQty(Number(e.target.value))}
        sx={{
          alignSelf: "flex-start",
          minWidth: 48,
          height: 18,
          bgcolor: "#fff",
          color: "#131722",
          fontSize: 11,
          fontWeight: 600,
          borderRadius: "2px",
          ".MuiOutlinedInput-notchedOutline": { border: 0 },
          ".MuiSelect-select": { py: 0, px: "4px", pr: "18px !important" },
          ".MuiSelect-icon": { right: 0, fontSize: 16 },
        }}
      >
        {[0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10].map((n) => (
          <MenuItem key={n} value={n} sx={{ fontSize: 11, minHeight: 28 }}>
            {n}
          </MenuItem>
        ))}
      </Select>
    </Box>
  );
}
