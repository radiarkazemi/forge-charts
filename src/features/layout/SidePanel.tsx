import Paper from "@mui/material/Paper";
import type { SidePanelId } from "@/application";
import { AlertsPanel } from "@/features/alerts/AlertsPanel";
import { DataWindowPanel } from "@/features/data-window/DataWindowPanel";
import { WatchlistPanel } from "@/features/watchlist/WatchlistPanel";

interface SidePanelProps {
  readonly panel: SidePanelId;
  readonly onClose: () => void;
  readonly onCreateAlert: () => void;
  /** When true, panel floats over the chart (mobile) instead of shrinking it. */
  readonly overlay?: boolean;
}

const PANEL_WIDTH = 320;

export function SidePanel({ panel, onClose, onCreateAlert, overlay = false }: SidePanelProps) {
  return (
    <Paper
      square
      elevation={overlay ? 8 : 0}
      sx={{
        width: { xs: "min(100%, 320px)", sm: PANEL_WIDTH },
        display: "flex",
        flexDirection: "column",
        borderLeft: overlay ? 0 : 1,
        borderColor: "divider",
        minHeight: 0,
        ...(overlay
          ? {
              position: "absolute",
              top: 0,
              right: 44,
              bottom: 0,
              zIndex: 20,
              maxWidth: "calc(100% - 44px)",
            }
          : {}),
      }}
    >
      {panel === "watchlist" ? <WatchlistPanel onClose={onClose} /> : null}
      {panel === "alerts" ? <AlertsPanel onClose={onClose} onCreate={onCreateAlert} /> : null}
      {panel === "data" ? <DataWindowPanel onClose={onClose} /> : null}
    </Paper>
  );
}
