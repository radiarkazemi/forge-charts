import Box from "@mui/material/Box";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import { useServices } from "@/app/use-services";
import { useStore } from "@/shared/hooks/useStore";

/**
 * TradingView-scale quick Buy/Sell overlay (compact — matches broker widget).
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

  const btn = {
    border: 0,
    cursor: "pointer",
    width: 84,
    height: 40,
    borderRadius: "4px",
    color: "#fff",
    textAlign: "center" as const,
    fontFamily: "inherit",
    padding: "3px 4px",
    lineHeight: 1.1,
  };

  return (
    <Box
      sx={{
        position: "absolute",
        top: 40,
        left: 48,
        zIndex: 6,
        display: "flex",
        flexDirection: "column",
        gap: "3px",
        pointerEvents: "auto",
      }}
    >
      <Box sx={{ display: "flex", alignItems: "stretch", gap: "2px" }}>
        <button type="button" onClick={() => trade("sell")} style={{ ...btn, background: "#f23645" }}>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{q?.bid.toFixed(2) ?? "—"}</div>
          <div style={{ fontWeight: 600, fontSize: 9, letterSpacing: 0.2 }}>SELL</div>
        </button>
        <Box
          sx={{
            alignSelf: "center",
            px: "4px",
            py: "2px",
            bgcolor: "#131722",
            color: "#d1d4dc",
            borderRadius: "2px",
            fontSize: 10,
            fontWeight: 700,
            border: "1px solid #2a2e39",
            lineHeight: 1.2,
            minWidth: 26,
            textAlign: "center",
          }}
        >
          {(q?.spreadPoints ?? snap.instrument.spreadPoints).toFixed(1)}
        </Box>
        <button type="button" onClick={() => trade("buy")} style={{ ...btn, background: "#2962ff" }}>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{q?.ask.toFixed(2) ?? "—"}</div>
          <div style={{ fontWeight: 600, fontSize: 9, letterSpacing: 0.2 }}>BUY</div>
        </button>
      </Box>
      <Select
        size="small"
        value={snap.qty}
        onChange={(e) => demoTrading.setQty(Number(e.target.value))}
        sx={{
          alignSelf: "flex-start",
          minWidth: 52,
          height: 20,
          bgcolor: "#fff",
          color: "#131722",
          fontSize: 11,
          fontWeight: 600,
          borderRadius: "2px",
          ".MuiOutlinedInput-notchedOutline": { border: 0 },
          ".MuiSelect-select": { py: "1px", px: "5px" },
        }}
      >
        {[0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10].map((n) => (
          <MenuItem key={n} value={n} sx={{ fontSize: 11 }}>
            {n}
          </MenuItem>
        ))}
      </Select>
    </Box>
  );
}
