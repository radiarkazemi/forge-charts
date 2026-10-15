import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Typography from "@mui/material/Typography";
import { useEffect, useState, type MouseEvent } from "react";
import { intervalSeconds } from "@/domain";
import { useStore } from "@/shared/hooks/useStore";
import type { BarReplayController, BarReplaySpeed } from "./bar-replay-controller";

interface BarReplayToolbarProps {
  readonly controller: BarReplayController;
  /** Show even if controller.active is briefly false (React click → enter race). */
  readonly forceVisible?: boolean;
}

const SPEEDS: readonly { value: BarReplaySpeed; label: string; hint: string }[] = [
  { value: 0.5, label: "0.5×", hint: "Half speed" },
  { value: 1, label: "1×", hint: "Realtime candle" },
  { value: 2, label: "2×", hint: "2× faster" },
  { value: 5, label: "5×", hint: "5× faster" },
  { value: 10, label: "10×", hint: "10× faster" },
];

const btnSx = {
  minWidth: 34,
  height: 34,
  px: 0.85,
  borderRadius: "6px",
  color: "#d1d4dc",
  fontSize: 13,
  fontWeight: 600,
  transition: "background .12s ease, color .12s ease",
  "&:hover": { bgcolor: "rgba(255,255,255,0.08)" },
  "&.active": { color: "#2962ff", bgcolor: "rgba(41,98,255,0.16)" },
  "&.Mui-disabled": { opacity: 0.35 },
} as const;

function formatRemain(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function stepMsFor(resolution: string): number {
  try {
    return Math.max(1_000, intervalSeconds(resolution) * 1_000);
  } catch {
    return 60_000;
  }
}

/**
 * TradingView-style floating Bar Replay bar (bottom of chart).
 * Select → transport → speed → TF / countdown → exit.
 */
export function BarReplayToolbar({ controller, forceVisible = false }: BarReplayToolbarProps) {
  const snap = useStore(controller.state);
  const [speedAnchor, setSpeedAnchor] = useState<null | HTMLElement>(null);
  const [selectAnchor, setSelectAnchor] = useState<null | HTMLElement>(null);
  const [countdown, setCountdown] = useState("0:00");

  useEffect(() => {
    if (!snap.active && !forceVisible) return;
    const tick = () => {
      const stepMs = stepMsFor(snap.resolution);
      // While a candle is forming (play or paused mid-bar), show remaining candle time.
      const progress =
        snap.cursorIndex >= 0 ? Math.min(1, Math.max(0, snap.formProgress)) : 0;
      const remain =
        snap.cursorIndex >= 0 && (snap.phase === "playing" || progress > 0)
          ? stepMs * (1 - progress)
          : snap.cursorIndex >= 0
            ? stepMs
            : 0;
      setCountdown(formatRemain(remain));
    };
    tick();
    const id = window.setInterval(tick, 200);
    return () => window.clearInterval(id);
  }, [
    snap.active,
    snap.resolution,
    snap.formProgress,
    snap.phase,
    snap.cursorIndex,
    forceVisible,
  ]);

  if (!snap.active && !forceVisible) return null;

  const playing = snap.phase === "playing";
  const canStep = snap.cursorIndex >= 0 && snap.cursorIndex < snap.bufferLength - 1;
  const resolutionLabel = controller.resolutionLabel();
  const speedMeta = SPEEDS.find((s) => s.value === snap.speed) ?? SPEEDS[1]!;
  const showCountdown = snap.cursorIndex >= 0;

  const openSpeed = (e: MouseEvent<HTMLElement>) => setSpeedAnchor(e.currentTarget);
  const openSelect = (e: MouseEvent<HTMLElement>) => setSelectAnchor(e.currentTarget);

  return (
    <Box
      sx={{
        position: "absolute",
        left: "50%",
        bottom: { xs: 100, sm: 56 },
        transform: "translateX(-50%)",
        zIndex: 30,
        display: "flex",
        alignItems: "center",
        gap: 0.5,
        px: 1.25,
        py: 0.85,
        bgcolor: "rgba(19, 23, 34, 0.96)",
        border: "1px solid #2a2e39",
        borderRadius: "12px",
        boxShadow: "0 10px 32px rgba(0,0,0,0.55)",
        backdropFilter: "blur(8px)",
        pointerEvents: "auto",
        userSelect: "none",
        whiteSpace: "nowrap",
        maxWidth: "calc(100vw - 24px)",
      }}
    >
      {/* Select */}
      <ButtonBase
        className={snap.selecting ? "active" : undefined}
        sx={{ ...btnSx, gap: 0.75, px: 1.1, minWidth: "auto" }}
        onClick={openSelect}
        title="Select bar"
      >
        <SelectBarIcon />
        <Typography
          component="span"
          sx={{
            fontSize: 13,
            fontWeight: 600,
            color: "inherit",
            display: { xs: "none", sm: "inline" },
          }}
        >
          Select
        </Typography>
        <ChevronIcon />
      </ButtonBase>

      <Menu
        anchorEl={selectAnchor}
        open={Boolean(selectAnchor)}
        onClose={() => setSelectAnchor(null)}
        anchorOrigin={{ vertical: "top", horizontal: "left" }}
        transformOrigin={{ vertical: "bottom", horizontal: "left" }}
        slotProps={{
          paper: {
            sx: {
              bgcolor: "#1c2030",
              border: "1px solid #2a2e39",
              color: "#d1d4dc",
              minWidth: 200,
            },
          },
        }}
      >
        <MenuItem
          onClick={() => {
            setSelectAnchor(null);
            void controller.selectBar();
          }}
        >
          Select bar on chart
        </MenuItem>
        {snap.cursorIndex >= 0 ? (
          <MenuItem
            onClick={() => {
              setSelectAnchor(null);
              void controller.jumpToStart();
            }}
          >
            Jump to start
          </MenuItem>
        ) : null}
      </Menu>

      <Divider />

      {/* Transport */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.15 }}>
        <ButtonBase
          sx={btnSx}
          title="Jump to start"
          disabled={snap.startIndex < 0}
          onClick={() => void controller.jumpToStart()}
        >
          <JumpStartIcon />
        </ButtonBase>

        <ButtonBase
          sx={{
            ...btnSx,
            minWidth: 40,
            height: 40,
            borderRadius: "10px",
            bgcolor: playing ? "rgba(41,98,255,0.2)" : "rgba(255,255,255,0.06)",
            color: playing ? "#5b8cff" : "#f0f3fa",
            "&:hover": { bgcolor: playing ? "rgba(41,98,255,0.3)" : "rgba(255,255,255,0.1)" },
          }}
          title={playing ? "Pause" : "Play"}
          disabled={snap.cursorIndex < 0}
          onClick={() => void controller.play()}
        >
          {playing ? <PauseIcon /> : <PlayIcon />}
        </ButtonBase>

        <ButtonBase
          sx={btnSx}
          title="Forward one bar"
          disabled={!canStep && snap.formProgress <= 0}
          onClick={() => void controller.stepForward()}
        >
          <StepIcon />
        </ButtonBase>
      </Box>

      <Divider />

      {/* Speed */}
      <ButtonBase
        sx={{ ...btnSx, minWidth: 52, gap: 0.4, px: 1 }}
        title="Playback speed — 1× forms each candle in real timeframe"
        onClick={openSpeed}
      >
        <Typography component="span" sx={{ fontSize: 13, fontWeight: 700, color: "#f0f3fa" }}>
          {speedMeta.label}
        </Typography>
        <ChevronIcon />
      </ButtonBase>
      <Menu
        anchorEl={speedAnchor}
        open={Boolean(speedAnchor)}
        onClose={() => setSpeedAnchor(null)}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
        transformOrigin={{ vertical: "bottom", horizontal: "center" }}
        slotProps={{
          paper: {
            sx: {
              bgcolor: "#1c2030",
              border: "1px solid #2a2e39",
              color: "#d1d4dc",
              minWidth: 180,
            },
          },
        }}
      >
        {SPEEDS.map((s) => (
          <MenuItem
            key={s.value}
            selected={s.value === snap.speed}
            onClick={() => {
              controller.setSpeed(s.value);
              setSpeedAnchor(null);
            }}
            sx={{
              display: "flex",
              justifyContent: "space-between",
              gap: 2,
              "&.Mui-selected": { bgcolor: "rgba(41,98,255,0.18)" },
            }}
          >
            <Typography component="span" sx={{ fontWeight: 700, fontSize: 13 }}>
              {s.label}
            </Typography>
            <Typography component="span" sx={{ fontSize: 12, color: "#787b86" }}>
              {s.hint}
            </Typography>
          </MenuItem>
        ))}
      </Menu>

      <Divider />

      {/* TF + countdown */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0.75,
          px: 0.5,
          minWidth: { xs: 72, sm: 108 },
        }}
      >
        <Typography
          component="span"
          sx={{ fontSize: 12, fontWeight: 700, color: "#8b919e", letterSpacing: 0.2 }}
        >
          {resolutionLabel}
        </Typography>
        {showCountdown ? (
          <Box
            component="span"
            title="Time left on forming candle"
            sx={{
              fontFamily: '"Trebuchet MS", "Segoe UI", sans-serif',
              fontSize: 12,
              fontWeight: 700,
              color: "#f0f3fa",
              bgcolor: "#2962ff",
              borderRadius: "4px",
              px: "7px",
              py: "2px",
              lineHeight: 1.35,
              letterSpacing: 0.2,
              minWidth: 40,
              textAlign: "center",
            }}
          >
            {countdown}
          </Box>
        ) : null}
      </Box>

      <ButtonBase
        sx={btnSx}
        title="Jump to realtime"
        onClick={() => void controller.jumpToRealtime()}
      >
        <RealtimeIcon />
      </ButtonBase>

      <Divider />

      <ButtonBase sx={btnSx} title="Close Bar Replay" onClick={() => void controller.exit()}>
        <CloseIcon />
      </ButtonBase>
    </Box>
  );
}

function Divider() {
  return <Box sx={{ width: 1, height: 22, bgcolor: "#363a45", mx: 0.35, flexShrink: 0 }} />;
}

function SelectBarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path d="M4 2v14M4 9h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M11 6l4 3-4 3V6z" fill="currentColor" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
      <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" />
    </svg>
  );
}

function JumpStartIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="currentColor" aria-hidden>
      <rect x="2" y="4" width="2" height="10" rx="0.5" />
      <path d="M15 4v10L7 9l8-5z" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="currentColor" aria-hidden>
      <path d="M5 3.5v11l10-5.5L5 3.5z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="currentColor" aria-hidden>
      <rect x="4" y="3.5" width="3.5" height="11" rx="0.5" />
      <rect x="10.5" y="3.5" width="3.5" height="11" rx="0.5" />
    </svg>
  );
}

function StepIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="currentColor" aria-hidden>
      <path d="M3 4v10l7-5L3 4z" />
      <rect x="12" y="4" width="2.5" height="10" rx="0.5" />
    </svg>
  );
}

function RealtimeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="currentColor" aria-hidden>
      <path d="M2 4v10l5.5-5L2 4z" />
      <path d="M8 4v10l5.5-5L8 4z" />
      <rect x="14.5" y="4" width="2" height="10" rx="0.5" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M3 3l8 8M11 3L3 11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
