import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";
import FormatListBulletedIcon from "@mui/icons-material/FormatListBulleted";
import NotificationsNoneIcon from "@mui/icons-material/NotificationsNone";
import TableChartOutlinedIcon from "@mui/icons-material/TableChartOutlined";
import type { SidePanelId } from "@/application";

interface SideRailProps {
  readonly active: SidePanelId | null;
  readonly onToggle: (id: SidePanelId) => void;
  readonly onOpenObjectTree: () => void;
  /** Narrower hit targets / hide Data Window on phones. */
  readonly compact?: boolean;
}

const ITEMS: ReadonlyArray<{ id: SidePanelId; label: string; icon: typeof FormatListBulletedIcon; mobile?: boolean }> = [
  { id: "watchlist", label: "Watchlist", icon: FormatListBulletedIcon, mobile: true },
  { id: "alerts", label: "Alerts", icon: NotificationsNoneIcon, mobile: true },
  { id: "data", label: "Data Window", icon: TableChartOutlinedIcon },
];

/** Vertical icon strip that toggles the side panels (mirrors TradingView's right bar). */
export function SideRail({ active, onToggle, onOpenObjectTree, compact = false }: SideRailProps) {
  const items = compact ? ITEMS.filter((item) => item.mobile) : ITEMS;

  return (
    <Box
      component="nav"
      aria-label="Side panels"
      sx={{
        width: compact ? 40 : 44,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 0.5,
        py: 1,
        bgcolor: "background.paper",
        borderLeft: 1,
        borderColor: "divider",
        flexShrink: 0,
        zIndex: 21,
      }}
    >
      {items.map(({ id, label, icon: Icon }) => (
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
      <Box sx={{ flex: 1 }} />
      <Tooltip title="Object tree (layers)" placement="left">
        <IconButton size="small" aria-label="Object tree" onClick={onOpenObjectTree}>
          <AccountTreeOutlinedIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </Box>
  );
}
