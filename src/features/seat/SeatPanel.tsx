import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import CloseIcon from "@mui/icons-material/Close";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useServices } from "@/app/use-services";
import type { Bar } from "@/domain";
import { useStore } from "@/shared/hooks/useStore";
import { analyzeSeat, type SeatDesk, type SeatReason, type SeatSide } from "./engine";
import {
  createPosition,
  readPosition,
  readPositions,
  type PositionChart,
  type PositionSide,
} from "./chart-position";

const FONT = '-apple-system,BlinkMacSystemFont,"Trebuchet MS","Segoe UI",sans-serif';
const NO_BARS: Bar[] = [];

interface SeatPanelProps {
  readonly onClose: () => void;
}

interface Draft {
  readonly side: PositionSide;
  readonly id: string;
  readonly entry: number;
  readonly stop: number;
  readonly target: number;
  readonly placedAt: number | null;
}

function chartApi(widget: unknown): PositionChart | null {
  const chart = (widget as { activeChart?: () => PositionChart } | null)?.activeChart?.();
  if (!chart || typeof chart.getAllShapes !== "function" || typeof chart.createShape !== "function") return null;
  return chart;
}

function formatPrice(value: number, digits: number): string {
  return value.toFixed(digits);
}

function alignedDetail(reasons: readonly SeatReason[]): string {
  const premium = reasons.some((reason) => reason.tone === "good" && reason.text.includes("premium half"));
  const discount = reasons.some((reason) => reason.tone === "good" && reason.text.includes("discount half"));
  const zone = reasons.some((reason) => reason.tone === "good" && reason.text.includes("Price is inside an unfilled"));
  const half = premium ? "premium" : discount ? "discount" : "";
  if (half && zone) return `Structure, ${half}, and the zone agree.`;
  if (half) return `Structure and ${half} agree.`;
  if (zone) return "Structure and the zone agree.";
  return "Structure agrees with this side.";
}

function verdictTitle(verdict: string): string {
  switch (verdict) {
    case "REVIEW_STOP":
      return "Review stop";
    case "SEAT_OK":
      return "Setup aligns";
    case "DO_NOT_CHASE":
      return "Do not chase";
    case "THESIS_BROKEN":
      return "Thesis broken";
    case "WEAK_LOCATION":
      return "Weak location";
    case "LOCATION_VALID":
      return "Location valid";
    case "STAND_ASIDE":
      return "Stand aside";
    case "SPREAD_STRESS":
      return "Spread stress";
    default:
      return "Waiting for bars";
  }
}

function bannerTone(verdict: string): "warn" | "bad" | "good" | "idle" {
  if (verdict === "SEAT_OK" || verdict === "LOCATION_VALID") return "good";
  if (verdict === "DO_NOT_CHASE" || verdict === "THESIS_BROKEN" || verdict === "SPREAD_STRESS") return "bad";
  if (verdict === "WARMING") return "idle";
  return "warn";
}

function checkLabel(reason: SeatReason, side: PositionSide): string {
  const text = reason.text.toLowerCase();
  if (text.includes("traded the take profit")) return "Take profit was reached";
  if (text.includes("traded the stop")) return "Stop was traded";
  if (text.includes("location is working")) return "Open profit is past 1 ATR";
  if (text.includes("swings agree")) return "Swing structure aligns";
  if (text.includes("point the other")) return "Swings point the other way";
  if (text.includes("mixed") || text.includes("not confirmed")) return "Swings are not confirmed";
  if (text.includes("premium half") && !text.includes("expensive")) return "Price is in premium";
  if (text.includes("discount half") && !text.includes("expensive")) return "Price is in discount";
  if (text.includes("equilibrium")) return "Price is on equilibrium";
  if (text.includes("expensive")) return "Price is on the expensive side";
  if (text.includes("not inside")) return "No unfilled imbalance";
  if (text.includes("unfilled") && text.includes("inside")) {
    return side === "short" ? "Short imbalance / order block" : "Long imbalance / order block";
  }
  if (text.includes("diverges")) return "Bar delta diverges";
  if (text.includes("delta") && text.includes("agrees")) return "Recent bar delta aligns";
  if (text.includes("balanced")) return "Bar delta is balanced";
  if (text.includes("rotating")) return "Low 15m efficiency";
  if (text.includes("covering ground")) return "15m efficiency is healthy";
  if (text.includes("working range")) return "Stop is in the working range";
  if (text.includes("not enough completed swings") && text.includes("only")) return "Tight stop · limited swing history";
  if (text.includes("unusually wild")) return "Volatility is elevated";
  if (text.includes("vwap")) return "Extended from session value";
  if (text.includes("through your stop")) return "Price is through the stop";
  if (text.includes("wrong side")) return "Stop is on the wrong side";
  if (text.includes("risk is wide") || text.includes("wide")) return "Stop is wide";
  if (text.includes("atr away")) return "Stop versus swing heat";
  if (text.includes("reward")) return "Reward to risk is set";
  return reason.text.length > 52 ? `${reason.text.slice(0, 50)}…` : reason.text;
}

export function SeatPanel({ onClose }: SeatPanelProps) {
  const { chart, marketData, quotes, symbols } = useServices();
  const symbol = useStore(chart.state, (s) => s.symbol);
  const quote = useStore(quotes.quotes, (book) => book[symbol]);
  const [m5, setM5] = useState<Bar[]>([]);
  const [h1, setH1] = useState<Bar[]>([]);
  const [loadedSymbol, setLoadedSymbol] = useState("");
  const [armed, setArmed] = useState<PositionSide>("short");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [checksOpen, setChecksOpen] = useState(true);
  const [contextOpen, setContextOpen] = useState(false);
  const [error, setError] = useState("");
  const draftRef = useRef<Draft | null>(null);

  const digits = symbols.findByTicker(symbol)?.pricePrecision ?? 2;
  const info = symbols.findByTicker(symbol);
  const bare = symbol.includes(":") ? symbol.slice(symbol.lastIndexOf(":") + 1) : symbol;

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
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
      } catch (err) {
        if (!cancel) setError(err instanceof Error ? err.message : "The feed did not answer.");
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 20_000);
    return () => {
      cancel = true;
      window.clearInterval(timer);
    };
  }, [info, marketData, symbol]);

  useEffect(() => {
    const pull = () => {
      const api = chartApi(chart.getWidget());
      if (!api) return;
      const rows = readPositions(api);
      const currentId = draftRef.current?.id;
      const match = (currentId ? rows.find((row) => row.id === currentId) : null) ?? rows.at(-1) ?? null;
      if (!match) {
        setDraft(null);
        return;
      }
      setDraft((current) => {
        if (
          current &&
          current.id === match.id &&
          current.entry === match.entry &&
          current.stop === match.stop &&
          current.target === match.target &&
          current.placedAt === match.placedAt
        ) {
          return current;
        }
        return match;
      });
      setArmed(match.side);
    };
    const stopDraw = chart.onDrawingEvent(() => pull());
    const timer = window.setInterval(pull, 400);
    pull();
    return () => {
      stopDraw();
      window.clearInterval(timer);
    };
  }, [chart]);

  const barsReady = loadedSymbol === symbol;
  const readyM5 = barsReady ? m5 : NO_BARS;
  const readyH1 = barsReady ? h1 : NO_BARS;

  const desk: SeatDesk | null = useMemo(() => {
    if (!draft) return null;
    const price = quote?.price ?? readyM5.at(-1)?.close ?? 0;
    return analyzeSeat(
      { M5: readyM5, H1: readyH1 },
      price > 0 ? { time: quote?.updatedAt ?? 0, bid: price, ask: price } : null,
      { side: draft.side as SeatSide, entry: draft.entry, stop: draft.stop, target: draft.target, placedAt: draft.placedAt },
      { digits, feedAgeSec: price > 0 || readyM5.length ? 0 : null },
    );
  }, [digits, draft, quote, readyH1, readyM5]);

  const reviewSetup = async () => {
    setChecksOpen(true);
    const api = chartApi(chart.getWidget());
    if (!api) {
      setError("The chart is still loading.");
      return;
    }
    const rows = readPositions(api);
    const match = rows.find((row) => row.side === armed) ?? rows.at(-1) ?? null;
    if (!match) {
      await place(armed);
      return;
    }
    setDraft(match);
    setArmed(match.side);
    const reward = match.side === "short" ? match.entry - match.target : match.target - match.entry;
    const risk = match.side === "short" ? match.stop - match.entry : match.entry - match.stop;
    if (!(reward > 0)) setError("Take profit is on the wrong side of the entry.");
    else if (!(risk > 0)) setError(match.side === "short" ? "For a short, the stop has to be above the entry." : "For a long, the stop has to be below the entry.");
    else setError("");
  };

  const place = async (side: PositionSide) => {
    setError("");
    setArmed(side);
    const api = chartApi(chart.getWidget());
    if (!api) {
      setError("The chart is still loading.");
      return;
    }
    const existing = readPositions(api).filter((row) => row.side === side).at(-1);
    if (existing) {
      setDraft(existing);
      await chart.exitDrawingTool();
      return;
    }
    const price = quote?.price ?? readyM5.at(-1)?.close;
    if (price == null || !(price > 0)) {
      await chart.selectLineTool(side === "long" ? "long_position" : "short_position");
      return;
    }
    const range = chart.getVisiblePriceRange();
    const span = range && range.to > range.from ? (range.to - range.from) * 0.08 : price * 0.003;
    const stopPrice = side === "long" ? price - span : price + span;
    const targetPrice = side === "long" ? price + span * 1.5 : price - span * 1.5;
    const visible = chart.getVisibleRange();
    const time = visible ? Math.floor(visible.from + (visible.to - visible.from) * 0.72) : Math.floor(Date.now() / 1000);
    try {
      const id = await createPosition(api, side, price, stopPrice, targetPrice, time);
      await chart.exitDrawingTool();
      if (!id) {
        await chart.selectLineTool(side === "long" ? "long_position" : "short_position");
        return;
      }
      const placed = readPosition(api, id, side === "long" ? "long_position" : "short_position");
      setDraft(placed ?? { id, side, entry: price, stop: stopPrice, target: targetPrice, placedAt: time });
    } catch {
      await chart.selectLineTool(side === "long" ? "long_position" : "short_position");
    }
  };

  const align = desk ? desk.reasons.filter((reason) => reason.tone === "good").length : 0;
  const review = desk ? desk.reasons.length - align : 0;
  const tone = desk ? bannerTone(desk.verdict) : "idle";
  const stopAtr = desk?.metrics.stopAtr;
  const lead = desk?.reasons.find((reason) => reason.tone === "bad") ?? desk?.reasons.find((reason) => reason.tone === "neutral");
  const targetReached = desk?.reasons.some((reason) => reason.text.includes("traded the take profit")) ?? false;
  const working = desk?.reasons.some((reason) => reason.text.includes("location is working")) ?? false;
  const bannerDetail = !desk
    ? "Choose Short or Long. The position tool drops on the chart."
    : desk.verdict === "REVIEW_STOP" && stopAtr != null
      ? `Stop is ${stopAtr.toFixed(2)} ATR away`
      : desk.verdict === "SEAT_OK" && targetReached
        ? "Take profit was reached"
        : desk.verdict === "SEAT_OK" && working
          ? "Open profit is past 1 ATR"
          : desk.verdict === "SEAT_OK"
            ? alignedDetail(desk.reasons)
            : lead
              ? checkLabel(lead, draft?.side ?? armed)
              : "The live numbers agree with this location.";
  const rr = desk?.metrics.rr;

  return (
    <Box
      sx={{
        height: "auto",
        maxHeight: "100%",
        overflow: "auto",
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        bgcolor: "#ffffff",
        color: "#131722",
        fontFamily: FONT,
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, px: 1.75, pt: 1.5, pb: 1, flexShrink: 0 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ fontWeight: 700, fontSize: 18, lineHeight: 1.2 }}>Setup Review</Box>
          <Box sx={{ color: "#787b86", fontSize: 12, mt: 0.25, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {info?.name || bare}
          </Box>
        </Box>
        <Box
          sx={{
            px: 1.1,
            py: 0.45,
            borderRadius: "8px",
            bgcolor: "#e8f0fe",
            color: "#2962ff",
            fontWeight: 700,
            fontSize: 13,
            whiteSpace: "nowrap",
          }}
        >
          Score {desk && desk.verdict !== "WARMING" ? desk.score : "—"}
        </Box>
        <IconButton size="small" onClick={onClose} aria-label="Close" sx={{ color: "#787b86", p: 0.25 }}>
          <CloseIcon sx={{ fontSize: 18 }} />
        </IconButton>
      </Box>

      <Box sx={{ px: 1.5, minWidth: 0, pb: 1 }}>
        <Box
          sx={{
            display: "flex",
            gap: 1,
            alignItems: "flex-start",
            px: 1.25,
            py: 1,
            mb: 1.25,
            borderRadius: "10px",
            bgcolor: tone === "good" ? "#e8f7f1" : tone === "bad" ? "#fdecec" : tone === "warn" ? "#fff6e0" : "#f0f3fa",
          }}
        >
          <Box sx={{ color: tone === "good" ? "#089981" : tone === "bad" ? "#f23645" : "#e6a100", fontSize: 16, lineHeight: 1.2 }}>
            {tone === "good" ? "✓" : "!"}
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Box sx={{ fontWeight: 700, fontSize: 14 }}>{desk ? verdictTitle(desk.verdict) : "No position yet"}</Box>
            <Box sx={{ color: "#131722", fontSize: 13, mt: 0.15 }}>{bannerDetail}</Box>
          </Box>
        </Box>

        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, mb: 1.5 }}>
          <SideButton label="Short" active={armed === "short"} onClick={() => void place("short")} />
          <SideButton label="Long" active={armed === "long"} onClick={() => void place("long")} />
        </Box>

        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 1, mb: 1.5 }}>
          <PriceCell label="Entry" value={draft ? formatPrice(draft.entry, digits) : "—"} />
          <PriceCell label="Stop loss" value={draft ? formatPrice(draft.stop, digits) : "—"} />
          <PriceCell label="Take profit" value={draft ? formatPrice(draft.target, digits) : "—"} />
        </Box>

        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", mb: 1.25, py: 0.5 }}>
          <Box>
            <Box sx={{ color: "#787b86", fontSize: 12 }}>Reward / risk</Box>
            <Box sx={{ fontWeight: 700, fontSize: 18, color: rr != null && rr >= 2 ? "#089981" : "#131722" }}>
              {rr != null ? `${rr.toFixed(2)}×` : "—"}
            </Box>
          </Box>
          <Box>
            <Box sx={{ color: "#787b86", fontSize: 12 }}>Stop distance</Box>
            <Box sx={{ fontWeight: 700, fontSize: 18 }}>{stopAtr != null ? `${stopAtr.toFixed(2)} ATR` : "—"}</Box>
          </Box>
        </Box>

        <Section
          title="ICT checks"
          meta={desk ? `${align} align · ${review} to review` : "Place a position"}
          open={checksOpen}
          onToggle={() => setChecksOpen((open) => !open)}
        >
          {(desk?.reasons ?? []).map((reason) => (
            <CheckRow key={reason.text} tone={reason.tone} label={checkLabel(reason, armed)} />
          ))}
        </Section>

        <Section title="Market context" open={contextOpen} onToggle={() => setContextOpen((open) => !open)}>
          <ContextRow label="Structure" value={desk?.metrics.structureText ?? "—"} />
          <ContextRow label="Profile" value={desk?.metrics.profileWhere ?? "—"} />
          <ContextRow label="Equilibrium" value={desk?.metrics.dealingEq == null ? "—" : formatPrice(desk.metrics.dealingEq, digits)} />
          <ContextRow label="VWAP z" value={desk?.metrics.vwapZ == null ? "—" : desk.metrics.vwapZ.toFixed(2)} />
          <ContextRow label="15m efficiency" value={desk?.metrics.efficiencyM15 == null ? "—" : desk.metrics.efficiencyM15.toFixed(2)} />
          <ContextRow
            label="Vol rank"
            value={desk?.metrics.rvPercentile == null ? "—" : `${Math.round(desk.metrics.rvPercentile * 100)}th`}
          />
          <ContextRow
            label="Heat"
            value={desk?.metrics.heatP70Atr == null ? "not enough swings" : `${desk.metrics.heatP70Atr.toFixed(2)} ATR`}
          />
        </Section>
        {error ? <Box sx={{ color: "#f23645", fontSize: 12, mt: 1 }}>{error}</Box> : null}
      </Box>

      <Box sx={{ p: 1.5, pt: 1, flexShrink: 0 }}>
        <Button
          fullWidth
          variant="contained"
          onClick={() => void reviewSetup()}
          sx={{
            textTransform: "none",
            minHeight: 44,
            borderRadius: "10px",
            bgcolor: "#2962ff",
            fontFamily: FONT,
            fontWeight: 700,
            fontSize: 15,
            boxShadow: "none",
            "&:hover": { bgcolor: "#1e53e5", boxShadow: "none" },
          }}
        >
          Review setup
        </Button>
      </Box>
    </Box>
  );
}

function SideButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      aria-pressed={active}
      sx={{
        height: 40,
        border: 0,
        borderRadius: "10px",
        cursor: "pointer",
        fontFamily: FONT,
        fontWeight: 700,
        fontSize: 15,
        bgcolor: active ? "#2962ff" : "#f0f3fa",
        color: active ? "#fff" : "#131722",
      }}
    >
      {label}
    </Box>
  );
}

function PriceCell({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Box sx={{ color: "#787b86", fontSize: 12 }}>{label}</Box>
      <Box
        sx={{
          fontWeight: 700,
          fontSize: 16,
          fontVariantNumeric: "tabular-nums",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {value}
      </Box>
    </Box>
  );
}

function Section({
  title,
  meta,
  open,
  onToggle,
  children,
}: {
  title: string;
  meta?: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <Box sx={{ borderTop: "1px solid #e0e3eb", py: 0.5 }}>
      <Box
        component="button"
        type="button"
        onClick={onToggle}
        sx={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 1,
          border: 0,
          background: "transparent",
          cursor: "pointer",
          fontFamily: FONT,
          color: "#131722",
          py: 0.75,
          px: 0,
        }}
      >
        <Box sx={{ fontWeight: 700, fontSize: 14 }}>{title}</Box>
        <Box sx={{ flex: 1 }} />
        {meta ? (
          <Box sx={{ color: "#787b86", fontSize: 12, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {meta}
          </Box>
        ) : null}
        <Box sx={{ color: "#787b86", fontSize: 12, transform: open ? "rotate(180deg)" : "none" }}>⌃</Box>
      </Box>
      {open ? <Box sx={{ pb: 0.75 }}>{children}</Box> : null}
    </Box>
  );
}

function CheckRow({ tone, label }: { tone: SeatReason["tone"]; label: string }) {
  const good = tone === "good";
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1, py: 0.45, minWidth: 0 }}>
      <Box
        sx={{
          width: 18,
          height: 18,
          borderRadius: "50%",
          flexShrink: 0,
          display: "grid",
          placeItems: "center",
          bgcolor: good ? "#e8f7f1" : "#fff6e0",
          color: good ? "#089981" : "#e6a100",
          fontSize: 12,
          fontWeight: 700,
        }}
      >
        {good ? "✓" : "!"}
      </Box>
      <Box sx={{ fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</Box>
    </Box>
  );
}

function ContextRow({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.2fr)", gap: 1, py: 0.35, fontSize: 13 }}>
      <Box sx={{ color: "#787b86", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</Box>
      <Box sx={{ fontWeight: 600, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</Box>
    </Box>
  );
}
