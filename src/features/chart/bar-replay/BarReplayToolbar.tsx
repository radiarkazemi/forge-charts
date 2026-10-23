import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Typography from "@mui/material/Typography";
import { useState, type MouseEvent } from "react";
import { MOBILE_BOTTOM_BAR_HEIGHT } from "@/features/layout/mobile-chrome";
import { useStore } from "@/shared/hooks/useStore";
import type { BarReplayController, BarReplaySpeed } from "./bar-replay-controller";

interface BarReplayToolbarProps {
  readonly controller: BarReplayController;
  /** Show even if controller.active is briefly false (React click → enter race). */
  readonly forceVisible?: boolean;
}

const SPEEDS: readonly { value: BarReplaySpeed; label: string }[] = [
  { value: 0.5, label: "0.5x" },
  { value: 1, label: "1x" },
  { value: 2, label: "2x" },
  { value: 5, label: "5x" },
  { value: 10, label: "10x" },
];

const MENU_PAPER = {
  bgcolor: "#1e222d",
  border: "1px solid #2a2e39",
  color: "#d1d4dc",
  mt: 0.5,
} as const;

const iconBtn = {
  width: 28,
  height: 28,
  minWidth: 28,
  borderRadius: "4px",
  color: "#b2b5be",
  transition: "background .12s ease, color .12s ease",
  "&:hover": { bgcolor: "rgba(255,255,255,0.06)", color: "#f0f3fa" },
  "&.Mui-disabled": { opacity: 0.28 },
  "&:focus-visible": { outline: "2px solid rgba(41,98,255,0.5)", outlineOffset: 1 },
} as const;

/**
 * TradingView Bar Replay navbar — full-width bottom strip, controls right-aligned:
 * [Select bar ▾] | ▶  ▶|  1x  5m | ▶||  ✕
 */
export function BarReplayToolbar({ controller, forceVisible = false }: BarReplayToolbarProps) {
  const snap = useStore(controller.state);
  const [speedAnchor, setSpeedAnchor] = useState<null | HTMLElement>(null);
  const [selectAnchor, setSelectAnchor] = useState<null | HTMLElement>(null);

  if (!snap.active && !forceVisible) return null;

  const playing = snap.phase === "playing";
  const canStep = snap.cursorIndex >= 0 && snap.cursorIndex < snap.bufferLength - 1;
  const resolutionLabel = controller.resolutionLabel();
  const speedMeta = SPEEDS.find((s) => s.value === snap.speed) ?? SPEEDS[1]!;

  const openSpeed = (e: MouseEvent<HTMLElement>) => setSpeedAnchor(e.currentTarget);
  const openSelect = (e: MouseEvent<HTMLElement>) => setSelectAnchor(e.currentTarget);

  return (
    <Box
      data-testid="bar-replay-toolbar"
      sx={{
        // TradingView-style strip pinned to the bottom of the chart pane.
        position: "absolute",
        left: 0,
        right: 0,
        bottom: {
          xs: `calc(${MOBILE_BOTTOM_BAR_HEIGHT}px + env(safe-area-inset-bottom, 0px))`,
          sm: 0,
        },
        zIndex: 40,
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        height: 36,
        px: 1.25,
        bgcolor: "#131722",
        borderTop: "1px solid #2a2e39",
        pointerEvents: "auto",
        userSelect: "none",
        whiteSpace: "nowrap",
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0.25,
          maxWidth: "100%",
        }}
      >
        {/* Select bar — primary click selects; chevron opens jump menu */}
        <Box
          sx={{
            display: "flex",
            alignItems: "stretch",
            height: 28,
            borderRadius: "6px",
            overflow: "hidden",
            bgcolor: snap.selecting ? "rgba(41,98,255,0.16)" : "#2a2e39",
          }}
        >
          <ButtonBase
            onClick={() => void controller.selectBar()}
            title="Select bar"
            aria-label="Select bar"
            sx={{
              height: 28,
              px: 1,
              gap: 0.65,
              color: snap.selecting ? "#5b8cff" : "#d1d4dc",
              fontSize: 13,
              fontWeight: 500,
              letterSpacing: 0.1,
              "&:hover": { bgcolor: "rgba(255,255,255,0.04)", color: "#f0f3fa" },
            }}
          >
            <SelectBarIcon />
            <Box component="span" sx={{ display: { xs: "none", sm: "inline" }, lineHeight: 1 }}>
              Select bar
            </Box>
          </ButtonBase>
          <ButtonBase
            onClick={openSelect}
            title="More replay options"
            aria-label="More replay options"
            aria-haspopup="menu"
            sx={{
              width: 22,
              height: 28,
              color: snap.selecting ? "#5b8cff" : "#b2b5be",
              borderLeft: "1px solid rgba(255,255,255,0.06)",
              "&:hover": { bgcolor: "rgba(255,255,255,0.04)", color: "#f0f3fa" },
            }}
          >
            <ChevronIcon />
          </ButtonBase>
        </Box>
        <Menu
          anchorEl={selectAnchor}
          open={Boolean(selectAnchor)}
          onClose={() => setSelectAnchor(null)}
          anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
          transformOrigin={{ vertical: "top", horizontal: "left" }}
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
            disabled={snap.startIndex < 0}
            onClick={() => {
              setSelectAnchor(null);
              void controller.jumpToStart();
            }}
          >
            Jump to start
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

        {/* Play / Pause */}
        <ButtonBase
          sx={{
            ...iconBtn,
            color: playing ? "#2962ff" : "#b2b5be",
          }}
          title={playing ? "Pause" : "Play"}
          aria-label={playing ? "Pause" : "Play"}
          disabled={snap.cursorIndex < 0}
          onClick={() => void controller.play()}
        >
          {playing ? <PauseIcon /> : <PlayIcon />}
        </ButtonBase>

        {/* Step forward */}
        <ButtonBase
          sx={iconBtn}
          title="Forward one bar"
          aria-label="Forward one bar"
          disabled={!canStep && snap.formProgress <= 0}
          onClick={() => void controller.stepForward()}
        >
          <StepIcon />
        </ButtonBase>

        {/* Speed */}
        <ButtonBase
          sx={{
            ...iconBtn,
            width: "auto",
            minWidth: 28,
            px: 0.65,
            fontSize: 13,
            fontWeight: 500,
            color: "#d1d4dc",
          }}
          title="Replay speed"
          aria-label="Replay speed"
          aria-haspopup="menu"
          onClick={openSpeed}
        >
          {speedMeta.label}
        </ButtonBase>
        <Menu
          anchorEl={speedAnchor}
          open={Boolean(speedAnchor)}
          onClose={() => setSpeedAnchor(null)}
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
          transformOrigin={{ vertical: "top", horizontal: "center" }}
          slotProps={{ paper: { sx: { ...MENU_PAPER, minWidth: 80 } } }}
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
              <Typography component="span" sx={{ fontWeight: 600, fontSize: 13 }}>
                {s.label}
              </Typography>
            </MenuItem>
          ))}
        </Menu>

        {/* Timeframe */}
        <Box
          component="span"
          title="Chart interval"
          sx={{
            px: 0.65,
            fontSize: 13,
            fontWeight: 500,
            color: "#d1d4dc",
            lineHeight: "28px",
            minWidth: 28,
            textAlign: "center",
          }}
        >
          {resolutionLabel}
        </Box>

        <Rule />

        {/* Jump to realtime */}
        <ButtonBase
          sx={iconBtn}
          title="Jump to realtime"
          aria-label="Jump to realtime"
          onClick={() => void controller.jumpToRealtime()}
        >
          <JumpRealtimeIcon />
        </ButtonBase>

        {/* Close */}
        <ButtonBase
          sx={iconBtn}
          title="Exit Bar Replay"
          aria-label="Exit Bar Replay"
          onClick={() => void controller.exit()}
        >
          <CloseIcon />
        </ButtonBase>
      </Box>
    </Box>
  );
}

function Rule() {
  return (
    <Box
      sx={{
        width: "1px",
        height: 18,
        bgcolor: "#2a2e39",
        mx: 0.55,
        flexShrink: 0,
      }}
    />
  );
}

/** Vertical bar with arrow pointing left into it (TV “Select bar”). */
function SelectBarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path d="M12.5 3.5v11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path
        d="M10 9H4.5M6.2 6.6L3.6 9l2.6 2.4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
      <path
        d="M2.2 3.6L5 6.4L7.8 3.6"
        stroke="currentColor"
        strokeWidth="1.35"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path
        d="M6 4.2v9.6l8-4.8-8-4.8z"
        stroke="currentColor"
        strokeWidth="1.45"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 18 18" fill="currentColor" aria-hidden>
      <rect x="5" y="4" width="2.8" height="10" rx="0.6" />
      <rect x="10.2" y="4" width="2.8" height="10" rx="0.6" />
    </svg>
  );
}

function StepIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path
        d="M4.2 4.4v9.2l6.6-4.6-6.6-4.6z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
        fill="none"
      />
      <path d="M13.2 4.2v9.6" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" />
    </svg>
  );
}

/** ▶|| — jump to live / end replay (TradingView). */
function JumpRealtimeIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path
        d="M3.5 4.4v9.2l6.2-4.6-6.2-4.6z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
        fill="none"
      />
      <path d="M11.6 4.2v9.6M14.2 4.2v9.6" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M3 3l8 8M11 3L3 11" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" />
    </svg>
  );
}
