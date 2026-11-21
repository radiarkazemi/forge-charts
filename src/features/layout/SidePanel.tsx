import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import { useEffect, useRef, useState } from "react";
import type { SidePanelId } from "@/application";
import { AlertsPanel } from "@/features/alerts/AlertsPanel";
import { DataWindowPanel } from "@/features/data-window/DataWindowPanel";
import { PineEditorPanel } from "@/features/pine/PineEditorPanel";
import { SeatPanel } from "@/features/seat/SeatPanel";
import { WatchlistPanel } from "@/features/watchlist/WatchlistPanel";
import { RAIL_WIDTH_COMPACT } from "./mobile-chrome";

interface SidePanelProps {
  readonly panel: SidePanelId;
  readonly onClose: () => void;
  readonly onCreateAlert: () => void;
  readonly onOpenObjectTree?: () => void;
  readonly onRunPine?: (code: string) => Promise<{ ok: boolean; message: string }>;
  /** When true, panel floats over the chart (mobile) instead of shrinking it. */
  readonly overlay?: boolean;
  /** Offset from the right edge when overlaying (matches compact rail). */
  readonly overlayRight?: number;
}

const SEAT_WIDTH_KEY = "forge.seat.width";

function storedSeatWidth(): number {
  try {
    const saved = Number(localStorage.getItem(SEAT_WIDTH_KEY));
    if (saved >= 240 && saved <= 480) return saved;
  } catch {
    /* storage can be blocked */
  }
  return 280;
}

export function SidePanel({
  panel,
  onClose,
  onCreateAlert,
  onOpenObjectTree,
  onRunPine,
  overlay = false,
  overlayRight = RAIL_WIDTH_COMPACT,
}: SidePanelProps) {
  const pine = panel === "pine";
  const seat = panel === "seat";
  const [seatWidth, setSeatWidth] = useState(storedSeatWidth);
  const drag = useRef<{ x: number; width: number } | null>(null);
  useEffect(() => {
    if (!seat || overlay) return;
    try {
      localStorage.setItem(SEAT_WIDTH_KEY, String(seatWidth));
    } catch {
      /* ignore */
    }
  }, [overlay, seat, seatWidth]);
  return (
    <Paper
      square
      elevation={overlay ? 8 : 0}
      sx={{
        width: pine ? "100%" : seat ? (overlay ? "100%" : seatWidth) : 320,
        height: seat ? "auto" : "100%",
        maxHeight: overlay && seat ? "min(72%, 640px)" : seat ? "100%" : undefined,
        display: "flex",
        flexDirection: "column",
        borderLeft: pine || overlay ? 0 : 1,
        borderColor: seat ? "#e0e3eb" : "divider",
        bgcolor: seat ? "#ffffff" : undefined,
        color: seat ? "#131722" : undefined,
        minHeight: 0,
        minWidth: 0,
        overflow: seat ? "hidden" : undefined,
        position: "relative",
        alignSelf: seat && !overlay ? "flex-start" : undefined,
        flex: seat ? "0 0 auto" : 1,
        ...(overlay
          ? panel === "seat"
            ? {
                position: "absolute",
                left: 8,
                right: 8,
                bottom: 8,
                top: "auto",
                zIndex: 20,
                width: "auto",
                maxWidth: "none",
                borderRadius: "16px",
                overflow: "hidden",
                pointerEvents: "auto",
                boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
              }
            : {
                position: "absolute",
                top: 0,
                right: overlayRight,
                bottom: 0,
                zIndex: 20,
                width: `calc(100% - ${overlayRight}px)`,
                maxWidth: `calc(100% - ${overlayRight}px)`,
                boxShadow: "-8px 0 24px rgba(0,0,0,0.35)",
              }
          : {}),
      }}
    >
      {seat && !overlay ? (
        <Box
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize Setup Review"
          onPointerDown={(event) => {
            drag.current = { x: event.clientX, width: seatWidth };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (!drag.current) return;
            const next = Math.min(480, Math.max(240, Math.round(drag.current.width + drag.current.x - event.clientX)));
            setSeatWidth(next);
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
          sx={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: 8,
            cursor: "col-resize",
            zIndex: 3,
            touchAction: "none",
            "&:hover": { bgcolor: "rgba(41,98,255,0.28)" },
          }}
        />
      ) : null}
      {panel === "watchlist" ? <WatchlistPanel onClose={onClose} /> : null}
      {panel === "alerts" ? <AlertsPanel onClose={onClose} onCreate={onCreateAlert} /> : null}
      {panel === "data" ? <DataWindowPanel onClose={onClose} /> : null}
      {panel === "seat" ? <SeatPanel onClose={onClose} /> : null}
      {panel === "pine" ? (
        <PineEditorPanel onClose={onClose} onOpenObjectTree={onOpenObjectTree} onRun={onRunPine} />
      ) : null}
    </Paper>
  );
}
