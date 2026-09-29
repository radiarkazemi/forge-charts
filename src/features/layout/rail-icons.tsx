import SvgIcon from "@mui/material/SvgIcon";
import type { SvgIconProps } from "@mui/material/SvgIcon";

/**
 * TradingView dark-theme right-bar glyphs.
 * Stroke icons use currentColor (#D1D4DC) on #131722 — thin white outlines.
 */

const stroke = {
  fill: "none" as const,
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function WatchlistRailIcon(props: SvgIconProps) {
  return (
    <SvgIcon {...props} viewBox="0 0 28 28" inheritViewBox>
      <path {...stroke} d="M9 5h10a1.5 1.5 0 0 1 1.5 1.5V22l-6.5-3.25L7.5 22V6.5A1.5 1.5 0 0 1 9 5z" />
    </SvgIcon>
  );
}

export function AlertsRailIcon(props: SvgIconProps) {
  return (
    <SvgIcon {...props} viewBox="0 0 28 28" inheritViewBox>
      <circle {...stroke} cx="14" cy="14" r="8" />
      <path {...stroke} d="M14 9.25v5.25l3.5 2" />
    </SvgIcon>
  );
}

export function ObjectTreeRailIcon(props: SvgIconProps) {
  return (
    <SvgIcon {...props} viewBox="0 0 28 28" inheritViewBox>
      <path {...stroke} d="M14 4.75 21 11l-7 6.25L7 11l7-6.25z" />
      <path {...stroke} d="M14 11.25 21 17.5l-7 6.25L7 17.5l7-6.25z" opacity={0.9} />
    </SvgIcon>
  );
}

export function ChatsRailIcon(props: SvgIconProps) {
  return (
    <SvgIcon {...props} viewBox="0 0 28 28" inheritViewBox>
      <path
        {...stroke}
        d="M7.5 8.25h10.25A2.25 2.25 0 0 1 20 10.5v5.25a2.25 2.25 0 0 1-2.25 2.25H13.5L10 21v-3H7.5A2.25 2.25 0 0 1 5.25 15.75V10.5A2.25 2.25 0 0 1 7.5 8.25z"
      />
      <path {...stroke} d="M11.5 6.75h9A2 2 0 0 1 22.5 8.75v5" opacity={0.75} />
    </SvgIcon>
  );
}

export function HotlistsRailIcon(props: SvgIconProps) {
  return (
    <SvgIcon {...props} viewBox="0 0 28 28" inheritViewBox>
      <circle {...stroke} cx="14" cy="14" r="7.25" />
      <circle cx="14" cy="14" r="1.5" fill="currentColor" />
      <path {...stroke} d="M14 6.25v2M14 19.75v2M6.25 14h2M19.75 14h2" />
    </SvgIcon>
  );
}

/** Outline pine-tree — TradingView "Pine" on the right bar. */
export function PineRailIcon(props: SvgIconProps) {
  return (
    <SvgIcon {...props} viewBox="0 0 28 28" inheritViewBox>
      <path
        {...stroke}
        d="M14 4 21.5 13.5h-3.25L21 18.75h-3.5L20 23.5H8L9.5 18.75H6L8.75 13.5H5.5L14 4z"
      />
    </SvgIcon>
  );
}

export function CalendarRailIcon(props: SvgIconProps) {
  return (
    <SvgIcon {...props} viewBox="0 0 28 28" inheritViewBox>
      <rect {...stroke} x="6.25" y="7.25" width="15.5" height="14.5" rx="1.5" />
      <path {...stroke} d="M6.25 11.5h15.5M10 5.5v3.5M18 5.5v3.5" />
    </SvgIcon>
  );
}

export function NewsRailIcon(props: SvgIconProps) {
  return (
    <SvgIcon {...props} viewBox="0 0 28 28" inheritViewBox>
      <circle cx="9" cy="18.5" r="1.5" fill="currentColor" />
      <path {...stroke} d="M12 16a5.25 5.25 0 0 1 7.25 0M14.5 13a8.5 8.5 0 0 1 10.5 0" />
    </SvgIcon>
  );
}

export function NotificationsRailIcon(props: SvgIconProps) {
  return (
    <SvgIcon {...props} viewBox="0 0 28 28" inheritViewBox>
      <path
        {...stroke}
        d="M9.25 12a4.75 4.75 0 0 1 9.5 0c0 4.5 1.75 5.75 1.75 5.75H7.5S9.25 16.5 9.25 12z"
      />
      <path {...stroke} d="M12.25 20.75a1.75 1.75 0 0 0 3.5 0" />
    </SvgIcon>
  );
}

/** TV Products: solid white disc with dark 3×3 dots. */
export function AppsRailIcon(props: SvgIconProps) {
  return (
    <SvgIcon {...props} viewBox="0 0 28 28" inheritViewBox>
      <circle cx="14" cy="14" r="9" fill="currentColor" />
      {[9, 14, 19].flatMap((y) =>
        [9, 14, 19].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.2" fill="#131722" />),
      )}
    </SvgIcon>
  );
}

export function HelpRailIcon(props: SvgIconProps) {
  return (
    <SvgIcon {...props} viewBox="0 0 28 28" inheritViewBox>
      <circle {...stroke} cx="14" cy="14" r="8" />
      <path {...stroke} d="M11.5 11.25a2.5 2.5 0 1 1 3.6 2.25c-.75.4-1.15.95-1.15 1.85" />
      <circle cx="14" cy="18.5" r="1.05" fill="currentColor" />
    </SvgIcon>
  );
}
