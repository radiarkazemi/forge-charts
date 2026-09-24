import { useMemo, useState } from "react";
import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemButton from "@mui/material/ListItemButton";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import { useServices } from "@/app/use-services";
import type { SymbolInfo } from "@/domain";
import { useStore } from "@/shared/hooks/useStore";
import { EmptyState } from "@/shared/ui/EmptyState";
import { PanelHeader } from "@/shared/ui/PanelHeader";
import { PriceChange } from "@/shared/ui/PriceChange";
import { formatPrice } from "@/shared/utils/format";

interface WatchlistPanelProps {
  readonly onClose: () => void;
}

export function WatchlistPanel({ onClose }: WatchlistPanelProps) {
  const { settings, symbols, quotes, chart } = useServices();
  const watchlist = useStore(settings.settings, (s) => s.watchlist);
  const book = useStore(quotes.quotes);
  const current = useStore(chart.state, (s) => s.symbol);
  const [pending, setPending] = useState<SymbolInfo | null>(null);

  const rows = useMemo(() => {
    return watchlist.flatMap((entry) => {
      const symbol = symbols.findByTicker(entry);
      if (!symbol) return [];
      return [{ entry, symbol }];
    });
  }, [symbols, watchlist]);

  const options = useMemo(
    () =>
      symbols.all().filter((s) => {
        const key = `${s.exchange}:${s.ticker}`;
        return !watchlist.includes(s.ticker) && !watchlist.includes(key);
      }),
    [symbols, watchlist],
  );

  const add = (symbol: SymbolInfo | null) => {
    if (!symbol) return;
    settings.addToWatchlist(`${symbol.exchange}:${symbol.ticker}`);
    setPending(null);
  };

  return (
    <>
      <PanelHeader title="Watchlist" onClose={onClose} />
      <Box sx={{ p: 1.5, borderBottom: 1, borderColor: "divider" }}>
        <Autocomplete
          size="small"
          options={options}
          value={pending}
          onChange={(_, value) => add(value)}
          getOptionLabel={(s) => `${s.exchange}:${s.ticker}`}
          isOptionEqualToValue={(a, b) => a.ticker === b.ticker && a.exchange === b.exchange}
          renderOption={(props, s) => {
            const { key, ...rest } = props;
            return (
              <li key={`${s.exchange}:${s.ticker}`} {...rest}>
                <Box sx={{ display: "flex", flexDirection: "column" }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {s.ticker}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {s.name} · {s.exchange}
                  </Typography>
                </Box>
              </li>
            );
          }}
          renderInput={(params) => <TextField {...params} placeholder="Add symbol…" />}
        />
      </Box>

      {rows.length === 0 ? (
        <EmptyState title="Your watchlist is empty" description="Search above to add symbols." />
      ) : (
        <List dense disablePadding sx={{ overflowY: "auto", flex: 1 }}>
          {rows.map(({ entry, symbol: s }) => {
            const key = entry.includes(":") ? entry : `${s.exchange}:${s.ticker}`;
            const quote = book[s.ticker] ?? book[key];
            return (
              <ListItem
                key={entry}
                disablePadding
                secondaryAction={
                  <Tooltip title="Remove">
                    <IconButton
                      edge="end"
                      size="small"
                      aria-label={`Remove ${key}`}
                      onClick={() => settings.removeFromWatchlist(entry)}
                    >
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                }
                sx={{ "& .MuiListItemSecondaryAction-root": { opacity: 0 }, "&:hover .MuiListItemSecondaryAction-root": { opacity: 1 } }}
              >
                <ListItemButton
                  selected={current === s.ticker || current === key || current === entry}
                  onClick={() => chart.setSymbol(key)}
                  sx={{ pr: 6 }}
                >
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" noWrap sx={{ fontWeight: 700 }}>
                      {s.ticker}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" noWrap>
                      {s.exchange}
                    </Typography>
                  </Box>
                  <Box sx={{ textAlign: "right" }}>
                    <Typography
                      variant="body2"
                      sx={{ fontVariantNumeric: "tabular-nums", fontStyle: quote?.synthetic ? "italic" : "normal" }}
                    >
                      {formatPrice(quote?.price, s.pricePrecision)}
                    </Typography>
                    <PriceChange value={quote?.changePercent} />
                  </Box>
                </ListItemButton>
              </ListItem>
            );
          })}
        </List>
      )}
    </>
  );
}
