import { useCallback, useMemo, useRef, useState } from "react";
import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";
import {
  AuthGate,
  AuthService,
  migrateLegacyDataIfNeeded,
  SafetyAuthorizationPage,
  type AuthSession,
} from "@/features/auth";
import type { SafetyAuthorizationProfile } from "@/features/auth/safety-profile";
import { AppShell } from "@/features/layout/AppShell";
import { LocalStorageAdapter, ScopedStorage } from "@/infrastructure";
import { createAppTheme } from "@/shared/theme/create-app-theme";
import { activeProfile } from "@/application";
import {
  clearSyncCredentials,
  readSyncCredentials,
  storeSyncCredentials,
  syncProfileOnLogin,
  type ProfileSyncCredentials,
} from "@/features/profile-sync";
import { AppThemeProvider } from "./AppThemeProvider";
import { createServices, type Services } from "./container";
import { isDevSite } from "../dev-site";
import { DevLanding } from "@/features/auth/DevLanding";
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
  // Mirror safety profile into scoped storage for profile sync payloads.
  // Safety PII already lives under forge.u.<userId>.* — never copy other accounts here.
  try {
    const safety = auth.getSafetyProfile();
    if (safety) scoped.set("forge.auth.safetyProfile.v1", safety);
  } catch {
    /* ignore */
  }
  return services;
}

function pageView(): string | null {
  try {
    return new URLSearchParams(window.location.search).get("view");
  } catch {
    return null;
  }
}

function clearPageView(): void {
  const url = new URL(window.location.href);
  if (!url.searchParams.has("view")) return;
  url.searchParams.delete("view");
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

/** Gate the chart behind login/signup + safety authorization. */
export function App() {
  const devSite = useMemo(() => isDevSite(), []);
  const rawStorage = useMemo(() => new LocalStorageAdapter(), []);
  const auth = useMemo(() => new AuthService(rawStorage), [rawStorage]);
  const [session, setSession] = useState<AuthSession | null>(() => {
    const existing = auth.getSession();
    if (!existing) return null;
    // Incomplete safety — keep session object but force safety gate below.
    return existing;
  });
  const [needsSafetyBoot, setNeedsSafetyBoot] = useState(() => {
    const existing = auth.getSession();
    return Boolean(existing && auth.needsSafety(existing.userId));
  });
  const [view, setView] = useState<string | null>(() => pageView());
  const servicesRef = useRef<Services | null>(null);
  const [services, setServices] = useState<Services | null>(() => {
    const existing = auth.getSession();
    if (!existing || auth.needsSafety(existing.userId)) return null;
    const built = buildSessionServices(existing);
    servicesRef.current = built;
    // Resume cloud sync if this tab still has sessionStorage credentials.
    const creds = readSyncCredentials();
    if (creds) {
      void syncProfileOnLogin(built.storage, creds).then((result) => {
        if (!result.appliedRemote) return;
        // Remote won — rebuild services so chart mounts with synced autosave.
        servicesRef.current?.dispose();
        const rebuilt = buildSessionServices(existing);
        servicesRef.current = rebuilt;
        setServices(rebuilt);
      });
    }
    return built;
  });
  const gateTheme = useMemo(() => createAppTheme("dark"), []);

  const enter = useCallback(async (next: AuthSession, syncCreds: ProfileSyncCredentials) => {
    storeSyncCredentials(syncCreds);
    servicesRef.current?.dispose();
    // Build once into scoped storage, pull remote if newer, rebuild if applied.
    let built = buildSessionServices(next);
    try {
      const result = await syncProfileOnLogin(built.storage, syncCreds);
      if (result.appliedRemote) {
        built.dispose();
        built = buildSessionServices(next);
      }
    } catch {
      /* offline — local chart still works */
    }
    servicesRef.current = built;
    setServices(built);
    setNeedsSafetyBoot(false);
    clearPageView();
    setView(null);
    setSession(next);
  }, []);

  const completeBootSafety = useCallback(
    async (profile: SafetyAuthorizationProfile) => {
      const current = auth.getSession();
      if (!current) {
        setNeedsSafetyBoot(false);
        setSession(null);
        return;
      }
      const next = auth.saveSafetyProfile(current.userId, profile);
      const creds = readSyncCredentials();
      if (creds) {
        await enter(next, creds);
        return;
      }
      // No password in memory on cold resume — open charts locally; sync resumes on next login.
      servicesRef.current?.dispose();
      const built = buildSessionServices(next);
      servicesRef.current = built;
      setServices(built);
      setNeedsSafetyBoot(false);
      setSession(next);
    },
    [auth, enter],
  );

  const signOut = useCallback(() => {
    auth.logout();
    clearSyncCredentials();
    servicesRef.current?.dispose();
    servicesRef.current = null;
    setServices(null);
    setNeedsSafetyBoot(false);
    setSession(null);
    if (devSite) {
      const url = new URL(window.location.href);
      url.searchParams.set("view", "login");
      window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
      setView("login");
    }
  }, [auth, devSite]);

  if (devSite && view === "landing") {
    return <DevLanding signedIn={Boolean(session && services)} />;
  }

  if (needsSafetyBoot && session && view !== "login") {
    return (
      <ThemeProvider theme={gateTheme}>
        <CssBaseline />
        <SafetyAuthorizationPage
          username={session.username}
          displayName={session.displayName}
          initial={auth.getSafetyProfile() ?? undefined}
          onComplete={completeBootSafety}
          onBack={() => {
            signOut();
          }}
        />
      </ThemeProvider>
    );
  }

  if (!session || !services || (devSite && view === "login")) {
    return (
      <ThemeProvider theme={gateTheme}>
        <CssBaseline />
        <AuthGate
          auth={auth}
          onAuthenticated={async (s, creds) => {
            await enter(s, creds);
          }}
        />
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
