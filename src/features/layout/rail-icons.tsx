import SvgIcon from "@mui/material/SvgIcon";
import type { SvgIconProps } from "@mui/material/SvgIcon";

/** Thin-stroke glyphs matching TradingView's right widget bar (28×28 viewBox). */

export function WatchlistRailIcon(props: SvgIconProps) {
  return (
    <SvgIcon {...props} viewBox="0 0 28 28" fill="none">
      <path
        d="M9 5.5h10a1.5 1.5 0 0 1 1.5 1.5v14.2l-6.5-3.4-6.5 3.4V7A1.5 1.5 0 0 1 9 5.5z"
        stroke="currentColor"
        strokeWidth="1.4"
      />
    </SvgIcon>
  );
}

export function AlertsRailIcon(props: SvgIconProps) {
  return (
    <SvgIcon {...props} viewBox="0 0 28 28" fill="none">
      <circle cx="14" cy="14" r="8.25" stroke="currentColor" strokeWidth="1.4" />
      <path d="M14 9.5v5.2l3.2 1.9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </SvgIcon>
  );
}

export function ObjectTreeRailIcon(props: SvgIconProps) {
  return (
    <SvgIcon {...props} viewBox="0 0 28 28" fill="none">
      <path d="M14 5.5 20.5 11 14 16.5 7.5 11 14 5.5z" stroke="currentColor" strokeWidth="1.3" />
      <path d="M14 11.5 20.5 17 14 22.5 7.5 17 14 11.5z" stroke="currentColor" strokeWidth="1.3" opacity="0.85" />
    </SvgIcon>
  );
}

export function ChatsRailIcon(props: SvgIconProps) {
  return (
    <SvgIcon {...props} viewBox="0 0 28 28" fill="none">
      <path
        d="M8.5 8.5h9.5a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H14l-3 2.5V17.5H8.5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2z"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <path
        d="M12.5 7h8a1.75 1.75 0 0 1 1.75 1.75v4.5A1.75 1.75 0 0 1 20.5 15"
        stroke="currentColor"
        strokeWidth="1.3"
        opacity="0.75"
      />
    </SvgIcon>
  );
}

export function HotlistsRailIcon(props: SvgIconProps) {
  return (
    <SvgIcon {...props} viewBox="0 0 28 28" fill="none">
      <circle cx="14" cy="14" r="7.5" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="14" cy="14" r="1.6" fill="currentColor" />
      <path d="M14 6.5v2.2M14 19.3v2.2M6.5 14h2.2M19.3 14h2.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </SvgIcon>
  );
}

/** Stylized pine / branching tree — TradingView "Pine" control on the right bar. */
export function PineRailIcon(props: SvgIconProps) {
  return (
    <SvgIcon {...props} viewBox="0 0 28 28" fill="none">
      <path
        d="M14 4.5 20.8 14h-3l2.8 4.6H17L19.2 23H8.8L11 18.6H7.4L10.2 14h-3L14 4.5z"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinejoin="round"
      />
    </SvgIcon>
  );
}

export function CalendarRailIcon(props: SvgIconProps) {
  return (
    <SvgIcon {...props} viewBox="0 0 28 28" fill="none">
      <rect x="6.5" y="7.5" width="15" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M6.5 11.5h15M10 5.5v3M18 5.5v3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </SvgIcon>
  );
}

export function NewsRailIcon(props: SvgIconProps) {
  return (
    <SvgIcon {...props} viewBox="0 0 28 28" fill="none">
      <circle cx="9.5" cy="18.5" r="1.4" fill="currentColor" />
      <path
        d="M12.2 15.8a5 5 0 0 1 7 0M14.5 13.2a8.2 8.2 0 0 1 10.2 0"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </SvgIcon>
  );
}

export function NotificationsRailIcon(props: SvgIconProps) {
  return (
    <SvgIcon {...props} viewBox="0 0 28 28" fill="none">
      <path
        d="M9.5 12.2a4.5 4.5 0 0 1 9 0c0 4.2 1.7 5.6 1.7 5.6H7.8s1.7-1.4 1.7-5.6z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path d="M12.2 20.6a1.8 1.8 0 0 0 3.6 0" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </SvgIcon>
  );
}

export function AppsRailIcon(props: SvgIconProps) {
  return (
    <SvgIcon {...props} viewBox="0 0 28 28" fill="none">
      <circle cx="14" cy="14" r="9" stroke="currentColor" strokeWidth="1.3" />
      {[8.5, 14, 19.5].flatMap((y) =>
        [8.5, 14, 19.5].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.15" fill="currentColor" />),
      )}
    </SvgIcon>
  );
}

export function HelpRailIcon(props: SvgIconProps) {
  return (
    <SvgIcon {...props} viewBox="0 0 28 28" fill="none">
      <circle cx="14" cy="14" r="8.25" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M11.6 11.2a2.4 2.4 0 1 1 3.5 2.1c-.7.4-1.1.9-1.1 1.7"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <circle cx="14" cy="18.4" r="1" fill="currentColor" />
    </SvgIcon>
  );
}
