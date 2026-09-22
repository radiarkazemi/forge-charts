import { createTheme, type Theme } from "@mui/material/styles";
import type { ThemeMode } from "@/application";
import { FONT_FAMILY, TOKENS } from "./tokens";

/** MUI theme derived from the shared tokens so UI chrome matches the chart canvas. */
export function createAppTheme(mode: ThemeMode): Theme {
  const t = TOKENS[mode];

  return createTheme({
    palette: {
      mode,
      primary: { main: t.accent },
      success: { main: t.up },
      error: { main: t.down },
      background: { default: t.background, paper: t.surface },
      text: { primary: t.text, secondary: t.textMuted },
      divider: t.border,
    },
    shape: { borderRadius: 6 },
    typography: {
      fontFamily: FONT_FAMILY,
      fontSize: 13,
      button: { textTransform: "none", fontWeight: 600 },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          "html, body, #root": { height: "100%", margin: 0 },
          body: { overflow: "hidden" },
        },
      },
      MuiAppBar: {
        defaultProps: { elevation: 0, color: "transparent" },
        styleOverrides: {
          root: { backgroundColor: t.surface, borderBottom: `1px solid ${t.border}` },
        },
      },
      MuiPaper: {
        defaultProps: { elevation: 0 },
        styleOverrides: { root: { backgroundImage: "none" } },
      },
      MuiTooltip: {
        defaultProps: { arrow: true, enterDelay: 400 },
      },
      MuiListItemButton: {
        styleOverrides: { root: { borderRadius: 6 } },
      },
      MuiChip: {
        styleOverrides: { root: { fontWeight: 600 } },
      },
    },
  });
}
