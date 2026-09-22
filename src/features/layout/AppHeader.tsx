import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import Toolbar from "@mui/material/Toolbar";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import DarkModeOutlinedIcon from "@mui/icons-material/DarkModeOutlined";
import LightModeOutlinedIcon from "@mui/icons-material/LightModeOutlined";
import NotificationsNoneIcon from "@mui/icons-material/NotificationsNone";
import { useServices } from "@/app/use-services";
import { useStore } from "@/shared/hooks/useStore";
import { PriceChange } from "@/shared/ui/PriceChange";
import { formatPrice } from "@/shared/utils/format";

interface AppHeaderProps {
  readonly onCreateAlert: () => void;
}

export function AppHeader({ onCreateAlert }: AppHeaderProps) {
  const { settings, chart, quotes, symbols, alerts } = useServices();
  const theme = useStore(settings.settings, (s) => s.theme);
  const { symbol, interval } = useStore(chart.state);
  const quote = useStore(quotes.quotes, (book) => book[symbol]);
  const activeAlerts = useStore(alerts.alerts, (list) => list.filter((a) => a.status === "active").length);
  const info = symbols.findByTicker(symbol);

  return (
    <AppBar position="static">
      <Toolbar variant="dense" sx={{ gap: 1.5, minHeight: 48 }}>
        <Box
          aria-hidden
          sx={{
            width: 26,
            height: 26,
            borderRadius: 1,
            bgcolor: "primary.main",
            color: "primary.contrastText",
            display: "grid",
            placeItems: "center",
            fontWeight: 800,
          }}
        >
          F
        </Box>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mr: 1 }}>
          Forge Charts
        </Typography>

        <Chip size="small" variant="outlined" label={`${symbol} · ${interval}`} sx={{ fontVariantNumeric: "tabular-nums" }} />
        {quote ? (
          <Box sx={{ display: "flex", alignItems: "baseline", gap: 1 }}>
            <Typography variant="body2" sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
              {formatPrice(quote.price, info?.pricePrecision ?? 2)}
            </Typography>
            <PriceChange value={quote.changePercent} />
          </Box>
        ) : null}
        {info ? (
          <Typography variant="body2" color="text.secondary" noWrap sx={{ display: { xs: "none", md: "block" } }}>
            {info.name}
          </Typography>
        ) : null}

        <Box sx={{ flex: 1 }} />

        <Tooltip title="Create price alert">
          <IconButton size="small" onClick={onCreateAlert} aria-label="Create price alert">
            <NotificationsNoneIcon fontSize="small" />
            {activeAlerts > 0 ? (
              <Chip size="small" color="primary" label={activeAlerts} sx={{ ml: 0.5, height: 18, fontSize: 11 }} />
            ) : null}
          </IconButton>
        </Tooltip>
        <Tooltip title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}>
          <IconButton size="small" onClick={() => settings.toggleTheme()} aria-label="Toggle theme">
            {theme === "dark" ? <LightModeOutlinedIcon fontSize="small" /> : <DarkModeOutlinedIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
      </Toolbar>
    </AppBar>
  );
}
