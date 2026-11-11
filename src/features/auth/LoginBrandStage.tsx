import { useId } from "react";
import Box from "@mui/material/Box";

/** Landing-page F (forgechart.ir header). Two bars, viewBox 0 0 158 157. */
const F_TOP =
  "M13 84.5 L12.5 52 L46 14.5 L53 11.5 L144.5 12 L116 41.5 L112 43.5 L54 43.5 L49 45.5 Z";
const F_MID =
  "M13 143.5 L12.5 103 L16.5 97 L48 63.5 L52 61.5 L81 60.5 L125.5 61 L96 88.5 L68 89.5 L64 91.5 Z";

const STARS: ReadonlyArray<readonly [number, number, number]> = [
  [70, 54, 1.1],
  [128, 96, 0.8],
  [186, 42, 1.2],
  [250, 88, 0.7],
  [318, 36, 1],
  [390, 78, 0.9],
  [460, 48, 1.2],
  [530, 92, 0.7],
  [580, 40, 1],
  [96, 150, 0.6],
  [340, 130, 0.8],
  [500, 140, 0.6],
];

/**
 * Left panel of the sign-in screen: the landing-page F cut through a dark
 * wall, with the Forge night scene showing through the mark.
 */
export function LoginBrandStage() {
  const uid = useId().replace(/:/g, "");
  const sky = `${uid}-sky`;
  const aurora = `${uid}-aurora`;
  const glow = `${uid}-glow`;
  const wall = `${uid}-wall`;
  const mark = "translate(108 198) scale(2.68)";

  return (
    <Box
      sx={{
        height: "100%",
        borderRadius: "28px",
        overflow: "hidden",
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "0 28px 80px rgba(0,0,0,0.38)",
        bgcolor: "#070b12",
      }}
    >
      <svg
        viewBox="0 0 640 860"
        width="100%"
        height="100%"
        preserveAspectRatio="xMidYMid slice"
        role="img"
        aria-label="Forge"
      >
        <defs>
          <linearGradient id={sky} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#050810" />
            <stop offset="38%" stopColor="#12325f" />
            <stop offset="62%" stopColor="#0d4a52" />
            <stop offset="100%" stopColor="#07140f" />
          </linearGradient>
          <linearGradient id={aurora} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#1638ff" stopOpacity="0.05" />
            <stop offset="45%" stopColor="#2f7bff" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#5ce1ff" stopOpacity="0.2" />
          </linearGradient>
          <filter id={glow} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <mask id={wall}>
            <rect width="640" height="860" fill="white" />
            <g transform={mark} fill="black">
              <path d={F_TOP} />
              <path d={F_MID} />
            </g>
          </mask>
        </defs>

        <rect width="640" height="860" fill={`url(#${sky})`} />
        {STARS.map(([x, y, r]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r={r} fill="#f4f7ff" opacity="0.75" />
        ))}
        <path
          d="M-20 210 C 120 90, 220 280, 360 140 S 560 250, 680 100"
          fill="none"
          stroke={`url(#${aurora})`}
          strokeWidth="54"
          strokeLinecap="round"
          opacity="0.55"
        />
        <path
          d="M-10 280 C 140 160, 260 340, 400 200 S 580 300, 680 180"
          fill="none"
          stroke="#5ce1ff"
          strokeWidth="22"
          strokeLinecap="round"
          opacity="0.28"
        />
        <path
          d="M0 500 L90 360 L160 450 L250 300 L340 460 L430 270 L520 420 L590 330 L640 450 L640 640 L0 640 Z"
          fill="#0c2236"
        />
        <path
          d="M0 560 L140 430 L220 520 L320 390 L430 530 L530 410 L640 520 L640 680 L0 680 Z"
          fill="#123044"
        />
        <path d="M250 300 L278 348 L222 348 Z" fill="#d5e7f5" opacity="0.85" />
        <path d="M430 270 L462 330 L398 330 Z" fill="#e7f3fb" opacity="0.9" />
        <path d="M0 640 L0 860 L640 860 L640 640 Z" fill="#07161c" />
        <path
          d="M0 700 L140 760 L220 720 L320 780 L430 710 L530 770 L640 720 L640 860 L0 860 Z"
          fill="#0c2a32"
          opacity="0.85"
        />

        <g mask={`url(#${wall})`}>
          <rect width="640" height="860" fill="#12171f" />
          <rect width="640" height="860" fill="#1b2430" opacity="0.4" />
        </g>
        <g
          transform={mark}
          fill="none"
          stroke="#5ce1ff"
          strokeWidth="1.6"
          filter={`url(#${glow})`}
          opacity="0.95"
        >
          <path d={F_TOP} />
          <path d={F_MID} />
        </g>
        <g transform={mark} fill="none" stroke="#2f7bff" strokeWidth="3" opacity="0.55">
          <path d={F_TOP} />
          <path d={F_MID} />
        </g>
      </svg>
    </Box>
  );
}
