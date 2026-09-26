import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Typography from "@mui/material/Typography";
import { useState, type MouseEvent } from "react";
import { useStore } from "@/shared/hooks/useStore";
import type { BarReplayController, BarReplaySpeed } from "./bar-replay-controller";

interface BarReplayToolbarProps {
  readonly controller: BarReplayController;
  /** Show even if controller.active is briefly false (React click → enter race). */
  readonly forceVisible?: boolean;
}

const SPEEDS: BarReplaySpeed[] = [0.5, 1, 2, 5, 10];

const btnSx = {
  minWidth: 32,
  height: 32,
  px: 0.75,
  borderRadius: "4px",
  color: "#d1d4dc",
  fontSize: 13,
  fontWeight: 600,
  "&:hover": { bgcolor: "rgba(255,255,255,0.08)" },
  "&.active": { color: "#2962ff", bgcolor: "rgba(41,98,255,0.12)" },
} as const;

/**
 * TradingView-style floating Bar Replay bar (bottom of chart).
 * Select bar → play / step / speed → jump to realtime / close.
 */
export function BarReplayToolbar({ controller, forceVisible = false }: BarReplayToolbarProps) {
  const snap = useStore(controller.state);
  const [speedAnchor, setSpeedAnchor] = useState<null | HTMLElement>(null);
  const [selectAnchor, setSelectAnchor] = useState<null | HTMLElement>(null);

  if (!snap.active && !forceVisible) return null;

  const playing = snap.phase === "playing";
  const canStep = snap.cursorIndex >= 0 && snap.cursorIndex < snap.bufferLength - 1;
  const resolutionLabel = controller.resolutionLabel();

  const openSpeed = (e: MouseEvent<HTMLElement>) => setSpeedAnchor(e.currentTarget);
  const openSelect = (e: MouseEvent<HTMLElement>) => setSelectAnchor(e.currentTarget);

  return (
    <Box
      sx={{
        position: "absolute",
        left: "50%",
        bottom: { xs: 64, sm: 52 },
        transform: "translateX(-50%)",
        zIndex: 30,
        display: "flex",
        alignItems: "center",
        gap: 0.25,
        px: 1.25,
        py: 0.75,
        bgcolor: "#131722",
        border: "1px solid #2a2e39",
        borderRadius: "8px",
        boxShadow: "0 8px 24px rgba(0,0,0,0.55)",
        pointerEvents: "auto",
        userSelect: "none",
        whiteSpace: "nowrap",
      }}
    >
      <ButtonBase
        className={snap.selecting ? "active" : undefined}
        sx={{ ...btnSx, gap: 0.75, px: 1, minWidth: "auto" }}
        onClick={openSelect}
        title="Select bar"
      >
        <SelectBarIcon />
        <Typography component="span" sx={{ fontSize: 13, fontWeight: 600, color: "inherit" }}>
          Select bar
        </Typography>
        <ChevronIcon />
      </ButtonBase>

      <Menu
        anchorEl={selectAnchor}
        open={Boolean(selectAnchor)}
        onClose={() => setSelectAnchor(null)}
        anchorOrigin={{ vertical: "top", horizontal: "left" }}
        transformOrigin={{ vertical: "bottom", horizontal: "left" }}
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

      <ButtonBase
        sx={btnSx}
        title="Jump to start"
        disabled={snap.startIndex < 0}
        onClick={() => void controller.jumpToStart()}
      >
        <JumpStartIcon />
      </ButtonBase>

      <ButtonBase
        sx={btnSx}
        title={playing ? "Pause" : "Play"}
        disabled={snap.cursorIndex < 0}
        onClick={() => void controller.play()}
      >
        {playing ? <PauseIcon /> : <PlayIcon />}
      </ButtonBase>

      <ButtonBase
        sx={btnSx}
        title="Forward one bar"
        disabled={!canStep}
        onClick={() => void controller.stepForward()}
      >
        <StepIcon />
      </ButtonBase>

      <ButtonBase sx={{ ...btnSx, minWidth: 40 }} title="Playback speed" onClick={openSpeed}>
        {snap.speed}x
      </ButtonBase>
      <Menu
        anchorEl={speedAnchor}
        open={Boolean(speedAnchor)}
        onClose={() => setSpeedAnchor(null)}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
        transformOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        {SPEEDS.map((s) => (
          <MenuItem
            key={s}
            selected={s === snap.speed}
            onClick={() => {
              controller.setSpeed(s);
              setSpeedAnchor(null);
            }}
          >
            {s}x
          </MenuItem>
        ))}
      </Menu>

      <Typography
        component="span"
        sx={{ px: 0.75, fontSize: 12, fontWeight: 600, color: "#787b86", minWidth: 28, textAlign: "center" }}
      >
        {resolutionLabel}
      </Typography>

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
  return <Box sx={{ width: 1, height: 18, bgcolor: "#363a45", mx: 0.5 }} />;
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
