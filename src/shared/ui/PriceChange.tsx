import Typography from "@mui/material/Typography";
import { formatPercent } from "../utils/format";

interface PriceChangeProps {
  readonly value: number | undefined;
}

/** Colour-coded percentage change. */
export function PriceChange({ value }: PriceChangeProps) {
  const color = value === undefined || value === 0 ? "text.secondary" : value > 0 ? "success.main" : "error.main";
  return (
    <Typography variant="caption" sx={{ color, fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
      {formatPercent(value)}
    </Typography>
  );
}
