import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Typography from "@mui/material/Typography";
import { useEffect, useState, type MouseEvent } from "react";
import { intervalSeconds } from "@/domain";
import { MOBILE_BOTTOM_BAR_HEIGHT } from "@/features/layout/mobile-chrome";
import { useStore } from "@/shared/hooks/useStore";
import type { BarReplayController, BarReplaySpeed } from "./bar-replay-controller";

interface BarReplayToolbarProps {
  readonly controller: BarReplayController;
  /** Show even if controller.active is briefly false (React click → enter race). */
  readonly forceVisible?: boolean;
}

const SPEEDS: readonly { value: BarReplaySpeed; label: string }[] = [
  { value: 0.5, label: "0.5×" },
  { value: 1, label: "1×" },
  { value: 2, label: "2×" },
  { value: 5, label: "5×" },
  { value: 10, label: "10×" },
];

const MENU_PAPER = {
  bgcolor: "#1c2030",
  border: "1px solid #2a2e39",
  color: "#d1d4dc",
} as const;

const iconBtn = {
  width: 32,
  height: 32,
  minWidth: 32,
  borderRadius: "6px",
  color: "#d1d4dc",
  transition: "background .12s ease, color .12s ease",
  "&:hover": { bgcolor: "rgba(255,255,255,0.08)", color: "#f0f3fa" },
  "&.active": { color: "#2962ff", bgcolor: "rgba(41,98,255,0.18)" },
  "&.Mui-disabled": { opacity: 0.32 },
  "&:focus-visible": { outline: "2px solid rgba(41,98,255,0.55)", outlineOffset: 1 },
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
 * TradingView-style Bar Replay strip — single compact row:
 * Select bar · jump/play/step · speed · TF+countdown · exit
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
      data-testid="bar-replay-toolbar"
      sx={{
        position: "absolute",
        left: "50%",
        bottom: {
          xs: `calc(${MOBILE_BOTTOM_BAR_HEIGHT}px + 10px + env(safe-area-inset-bottom, 0px))`,
          sm: 56,
        },
        transform: "translateX(-50%)",
        zIndex: 40,
        display: "flex",
        alignItems: "center",
        gap: 0.5,
        px: 1,
        py: 0.6,
        bgcolor: "rgba(19, 23, 34, 0.94)",
        border: "1px solid #2a2e39",
        borderTop: "2px solid #2962ff",
        borderRadius: "10px",
        boxShadow: "0 10px 28px rgba(0,0,0,0.55)",
        backdropFilter: "blur(10px)",
        pointerEvents: "auto",
        userSelect: "none",
        whiteSpace: "nowrap",
        maxWidth: "calc(100vw - 16px)",
      }}
    >
      <ButtonBase
        className={snap.selecting ? "active" : undefined}
        sx={{
          ...iconBtn,
          width: "auto",
          minWidth: 32,
          px: { xs: 0.5, sm: 1 },
          gap: 0.6,
          fontSize: 12,
          fontWeight: 700,
          color: snap.selecting ? "#5b8cff" : "#f0f3fa",
        }}
        onClick={openSelect}
        title="Select bar"
        aria-label="Select bar"
        aria-haspopup="menu"
      >
        <SelectBarIcon />
        <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>
          Select bar
        </Box>
      </ButtonBase>
      <Menu
        anchorEl={selectAnchor}
        open={Boolean(selectAnchor)}
        onClose={() => setSelectAnchor(null)}
        anchorOrigin={{ vertical: "top", horizontal: "left" }}
        transformOrigin={{ vertical: "bottom", horizontal: "left" }}
        slotProps={{ paper: { sx: { ...MENU_PAPER, minWidth: 168 } } }}
      >
        <MenuItem
          onClick={() => {
            setSelectAnchor(null);
            void controller.selectBar();
          }}
        >
          Select bar
        </MenuItem>
        <MenuItem
          onClick={() => {
            setSelectAnchor(null);
            void controller.jumpToRealtime();
          }}
        >
          Jump to realtime
        </MenuItem>
      </Menu>

      <Rule />

      <ButtonBase
        sx={iconBtn}
        title="Jump to start"
        aria-label="Jump to start"
        disabled={snap.startIndex < 0}
        onClick={() => void controller.jumpToStart()}
      >
        <JumpStartIcon />
      </ButtonBase>

      <ButtonBase
        sx={{
          ...iconBtn,
          bgcolor: playing ? "rgba(41,98,255,0.22)" : "transparent",
          color: playing ? "#5b8cff" : "#f0f3fa",
          "&:hover": {
            bgcolor: playing ? "rgba(41,98,255,0.32)" : "rgba(255,255,255,0.08)",
          },
        }}
        title={playing ? "Pause" : "Play"}
        aria-label={playing ? "Pause" : "Play"}
        disabled={snap.cursorIndex < 0}
        onClick={() => void controller.play()}
      >
        {playing ? <PauseIcon /> : <PlayIcon />}
      </ButtonBase>

      <ButtonBase
        sx={iconBtn}
        title="Forward one bar"
        aria-label="Forward one bar"
        disabled={!canStep && snap.formProgress <= 0}
        onClick={() => void controller.stepForward()}
      >
        <StepIcon />
      </ButtonBase>

      <Rule />

      <ButtonBase
        sx={{
          ...iconBtn,
          width: "auto",
          minWidth: 44,
          px: 0.85,
          gap: 0.3,
          fontSize: 12,
          fontWeight: 700,
          color: "#f0f3fa",
        }}
        title="Replay speed"
        aria-label="Replay speed"
        aria-haspopup="menu"
        onClick={openSpeed}
      >
        {speedMeta.label}
        <ChevronIcon />
      </ButtonBase>
      <Menu
        anchorEl={speedAnchor}
        open={Boolean(speedAnchor)}
        onClose={() => setSpeedAnchor(null)}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
        transformOrigin={{ vertical: "bottom", horizontal: "center" }}
        slotProps={{ paper: { sx: { ...MENU_PAPER, minWidth: 88 } } }}
      >
        {SPEEDS.map((s) => (
          <MenuItem
            key={s.value}
            selected={s.value === snap.speed}
            onClick={() => {
              controller.setSpeed(s.value);
              setSpeedAnchor(null);
            }}
            sx={{ "&.Mui-selected": { bgcolor: "rgba(41,98,255,0.18)" } }}
          >
            <Typography component="span" sx={{ fontWeight: 700, fontSize: 13 }}>
              {s.label}
            </Typography>
          </MenuItem>
        ))}
      </Menu>

      <Rule />

      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0.55,
          px: 0.4,
          minWidth: 76,
          justifyContent: "center",
        }}
      >
        <Typography
          component="span"
          sx={{ fontSize: 11, fontWeight: 700, color: "#8b919e", letterSpacing: 0.3 }}
        >
          {resolutionLabel}
        </Typography>
        <Box
          component="span"
          title="Time left on forming candle"
          sx={{
            fontFamily: '"Trebuchet MS", "Segoe UI", sans-serif',
            fontSize: 11,
            fontWeight: 700,
            color: "#f0f3fa",
            bgcolor: showCountdown ? "#2962ff" : "rgba(41,98,255,0.25)",
            borderRadius: "3px",
            px: "6px",
            py: "1px",
            lineHeight: 1.4,
            letterSpacing: 0.2,
            minWidth: 36,
            textAlign: "center",
            opacity: showCountdown ? 1 : 0.45,
          }}
        >
          {showCountdown ? countdown : "—"}
        </Box>
      </Box>

      <Rule />

      <ButtonBase
        sx={iconBtn}
        title="Exit Bar Replay"
        aria-label="Exit Bar Replay"
        onClick={() => void controller.exit()}
      >
        <CloseIcon />
      </ButtonBase>
    </Box>
  );
}

function Rule() {
  return <Box sx={{ width: 1, height: 18, bgcolor: "#363a45", mx: 0.15, flexShrink: 0 }} />;
}

function SelectBarIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path d="M4 2v14M4 9h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M11 6l4 3-4 3V6z" fill="currentColor" />
    </svg>
  );
}

function JumpStartIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 18 18" fill="currentColor" aria-hidden>
      <rect x="3" y="4" width="2.5" height="10" rx="0.5" />
      <path d="M15 4v10l-7-5 7-5z" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden>
      <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 18 18" fill="currentColor" aria-hidden>
      <path d="M5 3.5v11l10-5.5L5 3.5z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 18 18" fill="currentColor" aria-hidden>
      <rect x="4" y="3.5" width="3.5" height="11" rx="0.5" />
      <rect x="10.5" y="3.5" width="3.5" height="11" rx="0.5" />
    </svg>
  );
}

function StepIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 18 18" fill="currentColor" aria-hidden>
      <path d="M3 4v10l7-5L3 4z" />
      <rect x="12" y="4" width="2.5" height="10" rx="0.5" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M3 3l8 8M11 3L3 11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
