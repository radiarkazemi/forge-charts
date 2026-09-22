import Paper from "@mui/material/Paper";
import type { SidePanelId } from "@/application";
import { AlertsPanel } from "@/features/alerts/AlertsPanel";
import { DataWindowPanel } from "@/features/data-window/DataWindowPanel";
import { WatchlistPanel } from "@/features/watchlist/WatchlistPanel";

interface SidePanelProps {
  readonly panel: SidePanelId;
  readonly onClose: () => void;
  readonly onCreateAlert: () => void;
}

const PANEL_WIDTH = 320;

export function SidePanel({ panel, onClose, onCreateAlert }: SidePanelProps) {
  return (
    <Paper
      square
      sx={{
        width: PANEL_WIDTH,
        display: "flex",
        flexDirection: "column",
        borderLeft: 1,
        borderColor: "divider",
        minHeight: 0,
      }}
    >
      {panel === "watchlist" ? <WatchlistPanel onClose={onClose} /> : null}
      {panel === "alerts" ? <AlertsPanel onClose={onClose} onCreate={onCreateAlert} /> : null}
      {panel === "data" ? <DataWindowPanel onClose={onClose} /> : null}
    </Paper>
  );
}
