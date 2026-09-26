import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import BookmarkBorderOutlinedIcon from "@mui/icons-material/BookmarkBorderOutlined";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import LayersOutlinedIcon from "@mui/icons-material/LayersOutlined";
import ChatBubbleOutlineOutlinedIcon from "@mui/icons-material/ChatBubbleOutlineOutlined";
import RadarIcon from "@mui/icons-material/Radar";
import CalendarMonthOutlinedIcon from "@mui/icons-material/CalendarMonthOutlined";
import CellTowerOutlinedIcon from "@mui/icons-material/CellTowerOutlined";
import NotificationsNoneIcon from "@mui/icons-material/NotificationsNone";
import AppsIcon from "@mui/icons-material/Apps";
import HelpOutlineOutlinedIcon from "@mui/icons-material/HelpOutlineOutlined";
import SvgIcon from "@mui/material/SvgIcon";
import type { SvgIconProps } from "@mui/material/SvgIcon";
import type { SidePanelId } from "@/application";

/** TradingView-style pine-tree glyph used for Pine Editor on the right rail. */
function PineTreeIcon(props: SvgIconProps) {
  return (
    <SvgIcon {...props} viewBox="0 0 28 28">
      <path
        fill="currentColor"
        d="M14 3.5 21.5 14h-3.2l3.4 5.2H17.5L20 23H8l2.5-3.8H6.3L9.7 14H6.5L14 3.5z"
      />
    </SvgIcon>
  );
}

interface SideRailProps {
  readonly active: SidePanelId | null;
  readonly onToggle: (id: SidePanelId) => void;
  readonly onOpenObjectTree: () => void;
  readonly onOpenPine: () => void;
  readonly compact?: boolean;
}

interface RailItem {
  readonly id?: SidePanelId;
  readonly label: string;
  readonly icon: typeof BookmarkBorderOutlinedIcon | typeof PineTreeIcon;
  readonly action?: "objectTree" | "pine" | "external";
  readonly href?: string;
  readonly group: "top" | "mid" | "bottom";
  readonly mobile?: boolean;
}

const ITEMS: readonly RailItem[] = [
  { id: "watchlist", label: "Watchlist", icon: BookmarkBorderOutlinedIcon, group: "top", mobile: true },
  { id: "alerts", label: "Alerts", icon: AccessTimeIcon, group: "top", mobile: true },
  { label: "Object tree", icon: LayersOutlinedIcon, action: "objectTree", group: "top", mobile: true },
  { id: "data", label: "Chats", icon: ChatBubbleOutlineOutlinedIcon, group: "top" },
  { label: "Hotlists", icon: RadarIcon, action: "external", href: "https://forgechart.ir/", group: "mid" },
  { label: "Pine Editor", icon: PineTreeIcon, action: "pine", group: "mid", mobile: true },
  { label: "Calendar", icon: CalendarMonthOutlinedIcon, action: "external", href: "https://forgechart.ir/", group: "mid" },
  { label: "News", icon: CellTowerOutlinedIcon, action: "external", href: "https://forgechart.ir/", group: "mid" },
  { label: "Notifications", icon: NotificationsNoneIcon, action: "external", href: "https://forgechart.ir/", group: "mid" },
  { label: "Apps", icon: AppsIcon, action: "external", href: "https://forgechart.ir/", group: "mid" },
  {
    label: "Help Center",
    icon: HelpOutlineOutlinedIcon,
    action: "external",
    href: "https://forgechart.ir/",
    group: "bottom",
    mobile: true,
  },
];

/** TradingView-style right icon rail. */
export function SideRail({ active, onToggle, onOpenObjectTree, onOpenPine, compact = false }: SideRailProps) {
  const visible = compact ? ITEMS.filter((item) => item.mobile) : ITEMS;
  const top = visible.filter((i) => i.group === "top");
  const mid = visible.filter((i) => i.group === "mid");
  const bottom = visible.filter((i) => i.group === "bottom");

  const renderButton = (item: RailItem) => {
    const Icon = item.icon;
    const pressed =
      (item.id != null && active === item.id) || (item.action === "pine" && active === "pine");
    const onClick = () => {
      if (item.id) onToggle(item.id);
      else if (item.action === "objectTree") onOpenObjectTree();
      else if (item.action === "pine") onOpenPine();
      else if (item.href) window.open(item.href, "_blank", "noopener");
    };
    return (
      <Tooltip key={item.label} title={item.label} placement="left">
        <IconButton
          size="small"
          aria-label={item.label}
          aria-pressed={pressed}
          color={pressed ? "primary" : "default"}
          onClick={onClick}
          sx={{
            color: pressed ? "primary.main" : "text.secondary",
            bgcolor: pressed ? "action.selected" : undefined,
            borderRadius: 1,
          }}
        >
          <Icon fontSize="small" />
        </IconButton>
      </Tooltip>
    );
  };

  return (
    <Box
      component="nav"
      aria-label="Side panels"
      sx={{
        width: compact ? 40 : 48,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 0.15,
        py: 1,
        bgcolor: "background.paper",
        borderLeft: 1,
        borderColor: "divider",
        flexShrink: 0,
        zIndex: 21,
      }}
    >
      {top.map(renderButton)}
      {!compact && mid.length > 0 ? (
        <>
          <Box sx={{ flex: 1, minHeight: 24 }} />
          {mid.map(renderButton)}
        </>
      ) : (
        <Box sx={{ flex: 1 }} />
      )}
      <Divider flexItem sx={{ my: 0.75, borderColor: "divider", width: "55%" }} />
      {bottom.map(renderButton)}
    </Box>
  );
}
