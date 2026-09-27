import Box from "@mui/material/Box";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Typography from "@mui/material/Typography";
import { useServices } from "@/app/use-services";
import { useStore } from "@/shared/hooks/useStore";

/**
 * Floating quick Buy/Sell (TradingView broker overlay) — top-left of chart.
 */
export function QuickTradeOverlay() {
  const { demoTrading, chart, quotes } = useServices();
  const snap = useStore(demoTrading.state);
  const symbol = useStore(chart.state, (s) => s.symbol);
  const quote = useStore(quotes.quotes, (q) => q[symbol]);
  const mid = snap.space.lastPrice ?? quote?.price ?? null;
  const q = demoTrading.quotes(mid);

  // Show whenever dock is open or ticket/space is active (demo trading engaged).
  if (!snap.dockOpen && !snap.ticketOpen && !snap.space.active) return null;

  const bare = symbol.includes(":") ? symbol.slice(symbol.lastIndexOf(":") + 1) : symbol;

  const trade = (side: "buy" | "sell") => {
    if (mid == null) return;
    demoTrading.setSide(side);
    demoTrading.setTicketOpen(true);
    const result = demoTrading.placeOrder({ side, type: "market", mid, symbol: bare });
    if (!result.ok) window.alert(result.message);
  };

  return (
    <Box
      sx={{
        position: "absolute",
        top: 48,
        left: 56,
        zIndex: 6,
        display: "flex",
        flexDirection: "column",
        gap: 0.5,
        pointerEvents: "auto",
      }}
    >
      <Box sx={{ display: "flex", alignItems: "stretch", gap: 0.5 }}>
        <Box
          component="button"
          type="button"
          onClick={() => trade("sell")}
          sx={{
            border: 0,
            cursor: "pointer",
            minWidth: 110,
            px: 1.5,
            py: 0.75,
            borderRadius: 1,
            bgcolor: "#ef5350",
            color: "#fff",
            textAlign: "center",
            font: "inherit",
            boxShadow: "0 2px 8px rgba(0,0,0,0.35)",
          }}
        >
          <Typography sx={{ fontWeight: 800, fontSize: 16, lineHeight: 1.1 }}>
            {q?.bid.toFixed(2) ?? "—"}
          </Typography>
          <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.4 }}>SELL</Typography>
        </Box>
        <Box
          sx={{
            alignSelf: "center",
            px: 0.75,
            py: 0.25,
            bgcolor: "#131722",
            color: "#d1d4dc",
            borderRadius: 0.5,
            fontSize: 11,
            fontWeight: 700,
            border: "1px solid #2a2e39",
          }}
        >
          {(q?.spreadPoints ?? snap.instrument.spreadPoints).toFixed(1)}
        </Box>
        <Box
          component="button"
          type="button"
          onClick={() => trade("buy")}
          sx={{
            border: 0,
            cursor: "pointer",
            minWidth: 110,
            px: 1.5,
            py: 0.75,
            borderRadius: 1,
            bgcolor: "#2962ff",
            color: "#fff",
            textAlign: "center",
            font: "inherit",
            boxShadow: "0 2px 8px rgba(0,0,0,0.35)",
          }}
        >
          <Typography sx={{ fontWeight: 800, fontSize: 16, lineHeight: 1.1 }}>
            {q?.ask.toFixed(2) ?? "—"}
          </Typography>
          <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.4 }}>BUY</Typography>
        </Box>
      </Box>
      <Select
        size="small"
        value={snap.qty}
        onChange={(e) => demoTrading.setQty(Number(e.target.value))}
        sx={{
          alignSelf: "flex-start",
          minWidth: 72,
          height: 28,
          bgcolor: "#fff",
          color: "#131722",
          fontSize: 13,
          fontWeight: 600,
          ".MuiOutlinedInput-notchedOutline": { border: 0 },
        }}
      >
        {[0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 11].map((n) => (
          <MenuItem key={n} value={n}>
            {n}
          </MenuItem>
        ))}
      </Select>
    </Box>
  );
}
