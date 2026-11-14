import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  DRAWINGS_UPDATED_EVENT,
  pullProfileIfNewer,
  syncProfileOnLogin,
  type ProfileSyncCredentials,
} from "@/features/profile-sync";
import { AppThemeProvider } from "./AppThemeProvider";
import { createServices, type Services } from "./container";
import { isDevSite } from "../dev-site";
import { DevLanding } from "@/features/auth/DevLanding";
import { SubscriptionPage } from "@/features/billing/SubscriptionPage";
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

function resumeSession(auth: AuthService): AuthSession | null {
  // ?view=login is an explicit sign-out. Do not revive a session the chart copied back.
  if (isDevSite() && pageView() === "login") {
    auth.logout();
    return null;
  }
  return auth.getSession();
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
    const existing = resumeSession(auth);
    if (!existing) return null;
    // Incomplete safety — keep session object but force safety gate below.
    return existing;
  });
  const [needsSafetyBoot, setNeedsSafetyBoot] = useState(() => {
    const existing = resumeSession(auth);
    return Boolean(existing && auth.needsSafety(existing.userId));
  });
  const [view, setView] = useState<string | null>(() => pageView());
  const servicesRef = useRef<Services | null>(null);
  const [services, setServices] = useState<Services | null>(null);
  const [bootDone, setBootDone] = useState(false);
  const gateTheme = useMemo(() => createAppTheme("dark"), []);

  // Pull the account before the chart mounts, so a trendline saved on the
  // computer is already here when the phone opens the same symbol.
  useEffect(() => {
    let cancelled = false;
    let built: Services | null = null;
    const existing = auth.getSession();
    if (pageView() === "login" || !existing || auth.needsSafety(existing.userId)) {
      setBootDone(true);
      return;
    }
    built = buildSessionServices(existing);
    const creds = readSyncCredentials();
    const finish = () => {
      if (cancelled || !built) {
        built?.dispose();
        return;
      }
      servicesRef.current = built;
      setServices(built);
      setBootDone(true);
    };
    if (!creds) {
      finish();
      return () => {
        cancelled = true;
      };
    }
    void (async () => {
      try {
        await syncProfileOnLogin(built!.storage, creds);
      } catch {
        /* offline — open the local chart */
      }
      finish();
    })();
    return () => {
      cancelled = true;
      built?.dispose();
      if (servicesRef.current === built) {
        servicesRef.current = null;
        setServices(null);
      }
    };
  }, [auth]);

  useEffect(() => {
    const current = services;
    if (!current) return;
    let pulling = false;
    const reloadChart = () => {
      const existing = auth.getSession();
      if (!existing || servicesRef.current !== current) return;
      current.dispose();
      const rebuilt = buildSessionServices(existing);
      servicesRef.current = rebuilt;
      setServices(rebuilt);
    };
    const pull = async () => {
      if (pulling || document.visibilityState === "hidden") return;
      const creds = readSyncCredentials();
      if (!creds) return;
      pulling = true;
      try {
        const result = await pullProfileIfNewer(current.storage, creds);
        if (!result.appliedRemote) return;
        reloadChart();
      } catch {
        /* offline */
      } finally {
        pulling = false;
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void pull();
    };
    const onDrawings = () => reloadChart();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener(DRAWINGS_UPDATED_EVENT, onDrawings);
    const timer = window.setInterval(() => void pull(), 12_000);
    void pull();
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(DRAWINGS_UPDATED_EVENT, onDrawings);
      window.clearInterval(timer);
    };
  }, [services, auth]);

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
    const dropSession = () => {
      try {
        auth.logout();
      } catch {
        /* storage blocked — React state still leaves the chart */
      }
      try {
        clearSyncCredentials();
      } catch {
        /* ignore */
      }
    };
    dropSession();
    try {
      servicesRef.current?.dispose();
    } catch {
      /* chart teardown must not keep the user signed in */
    }
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
    // The chart iframe writes the previous session back while its window closes.
    window.setTimeout(dropSession, 0);
    window.setTimeout(dropSession, 400);
    window.setTimeout(dropSession, 1200);
  }, [auth, devSite]);

  if (devSite && view === "landing") {
    return <DevLanding signedIn={Boolean(session && services)} />;
  }

  if (view === "subscribe" && !(needsSafetyBoot && session)) {
    const signedIn = Boolean(session && services);
    const go = (next: string | null) => {
      const url = new URL(window.location.href);
      url.searchParams.delete("view");
      if (next) url.searchParams.set("view", next);
      window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
      setView(next);
    };
    return (
      <ThemeProvider theme={gateTheme}>
        <CssBaseline />
        <SubscriptionPage
          signedIn={signedIn}
          onBack={() => go(signedIn ? null : devSite ? "login" : null)}
          onSignIn={() => go("login")}
        />
      </ThemeProvider>
    );
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

  if (session && !needsSafetyBoot && view !== "login" && !bootDone) {
    return (
      <ThemeProvider theme={gateTheme}>
        <CssBaseline />
      </ThemeProvider>
    );
  }

  if (!session || !services || view === "login") {
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
