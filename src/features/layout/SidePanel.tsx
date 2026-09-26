import Paper from "@mui/material/Paper";
import type { SidePanelId } from "@/application";
import { AlertsPanel } from "@/features/alerts/AlertsPanel";
import { DataWindowPanel } from "@/features/data-window/DataWindowPanel";
import { PineEditorPanel } from "@/features/pine/PineEditorPanel";
import { WatchlistPanel } from "@/features/watchlist/WatchlistPanel";

interface SidePanelProps {
  readonly panel: SidePanelId;
  readonly onClose: () => void;
  readonly onCreateAlert: () => void;
  readonly onOpenObjectTree?: () => void;
  readonly onRunPine?: (code: string) => Promise<{ ok: boolean; message: string }>;
  /** When true, panel floats over the chart (mobile) instead of shrinking it. */
  readonly overlay?: boolean;
}

const PANEL_WIDTH = 420;

export function SidePanel({
  panel,
  onClose,
  onCreateAlert,
  onOpenObjectTree,
  onRunPine,
  overlay = false,
}: SidePanelProps) {
  const pine = panel === "pine";
  return (
    <Paper
      square
      elevation={overlay ? 8 : 0}
      sx={{
        width: pine ? "100%" : { xs: `min(100%, ${PANEL_WIDTH}px)`, sm: 320 },
        height: "100%",
        display: "flex",
        flexDirection: "column",
        borderLeft: pine || overlay ? 0 : 1,
        borderColor: "divider",
        minHeight: 0,
        flex: 1,
        ...(overlay
          ? {
              position: "absolute",
              top: 0,
              right: 52,
              bottom: 0,
              zIndex: 20,
              maxWidth: "calc(100% - 52px)",
            }
          : {}),
      }}
    >
      {panel === "watchlist" ? <WatchlistPanel onClose={onClose} /> : null}
      {panel === "alerts" ? <AlertsPanel onClose={onClose} onCreate={onCreateAlert} /> : null}
      {panel === "data" ? <DataWindowPanel onClose={onClose} /> : null}
      {panel === "pine" ? (
        <PineEditorPanel onClose={onClose} onOpenObjectTree={onOpenObjectTree} onRun={onRunPine} />
      ) : null}
    </Paper>
  );
}
