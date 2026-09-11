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

/** Slanted geometric F mark paths (spine + top + mid bars). */
const SPINE = "M12 10h14l-8 44H4z";
const TOP = "M26 10h30l-5 14H21z";
const MID = "M23 32h24l-5 14H18z";

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
      viewBox="0 0 64 64"
      role="img"
      aria-label={title}
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>{title}</title>
      {resolved === "gradient" ? (
        <defs>
          <linearGradient id={gradId} x1="8" y1="58" x2="54" y2="6" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#1638ff" />
            <stop offset="45%" stopColor="#2f7bff" />
            <stop offset="100%" stopColor="#5ce1ff" />
          </linearGradient>
        </defs>
      ) : null}
      <g transform="skewX(-12) translate(5 0)" fill={fill}>
        <path d={SPINE} />
        <path d={TOP} />
        <path d={MID} />
      </g>
    </svg>
  );
}
