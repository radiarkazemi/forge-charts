import { useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import Box from "@mui/material/Box";
import { isDevSite } from "@/dev-site";
import { RecaptchaField } from "./RecaptchaField";

function brandSrc(file: string): string {
  const base = import.meta.env.BASE_URL || "/";
  const root = base.endsWith("/") ? base : `${base}/`;
  return `${root}brand/${file}`;
}

interface MobileForgeLoginProps {
  readonly mode: "login" | "signup";
  readonly username: string;
  readonly password: string;
  readonly confirm: string;
  readonly displayName: string;
  readonly error: string | null;
  readonly busy: boolean;
  readonly showPassword: boolean;
  readonly onTogglePassword: () => void;
  readonly onMode: (mode: "login" | "signup") => void;
  readonly onUsername: (value: string) => void;
  readonly onPassword: (value: string) => void;
  readonly onConfirm: (value: string) => void;
  readonly onDisplayName: (value: string) => void;
  readonly onCaptcha: (token: string | null) => void;
  readonly onCaptchaError: (message: string) => void;
  readonly onSubmit: (event: FormEvent) => void;
}

const fieldInput = {
  flex: 1,
  minWidth: 0,
  border: "none",
  outline: "none",
  background: "transparent",
  color: "#f6f3ee",
  font: "inherit",
  fontSize: 16,
  "&::placeholder": { color: "#b7b1a8", opacity: 1 },
  "&:-webkit-autofill, &:-webkit-autofill:hover, &:-webkit-autofill:focus": {
    WebkitTextFillColor: "#f6f3ee",
    WebkitBoxShadow: "0 0 0 1000px #12100e inset",
    caretColor: "#f0c27a",
    transition: "background-color 99999s ease-out",
  },
};

function EnvelopeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden fill="none" stroke="#f3efe8" strokeWidth="1.6">
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
      <path d="M4 7l8 6 8-6" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden fill="none" stroke="#f3efe8" strokeWidth="1.6">
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function PersonIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden fill="none" stroke="#f3efe8" strokeWidth="1.6">
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5 19c1.4-3 3.8-4.5 7-4.5S17.6 16 19 19" />
    </svg>
  );
}

function EyeIcon({ open }: { readonly open: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden fill="none" stroke="#c8c2b8" strokeWidth="1.6">
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z" />
      <circle cx="12" cy="12" r="2.5" />
      {open ? null : <path d="M4 5l16 14" />}
    </svg>
  );
}

function MobileField({
  icon,
  label,
  type = "text",
  value,
  onChange,
  autoComplete,
  required = true,
  minLength,
  end,
}: {
  readonly icon: ReactNode;
  readonly label: string;
  readonly type?: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly autoComplete: string;
  readonly required?: boolean;
  readonly minLength?: number;
  readonly end?: ReactNode;
}) {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1.25,
        height: 52,
        px: 1.75,
        borderRadius: "12px",
        border: "1px solid rgba(226, 216, 200, 0.42)",
        bgcolor: "rgba(0,0,0,0.38)",
        "&:focus-within": {
          borderColor: "rgba(232, 196, 130, 0.8)",
          boxShadow: "0 0 0 1px rgba(232, 196, 130, 0.25)",
        },
      }}
    >
      {icon}
      <Box
        component="input"
        aria-label={label}
        placeholder={label}
        type={type}
        required={required}
        minLength={minLength}
        value={value}
        autoComplete={autoComplete}
        onChange={(event) => onChange(event.target.value)}
        sx={fieldInput}
      />
      {end}
    </Box>
  );
}

/** Phone sign-in and create-account, matching the stacked molten-gold card. */
export function MobileForgeLogin({
  mode,
  username,
  password,
  confirm,
  displayName,
  error,
  busy,
  showPassword,
  onTogglePassword,
  onMode,
  onUsername,
  onPassword,
  onConfirm,
  onDisplayName,
  onCaptcha,
  onCaptchaError,
  onSubmit,
}: MobileForgeLoginProps) {
  const captchaSlot = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [notice, setNotice] = useState<string | null>(null);
  const signup = mode === "signup";
  const dev = isDevSite();

  useLayoutEffect(() => {
    const slot = captchaSlot.current;
    if (!slot) return;
    const fit = () => setZoom(Math.min(1, slot.clientWidth / 304));
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(slot);
    return () => observer.disconnect();
  }, [mode]);

  return (
    <Box
      sx={{
        minHeight: "100dvh",
        bgcolor: "#050403",
        color: "#f6f3ee",
        fontFamily: '"Segoe UI", "Helvetica Neue", Arial, sans-serif',
        overflow: "auto",
      }}
    >
      <Box sx={{ position: "relative" }}>
        <Box
          component="img"
          src={brandSrc("forge-mobile-hero.webp")}
          alt=""
          sx={{ width: "100%", height: "auto", display: "block", userSelect: "none" }}
        />
        <Box
          sx={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: 56,
            background: "linear-gradient(transparent, #050403)",
            pointerEvents: "none",
          }}
        />
      </Box>

      <Box
        component="form"
        onSubmit={onSubmit}
        sx={{
          position: "relative",
          zIndex: 1,
          maxWidth: 440,
          mx: "auto",
          px: 2,
          mt: -2.5,
          pb: 4,
        }}
      >
        <Box
          component={dev ? "a" : "div"}
          href={dev ? "?view=landing" : undefined}
          aria-label={dev ? "Forge" : undefined}
          sx={{
            position: "absolute",
            zIndex: 2,
            top: 0,
            left: "50%",
            transform: "translate(-50%, -28%)",
            lineHeight: 0,
          }}
        >
          <Box
            component="img"
            src={brandSrc("forge-f.png")}
            alt=""
            sx={{ height: 42, width: "auto", display: "block" }}
          />
        </Box>

        <Box
          sx={{
            clipPath: "polygon(26px 0, 100% 0, 100% calc(100% - 32px), calc(100% - 32px) 100%, 0 100%, 0 26px)",
            background: "linear-gradient(160deg, rgba(236,198,120,0.95), rgba(90,74,48,0.35) 28%, rgba(236,198,120,0.55) 100%)",
            p: "1px",
            filter: "drop-shadow(0 18px 36px rgba(0,0,0,0.55))",
          }}
        >
          <Box
            sx={{
              bgcolor: "#100e0c",
              backgroundImage: "linear-gradient(180deg, rgba(255,220,150,0.05), transparent 18%)",
              px: 2.5,
              pt: 5.5,
              pb: 2.75,
            }}
          >
            <Box sx={{ textAlign: "center", mb: 2.25 }}>
              <Box sx={{ fontSize: 28, fontWeight: 650, letterSpacing: "-0.03em", lineHeight: 1.15 }}>
                {signup ? "Create account" : "Welcome back"}
              </Box>
              <Box sx={{ mt: 0.5, color: "#c9c3ba", fontSize: 15 }}>
                {signup ? "Join Forge" : "Sign in to Forge"}
              </Box>
            </Box>

            <Box sx={{ display: "flex", flexDirection: "column", gap: 1.35 }}>
              {signup ? (
                <MobileField
                  icon={<PersonIcon />}
                  label="Name"
                  value={displayName}
                  onChange={onDisplayName}
                  autoComplete="nickname"
                  required={false}
                />
              ) : null}
              <MobileField
                icon={<EnvelopeIcon />}
                label="Email"
                type="email"
                value={username}
                onChange={onUsername}
                autoComplete="username"
              />
              <MobileField
                icon={<LockIcon />}
                label="Password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={onPassword}
                autoComplete={signup ? "new-password" : "current-password"}
                minLength={6}
                end={(
                  <Box
                    component="button"
                    type="button"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    onClick={onTogglePassword}
                    sx={{ p: 0, border: "none", bgcolor: "transparent", cursor: "pointer", lineHeight: 0 }}
                  >
                    <EyeIcon open={showPassword} />
                  </Box>
                )}
              />
              {signup ? (
                <MobileField
                  icon={<LockIcon />}
                  label="Confirm password"
                  type="password"
                  value={confirm}
                  onChange={onConfirm}
                  autoComplete="new-password"
                  minLength={6}
                />
              ) : (
                <Box sx={{ display: "flex", justifyContent: "flex-end", mt: -0.25 }}>
                  <Box
                    component="button"
                    type="button"
                    onClick={() => setNotice("Password reset isn't available yet. Use the password for this account.")}
                    sx={{
                      p: 0,
                      border: "none",
                      bgcolor: "transparent",
                      color: "#a8a29a",
                      font: "inherit",
                      fontSize: 13,
                      cursor: "pointer",
                    }}
                  >
                    Forgot password?
                  </Box>
                </Box>
              )}

              <Box ref={captchaSlot} sx={{ width: "100%", height: Math.max(78 * zoom, 64), overflow: "hidden" }}>
                <Box sx={{ width: 304, height: 78, zoom, transformOrigin: "top left", position: "relative" }}>
                  <RecaptchaField onToken={onCaptcha} onError={onCaptchaError} />
                  <Box sx={{ position: "absolute", left: 0, top: 0, width: 304, height: 14, bgcolor: "#222", pointerEvents: "none" }} />
                  <Box sx={{ position: "absolute", left: 0, top: 14, width: 228, height: 8, bgcolor: "#222", pointerEvents: "none" }} />
                </Box>
              </Box>

              {error || notice ? (
                <Box sx={{ color: error ? "#ffb4b4" : "#c9c3ba", fontSize: 13, textAlign: "center", lineHeight: 1.3 }}>
                  {error || notice}
                </Box>
              ) : null}

              <Box
                component="button"
                type="submit"
                disabled={busy}
                sx={{
                  height: 52,
                  border: "none",
                  borderRadius: "14px",
                  cursor: busy ? "progress" : "pointer",
                  color: "#1a120c",
                  font: "inherit",
                  fontSize: 18,
                  fontWeight: 700,
                  background: "linear-gradient(180deg, #f8e7b0 0%, #f6c15a 38%, #e8a33a 100%)",
                  boxShadow: "0 10px 24px rgba(227, 154, 50, 0.22)",
                }}
              >
                {busy ? "Please wait…" : signup ? "Create account →" : "Sign In →"}
              </Box>

              <Box sx={{ textAlign: "center", fontSize: 15, color: "#d9d3cb" }}>
                {signup ? "Already on Forge? " : "New to Forge? "}
                <Box
                  component="button"
                  type="button"
                  onClick={() => {
                    setNotice(null);
                    onMode(signup ? "login" : "signup");
                  }}
                  sx={{
                    p: 0,
                    border: "none",
                    bgcolor: "transparent",
                    color: "#e4b15a",
                    font: "inherit",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {signup ? "Sign in" : "Create account"}
                </Box>
              </Box>
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
