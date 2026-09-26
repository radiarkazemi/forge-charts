import type { ComponentType } from "react";
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import type { SvgIconProps } from "@mui/material/SvgIcon";
import type { SidePanelId } from "@/application";
import {
  AlertsRailIcon,
  AppsRailIcon,
  CalendarRailIcon,
  ChatsRailIcon,
  HelpRailIcon,
  HotlistsRailIcon,
  NewsRailIcon,
  NotificationsRailIcon,
  ObjectTreeRailIcon,
  PineRailIcon,
  WatchlistRailIcon,
} from "./rail-icons";

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
  readonly icon: ComponentType<SvgIconProps>;
  readonly action?: "objectTree" | "pine" | "external";
  readonly href?: string;
  readonly group: "top" | "mid" | "bottom";
  readonly mobile?: boolean;
}

/**
 * TradingView Supercharts right widget bar order (dark theme):
 * Watchlist → Alerts → Object tree → Chats | Hotlists → Pine → Calendar → News → Notifications → Apps | Help
 */
const ITEMS: readonly RailItem[] = [
  { id: "watchlist", label: "Watchlist, details, and news", icon: WatchlistRailIcon, group: "top", mobile: true },
  { id: "alerts", label: "Alerts", icon: AlertsRailIcon, group: "top", mobile: true },
  { label: "Object tree and data window", icon: ObjectTreeRailIcon, action: "objectTree", group: "top", mobile: true },
  { id: "data", label: "Chats", icon: ChatsRailIcon, group: "top" },
  { label: "Hotlists", icon: HotlistsRailIcon, action: "external", href: "https://forgechart.ir/", group: "mid" },
  { label: "Pine", icon: PineRailIcon, action: "pine", group: "mid", mobile: true },
  { label: "Calendars", icon: CalendarRailIcon, action: "external", href: "https://forgechart.ir/", group: "mid" },
  { label: "News", icon: NewsRailIcon, action: "external", href: "https://forgechart.ir/", group: "mid" },
  { label: "Notifications", icon: NotificationsRailIcon, action: "external", href: "https://forgechart.ir/", group: "mid" },
  { label: "Products", icon: AppsRailIcon, action: "external", href: "https://forgechart.ir/", group: "mid" },
  {
    label: "Help Center",
    icon: HelpRailIcon,
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
          onClick={onClick}
          sx={{
            width: 36,
            height: 36,
            color: pressed ? "primary.main" : "text.secondary",
            bgcolor: pressed ? "action.selected" : "transparent",
            borderRadius: 1,
            "&:hover": { bgcolor: "action.hover", color: "text.primary" },
          }}
        >
          <Icon sx={{ fontSize: 22 }} />
        </IconButton>
      </Tooltip>
    );
  };

  return (
    <Box
      component="nav"
      aria-label="Side panels"
      sx={{
        width: compact ? 42 : 52,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 0.2,
        py: 1,
        bgcolor: "#131722",
        borderLeft: "1px solid #2a2e39",
        flexShrink: 0,
        zIndex: 21,
      }}
    >
      {top.map(renderButton)}
      {!compact && mid.length > 0 ? (
        <>
          <Box sx={{ flex: 1, minHeight: 28 }} />
          {mid.map(renderButton)}
        </>
      ) : (
        <Box sx={{ flex: 1 }} />
      )}
      <Divider flexItem sx={{ my: 0.75, borderColor: "#2a2e39", width: "50%" }} />
      {bottom.map(renderButton)}
    </Box>
  );
}
