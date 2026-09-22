import { AppShell } from "@/features/layout/AppShell";
import { AppThemeProvider } from "./AppThemeProvider";
import type { Services } from "./container";
import { ServicesProvider } from "./ServicesProvider";

interface AppProps {
  readonly services: Services;
}

export function App({ services }: AppProps) {
  return (
    <ServicesProvider services={services}>
      <AppThemeProvider>
        <AppShell />
      </AppThemeProvider>
    </ServicesProvider>
  );
}
