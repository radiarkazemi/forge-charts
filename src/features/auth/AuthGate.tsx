import { useState, type FormEvent } from "react";
import { ForgeLoginPicture } from "./ForgeLoginPicture";
import {
  clearSyncCredentials,
  deriveAccountKey,
  deriveSyncKey,
  type ProfileSyncCredentials,
} from "@/features/profile-sync";
import type { AuthService, AuthSession, PendingSignup } from "./auth-service";
import { verifyGoogleIdToken } from "./google-sign-in";
import { SafetyAuthorizationPage } from "./SafetyAuthorizationPage";
import type { SafetyAuthorizationProfile } from "./safety-profile";

interface AuthGateProps {
  readonly auth: AuthService;
  /** Must resolve only after chart services are ready — keeps the form busy. */
  readonly onAuthenticated: (
    session: AuthSession,
    syncCreds: ProfileSyncCredentials,
  ) => void | Promise<void>;
}

type Mode = "login" | "signup";
type Phase = "credentials" | "safety";

/** Full-screen gate — chart never mounts until a valid session + safety profile exist. */
export function AuthGate({ auth, onAuthenticated }: AuthGateProps) {
  const [mode, setMode] = useState<Mode>("login");
  const [phase, setPhase] = useState<Phase>("credentials");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingSignup, setPendingSignup] = useState<PendingSignup | null>(null);
  const [pendingLogin, setPendingLogin] = useState<{
    session: AuthSession;
    password: string;
  } | null>(null);

  const finishAuth = async (session: AuthSession, plainPassword: string) => {
    const syncCreds: ProfileSyncCredentials = {
      accountKey: await deriveAccountKey(session.username),
      syncKey: await deriveSyncKey(session.username, plainPassword),
    };
    await onAuthenticated(session, syncCreds);
  };

  const submitCredentials = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      // Drop any previous account’s sync keys before touching a new identity.
      clearSyncCredentials();
      if (mode === "signup") {
        if (password !== confirm) throw new Error("Passwords do not match.");
        const pending = await auth.beginSignUp({
          username,
          password,
          displayName: displayName || undefined,
        });
        setPendingSignup(pending);
        setPendingLogin(null);
        setPhase("safety");
        setBusy(false);
        return;
      }

      const session = await auth.login(username, password);
      if (auth.needsSafety()) {
        setPendingLogin({ session, password });
        setPendingSignup(null);
        setPhase("safety");
        setBusy(false);
        return;
      }
      await finishAuth(session, password);
      // stay busy — App unmounts this gate when session is ready
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setBusy(false);
    }
  };

  const submitGoogle = async (idToken: string) => {
    setError(null);
    setBusy(true);
    try {
      clearSyncCredentials();
      const profile = await verifyGoogleIdToken(idToken);
      const result = auth.signInWithGoogle(profile);
      if (result.kind === "pending") {
        setPendingSignup(result.pending);
        setPendingLogin(null);
        setUsername(result.pending.username);
        setDisplayName(result.pending.displayName);
        setPhase("safety");
        setBusy(false);
        return;
      }
      if (auth.needsSafety(result.session.userId)) {
        setPendingLogin({ session: result.session, password: result.syncSecret });
        setPendingSignup(null);
        setPhase("safety");
        setBusy(false);
        return;
      }
      await finishAuth(result.session, result.syncSecret);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setBusy(false);
    }
  };

  const completeSafety = async (profile: SafetyAuthorizationProfile) => {
    setError(null);
    setBusy(true);
    try {
      if (pendingSignup) {
        const session = await auth.completeSignup(pendingSignup, profile);
        await finishAuth(session, pendingSignup.password);
        return;
      }
      if (pendingLogin) {
        const session = auth.saveSafetyProfile(pendingLogin.session.userId, profile);
        await finishAuth(session, pendingLogin.password);
        return;
      }
      throw new Error("Signup expired. Please start again.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setBusy(false);
      throw err instanceof Error ? err : new Error("Something went wrong.");
    }
  };

  if (phase === "safety") {
    const name = pendingSignup?.username || pendingLogin?.session.username || username;
    const label = pendingSignup?.displayName || pendingLogin?.session.displayName || displayName;
    return (
      <SafetyAuthorizationPage
        username={name}
        displayName={label}
        initial={pendingLogin ? auth.getSafetyProfile() ?? undefined : undefined}
        onComplete={completeSafety}
        onBack={
          pendingSignup
            ? undefined
            : () => {
                setPhase("credentials");
                setPendingLogin(null);
                setError(null);
                auth.logout();
              }
        }
      />
    );
  }

  return (
    <ForgeLoginPicture
      mode={mode}
      username={username}
      password={password}
      confirm={confirm}
      displayName={displayName}
      error={error}
      busy={busy}
      onMode={(next) => {
        setMode(next);
        setError(null);
      }}
      onUsername={setUsername}
      onPassword={setPassword}
      onConfirm={setConfirm}
      onDisplayName={setDisplayName}
      onSubmit={(e) => void submitCredentials(e)}
      onGoogleCredential={(idToken) => void submitGoogle(idToken)}
    />
  );
}
