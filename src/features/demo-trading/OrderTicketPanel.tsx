import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import CloseIcon from "@mui/icons-material/Close";
import { useServices } from "@/app/use-services";
import { useStore } from "@/shared/hooks/useStore";

const FONT = '"Trebuchet MS","Segoe UI",Tahoma,sans-serif';

interface OrderTicketPanelProps {
  /** On phones, float as a bottom sheet instead of a fixed side column. */
  readonly mobile?: boolean;
}

/**
 * TradingView Order ticket (right panel) — Market / Limit / Stop + SL/TP brackets.
 */
export function OrderTicketPanel({ mobile = false }: OrderTicketPanelProps) {
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
  const isPending = snap.orderType !== "market";
  const entryRef =
    isPending
      ? snap.entryPrice
      : q
        ? sellActive
          ? q.bid
          : q.ask
        : mid;

  const submit = () => {
    if (mid == null) return;
    if (isPending && (snap.entryPrice == null || !Number.isFinite(snap.entryPrice))) {
      window.alert(`Enter a ${snap.orderType} price`);
      return;
    }
    const result = demoTrading.placeOrder({
      side: snap.side,
      type: snap.orderType,
      mid,
      symbol: bare,
      limitPrice: isPending ? snap.entryPrice : null,
    });
    if (!result.ok) window.alert(result.message);
  };

  return (
    <Box
      sx={
        mobile
          ? {
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              top: "auto",
              height: "min(72%, 480px)",
              width: "100%",
              zIndex: 25,
              display: "flex",
              flexDirection: "column",
              bgcolor: "#131722",
              borderTop: "1px solid #2a2e39",
              borderTopLeftRadius: 12,
              borderTopRightRadius: 12,
              boxShadow: "0 -8px 28px rgba(0,0,0,0.45)",
              color: "#d1d4dc",
              fontFamily: FONT,
              fontSize: 12,
              minHeight: 0,
              pb: "env(safe-area-inset-bottom, 0px)",
            }
          : {
              width: 280,
              flexShrink: 0,
              height: "100%",
              display: "flex",
              flexDirection: "column",
              bgcolor: "#131722",
              borderLeft: "1px solid #2a2e39",
              color: "#d1d4dc",
              fontFamily: FONT,
              fontSize: 12,
              minHeight: 0,
            }
      }
    >
      {/* Header */}
      <Box sx={{ display: "flex", alignItems: "center", height: 38, px: 1, borderBottom: "1px solid #2a2e39" }}>
        <Box
          sx={{
            width: 18,
            height: 18,
            borderRadius: "2px",
            bgcolor: "#f23645",
            color: "#fff",
            fontWeight: 700,
            fontSize: 11,
            display: "grid",
            placeItems: "center",
            mr: 0.75,
          }}
        >
          F
        </Box>
        <Box sx={{ fontWeight: 700, flex: 1, fontSize: 13 }}>{bare}</Box>
        <IconButton size="small" onClick={() => demoTrading.setTicketOpen(false)} sx={{ color: "#787b86", p: 0.25 }}>
          <CloseIcon sx={{ fontSize: 16 }} />
        </IconButton>
      </Box>

      <Box sx={{ display: "flex", gap: 0.5, p: 0.75 }}>
        <TopTab active label="Order" />
        <TopTab label="DOM" disabled />
      </Box>

      {/* Sell / Buy */}
      <Box sx={{ display: "flex", mx: 0.75, mb: 0.75, border: "1px solid #2a2e39", overflow: "hidden" }}>
        <SideQuote
          label="Sell"
          price={q?.bid}
          active={sellActive}
          activeBg="#f23645"
          idleColor="#f23645"
          onClick={() => demoTrading.setSide("sell")}
        />
        <Box
          sx={{
            minWidth: 32,
            display: "grid",
            placeItems: "center",
            bgcolor: "#0c0e15",
            fontSize: 11,
            fontWeight: 700,
            color: "#b2b5be",
            borderLeft: "1px solid #2a2e39",
            borderRight: "1px solid #2a2e39",
          }}
        >
          {(q?.spreadPoints ?? snap.instrument.spreadPoints).toFixed(1)}
        </Box>
        <SideQuote
          label="Buy"
          price={q?.ask}
          active={!sellActive}
          activeBg="#2962ff"
          idleColor="#2962ff"
          onClick={() => demoTrading.setSide("buy")}
        />
      </Box>

      {/* Market / Limit / Stop */}
      <Box sx={{ display: "flex", gap: 1.5, px: 1.25, borderBottom: "1px solid #2a2e39", mb: 1 }}>
        {(["market", "limit", "stop"] as const).map((t) => (
          <Box
            key={t}
            onClick={() => demoTrading.setOrderType(t)}
            sx={{
              pb: 0.6,
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

      <Box sx={{ px: 1.25, mb: 1, overflow: "auto", flex: 1, minHeight: 0 }}>
        {/* Limit / Stop price */}
        {isPending ? (
          <Field
            label={snap.orderType === "limit" ? "Limit price" : "Stop price"}
            value={snap.entryPrice ?? ""}
            onChange={(v) => demoTrading.setEntryPrice(v === "" ? null : Number(v))}
          />
        ) : null}

        <Field
          label={`Lots (size ${snap.instrument.contractSize})`}
          value={snap.qty}
          onChange={(v) => demoTrading.setQty(Number(v) || 0)}
        />

        <Box sx={{ bgcolor: "#1e222d", borderRadius: "2px", px: 1, py: 0.5, mb: 1.25, fontSize: 12 }}>
          <InfoRow
            label={`Trade value (${snap.instrument.leverage}:1)`}
            value={metrics ? `${metrics.tradeValue.toFixed(2)} USD` : "—"}
          />
          <InfoRow label="Tick value" value={metrics ? `${metrics.tickValue.toFixed(2)} USD` : "—"} />
        </Box>

        {/* Exits — always visible (TV brackets) */}
        <Box sx={{ fontWeight: 700, fontSize: 13, mb: 0.75 }}>Exits</Box>
        <ExitBlock
          label="Take profit, price"
          enabled={snap.takeProfitEnabled}
          price={snap.takeProfitPrice}
          ticks={snap.takeProfitTicks}
          onToggle={(v) => demoTrading.setTakeProfitEnabled(v)}
          onPrice={(v) => demoTrading.setTakeProfitPrice(v)}
          onTicks={(v) => demoTrading.setTakeProfitTicks(v)}
        />
        <ExitBlock
          label="Stop loss, price"
          enabled={snap.stopLossEnabled}
          price={snap.stopLossPrice}
          ticks={snap.stopLossTicks}
          onToggle={(v) => demoTrading.setStopLossEnabled(v)}
          onPrice={(v) => demoTrading.setStopLossPrice(v)}
          onTicks={(v) => demoTrading.setStopLossTicks(v)}
        />

        <Box sx={{ fontWeight: 700, fontSize: 13, mb: 0.5, mt: 1 }}>Broker provided data</Box>
        <InfoRow label="Required Margin" value={metrics ? `${metrics.margin.toFixed(8)} USD` : "—"} />
        {entryRef != null && snap.takeProfitEnabled && snap.takeProfitPrice != null ? (
          <InfoRow
            label="TP ticks"
            value={String(Math.round(Math.abs(snap.takeProfitPrice - entryRef) / snap.instrument.tickSize))}
          />
        ) : null}
      </Box>

      <Box sx={{ p: 1, borderTop: "1px solid #2a2e39" }}>
        <Button
          fullWidth
          variant="contained"
          onClick={submit}
          disabled={mid == null}
          sx={{
            textTransform: "none",
            minHeight: 48,
            borderRadius: "4px",
            bgcolor: sellActive ? "#f23645" : "#2962ff",
            "&:hover": { bgcolor: sellActive ? "#e53935" : "#1e88e5" },
            fontWeight: 700,
            fontSize: 14,
            fontFamily: FONT,
            lineHeight: 1.2,
            display: "flex",
            flexDirection: "column",
            py: 0.75,
          }}
        >
          <Box component="span">
            {sellActive ? "Sell" : "Buy"} {snap.qty} {bare}
          </Box>
          <Box component="span" sx={{ fontSize: 11, fontWeight: 600, opacity: 0.9 }}>
            {snap.orderType.toUpperCase()}
            {isPending && snap.entryPrice != null ? ` @ ${snap.entryPrice}` : ""}
          </Box>
        </Button>
      </Box>
    </Box>
  );
}

function TopTab({ label, active, disabled }: { label: string; active?: boolean; disabled?: boolean }) {
  return (
    <Box
      sx={{
        flex: 1,
        textAlign: "center",
        py: 0.6,
        bgcolor: active ? "#2a2e39" : "transparent",
        color: disabled ? "#434651" : "#d1d4dc",
        fontWeight: 600,
        fontSize: 13,
        borderRadius: "2px",
        cursor: disabled ? "default" : "pointer",
      }}
    >
      {label}
    </Box>
  );
}

function SideQuote({
  label,
  price,
  active,
  activeBg,
  idleColor,
  onClick,
}: {
  label: string;
  price?: number;
  active: boolean;
  activeBg: string;
  idleColor: string;
  onClick: () => void;
}) {
  return (
    <Box
      onClick={onClick}
      sx={{
        flex: 1,
        py: 1,
        cursor: "pointer",
        bgcolor: active ? activeBg : "#1e222d",
        textAlign: "center",
      }}
    >
      <Box sx={{ color: active ? "#fff" : idleColor, fontWeight: 600, fontSize: 11, lineHeight: 1.2 }}>{label}</Box>
      <Box sx={{ fontWeight: 700, fontSize: 16, color: active ? "#fff" : "#d1d4dc", lineHeight: 1.25 }}>
        {price?.toFixed(2) ?? "—"}
      </Box>
    </Box>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
}) {
  return (
    <Box sx={{ mb: 1 }}>
      <Box sx={{ color: "#787b86", fontSize: 11, mb: 0.35 }}>{label}</Box>
      <TextField
        size="small"
        fullWidth
        value={value}
        onChange={(e) => onChange(e.target.value)}
        sx={{
          "& .MuiInputBase-root": { height: 30, fontSize: 13, bgcolor: "#1e222d", borderRadius: "2px" },
          input: { color: "#d1d4dc", py: 0, fontFamily: FONT },
          "& fieldset": { borderColor: "#363a45" },
        }}
      />
    </Box>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ display: "flex", justifyContent: "space-between", py: 0.25, fontSize: 12 }}>
      <Box sx={{ color: "#787b86" }}>{label}</Box>
      <Box sx={{ fontWeight: 600 }}>{value}</Box>
    </Box>
  );
}

function ExitBlock({
  label,
  enabled,
  price,
  ticks,
  onToggle,
  onPrice,
  onTicks,
}: {
  label: string;
  enabled: boolean;
  price: number | null;
  ticks: number | null;
  onToggle: (v: boolean) => void;
  onPrice: (v: number | null) => void;
  onTicks: (v: number | null) => void;
}) {
  return (
    <Box sx={{ mb: 1 }}>
      <Box sx={{ display: "flex", alignItems: "center", minHeight: 28 }}>
        <Box sx={{ flex: 1, color: "#787b86", fontSize: 12 }}>{label}</Box>
        <Switch size="small" checked={enabled} onChange={(_, v) => onToggle(v)} />
      </Box>
      <Box sx={{ display: "flex", gap: 0.75 }}>
        <TextField
          size="small"
          fullWidth
          disabled={!enabled}
          placeholder="Price"
          value={price ?? ""}
          onChange={(e) => onPrice(e.target.value === "" ? null : Number(e.target.value))}
          sx={{
            "& .MuiInputBase-root": { height: 28, fontSize: 12, bgcolor: "#1e222d" },
            input: { color: "#d1d4dc", py: 0 },
            "& fieldset": { borderColor: "#363a45" },
          }}
        />
        <TextField
          size="small"
          disabled={!enabled}
          placeholder="Ticks"
          value={ticks ?? ""}
          onChange={(e) => onTicks(e.target.value === "" ? null : Number(e.target.value))}
          sx={{
            width: 88,
            flexShrink: 0,
            "& .MuiInputBase-root": { height: 28, fontSize: 12, bgcolor: "#1e222d" },
            input: { color: "#d1d4dc", py: 0 },
            "& fieldset": { borderColor: "#363a45" },
          }}
        />
      </Box>
    </Box>
  );
}
