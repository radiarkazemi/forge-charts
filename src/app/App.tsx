import { useCallback, useMemo, useRef, useState } from "react";
import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";
import { AuthGate, AuthService, migrateLegacyDataIfNeeded, type AuthSession } from "@/features/auth";
import { AppShell } from "@/features/layout/AppShell";
import { LocalStorageAdapter, ScopedStorage } from "@/infrastructure";
import { createAppTheme } from "@/shared/theme/create-app-theme";
import { activeProfile } from "@/application";
import { AppThemeProvider } from "./AppThemeProvider";
import { createServices, type Services } from "./container";
import { ServicesProvider } from "./ServicesProvider";

function buildSessionServices(session: AuthSession): Services {
  const raw = new LocalStorageAdapter();
  const auth = new AuthService(raw);
  const scoped = new ScopedStorage(raw, session.userId);
  migrateLegacyDataIfNeeded(auth, raw, scoped, session);
  const services = createServices(undefined, scoped);
  // Keep the in-app profile name in sync with the signed-in account.
  try {
    const snap = services.settings.settings.get();
    const active = activeProfile(snap);
    if (
      active.username !== session.username ||
      (session.displayName && active.displayName !== session.displayName)
    ) {
      services.settings.upsertProfile({
        ...active,
        username: session.username,
        displayName: session.displayName || active.displayName,
        avatarInitial: (session.displayName || session.username || "U")
          .slice(0, 1)
          .toUpperCase(),
      });
    }
  } catch {
    /* ignore */
  }
  return services;
}

/** Gate the chart behind login/signup. Each account gets isolated ScopedStorage. */
export function App() {
  const rawStorage = useMemo(() => new LocalStorageAdapter(), []);
  const auth = useMemo(() => new AuthService(rawStorage), [rawStorage]);
  const [session, setSession] = useState<AuthSession | null>(() => auth.getSession());
  const servicesRef = useRef<Services | null>(null);

  const [services, setServices] = useState<Services | null>(() => {
    const existing = auth.getSession();
    if (!existing) return null;
    const built = buildSessionServices(existing);
    servicesRef.current = built;
    return built;
  });

  const gateTheme = useMemo(() => createAppTheme("dark"), []);

  const enter = useCallback((next: AuthSession) => {
    servicesRef.current?.dispose();
    const built = buildSessionServices(next);
    servicesRef.current = built;
    setServices(built);
    setSession(next);
  }, []);

  const signOut = useCallback(() => {
    auth.logout();
    servicesRef.current?.dispose();
    servicesRef.current = null;
    setServices(null);
    setSession(null);
  }, [auth]);

  if (!session || !services) {
    return (
      <ThemeProvider theme={gateTheme}>
        <CssBaseline />
        <AuthGate auth={auth} onAuthenticated={enter} />
      </ThemeProvider>
    );
  }

  return (
    <ServicesProvider services={services}>
      <AppThemeProvider>
        <AppShell onSignOut={signOut} />
      </AppThemeProvider>
    </ServicesProvider>
  );
}
