import { useState, type FormEvent } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { LandingMark } from "@/brand/LandingMark";
import { AuthCard, AuthShell, authButtonSx, authFieldSx } from "./AuthShell";
import {
  clearSyncCredentials,
  deriveAccountKey,
  deriveSyncKey,
  type ProfileSyncCredentials,
} from "@/features/profile-sync";
import type { AuthService, AuthSession, PendingSignup } from "./auth-service";
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
    <AuthShell>
      <AuthCard>
        <Box component="form" onSubmit={(e) => void submitCredentials(e)}>
          <Stack spacing={2.5}>
            <Stack direction="row" spacing={1.25} sx={{ alignItems: "center", justifyContent: "center", color: "#f4f7ff" }}>
              <LandingMark size={28} />
              <Typography sx={{ fontWeight: 700, letterSpacing: "0.28em", fontSize: 15, color: "#f4f7ff" }}>
                FORGE
              </Typography>
            </Stack>
            <Box sx={{ textAlign: "center" }}>
              <Typography sx={{ fontWeight: 700, fontSize: 22, color: "#f4f7ff" }}>
                {mode === "login" ? "Log in" : "Create account"}
              </Typography>
              <Typography variant="body2" sx={{ color: "#8b97ad", mt: 0.75 }}>
                {mode === "login"
                  ? "Sign in so your layouts and chart styles stay with you."
                  : "Email and password. Your password stays on this device."}
              </Typography>
            </Box>

            <Box
              sx={{
                display: "flex",
                p: "3px",
                width: "100%",
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.08)",
                bgcolor: "rgba(255,255,255,0.03)",
              }}
            >
              {(["login", "signup"] as const).map((value) => {
                const selected = mode === value;
                return (
                  <Button
                    key={value}
                    type="button"
                    onClick={() => {
                      setMode(value);
                      setError(null);
                    }}
                    sx={{
                      flex: 1,
                      borderRadius: 999,
                      textTransform: "none",
                      fontWeight: 650,
                      py: 0.6,
                      color: selected ? "#050810" : "#8b97ad",
                      bgcolor: selected ? "#fff" : "transparent",
                      "&:hover": { bgcolor: selected ? "#fff" : "rgba(255,255,255,0.04)" },
                    }}
                  >
                    {value === "login" ? "Log in" : "Sign up"}
                  </Button>
                );
              })}
            </Box>

            <Stack spacing={1.5}>
              {mode === "signup" ? (
                <TextField
                  label="Display name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  autoComplete="nickname"
                  fullWidth
                  size="small"
                  sx={authFieldSx}
                />
              ) : null}
              <TextField
                label="Email"
                type="email"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
                fullWidth
                size="small"
                placeholder="you@email.com"
                helperText={mode === "signup" ? "Use a real email — needed for account recovery" : undefined}
                slotProps={{ htmlInput: { minLength: 5, maxLength: 64 } }}
                sx={authFieldSx}
              />
              <TextField
                label="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                required
                fullWidth
                size="small"
                slotProps={{ htmlInput: { minLength: 6 } }}
                sx={authFieldSx}
              />
              {mode === "signup" ? (
                <TextField
                  label="Confirm password"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  required
                  fullWidth
                  size="small"
                  slotProps={{ htmlInput: { minLength: 6 } }}
                  sx={authFieldSx}
                />
              ) : null}
              {error ? (
                <Alert severity="error" sx={{ py: 0.5 }}>
                  {error}
                </Alert>
              ) : null}
              <Button type="submit" variant="contained" disabled={busy} fullWidth sx={authButtonSx}>
                {busy ? (
                  <CircularProgress size={22} sx={{ color: "#fff" }} />
                ) : mode === "login" ? (
                  "Log in"
                ) : (
                  "Continue"
                )}
              </Button>
            </Stack>

            <Typography variant="caption" sx={{ color: "#8b97ad", textAlign: "center", display: "block" }}>
              {mode === "signup"
                ? "Next: name and terms. Passwords stay on this device."
                : "Passwords stay on this device. Other people need their own account."}
            </Typography>
          </Stack>
        </Box>
      </AuthCard>
    </AuthShell>
  );
}
