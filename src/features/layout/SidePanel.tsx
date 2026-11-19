import Paper from "@mui/material/Paper";
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
  return (
    <Paper
      square
      elevation={overlay ? 8 : 0}
      sx={{
        width: pine
          ? "100%"
          : { xs: "100%", sm: panel === "seat" ? 360 : 320 },
        height: overlay && panel === "seat" ? "auto" : "100%",
        maxHeight: overlay && panel === "seat" ? "min(72%, 640px)" : undefined,
        display: "flex",
        flexDirection: "column",
        borderLeft: pine || overlay ? 0 : 1,
        borderColor: panel === "seat" ? "#e0e3eb" : "divider",
        bgcolor: panel === "seat" ? "#ffffff" : undefined,
        color: panel === "seat" ? "#131722" : undefined,
        minHeight: 0,
        flex: 1,
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
