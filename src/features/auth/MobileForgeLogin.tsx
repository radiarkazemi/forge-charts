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
  fontSize: "4.6cqw",
  "&::placeholder": { color: "#b7b1a8", opacity: 1 },
  "&:-webkit-autofill, &:-webkit-autofill:hover, &:-webkit-autofill:focus": {
    WebkitTextFillColor: "#f6f3ee",
    WebkitBoxShadow: "0 0 0 1000px #12100e inset",
    caretColor: "#f0c27a",
    transition: "background-color 99999s ease-out",
  },
};

function LockIcon() {
  return (
    <svg width="4.6cqw" height="4.6cqw" viewBox="0 0 24 24" aria-hidden fill="none" stroke="#f3efe8" strokeWidth="1.6">
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function PersonIcon() {
  return (
    <svg width="4.6cqw" height="4.6cqw" viewBox="0 0 24 24" aria-hidden fill="none" stroke="#f3efe8" strokeWidth="1.6">
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5 19c1.4-3 3.8-4.5 7-4.5S17.6 16 19 19" />
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
        gap: "3cqw",
        width: "100%",
        height: "11.3cqw",
        px: "4cqw",
        borderRadius: "2.8cqw",
        border: "1px solid rgba(214, 206, 192, 0.55)",
        bgcolor: "rgba(0,0,0,0.28)",
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
/** Red test-key lines sit above the checkbox. */
const BANNER_H = 22;

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
        bgcolor: "#161616",
        borderRadius: "2.6cqw",
      }}
    >
      <Box sx={{ height: shown, marginTop: `${pad}px`, overflow: "hidden" }}>
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
  background: filled ? "#0e0d0b" : "transparent",
  color: "#f4f1ec",
  font: "inherit",
  fontSize: "4cqw",
  padding: 0,
  caretColor: "#f0c27a",
  "&:-webkit-autofill, &:-webkit-autofill:hover, &:-webkit-autofill:focus": {
    WebkitTextFillColor: "#f4f1ec",
    WebkitBoxShadow: "0 0 0 1000px #0e0d0b inset",
    caretColor: "#f0c27a",
  },
});

function Art({ file }: { readonly file: string }) {
  return (
    <Box
      component="img"
      src={brandSrc(file)}
      alt=""
      sx={{ width: "100%", height: "auto", display: "block", userSelect: "none", pointerEvents: "none" }}
    />
  );
}

const sideBand = {
  backgroundImage: `url(${brandSrc("forge-mobile-side.webp")})`,
  backgroundRepeat: "repeat-y",
  backgroundSize: "100% auto",
  backgroundPosition: "left top",
  px: "12.1%",
  py: "3.4cqw",
};

/** Phone sign-in: fixed scene, scrollable card. Create account grows the same card. */
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
  const [notice, setNotice] = useState<string | null>(null);
  const signup = mode === "signup";
  const dev = isDevSite();
  const message = error || notice;
  return (
    <Box sx={{ height: "100dvh", overflow: "hidden", bgcolor: "#050403", position: "relative" }}>
      <Box
        component="img"
        src={brandSrc("forge-mobile-bg.webp")}
        alt=""
        sx={{
          position: "fixed",
          top: 0,
          left: "50%",
          // The artwork is a tall file; the scene is its top half. Size that half to the screen.
          width: "196%",
          height: "auto",
          maxWidth: "none",
          transform: "translateX(-50%)",
          pointerEvents: "none",
          userSelect: "none",
        }}
      />
      <Box
        sx={{
          position: "relative",
          zIndex: 1,
          height: "100%",
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
          touchAction: "pan-y",
          overscrollBehavior: "contain",
        }}
      >
        <Box
          component="form"
          onSubmit={onSubmit}
          sx={{
            width: "min(100%, 460px)",
            mx: "auto",
            pt: "34dvh",
            px: "2vw",
            pb: "10dvh",
            containerType: "inline-size",
            fontFamily: '"Segoe UI", "Helvetica Neue", Arial, sans-serif',
          }}
        >
          {dev ? (
            <Box
              component="a"
              href="?view=landing"
              aria-label="Forge"
              sx={{ position: "absolute", left: "34%", top: "18dvh", width: "32%", height: "7dvh", zIndex: 2 }}
            />
          ) : null}

          {signup ? (
            <>
              <Art file="forge-mobile-top.webp" />
              <Box sx={sideBand}>
                <MobileField
                  icon={<PersonIcon />}
                  label="Name"
                  value={displayName}
                  onChange={onDisplayName}
                  autoComplete="nickname"
                  required={false}
                />
              </Box>
              <Box sx={{ position: "relative" }}>
                <Art file="forge-mobile-fields.webp" />
                <Box
                  component="input"
                  aria-label="Email"
                  type="email"
                  required
                  value={username}
                  autoComplete="username"
                  onChange={(event) => onUsername(event.target.value)}
                  sx={{ ...hole(Boolean(username)), left: "24.8%", top: "8%", width: "63%", height: "32%", fontSize: "4.6cqw" }}
                />
                <Box
                  component="input"
                  aria-label="Password"
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={6}
                  value={password}
                  autoComplete="new-password"
                  onChange={(event) => onPassword(event.target.value)}
                  sx={{ ...hole(Boolean(password)), left: "24.8%", top: "58%", width: "55%", height: "32%", fontSize: "4.6cqw" }}
                />
                <Box
                  component="button"
                  type="button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={onTogglePassword}
                  sx={{ position: "absolute", left: "80.8%", top: "64%", width: "8%", height: "22%", p: 0, border: "none", bgcolor: "transparent", cursor: "pointer" }}
                />
              </Box>
              <Box sx={sideBand}>
                <MobileField
                  icon={<LockIcon />}
                  label="Confirm password"
                  type="password"
                  value={confirm}
                  onChange={onConfirm}
                  autoComplete="new-password"
                  minLength={6}
                />
              </Box>
              <Box sx={{ position: "relative" }}>
                <Art file="forge-mobile-foot.webp" />
                <Box sx={{ position: "absolute", left: "12.2%", top: "2.5%", width: "75.8%", height: "21.5%" }}>
                  <CaptchaFit onToken={onCaptcha} onError={onCaptchaError} />
                </Box>
                {message ? (
                  <Box sx={{ position: "absolute", left: "14%", top: "25%", width: "72%", color: "#ffb4b4", fontSize: "3cqw", textAlign: "center" }}>
                    {message}
                  </Box>
                ) : null}
                <Box
                  component="button"
                  type="submit"
                  disabled={busy}
                  sx={{
                    position: "absolute",
                    left: "9.6%",
                    top: "32.4%",
                    width: "80.7%",
                    height: "18.3%",
                    border: "none",
                    borderRadius: "3.2cqw",
                    cursor: busy ? "progress" : "pointer",
                    color: "#1a120c",
                    font: "inherit",
                    fontSize: "4.4cqw",
                    fontWeight: 700,
                    background: "linear-gradient(180deg, #f8e7b0 0%, #f3c56a 42%, #e39a32 100%)",
                  }}
                >
                  {busy ? "Please wait…" : "Create account →"}
                </Box>
                <Box
                  sx={{
                    position: "absolute",
                    left: "12%",
                    top: "58%",
                    width: "76%",
                    textAlign: "center",
                    color: "#d9d3cb",
                    fontSize: "3.6cqw",
                  }}
                >
                  Already on Forge?{" "}
                  <Box
                    component="button"
                    type="button"
                    onClick={() => {
                      setNotice(null);
                      onMode("login");
                    }}
                    sx={{ p: 0, border: "none", bgcolor: "transparent", color: "#e4b15a", font: "inherit", fontWeight: 700, cursor: "pointer" }}
                  >
                    Sign in
                  </Box>
                </Box>
              </Box>
            </>
          ) : (
            <Box sx={{ position: "relative" }}>
              <Art file="forge-mobile-form.webp" />
              <Box
                component="input"
                aria-label="Email"
                type="email"
                required
                value={username}
                autoComplete="username"
                onChange={(event) => onUsername(event.target.value)}
                sx={{ ...hole(Boolean(username)), left: "24.8%", top: "29.2%", width: "63%", height: "7.6%", fontSize: "4.6cqw" }}
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
                sx={{ ...hole(Boolean(password)), left: "24.8%", top: "39.2%", width: "55%", height: "7.6%", fontSize: "4.6cqw" }}
              />
              <Box
                component="button"
                type="button"
                aria-label={showPassword ? "Hide password" : "Show password"}
                onClick={onTogglePassword}
                sx={{ position: "absolute", left: "80.5%", top: "40.6%", width: "8%", height: "5%", p: 0, border: "none", bgcolor: "transparent", cursor: "pointer" }}
              />
              <Box
                component="button"
                type="button"
                onClick={() => setNotice("Password reset isn't available yet. Use the password for this account.")}
                sx={{ position: "absolute", left: "63.5%", top: "48.4%", width: "26%", height: "2.8%", p: 0, border: "none", bgcolor: "transparent", cursor: "pointer" }}
              />
              <Box sx={{ position: "absolute", left: "12.2%", top: "53.7%", width: "75.8%", height: "10.2%" }}>
                <CaptchaFit onToken={onCaptcha} onError={onCaptchaError} />
              </Box>
              {message ? (
                <Box sx={{ position: "absolute", left: "14%", top: "64.4%", width: "72%", color: "#ffb4b4", fontSize: "2.8cqw", textAlign: "center", textShadow: "0 1px 2px #000" }}>
                  {message}
                </Box>
              ) : null}
              <Box
                component="button"
                type="submit"
                disabled={busy}
                aria-label={busy ? "Please wait" : "Sign in"}
                sx={{
                  position: "absolute",
                  left: "9.6%",
                  top: "67.9%",
                  width: "80.7%",
                  height: "8.7%",
                  p: 0,
                  border: "none",
                  borderRadius: "16px",
                  bgcolor: busy ? "#e39a32" : "transparent",
                  color: busy ? "#1a120c" : "transparent",
                  font: "inherit",
                  fontSize: "4cqw",
                  fontWeight: 700,
                  cursor: busy ? "progress" : "pointer",
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
                sx={{ position: "absolute", left: "22%", top: "80.2%", width: "56%", height: "3.4%", p: 0, border: "none", bgcolor: "transparent", cursor: "pointer" }}
              />
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}
