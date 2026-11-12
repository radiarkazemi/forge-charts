import { useState, type FormEvent, type ReactNode } from "react";
import Box from "@mui/material/Box";
import { isDevSite } from "@/dev-site";
import { RecaptchaField } from "./RecaptchaField";

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

const inputSx = {
  flex: 1,
  minWidth: 0,
  border: "none",
  outline: "none",
  background: "transparent",
  color: "#f6f3ee",
  font: "inherit",
  fontSize: 15,
  "&::placeholder": { color: "#b7b1a8", opacity: 1 },
  "&:-webkit-autofill, &:-webkit-autofill:hover, &:-webkit-autofill:focus": {
    WebkitTextFillColor: "#f6f3ee",
    WebkitBoxShadow: "0 0 0 1000px #12100e inset",
    caretColor: "#f0c27a",
    transition: "background-color 99999s ease-out",
  },
};

function MailIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden fill="none" stroke="#d9d3cb" strokeWidth="1.6">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M4 7l8 6 8-6" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden fill="none" stroke="#d9d3cb" strokeWidth="1.6">
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function PersonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden fill="none" stroke="#d9d3cb" strokeWidth="1.6">
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5 19c1.4-3 3.8-4.5 7-4.5S17.6 16 19 19" />
    </svg>
  );
}

function EyeIcon({ off }: { readonly off: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden fill="none" stroke="#cfc8c0" strokeWidth="1.6">
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z" />
      <circle cx="12" cy="12" r="2.5" />
      {off ? <path d="M4 5l16 14" /> : null}
    </svg>
  );
}

function FieldRow({
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
        height: 48,
        px: 1.6,
        borderRadius: "14px",
        border: "1px solid rgba(206,196,180,0.42)",
        bgcolor: "rgba(0,0,0,0.28)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04), 0 10px 22px rgba(0,0,0,0.28)",
        "&:focus-within": {
          borderColor: "rgba(232,196,130,0.85)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06), 0 0 16px rgba(210,150,50,0.22)",
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
        sx={inputSx}
      />
      {end}
    </Box>
  );
}

/**
 * Full-page molten background with a sign-in card.
 * Account creation stays inside the same card.
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
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const dev = isDevSite();
  const message = localError || error;

  const submit = (event: FormEvent) => {
    if (!captchaToken) {
      event.preventDefault();
      setLocalError("Confirm you are not a robot.");
      return;
    }
    setLocalError(null);
    onSubmit(event);
  };

  return (
    <Box sx={{ minHeight: "100dvh", position: "relative", bgcolor: "#050403" }}>
      <Box
        component="img"
        src={brandSrc("forge-background-hi.webp")}
        alt=""
        sx={{
          position: "fixed",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: "center",
          pointerEvents: "none",
          userSelect: "none",
        }}
      />
      <Box
        sx={{
          position: "relative",
          zIndex: 1,
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: { xs: "center", md: "flex-end" },
          px: { xs: 2, md: "7vw" },
          py: 3,
          overflow: "auto",
        }}
      >
        {dev ? (
          <Box
            component="a"
            href="?view=landing"
            sx={{
              position: "fixed",
              zIndex: 2,
              top: 16,
              left: 16,
              color: "#f3ddb8",
              textDecoration: "none",
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: "0.04em",
              fontFamily: '"Segoe UI", "Helvetica Neue", Arial, sans-serif',
              px: 1.4,
              py: 0.6,
              borderRadius: "999px",
              bgcolor: "rgba(0,0,0,0.5)",
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
            width: "min(440px, 100%)",
            fontFamily: '"Segoe UI", "Helvetica Neue", Arial, sans-serif',
            color: "#f6f3ee",
          }}
        >
          <Box
            component="img"
            src={brandSrc("forge-form-top.png")}
            alt=""
            sx={{ width: "100%", height: "auto", display: "block", userSelect: "none", pointerEvents: "none" }}
          />
          <Box
            sx={{
              backgroundImage: `url(${brandSrc("forge-form-side.png")})`,
              backgroundRepeat: "repeat-y",
              backgroundSize: "100% auto",
              display: "flex",
              flexDirection: "column",
              gap: 1.35,
              px: "15.5%",
              pt: 0.25,
              pb: 1.25,
            }}
          >
          {mode === "signup" ? (
            <FieldRow
              icon={<PersonIcon />}
              label="Name"
              value={displayName}
              onChange={onDisplayName}
              autoComplete="nickname"
              required={false}
            />
          ) : null}
          <FieldRow
            icon={<MailIcon />}
            label="Email"
            type="email"
            value={username}
            onChange={onUsername}
            autoComplete="username"
          />
          <FieldRow
            icon={<LockIcon />}
            label="Password"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={onPassword}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            minLength={6}
            end={
              <Box
                component="button"
                type="button"
                aria-label={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword((value) => !value)}
                sx={{
                  display: "grid",
                  placeItems: "center",
                  p: 0.5,
                  border: "none",
                  bgcolor: "transparent",
                  cursor: "pointer",
                }}
              >
                <EyeIcon off={showPassword} />
              </Box>
            }
          />
          {mode === "signup" ? (
            <FieldRow
              icon={<LockIcon />}
              label="Confirm password"
              type="password"
              value={confirm}
              onChange={onConfirm}
              autoComplete="new-password"
              minLength={6}
            />
          ) : null}

          <RecaptchaField
            onToken={(token) => {
              setCaptchaToken(token);
              if (token) setLocalError(null);
            }}
            onError={(next) => setLocalError(next)}
          />

          {message ? (
            <Box sx={{ color: "#ffb4b4", fontSize: 13, lineHeight: 1.35, textAlign: "center" }}>{message}</Box>
          ) : null}

          <Box
            component="button"
            type="button"
            onClick={() => {
              setLocalError(null);
              onMode(mode === "login" ? "signup" : "login");
            }}
            sx={{
              border: "none",
              bgcolor: "transparent",
              color: "#e7c79a",
              font: "inherit",
              fontSize: 14,
              cursor: "pointer",
              py: 0.25,
              alignSelf: "center",
            }}
          >
            {mode === "login" ? "Create account" : "Back to sign in"}
          </Box>
          </Box>
          <Box sx={{ position: "relative" }}>
            <Box
              component="img"
              src={brandSrc("forge-form-bottom.png")}
              alt=""
              sx={{ width: "100%", height: "auto", display: "block", userSelect: "none", pointerEvents: "none" }}
            />
            <Box
              component="button"
              type="submit"
              disabled={busy}
              sx={{
                position: "absolute",
                left: "12%",
                top: "3.2%",
                width: "76%",
                height: "37%",
                border: "none",
                borderRadius: "14px",
                cursor: busy ? "progress" : "pointer",
                color: "#1a120c",
                font: "inherit",
                fontSize: 16,
                fontWeight: 650,
                opacity: 1,
                background: "linear-gradient(180deg, #f8e7b0 0%, #f5b24e 22%, #f1ae4a 78%, #e39a32 100%)",
                "&:disabled": { opacity: 1, color: "#1a120c" },
              }}
            >
              {busy ? "Please wait…" : mode === "login" ? "Sign In →" : "Create account →"}
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
