import { useMemo, useState } from "react";
import Autocomplete from "@mui/material/Autocomplete";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { useServices } from "@/app/use-services";
import { ALERT_CONDITION_LABELS, type AlertCondition, type SymbolInfo } from "@/domain";

interface CreateAlertDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
}

const CONDITIONS = Object.keys(ALERT_CONDITION_LABELS) as AlertCondition[];

export function CreateAlertDialog({ open, onClose }: CreateAlertDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      {/* The form mounts fresh on every open, so its initial state is always current. */}
      <CreateAlertForm onClose={onClose} />
    </Dialog>
  );
}

function CreateAlertForm({ onClose }: { readonly onClose: () => void }) {
  const { alerts, symbols, quotes, chart, notifier } = useServices();
  const options = useMemo(() => symbols.all(), [symbols]);

  const priceFor = (symbol: SymbolInfo | null): string => {
    const last = symbol ? quotes.lastPrice(symbol.ticker) : undefined;
    return last !== undefined ? last.toFixed(symbol?.pricePrecision ?? 2) : "";
  };

  const [symbol, setSymbol] = useState<SymbolInfo | null>(() => symbols.findByTicker(chart.state.get().symbol) ?? null);
  const [price, setPrice] = useState(() => priceFor(symbol));
  const [condition, setCondition] = useState<AlertCondition>("crossing");
  const [note, setNote] = useState("");

  const parsedPrice = Number(price);
  const valid = symbol !== null && Number.isFinite(parsedPrice) && parsedPrice > 0;

  const submit = () => {
    if (!valid || !symbol) return;
    alerts.add({ ticker: symbol.ticker, price: parsedPrice, condition, note });
    void notifier.requestPermission();
    onClose();
  };

  return (
    <>
      <DialogTitle>Create alert</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <Autocomplete
            options={options}
            value={symbol}
            onChange={(_, value) => {
              setSymbol(value);
              const next = priceFor(value);
              if (next) setPrice(next);
            }}
            getOptionLabel={(s) => s.ticker}
            isOptionEqualToValue={(a, b) => a.ticker === b.ticker}
            renderInput={(params) => <TextField {...params} label="Symbol" autoFocus />}
          />
          <TextField
            select
            label="Condition"
            value={condition}
            onChange={(e) => setCondition(e.target.value as AlertCondition)}
          >
            {CONDITIONS.map((c) => (
              <MenuItem key={c} value={c}>
                {ALERT_CONDITION_LABELS[c]}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Price"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            inputMode="decimal"
            error={price !== "" && !valid}
            helperText={price !== "" && !valid ? "Enter a positive number" : " "}
          />
          <TextField label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!valid} onClick={submit}>
          Create
        </Button>
      </DialogActions>
    </>
  );
}
