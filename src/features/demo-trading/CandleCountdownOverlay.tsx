import Box from "@mui/material/Box";
import { useEffect, useState } from "react";
import { useServices } from "@/app/use-services";
import { intervalSeconds, isMarketSessionOpen } from "@/domain";
import { useStore } from "@/shared/hooks/useStore";
import { resolutionToStepMs } from "./demo-space-controller";

function formatRemain(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function replayStepMs(resolution: string): number {
  try {
    return Math.max(1_000, intervalSeconds(resolution) * 1_000);
  } catch {
    return resolutionToStepMs(resolution);
  }
}

/**
 * TradingView-style candle close countdown (price-scale companion).
 * Uses bar-replay / demo-space form progress when active; otherwise wall-clock.
 * Hidden when the real market session is closed (unless replay/demo is running).
 */
export function CandleCountdownOverlay() {
  const { demoSpace, barReplay, chart, symbols } = useServices();
  const space = useStore(demoSpace.state);
  const replay = useStore(barReplay.state);
  const interval = useStore(chart.state, (s) => s.interval);
  const ticker = useStore(chart.state, (s) => s.symbol);
  const [label, setLabel] = useState("0:00");
  const [sessionOpen, setSessionOpen] = useState(true);

  useEffect(() => {
    const tick = () => {
      const info = symbols.findByTicker(ticker);
      const replayOn = replay.active && replay.cursorIndex >= 0;
      const open = space.active || replayOn || !info || isMarketSessionOpen(info);
      setSessionOpen(open);
      if (!open) {
        setLabel("0:00");
        return;
      }
      if (space.active && space.stepMs > 0) {
        const remain = space.stepMs * (1 - space.formProgress);
        setLabel(formatRemain(remain));
        return;
      }
      if (replayOn) {
        const stepMs = replayStepMs(replay.resolution);
        const progress = Math.min(1, Math.max(0, replay.formProgress));
        const remain =
          replay.phase === "playing" || progress > 0 ? stepMs * (1 - progress) : stepMs;
        setLabel(formatRemain(remain));
        return;
      }
      const stepMs = resolutionToStepMs(String(interval));
      const now = Date.now();
      const remain = stepMs - (now % stepMs);
      setLabel(formatRemain(remain));
    };
    tick();
    const id = window.setInterval(tick, 200);
    return () => window.clearInterval(id);
  }, [
    space.active,
    space.stepMs,
    space.formProgress,
    replay.active,
    replay.cursorIndex,
    replay.resolution,
    replay.formProgress,
    replay.phase,
    interval,
    ticker,
    symbols,
  ]);

  // Hide on daily+ (TV has no intraday countdown there).
  const replayOn = replay.active && replay.cursorIndex >= 0;
  const stepMs = space.active
    ? space.stepMs
    : replayOn
      ? replayStepMs(replay.resolution)
      : resolutionToStepMs(String(interval));
  if (stepMs >= 24 * 60 * 60_000) return null;
  // Market closed → no countdown (matches TradingView endofday freeze).
  if (!sessionOpen) return null;

  return (
    <Box
      sx={{
        position: "absolute",
        right: 4,
        top: 72,
        zIndex: 5,
        pointerEvents: "none",
        fontFamily: '"Trebuchet MS", "Segoe UI", sans-serif',
        fontSize: 11,
        fontWeight: 600,
        color: "#d1d4dc",
        bgcolor: "#2962ff",
        borderRadius: "2px",
        px: "5px",
        py: "1px",
        lineHeight: 1.25,
        letterSpacing: 0.15,
        boxShadow: "0 1px 2px rgba(0,0,0,0.4)",
      }}
      title="Time to candle close"
    >
      {label}
    </Box>
  );
}
