import { useMemo, type ReactNode } from "react";
import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";
import { createAppTheme } from "@/shared/theme/create-app-theme";
import { useStore } from "@/shared/hooks/useStore";
import { useServices } from "./use-services";

export function AppThemeProvider({ children }: { readonly children: ReactNode }) {
  const { settings } = useServices();
  const mode = useStore(settings.settings, (s) => s.theme);
  const theme = useMemo(() => createAppTheme(mode), [mode]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}
