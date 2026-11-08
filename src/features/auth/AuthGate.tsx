import { useState, type FormEvent } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { ForgeMark } from "@/brand/ForgeMark";
import {
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
      if (auth.needsSafety(session.userId)) {
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
        initial={
          pendingLogin ? auth.getSafetyProfile(pendingLogin.session.userId) ?? undefined : undefined
        }
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
    <Box
      sx={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        px: 2,
        background:
          "radial-gradient(1200px 600px at 20% -10%, rgba(41,98,255,0.22), transparent 55%), radial-gradient(900px 500px at 90% 110%, rgba(92,225,255,0.12), transparent 50%), #0b0e14",
      }}
    >
      <Box
        component="form"
        onSubmit={(e) => void submitCredentials(e)}
        sx={{
          width: "100%",
          maxWidth: 400,
          bgcolor: "#1e222d",
          border: "1px solid #2a2e39",
          borderRadius: 2,
          p: { xs: 2.5, sm: 3.5 },
          boxShadow: "0 24px 64px rgba(0,0,0,0.45)",
        }}
      >
        <Stack spacing={2.5} sx={{ alignItems: "center" }}>
          <ForgeMark theme="dark" size={48} />
          <Box sx={{ textAlign: "center" }}>
            <Typography variant="h5" sx={{ fontWeight: 700, color: "#f5f7fb", letterSpacing: 0.2 }}>
              Forge Charts
            </Typography>
            <Typography variant="body2" sx={{ color: "#787b86", mt: 0.75 }}>
              Sign in so your Radiar layout, starred indicators, and candle styles
              stay the same on every computer.
            </Typography>
          </Box>

          <Tabs
            value={mode}
            onChange={(_, v: Mode) => {
              setMode(v);
              setError(null);
            }}
            variant="fullWidth"
            sx={{
              width: "100%",
              minHeight: 40,
              "& .MuiTab-root": { color: "#787b86", minHeight: 40, textTransform: "none" },
              "& .Mui-selected": { color: "#d1d4dc !important" },
              "& .MuiTabs-indicator": { bgcolor: "#2962ff" },
            }}
          >
            <Tab value="login" label="Log in" />
            <Tab value="signup" label="Sign up" />
          </Tabs>

          <Stack spacing={1.5} sx={{ width: "100%" }}>
            {mode === "signup" ? (
              <TextField
                label="Display name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                autoComplete="nickname"
                fullWidth
                size="small"
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
              />
            ) : null}
            {error ? (
              <Alert severity="error" sx={{ py: 0.5 }}>
                {error}
              </Alert>
            ) : null}
            <Button
              type="submit"
              variant="contained"
              disabled={busy}
              fullWidth
              sx={{
                mt: 0.5,
                py: 1.1,
                bgcolor: "#2962ff",
                textTransform: "none",
                fontWeight: 600,
                "&:hover": { bgcolor: "#1e4fd6" },
              }}
            >
              {busy ? (
                <CircularProgress size={22} sx={{ color: "#fff" }} />
              ) : mode === "login" ? (
                "Log in"
              ) : (
                "Continue"
              )}
            </Button>
          </Stack>

          <Typography variant="caption" sx={{ color: "#787b86", textAlign: "center" }}>
            {mode === "signup"
              ? "Next: safety & authorization details (name, phone, ID). Passwords stay on this device."
              : "Passwords stay on this device. Other people need their own account — they cannot open yours without your password."}
          </Typography>
        </Stack>
      </Box>
    </Box>
  );
}
