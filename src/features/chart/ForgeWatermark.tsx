/**
 * TradingView / Faraz-style bottom-left brand mark.
 * Collapsed = Forge F icon; hover expands to show “Forge”.
 */

import Box from "@mui/material/Box";
import { ForgeMark } from "@/brand/ForgeMark";
import { useStore } from "@/shared/hooks/useStore";
import { useServices } from "@/app/use-services";

export function ForgeWatermark() {
  const { settings } = useServices();
  const theme = useStore(settings.settings, (s) => s.theme);
  const dark = theme === "dark";

  return (
    <Box
      component="a"
      href="https://forgechart.ir"
      target="_blank"
      rel="noopener noreferrer"
      title="Forge"
      aria-label="Forge"
      sx={{
        position: "absolute",
        left: { xs: 6, sm: 10 },
        bottom: { xs: 10, sm: 34 },
        zIndex: 6,
        display: "inline-flex",
        alignItems: "center",
        height: 28,
        maxWidth: 28,
        pl: "5px",
        pr: "5px",
        gap: 0,
        borderRadius: "8px",
        textDecoration: "none",
        color: dark ? "#e8eaf0" : "#0b0e14",
        backgroundColor: "transparent",
        overflow: "hidden",
        cursor: "pointer",
        transition:
          "max-width 0.28s cubic-bezier(0.2, 0.8, 0.2, 1), background-color 0.2s ease, padding 0.28s ease, box-shadow 0.2s ease, gap 0.28s ease",
        "&:hover": {
          maxWidth: 110,
          gap: "7px",
          pr: "10px",
          backgroundColor: dark ? "rgba(20, 24, 34, 0.88)" : "rgba(255, 255, 255, 0.92)",
          boxShadow: dark
            ? "0 4px 14px rgba(0,0,0,0.45)"
            : "0 4px 14px rgba(15, 20, 30, 0.12)",
          "& .forge-wm-text": {
            opacity: 1,
            transform: "translateX(0)",
          },
        },
      }}
    >
      <Box sx={{ display: "flex", flexShrink: 0, width: 18, height: 18 }}>
        <ForgeMark theme={dark ? "dark" : "light"} size={18} />
      </Box>
      <Box
        className="forge-wm-text"
        component="span"
        sx={{
          opacity: 0,
          transform: "translateX(-6px)",
          whiteSpace: "nowrap",
          fontWeight: 700,
          fontSize: 13,
          letterSpacing: "0.02em",
          lineHeight: 1,
          transition: "opacity 0.2s ease 0.04s, transform 0.28s ease",
        }}
      >
        Forge
      </Box>
    </Box>
  );
}
