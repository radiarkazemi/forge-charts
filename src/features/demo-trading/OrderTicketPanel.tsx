import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import CloseIcon from "@mui/icons-material/Close";
import { useServices } from "@/app/use-services";
import { useStore } from "@/shared/hooks/useStore";

/**
 * TradingView Order ticket — dense 260px drawer matching broker widget scale.
 */
export function OrderTicketPanel() {
  const { demoTrading, chart, quotes } = useServices();
  const snap = useStore(demoTrading.state);
  const symbol = useStore(chart.state, (s) => s.symbol);
  const quote = useStore(quotes.quotes, (q) => q[symbol]);
  const mid = snap.space.lastPrice ?? quote?.price ?? null;
  const metrics = demoTrading.ticketMetrics(mid);
  const q = demoTrading.quotes(mid);

  if (!snap.ticketOpen) return null;

  const bare = symbol.includes(":") ? symbol.slice(symbol.lastIndexOf(":") + 1) : symbol;
  const sellActive = snap.side === "sell";

  const submit = () => {
    if (mid == null) return;
    const result = demoTrading.placeOrder({
      side: snap.side,
      type: snap.orderType,
      mid,
      symbol: bare,
      limitPrice: snap.orderType === "market" ? null : mid,
    });
    if (!result.ok) window.alert(result.message);
  };

  return (
    <Box
      sx={{
        width: 252,
        flexShrink: 0,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        bgcolor: "#131722",
        borderLeft: "1px solid #2a2e39",
        color: "#d1d4dc",
        fontSize: 11,
        fontFamily: '"Trebuchet MS", "Segoe UI", sans-serif',
        minHeight: 0,
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          px: "8px",
          height: 32,
          borderBottom: "1px solid #2a2e39",
        }}
      >
        <Box
          sx={{
            width: 16,
            height: 16,
            borderRadius: "2px",
            bgcolor: "#f23645",
            color: "#fff",
            fontWeight: 700,
            fontSize: 10,
            display: "grid",
            placeItems: "center",
            mr: "6px",
          }}
        >
          F
        </Box>
        <Typography sx={{ fontWeight: 700, flex: 1, fontSize: 12 }}>{bare}</Typography>
        <IconButton size="small" onClick={() => demoTrading.setTicketOpen(false)} sx={{ color: "#787b86", p: "2px" }}>
          <CloseIcon sx={{ fontSize: 14 }} />
        </IconButton>
      </Box>

      <Box sx={{ display: "flex", gap: "4px", px: "6px", py: "4px" }}>
        <ChipTab active label="Order" />
        <ChipTab label="DOM" disabled />
      </Box>

      <Box sx={{ display: "flex", mx: "6px", mb: "6px", overflow: "hidden", border: "1px solid #2a2e39" }}>
        <Box
          onClick={() => demoTrading.setSide("sell")}
          sx={{
            flex: 1,
            py: "6px",
            cursor: "pointer",
            bgcolor: sellActive ? "#f23645" : "#1e222d",
            textAlign: "center",
          }}
        >
          <Box sx={{ color: sellActive ? "#fff" : "#f23645", fontWeight: 600, fontSize: 10, lineHeight: 1.15 }}>
            Sell
          </Box>
          <Box sx={{ fontWeight: 700, fontSize: 14, color: sellActive ? "#fff" : "#d1d4dc", lineHeight: 1.2 }}>
            {q?.bid.toFixed(2) ?? "—"}
          </Box>
        </Box>
        <Box
          sx={{
            display: "grid",
            placeItems: "center",
            px: "4px",
            minWidth: 26,
            bgcolor: "#0c0e15",
            fontSize: 10,
            fontWeight: 700,
            color: "#b2b5be",
          }}
        >
          {(q?.spreadPoints ?? snap.instrument.spreadPoints).toFixed(1)}
        </Box>
        <Box
          onClick={() => demoTrading.setSide("buy")}
          sx={{
            flex: 1,
            py: "6px",
            cursor: "pointer",
            bgcolor: !sellActive ? "#2962ff" : "#1e222d",
            textAlign: "center",
          }}
        >
          <Box sx={{ color: !sellActive ? "#fff" : "#2962ff", fontWeight: 600, fontSize: 10, lineHeight: 1.15 }}>
            Buy
          </Box>
          <Box sx={{ fontWeight: 700, fontSize: 14, color: !sellActive ? "#fff" : "#d1d4dc", lineHeight: 1.2 }}>
            {q?.ask.toFixed(2) ?? "—"}
          </Box>
        </Box>
      </Box>

      <Box sx={{ display: "flex", gap: "12px", px: "10px", mb: "8px", borderBottom: "1px solid #2a2e39" }}>
        {(["market", "limit", "stop"] as const).map((t) => (
          <Box
            key={t}
            onClick={() => demoTrading.setOrderType(t)}
            sx={{
              pb: "4px",
              cursor: "pointer",
              textTransform: "capitalize",
              fontSize: 12,
              fontWeight: 600,
              color: snap.orderType === t ? "#d1d4dc" : "#787b86",
              borderBottom: snap.orderType === t ? "2px solid #fff" : "2px solid transparent",
            }}
          >
            {t}
          </Box>
        ))}
      </Box>

      <Box sx={{ px: "10px", mb: "6px" }}>
        <Box sx={{ color: "#787b86", fontSize: 10, mb: "2px" }}>Lots (size {snap.instrument.contractSize})</Box>
        <TextField
          size="small"
          fullWidth
          value={snap.qty}
          onChange={(e) => demoTrading.setQty(Number(e.target.value))}
          sx={{
            "& .MuiInputBase-root": { height: 26, fontSize: 12, bgcolor: "#1e222d" },
            input: { color: "#d1d4dc", py: 0 },
            "& fieldset": { borderColor: "#363a45" },
          }}
        />
      </Box>

      <Box sx={{ mx: "10px", mb: "8px", px: "6px", py: "4px", bgcolor: "#1e222d", fontSize: 11 }}>
        <Row
          label={`Trade value (${snap.instrument.leverage}:1)`}
          value={metrics ? `${metrics.tradeValue.toFixed(2)} USD` : "—"}
        />
        <Row label="Tick value" value={metrics ? `${metrics.tickValue.toFixed(2)} USD` : "—"} />
      </Box>

      <Box sx={{ px: "10px", mb: "6px" }}>
        <Box sx={{ fontWeight: 700, mb: "4px", fontSize: 12 }}>Exits</Box>
        <ExitRow
          label="Take profit, price"
          enabled={snap.takeProfitEnabled}
          price={snap.takeProfitPrice}
          onToggle={(v) => demoTrading.setTakeProfitEnabled(v)}
          onPrice={(v) => demoTrading.setTakeProfitPrice(v)}
        />
        <ExitRow
          label="Stop loss, price"
          enabled={snap.stopLossEnabled}
          price={snap.stopLossPrice}
          onToggle={(v) => demoTrading.setStopLossEnabled(v)}
          onPrice={(v) => demoTrading.setStopLossPrice(v)}
        />
      </Box>

      <Box sx={{ px: "10px", mb: "6px", fontSize: 11 }}>
        <Box sx={{ fontWeight: 700, mb: "4px", fontSize: 12 }}>Broker provided data</Box>
        <Row label="Required Margin" value={metrics ? `${metrics.margin.toFixed(8)} USD` : "—"} />
      </Box>

      <Box sx={{ flex: 1 }} />

      <Box sx={{ p: "8px" }}>
        <Button
          fullWidth
          variant="contained"
          onClick={submit}
          disabled={mid == null}
          sx={{
            textTransform: "none",
            minHeight: 40,
            borderRadius: "2px",
            bgcolor: sellActive ? "#f23645" : "#2962ff",
            "&:hover": { bgcolor: sellActive ? "#e53935" : "#1e88e5" },
            fontWeight: 700,
            fontSize: 13,
            lineHeight: 1.15,
            py: "8px",
          }}
        >
          {sellActive ? "Sell" : "Buy"} {snap.qty} {bare} {snap.orderType.toUpperCase()}
        </Button>
      </Box>
    </Box>
  );
}

function ChipTab({ label, active, disabled }: { label: string; active?: boolean; disabled?: boolean }) {
  return (
    <Box
      sx={{
        flex: 1,
        textAlign: "center",
        py: "4px",
        bgcolor: active ? "#2a2e39" : "transparent",
        color: disabled ? "#434651" : "#d1d4dc",
        fontWeight: 600,
        fontSize: 12,
        cursor: disabled ? "default" : "pointer",
      }}
    >
      {label}
    </Box>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ display: "flex", justifyContent: "space-between", py: "1px" }}>
      <Box component="span" sx={{ color: "#787b86", fontSize: 11 }}>
        {label}
      </Box>
      <Box component="span" sx={{ fontWeight: 600, fontSize: 11 }}>
        {value}
      </Box>
    </Box>
  );
}

function ExitRow({
  label,
  enabled,
  price,
  onToggle,
  onPrice,
}: {
  label: string;
  enabled: boolean;
  price: number | null;
  onToggle: (v: boolean) => void;
  onPrice: (v: number | null) => void;
}) {
  return (
    <Box sx={{ mb: "6px" }}>
      <Box sx={{ display: "flex", alignItems: "center", minHeight: 22 }}>
        <Box sx={{ flex: 1, color: "#787b86", fontSize: 11 }}>
          {label}
        </Box>
        <Switch size="small" checked={enabled} onChange={(_, v) => onToggle(v)} sx={{ transform: "scale(0.8)" }} />
      </Box>
      <TextField
        size="small"
        fullWidth
        disabled={!enabled}
        value={price ?? ""}
        onChange={(e) => onPrice(e.target.value === "" ? null : Number(e.target.value))}
        sx={{
          "& .MuiInputBase-root": { height: 26, fontSize: 12, bgcolor: "#1e222d" },
          input: { color: "#d1d4dc", py: 0 },
          "& fieldset": { borderColor: "#363a45" },
        }}
      />
    </Box>
  );
}
