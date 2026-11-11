import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import type { SxProps, Theme } from "@mui/material/styles";
import { LoginBrandStage } from "./LoginBrandStage";

/** Landing page colors (forgechart.ir). */
const BG = "#050810";
const CARD = "rgba(14, 20, 34, 0.92)";
const LINE = "rgba(255, 255, 255, 0.08)";
const TEXT = "#f4f7ff";
const MUTED = "#8b97ad";
const BLUE = "#2f7bff";

export const authFieldSx: SxProps<Theme> = {
  "& .MuiInputLabel-root": { color: MUTED },
  "& .MuiInputLabel-root.Mui-focused": { color: "#4d9fff" },
  "& .MuiFormHelperText-root": { color: MUTED },
  "& .MuiOutlinedInput-root": {
    color: TEXT,
    borderRadius: "12px",
    background: "rgba(255,255,255,0.03)",
    "& fieldset": { borderColor: LINE },
    "&:hover fieldset": { borderColor: "rgba(255,255,255,0.18)" },
    "&.Mui-focused fieldset": { borderColor: BLUE },
  },
};

export const authButtonSx: SxProps<Theme> = {
  mt: 0.5,
  py: 1.25,
  borderRadius: "12px",
  textTransform: "none",
  fontWeight: 700,
  fontSize: 15,
  color: "#fff",
  background: "linear-gradient(180deg, #4d9fff 0%, #2f7bff 100%)",
  boxShadow: "none",
  "&:hover": {
    background: "linear-gradient(180deg, #6aafff 0%, #1d6aee 100%)",
    boxShadow: "none",
  },
};

/**
 * Sign-in layout: landing-page night scene on the left, form card on the right.
 * The chart never uses this shell.
 */
export function AuthShell({ children }: { readonly children: ReactNode }) {
  return (
    <Box
      sx={{
        height: "100%",
        minHeight: 0,
        flex: 1,
        display: "grid",
        gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1.15fr) minmax(320px, 0.85fr)" },
        gap: { xs: 0, md: 3.5 },
        p: { xs: 2, md: 3.5 },
        boxSizing: "border-box",
        position: "relative",
        overflow: "hidden",
        bgcolor: BG,
      }}
    >
      <Box
        aria-hidden
        sx={{
          pointerEvents: "none",
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(900px 520px at 82% 12%, rgba(47,123,255,0.22), transparent 60%), radial-gradient(700px 420px at 8% 80%, rgba(22,56,255,0.14), transparent 55%), radial-gradient(600px 280px at 50% 100%, rgba(92,225,255,0.06), transparent 50%)",
        }}
      />
      <Box sx={{ display: { xs: "none", md: "block" }, minHeight: 0, position: "relative", zIndex: 1 }}>
        <LoginBrandStage />
      </Box>
      <Box
        sx={{
          position: "relative",
          zIndex: 1,
          minHeight: 0,
          overflow: "auto",
          display: "flex",
        }}
      >
        <Box sx={{ width: "100%", maxWidth: 440, m: "auto" }}>{children}</Box>
      </Box>
    </Box>
  );
}

export function AuthCard({ children }: { readonly children: ReactNode }) {
  return (
    <Box
      sx={{
        width: "100%",
        bgcolor: CARD,
        border: `1px solid ${LINE}`,
        borderRadius: "22px",
        p: { xs: 2.5, sm: 3.5 },
        boxShadow: "0 24px 70px rgba(0,0,0,0.4)",
        backdropFilter: "blur(16px)",
      }}
    >
      {children}
    </Box>
  );
}
