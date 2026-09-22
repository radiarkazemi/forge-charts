import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import FormatListBulletedIcon from "@mui/icons-material/FormatListBulleted";
import NotificationsNoneIcon from "@mui/icons-material/NotificationsNone";
import TableChartOutlinedIcon from "@mui/icons-material/TableChartOutlined";
import type { SidePanelId } from "@/application";

interface SideRailProps {
  readonly active: SidePanelId | null;
  readonly onToggle: (id: SidePanelId) => void;
}

const ITEMS: ReadonlyArray<{ id: SidePanelId; label: string; icon: typeof FormatListBulletedIcon }> = [
  { id: "watchlist", label: "Watchlist", icon: FormatListBulletedIcon },
  { id: "alerts", label: "Alerts", icon: NotificationsNoneIcon },
  { id: "data", label: "Data Window", icon: TableChartOutlinedIcon },
];

/** Vertical icon strip that toggles the side panels (mirrors TradingView's right bar). */
export function SideRail({ active, onToggle }: SideRailProps) {
  return (
    <Box
      component="nav"
      aria-label="Side panels"
      sx={{
        width: 44,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 0.5,
        py: 1,
        bgcolor: "background.paper",
        borderLeft: 1,
        borderColor: "divider",
      }}
    >
      {ITEMS.map(({ id, label, icon: Icon }) => (
        <Tooltip key={id} title={label} placement="left">
          <IconButton
            size="small"
            aria-label={label}
            aria-pressed={active === id}
            color={active === id ? "primary" : "default"}
            onClick={() => onToggle(id)}
            sx={{ bgcolor: active === id ? "action.selected" : undefined }}
          >
            <Icon fontSize="small" />
          </IconButton>
        </Tooltip>
      ))}
    </Box>
  );
}
