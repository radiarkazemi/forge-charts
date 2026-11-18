import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import TextField from "@mui/material/TextField";
import CloseIcon from "@mui/icons-material/Close";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServices } from "@/app/use-services";
import type { Bar } from "@/domain";
import { LONG_POSITION_ICON, SHORT_POSITION_ICON } from "@/features/chart/position-tool-icons";
import { useStore } from "@/shared/hooks/useStore";
import { analyzeSeat, type SeatDesk, type SeatSide } from "./engine";
import {
  createPosition,
  readPosition,
  readPositions,
  writePosition,
  type ChartPosition,
  type PositionChart,
  type PositionSide,
} from "./chart-position";

const FONT = '"Trebuchet MS","Segoe UI",Tahoma,sans-serif';
const NO_BARS: Bar[] = [];

interface SeatPanelProps {
  readonly onClose: () => void;
}

type FieldName = "entry" | "stop" | "target";

interface Draft {
  readonly side: PositionSide;
  readonly id: string | null;
  readonly entry: string;
  readonly stop: string;
  readonly target: string;
}

function chartApi(widget: unknown): PositionChart | null {
  const chart = (widget as { activeChart?: () => PositionChart } | null)?.activeChart?.();
  if (!chart || typeof chart.getAllShapes !== "function" || typeof chart.createShape !== "function") return null;
  return chart;
}

function formatPrice(value: number, digits: number): string {
  return value.toFixed(digits);
}

function parsePrice(value: string): number | null {
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function tone(verdict: string): string {
  if (verdict === "SEAT_OK" || verdict === "LOCATION_VALID") return "#089981";
  if (verdict === "THESIS_BROKEN" || verdict === "SPREAD_STRESS" || verdict === "DO_NOT_CHASE") return "#f23645";
  if (verdict === "REVIEW_STOP" || verdict === "WEAK_LOCATION") return "#ff9800";
  return "#d1d4dc";
}

export function SeatPanel({ onClose }: SeatPanelProps) {
  const { chart, marketData, quotes, symbols } = useServices();
  const symbol = useStore(chart.state, (s) => s.symbol);
  const quote = useStore(quotes.quotes, (book) => book[symbol]);
  const [m5, setM5] = useState<Bar[]>([]);
  const [h1, setH1] = useState<Bar[]>([]);
  const [loadedSymbol, setLoadedSymbol] = useState("");
  const [status, setStatus] = useState("Waiting for the chart");
  const [armed, setArmed] = useState<PositionSide | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [focus, setFocus] = useState<FieldName | null>(null);
  const [error, setError] = useState("");
  const [result, setResult] = useState<SeatDesk | null>(null);
  const [submittedKey, setSubmittedKey] = useState("");
  const focusRef = useRef<FieldName | null>(null);
  const draftRef = useRef<Draft | null>(null);
  useEffect(() => {
    focusRef.current = focus;
  }, [focus]);

  const digits = symbols.findByTicker(symbol)?.pricePrecision ?? 2;
  const bare = symbol.includes(":") ? symbol.slice(symbol.lastIndexOf(":") + 1) : symbol;

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
        setStatus(five.isSynthetic ? "Demo prices" : five.providerId);
      } catch (err) {
        if (cancel) return;
        setStatus(err instanceof Error ? err.message : "The feed did not answer.");
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 20_000);
    return () => {
      cancel = true;
      window.clearInterval(timer);
    };
  }, [marketData, symbol, symbols]);

  const applyFromChart = (next: ChartPosition | null) => {
    if (!next || focusRef.current) return;
    setDraft((current) => {
      if (
        current &&
        current.id === next.id &&
        current.entry === formatPrice(next.entry, digits) &&
        current.stop === formatPrice(next.stop, digits) &&
        current.target === formatPrice(next.target, digits)
      ) {
        return current;
      }
      return {
        side: next.side,
        id: next.id,
        entry: formatPrice(next.entry, digits),
        stop: formatPrice(next.stop, digits),
        target: formatPrice(next.target, digits),
      };
    });
    setArmed(next.side);
  };

  useEffect(() => {
    const pull = () => {
      const api = chartApi(chart.getWidget());
      if (!api) return;
      const rows = readPositions(api);
      const currentId = draftRef.current?.id;
      const match = (currentId ? rows.find((row) => row.id === currentId) : null) ?? rows.at(-1) ?? null;
      if (!match) {
        if (!focusRef.current) setDraft(null);
        return;
      }
      applyFromChart(match);
    };
    const stopDraw = chart.onDrawingEvent(() => pull());
    const stopTool = chart.onSelectedLineToolChanged(() => {
      const tool = (chart.selectedLineTool() ?? "").toLowerCase();
      if (tool.includes("short")) setArmed("short");
      else if (tool.includes("long")) setArmed("long");
    });
    const timer = window.setInterval(pull, 400);
    pull();
    return () => {
      stopDraw();
      stopTool();
      window.clearInterval(timer);
    };
    // draft id is read through a ref so the subscription stays stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chart, digits]);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  const barsReady = loadedSymbol === symbol;
  const readyM5 = barsReady ? m5 : NO_BARS;
  const readyH1 = barsReady ? h1 : NO_BARS;
  const entry = draft ? parsePrice(draft.entry) : null;
  const stop = draft ? parsePrice(draft.stop) : null;
  const target = draft ? parsePrice(draft.target) : null;
  const levelKey = draft ? `${draft.side}|${draft.entry}|${draft.stop}|${draft.target}` : "";
  const moved = result != null && submittedKey !== "" && submittedKey !== levelKey;

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
      applyFromChart(existing);
      await chart.exitDrawingTool();
      return;
    }
    const price = quote?.price ?? readyM5.at(-1)?.close;
    if (price == null || !(price > 0)) {
      await chart.selectLineTool(side === "long" ? "long_position" : "short_position");
      setStatus("Click the chart to place the position.");
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
      applyFromChart(placed ?? { id, side, entry: price, stop: stopPrice, target: targetPrice });
    } catch {
      await chart.selectLineTool(side === "long" ? "long_position" : "short_position");
    }
  };

  const commitField = (name: FieldName, value: string) => {
    const next = { ...(draft ?? { side: armed ?? "long", id: null, entry: "", stop: "", target: "" }), [name]: value };
    setDraft(next);
    const api = chartApi(chart.getWidget());
    const entryPrice = parsePrice(next.entry);
    const stopPrice = parsePrice(next.stop);
    const targetPrice = parsePrice(next.target);
    if (!api || !next.id || entryPrice == null || stopPrice == null || targetPrice == null) return;
    try {
      writePosition(api, next.id, next.side, entryPrice, stopPrice, targetPrice);
    } catch {
      /* the drawing can be removed while a field is focused */
    }
  };

  const submit = () => {
    if (!draft || entry == null || stop == null || target == null) {
      setError("Place a long or short position on the chart first.");
      return;
    }
    if (draft.side === "long" && stop >= entry) {
      setError("For a long, the stop sits below the entry.");
      return;
    }
    if (draft.side === "short" && stop <= entry) {
      setError("For a short, the stop sits above the entry.");
      return;
    }
    const price = quote?.price ?? readyM5.at(-1)?.close ?? 0;
    const desk = analyzeSeat(
      { M5: readyM5, H1: readyH1 },
      price > 0 ? { time: quote?.updatedAt ?? 0, bid: price, ask: price } : null,
      { side: draft.side as SeatSide, entry, stop, target },
      { digits, feedAgeSec: price > 0 || readyM5.length ? 0 : null },
    );
    setError("");
    setResult(desk);
    setSubmittedKey(levelKey);
  };

  const metrics = result?.metrics;
  const rows = useMemo(() => {
    if (!metrics) return [];
    return [
      ["ATR", metrics.atr == null ? "—" : metrics.atr.toFixed(digits)],
      ["Structure", metrics.structureText ?? "—"],
      ["Equilibrium", metrics.dealingEq == null ? "—" : metrics.dealingEq.toFixed(digits)],
      ["Profile", metrics.profileWhere ?? "—"],
      ["VWAP z", metrics.vwapZ == null ? "—" : metrics.vwapZ.toFixed(2)],
      ["Efficiency", metrics.efficiencyH1 == null ? "—" : metrics.efficiencyH1.toFixed(2)],
      ["Vol rank", metrics.rvPercentile == null ? "—" : `${Math.round(metrics.rvPercentile * 100)}th`],
      ["Heat", metrics.heatP70Atr == null ? "—" : `${metrics.heatP70Atr.toFixed(2)} ATR`],
      ["Stop", metrics.stopAtr == null ? "—" : `${metrics.stopAtr.toFixed(2)} ATR`],
    ];
  }, [digits, metrics]);

  const side = draft?.side ?? armed;
  const sell = side === "short";

  return (
    <Box
      sx={{
        height: "100%",
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        bgcolor: "#131722",
        color: "#d1d4dc",
        fontFamily: FONT,
        fontSize: 12,
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", height: 38, px: 1, borderBottom: "1px solid #2a2e39", flexShrink: 0 }}>
        <Box sx={{ fontWeight: 700, fontSize: 13, flex: 1 }}>Seat</Box>
        <Box sx={{ color: "#787b86", fontSize: 11, mr: 0.5 }}>{bare}</Box>
        <IconButton size="small" onClick={onClose} aria-label="Close" sx={{ color: "#787b86", p: 0.25 }}>
          <CloseIcon sx={{ fontSize: 16 }} />
        </IconButton>
      </Box>

      <Box sx={{ display: "flex", mx: 0.75, mt: 0.75, border: "1px solid #2a2e39", overflow: "hidden", flexShrink: 0 }}>
        <ToolButton
          label="Short"
          icon={SHORT_POSITION_ICON}
          active={side === "short"}
          activeBg="#f23645"
          idleColor="#f23645"
          onClick={() => void place("short")}
        />
        <ToolButton
          label="Long"
          icon={LONG_POSITION_ICON}
          active={side === "long"}
          activeBg="#2962ff"
          idleColor="#2962ff"
          onClick={() => void place("long")}
        />
      </Box>

      <Box sx={{ px: 1.25, pt: 0.75, color: "#787b86", fontSize: 11, flexShrink: 0 }}>
        {draft?.id
          ? "Drag the position on the chart, or edit the prices. Then submit."
          : "Choose Long or Short. The position tool drops on the chart."}
      </Box>

      <Box sx={{ px: 1.25, py: 1, overflow: "auto", flex: 1, minHeight: 0 }}>
        <Field
          label="Entry"
          value={draft?.entry ?? ""}
          onFocus={() => setFocus("entry")}
          onBlur={() => setFocus(null)}
          onChange={(value) => commitField("entry", value)}
        />
        <Field
          label="Stop loss"
          value={draft?.stop ?? ""}
          onFocus={() => setFocus("stop")}
          onBlur={() => setFocus(null)}
          onChange={(value) => commitField("stop", value)}
        />
        <Field
          label="Take profit"
          value={draft?.target ?? ""}
          onFocus={() => setFocus("target")}
          onBlur={() => setFocus(null)}
          onChange={(value) => commitField("target", value)}
        />

        {result ? (
          <Box sx={{ bgcolor: "#1e222d", borderRadius: "2px", px: 1, py: 0.75, mt: 0.5 }}>
            <Box sx={{ color: tone(result.verdict), fontSize: 11, fontWeight: 700, letterSpacing: "0.04em" }}>
              {result.verdict.replaceAll("_", " ")}
            </Box>
            <Box sx={{ fontWeight: 700, fontSize: 14, lineHeight: 1.25, mt: 0.25 }}>{result.headline}</Box>
            <Box sx={{ color: "#787b86", mt: 0.5, lineHeight: 1.35 }}>{result.summary}</Box>
            <Box sx={{ display: "flex", justifyContent: "space-between", mt: 0.6, fontWeight: 600 }}>
              <Box sx={{ color: "#787b86" }}>Score</Box>
              <Box>{result.verdict === "WARMING" ? "—" : result.score}</Box>
            </Box>
            {result.reasons.map((reason) => (
              <Box
                key={reason.text}
                sx={{
                  mt: 0.6,
                  pl: 0.75,
                  borderLeft: "2px solid",
                  borderColor: reason.tone === "good" ? "#089981" : reason.tone === "bad" ? "#f23645" : "#ff9800",
                  color: "#d1d4dc",
                  lineHeight: 1.35,
                }}
              >
                {reason.text}
              </Box>
            ))}
            <Box sx={{ mt: 0.75, pt: 0.5, borderTop: "1px solid #2a2e39" }}>
              {rows.map(([label, value]) => (
                <Box key={label} sx={{ display: "flex", justifyContent: "space-between", gap: 1, py: 0.2 }}>
                  <Box sx={{ color: "#787b86" }}>{label}</Box>
                  <Box sx={{ fontWeight: 600, textAlign: "right" }}>{value}</Box>
                </Box>
              ))}
            </Box>
            {moved ? <Box sx={{ color: "#ff9800", mt: 0.6 }}>The position moved. Submit again.</Box> : null}
          </Box>
        ) : (
          <Box sx={{ color: "#787b86", fontSize: 11 }}>{status}</Box>
        )}
        {error ? <Box sx={{ color: "#f23645", mt: 0.75 }}>{error}</Box> : null}
      </Box>

      <Box sx={{ p: 1, borderTop: "1px solid #2a2e39", flexShrink: 0 }}>
        <Button
          fullWidth
          variant="contained"
          onClick={submit}
          sx={{
            textTransform: "none",
            minHeight: 40,
            borderRadius: "4px",
            bgcolor: sell ? "#f23645" : "#2962ff",
            fontFamily: FONT,
            fontWeight: 700,
            fontSize: 14,
            boxShadow: "none",
            "&:hover": { bgcolor: sell ? "#e53935" : "#1e53e5", boxShadow: "none" },
          }}
        >
          Submit
        </Button>
      </Box>
    </Box>
  );
}

function ToolButton({
  label,
  icon,
  active,
  activeBg,
  idleColor,
  onClick,
}: {
  label: string;
  icon: string;
  active: boolean;
  activeBg: string;
  idleColor: string;
  onClick: () => void;
}) {
  return (
    <Box
      component="button"
      type="button"
      aria-pressed={active}
      onClick={onClick}
      sx={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 0.5,
        py: 0.75,
        border: 0,
        cursor: "pointer",
        fontFamily: FONT,
        fontWeight: 700,
        fontSize: 13,
        bgcolor: active ? activeBg : "#1e222d",
        color: active ? "#fff" : idleColor,
        "& svg": { width: 22, height: 22 },
      }}
      dangerouslySetInnerHTML={{ __html: `${icon}<span>${label}</span>` }}
    />
  );
}

function Field({
  label,
  value,
  onChange,
  onFocus,
  onBlur,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onFocus: () => void;
  onBlur: () => void;
}) {
  return (
    <Box sx={{ mb: 1 }}>
      <Box sx={{ color: "#787b86", fontSize: 11, mb: 0.35 }}>{label}</Box>
      <TextField
        size="small"
        fullWidth
        value={value}
        placeholder="—"
        onFocus={onFocus}
        onBlur={onBlur}
        onChange={(event) => onChange(event.target.value)}
        slotProps={{ htmlInput: { inputMode: "decimal", style: { fontSize: 16 } } }}
        sx={{
          "& .MuiInputBase-root": { height: 30, fontSize: 13, bgcolor: "#1e222d", borderRadius: "2px" },
          input: { color: "#d1d4dc", py: 0, fontFamily: FONT },
          "& fieldset": { borderColor: "#363a45" },
          "& .MuiInputBase-root.Mui-focused fieldset": { borderColor: "#2962ff" },
        }}
      />
    </Box>
  );
}
