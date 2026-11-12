import { useState, type FormEvent } from "react";
import Box from "@mui/material/Box";
import { isDevSite } from "@/dev-site";

function brandSrc(file: string): string {
  const base = import.meta.env.BASE_URL || "/";
  const root = base.endsWith("/") ? base : `${base}/`;
  return `${root}brand/${file}`;
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

const CHECK_URL = `url("data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><path d='M3 8.2 6.4 11.5 13 4.5' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/></svg>`,
)}")`;

const fieldInputSx = {
  width: "100%",
  height: "100%",
  border: "none",
  outline: "none",
  background: "transparent",
  color: "#f4f1ec",
  font: "inherit",
  fontSize: "2.55cqh",
  letterSpacing: "0.01em",
  padding: "0 2cqw",
  boxSizing: "border-box" as const,
  "&:-webkit-autofill, &:-webkit-autofill:hover, &:-webkit-autofill:focus": {
    WebkitTextFillColor: "#f4f1ec",
    WebkitBoxShadow: "0 0 0 1000px #0d0d0c inset",
    caretColor: "#f0c27a",
    transition: "background-color 99999s ease-out",
  },
};

/**
 * The full molten scene, with a real sign-in form sitting on the card
 * in the same place as the original artwork.
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
  const message = localError || error;

  const submit = (event: FormEvent) => {
    if (!robot) {
      event.preventDefault();
      setLocalError("Confirm you are not a robot.");
      return;
    }
    setLocalError(null);
    onSubmit(event);
  };

  return (
    <Box
      sx={{
        minHeight: "100dvh",
        bgcolor: "#000",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: { xs: "auto", md: "hidden" },
      }}
    >
      <Box
        sx={{
          position: "relative",
          width: { xs: "100%", md: "min(100vw, calc(100dvh * 1672 / 941))" },
          aspectRatio: { md: "1672 / 941" },
          display: { xs: "flex", md: "block" },
          flexDirection: "column",
          alignItems: "center",
          containerType: { md: "size" },
        }}
      >
        <Box
          component="img"
          src={brandSrc("forge-background.png")}
          alt=""
          sx={{
            position: { xs: "relative", md: "absolute" },
            inset: { md: 0 },
            width: "100%",
            height: { xs: "auto", md: "100%" },
            display: "block",
            userSelect: "none",
            pointerEvents: "none",
          }}
        />

        {dev ? (
          <Box
            component="a"
            href="?view=landing"
            sx={{
              position: "absolute",
              zIndex: 3,
              left: "1.6%",
              top: "2.4%",
              color: "#f3ddb8",
              textDecoration: "none",
              fontSize: { xs: 13, md: "1.15cqw" },
              fontFamily: '"Segoe UI", "Helvetica Neue", Arial, sans-serif',
              fontWeight: 600,
              letterSpacing: "0.04em",
              px: "0.8cqw",
              py: "0.35cqw",
              borderRadius: "999px",
              bgcolor: "rgba(0,0,0,0.45)",
              border: "1px solid rgba(240,200,140,0.28)",
            }}
          >
            Landing
          </Box>
        ) : null}

        <Box
          component="form"
          onSubmit={submit}
          sx={{
            position: { xs: "relative", md: "absolute" },
            left: { xs: "auto", md: "54.713%" },
            top: { xs: "auto", md: "12.585%" },
            width: { xs: "min(92vw, 440px)", md: "38.15%" },
            height: { xs: "auto", md: "75.079%" },
            aspectRatio: { xs: "1192 / 1320", md: "auto" },
            my: { xs: 2, md: 0 },
            containerType: "size",
            fontFamily: '"Segoe UI", "Helvetica Neue", Arial, sans-serif',
          }}
        >
          <Box
            component="img"
            src={brandSrc("forge-login-form.png")}
            alt=""
            sx={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              display: "block",
              userSelect: "none",
              pointerEvents: "none",
            }}
          />

          <Box
            component="input"
            aria-label="Email"
            type="email"
            required
            value={username}
            autoComplete="username"
            onChange={(event) => onUsername(event.target.value)}
            sx={{
              ...fieldInputSx,
              position: "absolute",
              left: "23.3%",
              top: "37.0%",
              width: "61%",
              height: "9.6%",
              bgcolor: username ? "#0d0d0c" : "transparent",
            }}
          />
          <Box
            component="input"
            aria-label="Password"
            type={showPassword ? "text" : "password"}
            required
            minLength={6}
            value={password}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            onChange={(event) => onPassword(event.target.value)}
            sx={{
              ...fieldInputSx,
              position: "absolute",
              left: "23.3%",
              top: "48.6%",
              width: "54%",
              height: "10%",
              bgcolor: password ? "#0d0d0c" : "transparent",
            }}
          />
          <Box
            component="button"
            type="button"
            aria-label={showPassword ? "Hide password" : "Show password"}
            onClick={() => setShowPassword((value) => !value)}
            sx={{
              position: "absolute",
              left: "77.6%",
              top: "49.6%",
              width: "6.7%",
              height: "5.3%",
              p: 0,
              border: "none",
              bgcolor: "transparent",
              cursor: "pointer",
            }}
          />
          <Box
            component="input"
            type="checkbox"
            aria-label="I'm not a robot"
            checked={robot}
            onChange={(event) => {
              setRobot(event.target.checked);
              setLocalError(null);
            }}
            sx={{
              position: "absolute",
              left: "18.0%",
              top: "62.7%",
              width: "5.4%",
              height: "4.6%",
              m: 0,
              p: 0,
              appearance: "none",
              WebkitAppearance: "none",
              bgcolor: "transparent",
              border: "none",
              cursor: "pointer",
              backgroundRepeat: "no-repeat",
              backgroundPosition: "center",
              backgroundSize: "78%",
              "&:checked": { backgroundImage: CHECK_URL },
            }}
          />

          {mode === "signup" ? (
            <>
              <Box
                component="input"
                aria-label="Name"
                placeholder="Name"
                value={displayName}
                autoComplete="nickname"
                onChange={(event) => onDisplayName(event.target.value)}
                sx={{
                  ...fieldInputSx,
                  position: "absolute",
                  left: "16%",
                  top: "28.2%",
                  width: "68%",
                  height: "7.2%",
                  borderRadius: "10px",
                  border: "1px solid rgba(232,190,120,0.4)",
                  bgcolor: "rgba(8,8,8,0.92)",
                  "&::placeholder": { color: "#a8a097", opacity: 1 },
                }}
              />
              <Box
                component="input"
                aria-label="Confirm password"
                placeholder="Confirm password"
                type="password"
                required
                minLength={6}
                value={confirm}
                autoComplete="new-password"
                onChange={(event) => onConfirm(event.target.value)}
                sx={{
                  ...fieldInputSx,
                  position: "absolute",
                  left: "16%",
                  top: "86.2%",
                  width: "68%",
                  height: "7.2%",
                  borderRadius: "10px",
                  border: "1px solid rgba(232,190,120,0.4)",
                  bgcolor: "rgba(8,8,8,0.92)",
                  "&::placeholder": { color: "#a8a097", opacity: 1 },
                }}
              />
            </>
          ) : null}

          {message ? (
            <Box
              sx={{
                position: "absolute",
                left: "16%",
                top: "70.6%",
                width: "68%",
                color: "#ffb4b4",
                fontSize: "1.9cqh",
                lineHeight: 1.2,
                textAlign: "center",
                textShadow: "0 1px 2px #000",
                pointerEvents: "none",
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
              left: "12.6%",
              top: "73.3%",
              width: "75.1%",
              height: "10.9%",
              border: "none",
              bgcolor: "transparent",
              cursor: busy ? "progress" : "pointer",
              color: "transparent",
              font: "inherit",
            }}
          >
            {busy ? "Please wait" : mode === "login" ? "Sign In" : "Create account"}
          </Box>

          <Box
            component="button"
            type="button"
            onClick={() => onMode(mode === "login" ? "signup" : "login")}
            sx={{
              position: "absolute",
              left: "30%",
              top: mode === "signup" ? "94%" : "86.5%",
              width: "40%",
              border: "none",
              bgcolor: "transparent",
              color: "#e7c79a",
              font: "inherit",
              fontSize: "2.1cqh",
              cursor: "pointer",
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
