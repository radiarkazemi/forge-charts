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
        gap: "2.4cqw",
        width: "100%",
        height: "100%",
        px: "3.2cqw",
        borderRadius: "3.2cqw",
        border: "1px solid rgba(226, 216, 200, 0.5)",
        bgcolor: "#141210",
        boxSizing: "border-box",
        "&:focus-within": {
          borderColor: "rgba(232, 196, 130, 0.85)",
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

const WIDGET_W = 304;
const WIDGET_H = 78;
/** Red “for testing only” lines sit in the top of the test-key widget. */
const BANNER_H = 30;

function CaptchaFit({
  onToken,
  onError,
}: {
  readonly onToken: (token: string | null) => void;
  readonly onError: (message: string) => void;
}) {
  const slot = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = slot.current;
    if (!el) return;
    const fit = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w < 8 || h < 8) return;
      setSize({ w, h });
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const scale = size.w > 0 ? size.w / WIDGET_W : 1;
  const shown = (WIDGET_H - BANNER_H) * scale;
  const pad = Math.max(0, (size.h - shown) / 2);
  return (
    <Box
      ref={slot}
      sx={{
        width: "100%",
        height: "100%",
        overflow: "hidden",
        bgcolor: "#222",
        borderRadius: "2.4cqw",
        border: "1px solid rgba(226, 216, 200, 0.35)",
        boxSizing: "border-box",
      }}
    >
      <Box sx={{ marginTop: `${pad}px`, height: shown, overflow: "hidden" }}>
        <Box
          sx={{
            width: WIDGET_W,
            height: WIDGET_H,
            transform: `translateY(${-BANNER_H * scale}px) scale(${scale})`,
            transformOrigin: "top left",
          }}
        >
          <RecaptchaField onToken={onToken} onError={onError} />
        </Box>
      </Box>
    </Box>
  );
}

const hole = (filled: boolean) => ({
  position: "absolute" as const,
  border: "none",
  outline: "none",
  background: filled ? "#100e0c" : "transparent",
  color: "#f4f1ec",
  font: "inherit",
  fontSize: "3.5cqw",
  padding: 0,
  caretColor: "#f0c27a",
  "&:-webkit-autofill, &:-webkit-autofill:hover, &:-webkit-autofill:focus": {
    WebkitTextFillColor: "#f4f1ec",
    WebkitBoxShadow: "0 0 0 1000px #100e0c inset",
    caretColor: "#f0c27a",
  },
});

/** Phone sign-in uses the artwork itself. Create account keeps that frame and replaces the fields. */
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
  const artRef = useRef<HTMLImageElement>(null);
  const [art, setArt] = useState({ w: 0, h: 0 });
  const [notice, setNotice] = useState<string | null>(null);
  const signup = mode === "signup";
  const dev = isDevSite();
  useLayoutEffect(() => {
    const img = artRef.current;
    if (!img) return;
    const measure = () => setArt({ w: img.clientWidth, h: img.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(img);
    return () => observer.disconnect();
  }, []);
  const at = (x: number, y: number, width: number, height: number) => ({
    position: "absolute" as const,
    left: art.w * x,
    top: art.h * y,
    width: art.w * width,
    height: art.h * height,
  });
  return (
    <Box
      sx={{
        minHeight: "100dvh",
        bgcolor: "#050403",
        display: "flex",
        justifyContent: "center",
      }}
    >
      <Box
        component="form"
        onSubmit={onSubmit}
        sx={{
          position: "relative",
          width: "min(100%, 480px)",
          containerType: "inline-size",
          fontFamily: '"Segoe UI", "Helvetica Neue", Arial, sans-serif',
        }}
      >
        <Box
          component="img"
          ref={artRef}
          src={brandSrc("forge-mobile-login.webp")}
          alt=""
          sx={{ width: "100%", height: "auto", display: "block", userSelect: "none", pointerEvents: "none" }}
        />
        {dev ? (
          <Box
            component="a"
            href="?view=landing"
            aria-label="Forge"
            sx={{ position: "absolute", left: "38%", top: "43.2%", width: "24%", height: "4.2%" }}
          />
        ) : null}

        {signup ? (
          <>
            <Box sx={{ ...at(0.105, 0.434, 0.79, 0.482), bgcolor: "#100e0c" }} />
            <Box sx={{ ...at(0.12, 0.440, 0.76, 0.04), textAlign: "center" }}>
              <Box sx={{ color: "#f6f3ee", fontSize: "5.6cqw", fontWeight: 650, letterSpacing: "-0.03em", lineHeight: 1.05 }}>
                Create account
              </Box>
              <Box sx={{ color: "#c9c3ba", fontSize: "3cqw" }}>Join Forge</Box>
            </Box>
            <Box sx={at(0.127, 0.486, 0.746, 0.048)}>
              <MobileField icon={<PersonIcon />} label="Name" value={displayName} onChange={onDisplayName} autoComplete="nickname" required={false} />
            </Box>
            <Box sx={at(0.127, 0.542, 0.746, 0.048)}>
              <MobileField icon={<EnvelopeIcon />} label="Email" type="email" value={username} onChange={onUsername} autoComplete="username" />
            </Box>
            <Box sx={at(0.127, 0.598, 0.746, 0.048)}>
              <MobileField
                icon={<LockIcon />}
                label="Password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={onPassword}
                autoComplete="new-password"
                minLength={6}
                end={(
                  <Box component="button" type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={onTogglePassword} sx={{ p: 0, border: "none", bgcolor: "transparent", cursor: "pointer", lineHeight: 0 }}>
                    <EyeIcon open={showPassword} />
                  </Box>
                )}
              />
            </Box>
            <Box sx={at(0.127, 0.654, 0.746, 0.048)}>
              <MobileField icon={<LockIcon />} label="Confirm password" type="password" value={confirm} onChange={onConfirm} autoComplete="new-password" minLength={6} />
            </Box>
            <Box sx={at(0.127, 0.710, 0.746, 0.064)}>
              <CaptchaFit onToken={onCaptcha} onError={onCaptchaError} />
            </Box>
            {error || notice ? (
              <Box sx={{ ...at(0.14, 0.776, 0.72, 0.018), color: "#ffb4b4", fontSize: "2.6cqw", textAlign: "center" }}>{error || notice}</Box>
            ) : null}
            <Box
              component="button"
              type="submit"
              disabled={busy}
              sx={{
                ...at(0.127, 0.784, 0.746, 0.05),
                border: "none",
                borderRadius: "3cqw",
                cursor: busy ? "progress" : "pointer",
                color: "#1a120c",
                font: "inherit",
                fontSize: "4cqw",
                fontWeight: 700,
                background: "linear-gradient(180deg, #f8e7b0 0%, #f3c56a 42%, #e39a32 100%)",
              }}
            >
              {busy ? "Please wait…" : "Create account →"}
            </Box>
            <Box sx={{ ...at(0.12, 0.842, 0.76, 0.028), textAlign: "center", color: "#d9d3cb", fontSize: "3.2cqw", lineHeight: 1.2 }}>
              Already on Forge?{" "}
              <Box
                component="button"
                type="button"
                onClick={() => onMode("login")}
                sx={{ p: 0, border: "none", bgcolor: "transparent", color: "#e4b15a", font: "inherit", fontWeight: 700, cursor: "pointer" }}
              >
                Sign in
              </Box>
            </Box>
          </>
        ) : (
          <>
            <Box
              component="input"
              aria-label="Email"
              type="email"
              required
              value={username}
              autoComplete="username"
              onChange={(event) => onUsername(event.target.value)}
              sx={{ ...hole(Boolean(username)), ...at(0.254, 0.527, 0.593, 0.043), lineHeight: `${art.h * 0.043}px`, fontSize: art.h * 0.016 }}
            />
            <Box
              component="input"
              aria-label="Password"
              type={showPassword ? "text" : "password"}
              required
              minLength={6}
              value={password}
              autoComplete="current-password"
              onChange={(event) => onPassword(event.target.value)}
              sx={{ ...hole(Boolean(password)), ...at(0.254, 0.595, 0.530, 0.043), lineHeight: `${art.h * 0.043}px`, fontSize: art.h * 0.016 }}
            />
            <Box
              component="button"
              type="button"
              aria-label={showPassword ? "Hide password" : "Show password"}
              onClick={onTogglePassword}
              sx={{ ...at(0.795, 0.598, 0.08, 0.04), p: 0, border: "none", bgcolor: "transparent", cursor: "pointer" }}
            />
            <Box
              component="button"
              type="button"
              onClick={() => setNotice("Password reset isn't available yet. Use the password for this account.")}
              sx={{ ...at(0.62, 0.655, 0.26, 0.024), p: 0, border: "none", bgcolor: "transparent", cursor: "pointer" }}
            />
            <Box sx={at(0.124, 0.686, 0.750, 0.082)}>
              <CaptchaFit onToken={onCaptcha} onError={onCaptchaError} />
            </Box>
            {error || notice ? (
              <Box sx={{ position: "absolute", left: "14%", top: "76.4%", width: "72%", color: "#ffb4b4", fontSize: "2.8cqw", textAlign: "center", textShadow: "0 1px 2px #000" }}>
                {error || notice}
              </Box>
            ) : null}
            <Box
              component="button"
              type="submit"
              disabled={busy}
              aria-label={busy ? "Please wait" : "Sign in"}
              sx={{
                ...at(0.108, 0.789, 0.784, 0.056),
                p: 0,
                border: "none",
                bgcolor: busy ? "#e39a32" : "transparent",
                color: busy ? "#1a120c" : "transparent",
                font: "inherit",
                fontSize: "4cqw",
                fontWeight: 700,
                cursor: busy ? "progress" : "pointer",
                borderRadius: "14px",
              }}
            >
              {busy ? "Please wait…" : ""}
            </Box>
            <Box
              component="button"
              type="button"
              aria-label="Create account"
              onClick={() => {
                setNotice(null);
                onMode("signup");
              }}
              sx={{ ...at(0.22, 0.866, 0.56, 0.032), p: 0, border: "none", bgcolor: "transparent", cursor: "pointer" }}
            />
          </>
        )}
      </Box>
    </Box>
  );
}
