import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import { useEffect, useMemo, useState } from "react";
import { useServices } from "@/app/use-services";
import type { Bar } from "@/domain";
import { useStore } from "@/shared/hooks/useStore";
import { PanelHeader } from "@/shared/ui/PanelHeader";
import { analyzeSeat, type SeatDesk, type SeatSide } from "./engine";

interface SeatPanelProps {
  readonly onClose: () => void;
}

interface Ticket {
  readonly side: SeatSide;
  readonly entry: string;
  readonly stop: string;
  readonly target: string;
}

const EMPTY: Ticket = { side: "flat", entry: "", stop: "", target: "" };
const NO_BARS: Bar[] = [];

function parseNum(value: string): number | null {
  const text = value.trim();
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function toneColor(verdict: string): string {
  if (verdict === "SEAT_OK" || verdict === "LOCATION_VALID") return "success.main";
  if (verdict === "THESIS_BROKEN" || verdict === "SPREAD_STRESS") return "error.main";
  if (verdict === "REVIEW_STOP" || verdict === "DO_NOT_CHASE" || verdict === "WEAK_LOCATION") return "warning.main";
  return "text.primary";
}

export function SeatPanel({ onClose }: SeatPanelProps) {
  const { chart, marketData, quotes, symbols, demoTrading } = useServices();
  const symbol = useStore(chart.state, (s) => s.symbol);
  const quote = useStore(quotes.quotes, (book) => book[symbol]);
  const demo = useStore(demoTrading.state);
  const [m5, setM5] = useState<Bar[]>([]);
  const [h1, setH1] = useState<Bar[]>([]);
  const [status, setStatus] = useState("Loading the Forge feed…");
  const [loadedSymbol, setLoadedSymbol] = useState("");
  const [synthetic, setSynthetic] = useState(false);
  const [tickets, setTickets] = useState<Record<string, Ticket>>({});
  const [error, setError] = useState("");
  const ticket = tickets[symbol] ?? EMPTY;
  const setTicket = (next: Ticket | ((current: Ticket) => Ticket)) => {
    setTickets((book) => {
      const current = book[symbol] ?? EMPTY;
      const value = typeof next === "function" ? next(current) : next;
      return { ...book, [symbol]: value };
    });
  };

  useEffect(() => {
    const info = symbols.findByTicker(symbol);
    if (!info) return;
    let cancel = false;
    const load = async () => {
      const now = Math.floor(Date.now() / 1000);
      try {
        const five = await marketData.fetchHistory(info, "5", {
          from: now - 400 * 300,
          to: now + 120,
          countBack: 400,
        });
        let hourBars: Bar[] = [];
        try {
          const hour = await marketData.fetchHistory(info, "60", {
            from: now - 220 * 3600,
            to: now + 120,
            countBack: 220,
          });
          hourBars = hour.bars;
        } catch {
          hourBars = [];
        }
        if (cancel) return;
        setM5(five.bars);
        setH1(hourBars);
        setLoadedSymbol(symbol);
        setSynthetic(five.isSynthetic);
        setStatus(five.isSynthetic ? "Dev feed is synthetic for this symbol." : `Live Forge feed · ${five.providerId}`);
      } catch (err) {
        if (cancel) return;
        setStatus(err instanceof Error ? err.message : "The Forge feed did not answer.");
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 20_000);
    return () => {
      cancel = true;
      window.clearInterval(timer);
    };
  }, [marketData, symbol, symbols]);

  const openDemo = demo.positions.find((position) => position.status === "open" && position.symbol === symbol);

  const barsReady = loadedSymbol === symbol;
  const readyM5 = barsReady ? m5 : NO_BARS;
  const readyH1 = barsReady ? h1 : NO_BARS;
  const known = Boolean(symbols.findByTicker(symbol));
  const desk: SeatDesk = useMemo(() => {
    const price = quote?.price ?? readyM5.at(-1)?.close ?? 0;
    const digits = symbols.findByTicker(symbol)?.pricePrecision ?? 2;
    return analyzeSeat(
      { M5: readyM5, H1: readyH1 },
      price > 0 ? { time: quote?.updatedAt ?? 0, bid: price, ask: price } : null,
      {
        side: ticket.side,
        entry: parseNum(ticket.entry),
        stop: parseNum(ticket.stop),
        target: parseNum(ticket.target),
      },
      { digits, feedAgeSec: known && (quote || readyM5.length) ? 0 : null },
    );
  }, [known, quote, readyH1, readyM5, symbol, symbols, ticket]);

  const digits = symbols.findByTicker(symbol)?.pricePrecision ?? 2;
  const metrics = desk.metrics;

  const applyDemo = () => {
    if (!openDemo) return;
    setTicket({
      side: openDemo.side === "buy" ? "long" : "short",
      entry: String(openDemo.entryPrice),
      stop: openDemo.stopLoss == null ? "" : String(openDemo.stopLoss),
      target: openDemo.takeProfit == null ? "" : String(openDemo.takeProfit),
    });
    setError("");
  };

  const check = () => {
    if (ticket.side === "flat") {
      setError("");
      return;
    }
    const entry = parseNum(ticket.entry);
    const stop = parseNum(ticket.stop);
    if (entry == null || stop == null) {
      setError("A long or short needs both an entry and a stop.");
      return;
    }
    if (ticket.side === "long" && stop >= entry) {
      setError("For a long, the stop has to be below the entry.");
      return;
    }
    if (ticket.side === "short" && stop <= entry) {
      setError("For a short, the stop has to be above the entry.");
      return;
    }
    setError("");
  };

  const rows: [string, string][] = [
    ["ATR", metrics.atr == null ? "—" : metrics.atr.toFixed(digits)],
    ["Structure", metrics.structureText ?? "—"],
    ["Equilibrium", metrics.dealingEq == null ? "—" : metrics.dealingEq.toFixed(digits)],
    ["Profile", metrics.profileWhere ?? "—"],
    ["VWAP z", metrics.vwapZ == null ? "—" : metrics.vwapZ.toFixed(2)],
    ["Efficiency H1", metrics.efficiencyH1 == null ? "—" : metrics.efficiencyH1.toFixed(2)],
    ["Vol rank", metrics.rvPercentile == null ? "—" : `${Math.round(metrics.rvPercentile * 100)}th`],
    ["Buy pressure", metrics.buyPressure == null ? "—" : `${Math.round(metrics.buyPressure * 100)}%`],
    ["Heat", metrics.heatP70Atr == null ? "—" : `${metrics.heatP70Atr.toFixed(2)} ATR`],
    ["Your stop", metrics.stopAtr == null ? "—" : `${metrics.stopAtr.toFixed(2)} ATR`],
    ["Long / short", metrics.longScore == null ? "—" : `${metrics.longScore} / ${metrics.shortScore}`],
  ];

  return (
    <Box sx={{ display: "flex", flexDirection: "column", minHeight: 0, height: "100%" }}>
      <PanelHeader title="Seat" onClose={onClose} />
      <Box sx={{ overflow: "auto", px: 1.5, py: 1.25, display: "flex", flexDirection: "column", gap: 1.25 }}>
        <Typography variant="caption" color="text.secondary">
          {symbol} · {known ? status : "This symbol is not in the Forge list."}
          {synthetic ? " Numbers are from the demo feed." : ""}
        </Typography>
        <Box sx={{ p: 1.25, borderRadius: 1, bgcolor: "action.hover" }}>
          <Typography variant="overline" sx={{ color: toneColor(desk.verdict), letterSpacing: "0.08em" }}>
            {desk.verdict.replaceAll("_", " ")}
          </Typography>
          <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.15 }}>
            {desk.headline}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {desk.summary}
          </Typography>
          <Typography variant="caption" sx={{ display: "block", mt: 0.75, fontVariantNumeric: "tabular-nums" }}>
            Score {desk.verdict === "WARMING" ? "—" : desk.score}
          </Typography>
        </Box>
        <Box component="ul" sx={{ m: 0, pl: 0, listStyle: "none", display: "grid", gap: 0.5 }}>
          {desk.reasons.map((reason) => (
            <Box
              component="li"
              key={reason.text}
              sx={{
                pl: 1,
                borderLeft: 3,
                borderColor: reason.tone === "good" ? "success.main" : reason.tone === "bad" ? "error.main" : "warning.main",
                typography: "body2",
              }}
            >
              {reason.text}
            </Box>
          ))}
        </Box>
        <Typography variant="overline" color="text.secondary">
          Your ticket
        </Typography>
        <ToggleButtonGroup
          exclusive
          size="small"
          fullWidth
          value={ticket.side}
          onChange={(_event, value: SeatSide | null) => {
            if (value) setTicket((current) => ({ ...current, side: value }));
          }}
        >
          <ToggleButton value="long">Long</ToggleButton>
          <ToggleButton value="short">Short</ToggleButton>
          <ToggleButton value="flat">Flat</ToggleButton>
        </ToggleButtonGroup>
        <TextField size="small" label="Entry" value={ticket.entry} onChange={(event) => setTicket((current) => ({ ...current, entry: event.target.value }))} />
        <TextField size="small" label="Stop" value={ticket.stop} onChange={(event) => setTicket((current) => ({ ...current, stop: event.target.value }))} />
        <TextField size="small" label="Target" value={ticket.target} onChange={(event) => setTicket((current) => ({ ...current, target: event.target.value }))} />
        {openDemo ? (
          <Button size="small" variant="outlined" onClick={applyDemo}>
            Use the open demo {openDemo.side} on {symbol}
          </Button>
        ) : null}
        <Button variant="contained" onClick={check}>
          Check this seat
        </Button>
        {error ? (
          <Typography variant="body2" color="error">
            {error}
          </Typography>
        ) : null}
        <Box sx={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 0.5, typography: "body2" }}>
          {rows.map(([label, value]) => (
            <Box key={label} sx={{ display: "contents" }}>
              <Typography variant="body2" color="text.secondary">
                {label}
              </Typography>
              <Typography variant="body2" sx={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                {value}
              </Typography>
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  );
}
