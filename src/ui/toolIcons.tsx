import type { ReactNode, SVGProps } from "react";

function S(props: SVGProps<SVGSVGElement> & { children: ReactNode }) {
  const { children, ...rest } = props;
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" {...rest}>
      {children}
    </svg>
  );
}

const ICONS: Record<string, ReactNode> = {
  cross: (
    <S>
      <path d="M12 2v20M2 12h20" />
    </S>
  ),
  dot: (
    <S>
      <circle cx="12" cy="12" r="2.2" fill="currentColor" />
    </S>
  ),
  arrowCursor: (
    <S>
      <path d="M5 4 L19 12 L12 13 L10 20 Z" />
    </S>
  ),
  eraser: (
    <S>
      <path d="M4 16 L12 8 L16 12 L8 20 H4 Z" />
    </S>
  ),
  trendLine: (
    <S>
      <circle cx="6" cy="17" r="1.3" fill="currentColor" />
      <circle cx="18" cy="7" r="1.3" fill="currentColor" />
      <path d="M6 17 L18 7" />
    </S>
  ),
  ray: (
    <S>
      <circle cx="6" cy="16" r="1.3" fill="currentColor" />
      <path d="M6 16 L20 6" />
    </S>
  ),
  infoLine: (
    <S>
      <path d="M5 17 L19 7" />
      <path d="M14 6 h6 v6" />
    </S>
  ),
  extendedLine: (
    <S>
      <path d="M3 18 L21 6" />
    </S>
  ),
  trendAngle: (
    <S>
      <path d="M4 18 H20 M4 18 L18 8" />
      <path d="M8 18 A8 8 0 0 1 14 12" />
    </S>
  ),
  hline: (
    <S>
      <path d="M3 12 H21" />
    </S>
  ),
  horzRay: (
    <S>
      <circle cx="6" cy="12" r="1.3" fill="currentColor" />
      <path d="M6 12 H20" />
    </S>
  ),
  vline: (
    <S>
      <path d="M12 3 V21" />
    </S>
  ),
  crossLine: (
    <S>
      <path d="M12 3 V21 M3 12 H21" />
    </S>
  ),
  parallel: (
    <S>
      <path d="M5 18 L19 8 M5 21 L19 11" />
    </S>
  ),
  regression: (
    <S>
      <path d="M5 18 L19 8" />
      <path d="M6 14 L20 4 M4 21 L18 11" strokeDasharray="2 2" />
    </S>
  ),
  flatTop: (
    <S>
      <path d="M4 7 H20 M5 18 L19 10" />
    </S>
  ),
  disjoint: (
    <S>
      <path d="M5 18 L19 8 M5 18 L16 16" />
    </S>
  ),
  fibRetracement: (
    <S>
      <path d="M5 19 L19 5" />
      <path d="M5 16 H19 M5 12 H19 M5 8 H19" />
    </S>
  ),
  fibExtension: (
    <S>
      <path d="M5 18 L11 8 L19 12" />
      <path d="M5 6 H19 M5 10 H19" />
    </S>
  ),
  fibChannel: (
    <S>
      <path d="M5 18 L19 10 M5 14 L19 6 M5 10 L19 2" />
    </S>
  ),
  fibTimeZone: (
    <S>
      <path d="M6 4 V20 M10 4 V20 M14 4 V20 M19 4 V20" />
    </S>
  ),
  fibFan: (
    <S>
      <path d="M5 19 L20 19 M5 19 L20 12 M5 19 L20 5" />
    </S>
  ),
  fibTime: (
    <S>
      <path d="M5 19 L10 8 L16 14" />
      <path d="M8 4 V20 M13 4 V20 M19 4 V20" />
    </S>
  ),
  fibCircles: (
    <S>
      <circle cx="12" cy="12" r="3" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="9" />
    </S>
  ),
  fibSpiral: (
    <S>
      <path d="M12 12 C12 8 16 8 16 12 C16 18 8 18 8 12 C8 4 20 4 20 12" />
    </S>
  ),
  fibArcs: (
    <S>
      <path d="M5 19 A7 7 0 0 1 19 19" />
      <path d="M7 19 A5 5 0 0 1 17 19" />
      <path d="M9 19 A3 3 0 0 1 15 19" />
    </S>
  ),
  fibWedge: (
    <S>
      <path d="M5 19 L19 5 M5 19 L19 12 M5 19 L19 19" />
    </S>
  ),
  pitchfan: (
    <S>
      <path d="M5 19 L12 5 L19 16 M12 5 L8 16 M12 5 L16 16" />
    </S>
  ),
  pitchfork: (
    <S>
      <path d="M5 18 L12 6 L19 18 M12 6 V20" />
    </S>
  ),
  schiff: (
    <S>
      <path d="M6 16 L12 6 L18 16 M9 11 L12 20" />
    </S>
  ),
  modSchiff: (
    <S>
      <path d="M5 17 L12 7 L19 17 M8 12 L12 20" />
    </S>
  ),
  insidePitchfork: (
    <S>
      <path d="M6 18 L12 8 L18 18 M12 13 V20" />
    </S>
  ),
  gannBox: (
    <S>
      <rect x="5" y="5" width="14" height="14" />
      <path d="M5 12 H19 M12 5 V19 M5 19 L19 5" />
    </S>
  ),
  gannSquare: (
    <S>
      <rect x="5" y="5" width="14" height="14" />
      <path d="M5 5 L19 19 M5 19 L19 5" />
    </S>
  ),
  gannFan: (
    <S>
      <path d="M5 19 L20 19 M5 19 L20 14 M5 19 L20 8 M5 19 L14 4" />
    </S>
  ),
  gannSquareFixed: (
    <S>
      <rect x="6" y="6" width="12" height="12" />
      <path d="M6 12 H18 M12 6 V18" />
    </S>
  ),
  brush: (
    <S>
      <path d="M6 18 C10 10 14 14 18 6" />
    </S>
  ),
  highlighter: (
    <S strokeWidth="4">
      <path d="M5 16 L19 8" />
    </S>
  ),
  rectangle: (
    <S>
      <rect x="5" y="7" width="14" height="10" />
    </S>
  ),
  rotatedRect: (
    <S>
      <path d="M8 6 L18 9 L16 18 L6 15 Z" />
    </S>
  ),
  path: (
    <S>
      <path d="M5 16 L9 8 L13 14 L19 6" />
    </S>
  ),
  circle: (
    <S>
      <circle cx="12" cy="12" r="7" />
    </S>
  ),
  ellipse: (
    <S>
      <ellipse cx="12" cy="12" rx="8" ry="5" />
    </S>
  ),
  polyline: (
    <S>
      <path d="M4 16 L8 8 L12 12 L20 6" />
      <circle cx="4" cy="16" r="1.2" fill="currentColor" />
      <circle cx="20" cy="6" r="1.2" fill="currentColor" />
    </S>
  ),
  triangle: (
    <S>
      <path d="M12 5 L20 19 H4 Z" />
    </S>
  ),
  arc: (
    <S>
      <path d="M5 16 A8 8 0 0 1 19 10" />
    </S>
  ),
  curve: (
    <S>
      <path d="M4 16 Q12 4 20 16" />
    </S>
  ),
  doubleCurve: (
    <S>
      <path d="M4 16 C8 4 16 20 20 8" />
    </S>
  ),
  arrow: (
    <S>
      <path d="M5 17 L18 7" />
      <path d="M12 7 H18 V13" />
    </S>
  ),
  arrowUp: (
    <S>
      <path d="M12 5 L6 15 H18 Z" fill="currentColor" stroke="none" />
    </S>
  ),
  arrowDown: (
    <S>
      <path d="M12 19 L6 9 H18 Z" fill="currentColor" stroke="none" />
    </S>
  ),
  text: (
    <S>
      <path d="M6 7 H18 M12 7 V18" />
    </S>
  ),
  long: (
    <S>
      <rect x="6" y="4" width="12" height="8" fill="rgba(8,153,129,0.4)" />
      <rect x="6" y="12" width="12" height="6" fill="rgba(242,54,69,0.4)" />
    </S>
  ),
  short: (
    <S>
      <rect x="6" y="4" width="12" height="6" fill="rgba(242,54,69,0.4)" />
      <rect x="6" y="10" width="12" height="8" fill="rgba(8,153,129,0.4)" />
    </S>
  ),
  anchoredText: (
    <S>
      <path d="M7 8 H17 M12 8 V18 M8 18 H16" />
    </S>
  ),
  note: (
    <S>
      <path d="M7 5 H15 L18 8 V19 H7 Z" />
    </S>
  ),
  signpost: (
    <S>
      <path d="M12 20 V6 M12 6 H19 L17 9 L19 12 H12" />
    </S>
  ),
  callout: (
    <S>
      <rect x="8" y="4" width="12" height="8" />
      <path d="M10 12 L6 18" />
    </S>
  ),
  comment: (
    <S>
      <path d="M5 6 H19 V15 H10 L6 19 V15 H5 Z" />
    </S>
  ),
  priceLabel: (
    <S>
      <rect x="6" y="8" width="12" height="8" rx="2" />
    </S>
  ),
  priceNote: (
    <S>
      <path d="M5 12 H14 M14 8 V16 L19 12 Z" />
    </S>
  ),
  arrowMarker: (
    <S>
      <path d="M12 4 L12 16 M8 10 L12 16 L16 10" />
    </S>
  ),
  flagMark: (
    <S>
      <path d="M8 20 V5 H16 L14 8 L16 11 H8" />
    </S>
  ),
  cypher: (
    <S>
      <path d="M4 14 L8 6 L12 16 L16 8 L20 12" />
    </S>
  ),
  headShoulders: (
    <S>
      <path d="M4 16 L8 12 L12 6 L16 12 L20 16" />
    </S>
  ),
  abcd: (
    <S>
      <path d="M5 16 L10 6 L15 16 L20 8" />
    </S>
  ),
  trianglePattern: (
    <S>
      <path d="M4 18 L12 6 L20 18 M7 14 H17" />
    </S>
  ),
  threeDrives: (
    <S>
      <path d="M4 16 L7 8 L10 14 L13 6 L16 14 L19 5" />
    </S>
  ),
  elliottImpulse: (
    <S>
      <path d="M4 16 L7 8 L10 12 L14 4 L17 10 L20 6" />
    </S>
  ),
  elliottCorrection: (
    <S>
      <path d="M5 16 L10 6 L15 12 L20 8" />
    </S>
  ),
  elliottTriangle: (
    <S>
      <path d="M4 16 L8 8 L12 14 L16 10 L20 12" />
    </S>
  ),
  elliottDouble: (
    <S>
      <path d="M4 16 L8 8 L12 14 L16 6 L20 12" />
    </S>
  ),
  elliottTriple: (
    <S>
      <path d="M3 16 L7 8 L10 14 L13 6 L16 14 L19 7 L21 12" />
    </S>
  ),
  cyclicLines: (
    <S>
      <path d="M7 4 V20 M12 4 V20 M17 4 V20" />
    </S>
  ),
  timeCycles: (
    <S>
      <circle cx="12" cy="12" r="7" />
      <path d="M12 12 L12 7 M12 12 L16 12" />
    </S>
  ),
  sineLine: (
    <S>
      <path d="M3 12 C6 4 9 20 12 12 C15 4 18 20 21 12" />
    </S>
  ),
  forecast: (
    <S>
      <path d="M5 16 L12 10 L20 6" strokeDasharray="3 2" />
    </S>
  ),
  dateRange: (
    <S>
      <path d="M8 4 V20 M16 4 V20" />
      <path d="M8 8 H16" />
    </S>
  ),
  priceRange: (
    <S>
      <path d="M4 8 H20 M4 16 H20" />
    </S>
  ),
  datePriceRange: (
    <S>
      <rect x="6" y="6" width="12" height="12" />
    </S>
  ),
  barsPattern: (
    <S>
      <path d="M7 16 V8 M12 16 V6 M17 16 V10" />
    </S>
  ),
  ghostFeed: (
    <S>
      <path d="M5 16 L11 9 L19 12" strokeDasharray="2 2" />
    </S>
  ),
  projection: (
    <S>
      <path d="M5 17 L12 10 M12 10 L20 7" strokeDasharray="3 2" />
    </S>
  ),
  anchoredVwap: (
    <S>
      <path d="M5 16 C9 16 10 8 14 8 C18 8 19 12 21 12" />
    </S>
  ),
  volProfile: (
    <S>
      <path d="M6 6 H14 M6 10 H18 M6 14 H12 M6 18 H16" />
    </S>
  ),
  anchoredVolProfile: (
    <S>
      <path d="M5 5 V19 M5 8 H14 M5 12 H18 M5 16 H11" />
    </S>
  ),
  xabcd: (
    <S>
      <path d="M4 16 L8 7 L12 14 L16 6 L20 12" />
    </S>
  ),
};

export function ToolGlyph({ id, glyph }: { id: string; glyph?: string }) {
  if (glyph) return <span className="tool-emoji">{glyph}</span>;
  return ICONS[id] ?? (
    <S>
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </S>
  );
}
