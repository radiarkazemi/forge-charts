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

/** TradingView dark widget-bar colors */
const RAIL_BG = "#131722";
const RAIL_BORDER = "#2a2e39";
const ICON_IDLE = "#D1D4DC";
const ICON_ACTIVE = "#2962FF";
const ICON_HOVER_BG = "rgba(209, 212, 220, 0.08)";
const ICON_ACTIVE_BG = "rgba(41, 98, 255, 0.12)";

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

/** TradingView dark-theme right icon rail. */
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
          disableRipple
          sx={{
            position: "relative",
            width: 40,
            height: 40,
            color: pressed ? ICON_ACTIVE : ICON_IDLE,
            bgcolor: pressed ? ICON_ACTIVE_BG : "transparent",
            borderRadius: "4px",
            "&:hover": {
              bgcolor: pressed ? ICON_ACTIVE_BG : ICON_HOVER_BG,
              color: pressed ? ICON_ACTIVE : "#FFFFFF",
            },
            // TV active indicator: thin blue bar on the left edge of the rail button
            "&::before": pressed
              ? {
                  content: '""',
                  position: "absolute",
                  left: -6,
                  top: 8,
                  bottom: 8,
                  width: 2,
                  borderRadius: 1,
                  bgcolor: ICON_ACTIVE,
                }
              : undefined,
          }}
        >
          <Icon sx={{ fontSize: 22, color: "inherit" }} />
        </IconButton>
      </Tooltip>
    );
  };

  return (
    <Box
      component="nav"
      aria-label="Side panels"
      sx={{
        width: compact ? 44 : 52,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 0.35,
        py: 1.25,
        px: 0.5,
        bgcolor: RAIL_BG,
        borderLeft: `1px solid ${RAIL_BORDER}`,
        flexShrink: 0,
        zIndex: 21,
      }}
    >
      {top.map(renderButton)}
      {!compact && mid.length > 0 ? (
        <>
          <Box sx={{ flex: 1, minHeight: 32 }} />
          {mid.map(renderButton)}
        </>
      ) : (
        <Box sx={{ flex: 1 }} />
      )}
      <Divider flexItem sx={{ my: 0.75, borderColor: RAIL_BORDER, width: "48%" }} />
      {bottom.map(renderButton)}
    </Box>
  );
}
