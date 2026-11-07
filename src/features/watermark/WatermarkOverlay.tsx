/**
 * Screen-anchored title / subtitle watermark (AG FX style).
 */

import { useSyncExternalStore, type CSSProperties, type ReactElement } from "react";
import { Box, Typography } from "@mui/material";
import {
  getWatermarkOverlay,
  subscribeWatermarkOverlay,
  withTransparency,
  type WatermarkOverlayState,
  type WatermarkHAlign,
  type WatermarkVAlign,
} from "./runtime";

function useWatermark(): WatermarkOverlayState | null {
  return useSyncExternalStore(
    subscribeWatermarkOverlay,
    getWatermarkOverlay,
    () => null,
  );
}

function anchorStyle(
  vert: WatermarkVAlign,
  horz: WatermarkHAlign,
  offsetX: number,
  offsetY: number,
): CSSProperties {
  const style: CSSProperties = {
    position: "absolute",
    zIndex: 3,
    pointerEvents: "none",
    display: "flex",
    flexDirection: "column",
    gap: 0,
    maxWidth: "90%",
  };

  if (vert === "top") {
    style.top = Math.max(0, offsetY);
    style.bottom = "auto";
  } else if (vert === "bottom") {
    style.bottom = Math.max(0, offsetY + 36);
    style.top = "auto";
  } else {
    style.top = "50%";
    style.bottom = "auto";
    style.transform = `translateY(calc(-50% + ${offsetY}px))`;
  }

  if (horz === "left") {
    style.left = Math.max(8, 12 + offsetX);
    style.right = "auto";
    style.alignItems = "flex-start";
    style.textAlign = "left";
  } else if (horz === "right") {
    style.right = Math.max(8, 12 + offsetX);
    style.left = "auto";
    style.alignItems = "flex-end";
    style.textAlign = "right";
  } else {
    style.left = "50%";
    style.right = "auto";
    style.alignItems = "center";
    style.textAlign = "center";
    const base =
      typeof style.transform === "string" && style.transform.length > 0
        ? style.transform
        : "";
    style.transform = base
      ? `translateX(calc(-50% + ${offsetX}px)) ${base}`
      : `translateX(calc(-50% + ${offsetX}px))`;
  }

  return style;
}

export function WatermarkOverlay(): ReactElement | null {
  const state = useWatermark();
  if (!state || !state.visible) return null;

  const showTitle = state.showTitle && state.title.trim().length > 0;
  const showSub = state.showSubtitle && state.subtitle.trim().length > 0;
  const showSym = state.showSymbolInfo && state.symbolLabel.trim().length > 0;
  if (!showTitle && !showSub && !showSym) return null;

  const mainAnchor = anchorStyle(
    state.vertPos,
    state.horzPos,
    state.offsetX,
    state.offsetY,
  );

  const symbolOnlyDifferent =
    showSym && state.symbolVertPos !== state.vertPos;

  return (
    <>
      <Box
        data-testid="chart-watermark"
        sx={{
          ...mainAnchor,
          gap: `${Math.max(0, state.lineGap)}px`,
          fontFamily: '"Trebuchet MS", "Segoe UI", Outfit, sans-serif',
        }}
      >
        {showTitle ? (
          <Typography
            component="div"
            sx={{
              m: 0,
              p: 0,
              color: withTransparency(state.titleColor, state.titleTransparency),
              fontSize: state.titleSize,
              fontWeight: state.titleBold ? 700 : 500,
              letterSpacing: `${state.letterSpacing}em`,
              lineHeight: 1.15,
              textTransform: "none",
              userSelect: "none",
            }}
          >
            {state.title}
          </Typography>
        ) : null}
        {showSub ? (
          <Typography
            component="div"
            sx={{
              m: 0,
              p: 0,
              color: withTransparency(
                state.subtitleColor,
                state.subtitleTransparency,
              ),
              fontSize: state.subtitleSize,
              fontWeight: state.subtitleBold ? 700 : 500,
              letterSpacing: `${Math.max(0.02, state.letterSpacing * 0.7)}em`,
              lineHeight: 1.2,
              textTransform: "uppercase",
              userSelect: "none",
            }}
          >
            {state.subtitle}
          </Typography>
        ) : null}
        {showSym && !symbolOnlyDifferent ? (
          <Typography
            component="div"
            sx={{
              m: 0,
              mt: showTitle || showSub ? 0.5 : 0,
              p: 0,
              color: withTransparency(
                state.symbolColor,
                state.symbolTransparency,
              ),
              fontSize: state.symbolSize,
              fontWeight: 500,
              letterSpacing: "0.04em",
              lineHeight: 1.2,
              userSelect: "none",
            }}
          >
            {state.symbolLabel}
          </Typography>
        ) : null}
      </Box>

      {showSym && symbolOnlyDifferent ? (
        <Box
          data-testid="chart-watermark-symbol"
          sx={{
            ...anchorStyle(
              state.symbolVertPos,
              state.horzPos,
              state.offsetX,
              state.offsetY,
            ),
            fontFamily: '"Trebuchet MS", "Segoe UI", Outfit, sans-serif',
          }}
        >
          <Typography
            component="div"
            sx={{
              m: 0,
              p: 0,
              color: withTransparency(
                state.symbolColor,
                state.symbolTransparency,
              ),
              fontSize: state.symbolSize,
              fontWeight: 500,
              letterSpacing: "0.04em",
              lineHeight: 1.2,
              userSelect: "none",
            }}
          >
            {state.symbolLabel}
          </Typography>
        </Box>
      ) : null}
    </>
  );
}
