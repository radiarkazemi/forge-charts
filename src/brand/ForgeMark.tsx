import { useId } from "react";

type Variant = "auto" | "dark" | "light" | "mono" | "gradient";

type Props = {
  /** Visual treatment. `auto` follows the chart theme. */
  variant?: Variant;
  theme?: "dark" | "light";
  className?: string;
  title?: string;
  size?: number | string;
};

/** Official Forge mark — two forward bars traced from brand asset. */
const TOP =
  "M13 84.5 L12.5 52 L46 14.5 L53 11.5 L144.5 12 L116 41.5 L112 43.5 L54 43.5 L49 45.5 Z";
const BOTTOM =
  "M13 143.5 L12.5 103 L16.5 97 L48 63.5 L52 61.5 L81 60.5 L125.5 61 L96 88.5 L68 89.5 L64 91.5 Z";

/**
 * Forge brand mark (icon only — no wordmark).
 * Light → solid black · Dark → blue→cyan gradient (identity sheet).
 */
export function ForgeMark({
  variant = "auto",
  theme = "dark",
  className,
  title = "Forge",
  size = 24,
}: Props) {
  const uid = useId().replace(/:/g, "");
  const resolved: Exclude<Variant, "auto"> =
    variant === "auto" ? (theme === "light" ? "light" : "gradient") : variant;
  const gradId = `forgeMarkGrad-${uid}`;

  const fill =
    resolved === "light"
      ? "#0b0e14"
      : resolved === "mono"
        ? "currentColor"
        : resolved === "dark"
          ? "#f5f7fb"
          : `url(#${gradId})`;

  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 158 157"
      role="img"
      aria-label={title}
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>{title}</title>
      {resolved === "gradient" ? (
        <defs>
          <linearGradient id={gradId} x1="12" y1="144" x2="144" y2="12" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#1638ff" />
            <stop offset="45%" stopColor="#2f7bff" />
            <stop offset="100%" stopColor="#5ce1ff" />
          </linearGradient>
        </defs>
      ) : null}
      <g fill={fill}>
        <path d={TOP} />
        <path d={BOTTOM} />
      </g>
    </svg>
  );
}
