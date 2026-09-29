import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useState } from "react";
import { useServices } from "@/app/use-services";

export function ActivateDemoSpaceDialog({
  open,
  onClose,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
}) {
  const { demoSpace } = useServices();
  const [local, setLocal] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    // Prefer a weekday midday so FX/gold history is dense (avoid weekend gaps).
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
    d.setHours(14, 0, 0, 0);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const ms = Date.parse(local);
    if (!Number.isFinite(ms)) {
      setError("Invalid date/time");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await demoSpace.activate(Math.floor(ms / 1000));
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to activate");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Activate demo trading space</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ mb: 2, color: "text.secondary" }}>
          Pick a historical date. The chart cuts there and candles advance like live trading. You cannot pause —
          only deactivate to return to the real-time chart.
        </Typography>
        <TextField
          fullWidth
          type="datetime-local"
          label="Start date (local)"
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        {error ? (
          <Typography variant="caption" color="error" sx={{ mt: 1, display: "block" }}>
            {error}
          </Typography>
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={busy} onClick={() => void submit()}>
          {busy ? "Starting…" : "Submit"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export function CreateDemoAccountDialog({
  open,
  onClose,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
}) {
  const { demoTrading } = useServices();
  const [name, setName] = useState("Demo Account");
  const [balance, setBalance] = useState("100000");
  const [leverage, setLeverage] = useState("10000");
  const [spread, setSpread] = useState("6");

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Create demo account</DialogTitle>
      <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 1.5, pt: 1 }}>
        <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} fullWidth />
        <TextField label="Balance (USD)" value={balance} onChange={(e) => setBalance(e.target.value)} fullWidth />
        <TextField label="Leverage" value={leverage} onChange={(e) => setLeverage(e.target.value)} fullWidth />
        <TextField
          label="Spread (points)"
          value={spread}
          onChange={(e) => setSpread(e.target.value)}
          fullWidth
          helperText="Matches TradingView paper spread display (e.g. 6.0)"
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          onClick={() => {
            demoTrading.createAccount(
              name,
              Number(balance) || 100_000,
              Number(leverage) || 10_000,
              Number(spread) || 6,
            );
            onClose();
          }}
        >
          Create
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** Tiny helper used by dock imports that need a shared Box spacer. */
export function DemoDialogSpacer() {
  return <Box sx={{ height: 8 }} />;
}
