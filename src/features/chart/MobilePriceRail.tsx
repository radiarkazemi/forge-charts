import ButtonBase from "@mui/material/ButtonBase";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";
import { useState } from "react";
import { useServices } from "@/app/use-services";
import { useStore } from "@/shared/hooks/useStore";

/**
 * Phone-only percent toggle. The chart's own price scale draws the USD menu,
 * so this rail does not cover the header or the date-range label.
 */
export function MobilePriceRail() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"), { noSsr: true });
  const { chart, settings } = useServices();
  const appTheme = useStore(settings.settings, (s) => s.theme);
  const [percentOn, setPercentOn] = useState(false);
  if (!isMobile) return null;

  const dark = appTheme === "dark";
  const text = dark ? "#d1d4dc" : "#131722";

  return (
    <ButtonBase
      aria-label="Percentage scale"
      onClick={() => {
        chart.togglePercentageScale();
        setPercentOn((v) => !v);
      }}
      sx={{
        position: "absolute",
        right: 8,
        bottom: 46,
        zIndex: 5,
        width: 32,
        height: 26,
        color: percentOn ? "#2962FF" : text,
        fontSize: 15,
        fontWeight: 800,
        borderRadius: "4px",
        "&:active": { bgcolor: dark ? "rgba(209,212,220,0.08)" : "rgba(19,23,34,0.06)" },
      }}
    >
      %
    </ButtonBase>
  );
}
