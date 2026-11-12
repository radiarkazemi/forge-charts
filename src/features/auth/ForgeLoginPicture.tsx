import { useState, type FormEvent } from "react";
import Box from "@mui/material/Box";
import { isDevSite } from "@/dev-site";

function loginArtSrc(): string {
  const base = import.meta.env.BASE_URL || "/";
  const root = base.endsWith("/") ? base : `${base}/`;
  return `${root}brand/forge-login.png`;
}

interface ForgeLoginPictureProps {
  readonly mode: "login" | "signup";
  readonly username: string;
  readonly password: string;
  readonly confirm: string;
  readonly displayName: string;
  readonly error: string | null;
  readonly busy: boolean;
  readonly onMode: (mode: "login" | "signup") => void;
  readonly onUsername: (value: string) => void;
  readonly onPassword: (value: string) => void;
  readonly onConfirm: (value: string) => void;
  readonly onDisplayName: (value: string) => void;
  readonly onSubmit: (event: FormEvent) => void;
}

const fieldBase = {
  position: "absolute" as const,
  border: "none",
  outline: "none",
  background: "transparent",
  color: "#f5f5f5",
  fontFamily: '"Segoe UI", "Helvetica Neue", Arial, sans-serif',
  fontSize: "1.45cqw",
  padding: "0 2.2cqw 0 2.6cqw",
  boxSizing: "border-box" as const,
  caretColor: "#f0c27a",
};

/**
 * Sign-in screen painted as the supplied Forge artwork.
 * Fields sit on the card in the picture so the page matches it.
 */
export function ForgeLoginPicture({
  mode,
  username,
  password,
  confirm,
  displayName,
  error,
  busy,
  onMode,
  onUsername,
  onPassword,
  onConfirm,
  onDisplayName,
  onSubmit,
}: ForgeLoginPictureProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [robot, setRobot] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const dev = isDevSite();

  const submit = (event: FormEvent) => {
    if (!robot) {
      event.preventDefault();
      setLocalError("Confirm you are not a robot.");
      return;
    }
    setLocalError(null);
    onSubmit(event);
  };

  const message = localError || error;

  return (
    <Box
      sx={{
        height: "100dvh",
        bgcolor: "#000",
        display: "grid",
        placeItems: "center",
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          position: "relative",
          width: "min(100vw, calc(100dvh * 1672 / 941))",
          aspectRatio: "1672 / 941",
          containerType: "size",
        }}
      >
        <Box
          component="img"
          src={loginArtSrc()}
          alt=""
          sx={{ width: "100%", height: "100%", display: "block", userSelect: "none", pointerEvents: "none" }}
        />
        <Box component="form" onSubmit={submit} sx={{ position: "absolute", inset: 0 }}>
          {dev ? (
            <Box
              component="a"
              href="?view=landing"
              sx={{
                position: "absolute",
                left: "2%",
                top: "2.2%",
                color: "#f0d2a8",
                fontSize: "1.15cqw",
                fontWeight: 600,
                textDecoration: "none",
                letterSpacing: "0.04em",
              }}
            >
              Landing
            </Box>
          ) : null}

          {mode === "signup" ? (
            <Box
              component="input"
              aria-label="Display name"
              placeholder="Name"
              value={displayName}
              onChange={(e) => onDisplayName(e.target.value)}
              autoComplete="nickname"
              sx={{
                ...fieldBase,
                left: "63.6%",
                top: "42.2%",
                width: "22.2%",
                height: "5.6%",
                borderRadius: "8px",
                bgcolor: "rgba(8,8,8,0.92)",
                border: "1px solid rgba(240,194,122,0.35)",
              }}
            />
          ) : null}

          <Box
            component="input"
            aria-label="Email"
            type="email"
            required
            value={username}
            onChange={(e) => onUsername(e.target.value)}
            autoComplete="username"
            sx={{
              ...fieldBase,
              left: "63.6%",
              top: mode === "signup" ? "48.9%" : "48.9%",
              width: "22.2%",
              height: "6.4%",
              bgcolor: username ? "rgba(8,8,8,0.88)" : "transparent",
              borderRadius: "10px",
            }}
          />
          <Box
            component="input"
            aria-label="Password"
            type={showPassword ? "text" : "password"}
            required
            minLength={6}
            value={password}
            onChange={(e) => onPassword(e.target.value)}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            sx={{
              ...fieldBase,
              left: "63.6%",
              top: "55.5%",
              width: "20.2%",
              height: "6.2%",
              bgcolor: password ? "rgba(8,8,8,0.88)" : "transparent",
              borderRadius: "10px",
            }}
          />
          <Box
            component="button"
            type="button"
            aria-label={showPassword ? "Hide password" : "Show password"}
            onClick={() => setShowPassword((v) => !v)}
            sx={{
              position: "absolute",
              left: "83.6%",
              top: "56.2%",
              width: "2.4%",
              height: "4.6%",
              p: 0,
              border: "none",
              bgcolor: "transparent",
              cursor: "pointer",
            }}
          />
          <Box
            component="input"
            aria-label="I'm not a robot"
            type="checkbox"
            checked={robot}
            onChange={(e) => {
              setRobot(e.target.checked);
              setLocalError(null);
            }}
            sx={{
              position: "absolute",
              left: "63.1%",
              top: "60.15%",
              width: "1.55%",
              height: "2.6%",
              m: 0,
              accentColor: "#e0b56a",
              cursor: "pointer",
            }}
          />

          {mode === "signup" ? (
            <Box
              component="input"
              aria-label="Confirm password"
              type="password"
              required
              minLength={6}
              value={confirm}
              onChange={(e) => onConfirm(e.target.value)}
              placeholder="Confirm password"
              autoComplete="new-password"
              sx={{
                ...fieldBase,
                left: "63.6%",
                top: "76.2%",
                width: "22.2%",
                height: "5.4%",
                borderRadius: "8px",
                bgcolor: "rgba(8,8,8,0.92)",
                border: "1px solid rgba(240,194,122,0.35)",
              }}
            />
          ) : null}

          {message ? (
            <Box
              sx={{
                position: "absolute",
                left: "63.6%",
                top: "45.6%",
                width: "22%",
                color: "#ffb4b4",
                fontSize: "1.05cqw",
                lineHeight: 1.2,
                textShadow: "0 1px 2px #000",
              }}
            >
              {message}
            </Box>
          ) : null}

          <Box
            component="button"
            type="submit"
            disabled={busy}
            aria-label={mode === "login" ? "Sign in" : "Create account"}
            sx={{
              position: "absolute",
              left: "62.7%",
              top: "68.15%",
              width: "23%",
              height: "6.7%",
              border: "none",
              bgcolor: "transparent",
              cursor: busy ? "progress" : "pointer",
              borderRadius: "8px",
            }}
          />

          <Box
            component="button"
            type="button"
            onClick={() => onMode(mode === "login" ? "signup" : "login")}
            sx={{
              position: "absolute",
              left: "63.6%",
              top: mode === "signup" ? "82.4%" : "76.4%",
              border: "none",
              bgcolor: "transparent",
              color: "#e7c79a",
              fontSize: "1.15cqw",
              cursor: "pointer",
              p: 0,
              textShadow: "0 1px 2px #000",
            }}
          >
            {mode === "login" ? "Create account" : "Back to sign in"}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
