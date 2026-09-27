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
 * TradingView-style Order ticket (right drawer) for Demo Trading.
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
        width: 320,
        flexShrink: 0,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        bgcolor: "#131722",
        borderLeft: "1px solid #2a2e39",
        color: "#d1d4dc",
        minHeight: 0,
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", px: 1.25, py: 1, borderBottom: "1px solid #2a2e39" }}>
        <Box
          sx={{
            width: 22,
            height: 22,
            borderRadius: 0.5,
            bgcolor: "#ef5350",
            color: "#fff",
            fontWeight: 800,
            fontSize: 12,
            display: "grid",
            placeItems: "center",
            mr: 1,
          }}
        >
          F
        </Box>
        <Typography sx={{ fontWeight: 700, flex: 1 }}>{bare}</Typography>
        <IconButton size="small" onClick={() => demoTrading.setTicketOpen(false)} sx={{ color: "#787b86" }}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>

      <Box sx={{ display: "flex", gap: 0.5, p: 1 }}>
        <ChipTab active label="Order" />
        <ChipTab label="DOM" disabled />
      </Box>

      {/* Sell / Buy quote box */}
      <Box sx={{ display: "flex", mx: 1, mb: 1, borderRadius: 1, overflow: "hidden", border: "1px solid #2a2e39" }}>
        <Box
          onClick={() => demoTrading.setSide("sell")}
          sx={{
            flex: 1,
            p: 1,
            cursor: "pointer",
            bgcolor: sellActive ? "rgba(239,83,80,0.25)" : "#1e222d",
            textAlign: "center",
          }}
        >
          <Typography variant="caption" sx={{ color: "#ef5350", fontWeight: 700 }}>
            Sell
          </Typography>
          <Typography sx={{ fontWeight: 700, fontSize: 18 }}>{q?.bid.toFixed(2) ?? "—"}</Typography>
        </Box>
        <Box sx={{ display: "grid", placeItems: "center", px: 0.75, bgcolor: "#0c0e15", fontSize: 11, fontWeight: 700 }}>
          {(q?.spreadPoints ?? snap.instrument.spreadPoints).toFixed(1)}
        </Box>
        <Box
          onClick={() => demoTrading.setSide("buy")}
          sx={{
            flex: 1,
            p: 1,
            cursor: "pointer",
            bgcolor: !sellActive ? "rgba(41,98,255,0.25)" : "#1e222d",
            textAlign: "center",
          }}
        >
          <Typography variant="caption" sx={{ color: "#2962ff", fontWeight: 700 }}>
            Buy
          </Typography>
          <Typography sx={{ fontWeight: 700, fontSize: 18 }}>{q?.ask.toFixed(2) ?? "—"}</Typography>
        </Box>
      </Box>

      {/* Market / Limit / Stop */}
      <Box sx={{ display: "flex", gap: 2, px: 1.5, mb: 1.5, borderBottom: "1px solid #2a2e39" }}>
        {(["market", "limit", "stop"] as const).map((t) => (
          <Box
            key={t}
            onClick={() => demoTrading.setOrderType(t)}
            sx={{
              pb: 0.75,
              cursor: "pointer",
              textTransform: "capitalize",
              fontSize: 13,
              fontWeight: 600,
              color: snap.orderType === t ? "#d1d4dc" : "#787b86",
              borderBottom: snap.orderType === t ? "2px solid #fff" : "2px solid transparent",
            }}
          >
            {t}
          </Box>
        ))}
      </Box>

      <Box sx={{ px: 1.5, mb: 1 }}>
        <Typography variant="caption" sx={{ color: "#787b86" }}>
          Lots (size {snap.instrument.contractSize})
        </Typography>
        <TextField
          size="small"
          fullWidth
          value={snap.qty}
          onChange={(e) => demoTrading.setQty(Number(e.target.value))}
          sx={{ mt: 0.5, input: { color: "#d1d4dc" } }}
        />
      </Box>

      <Box sx={{ mx: 1.5, mb: 1.5, p: 1, bgcolor: "#1e222d", borderRadius: 1, fontSize: 12 }}>
        <Row label={`Trade value (${snap.instrument.leverage}:1)`} value={metrics ? `${metrics.tradeValue.toFixed(2)} USD` : "—"} />
        <Row label="Tick value" value={metrics ? `${metrics.tickValue.toFixed(2)} USD` : "—"} />
      </Box>

      <Box sx={{ px: 1.5, mb: 1 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
          Exits
        </Typography>
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

      <Box sx={{ px: 1.5, mb: 1, fontSize: 12 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
          Broker provided data
        </Typography>
        <Row label="Required Margin" value={metrics ? `${metrics.margin.toFixed(8)} USD` : "—"} />
      </Box>

      <Box sx={{ flex: 1 }} />

      <Box sx={{ p: 1.5 }}>
        <Button
          fullWidth
          variant="contained"
          onClick={submit}
          disabled={mid == null}
          sx={{
            textTransform: "none",
            py: 1.25,
            bgcolor: sellActive ? "#ef5350" : "#2962ff",
            "&:hover": { bgcolor: sellActive ? "#e53935" : "#1e88e5" },
            display: "flex",
            flexDirection: "column",
            lineHeight: 1.2,
          }}
        >
          <Box component="span" sx={{ fontWeight: 800, fontSize: 16 }}>
            {sellActive ? "Sell" : "Buy"}
          </Box>
          <Box component="span" sx={{ fontSize: 11, opacity: 0.9 }}>
            {snap.qty} {bare} {snap.orderType.toUpperCase()}
          </Box>
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
        py: 0.75,
        borderRadius: 1,
        bgcolor: active ? "#2a2e39" : "transparent",
        color: disabled ? "#434651" : "#d1d4dc",
        fontWeight: 600,
        fontSize: 13,
        cursor: disabled ? "default" : "pointer",
      }}
    >
      {label}
    </Box>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ display: "flex", justifyContent: "space-between", py: 0.35 }}>
      <Box component="span" sx={{ color: "#787b86" }}>
        {label}
      </Box>
      <Box component="span" sx={{ fontWeight: 600 }}>
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
    <Box sx={{ mb: 1 }}>
      <Box sx={{ display: "flex", alignItems: "center" }}>
        <Typography variant="caption" sx={{ flex: 1, color: "#787b86" }}>
          {label}
        </Typography>
        <Switch size="small" checked={enabled} onChange={(_, v) => onToggle(v)} />
      </Box>
      <TextField
        size="small"
        fullWidth
        disabled={!enabled}
        value={price ?? ""}
        onChange={(e) => onPrice(e.target.value === "" ? null : Number(e.target.value))}
        sx={{ input: { color: "#d1d4dc" } }}
      />
    </Box>
  );
}
