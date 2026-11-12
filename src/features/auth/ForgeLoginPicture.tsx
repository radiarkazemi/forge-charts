import { useState, type FormEvent, type ReactNode } from "react";
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

const inputSx = {
  flex: 1,
  minWidth: 0,
  border: "none",
  outline: "none",
  background: "transparent",
  color: "#f6f3ee",
  font: "inherit",
  fontSize: 15,
  letterSpacing: "0.01em",
  "&::placeholder": { color: "#a8a097", opacity: 1 },
  "&:-webkit-autofill, &:-webkit-autofill:hover, &:-webkit-autofill:focus": {
    WebkitTextFillColor: "#f6f3ee",
    WebkitBoxShadow: "0 0 0 1000px #161310 inset",
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

function EyeIcon({ off }: { readonly off: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden fill="none" stroke="#cfc8c0" strokeWidth="1.6">
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z" />
      <circle cx="12" cy="12" r="2.5" />
      {off ? <path d="M4 5l16 14" /> : null}
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

/** The gold F from the login artwork, sitting on the card. */
function ForgeMark() {
  return (
    <Box
      component="img"
      src={brandSrc("forge-f.png")}
      alt=""
      sx={{
        display: "block",
        width: 154,
        height: "auto",
        mx: "auto",
        mb: "-48px",
        transform: "translateX(-22px)",
        position: "relative",
        zIndex: 2,
        userSelect: "none",
        pointerEvents: "none",
      }}
    />
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
        height: 50,
        px: 1.75,
        borderRadius: "12px",
        border: "1px solid rgba(255,255,255,0.16)",
        bgcolor: "rgba(8,7,6,0.55)",
        boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.35)",
        "&:focus-within": { borderColor: "rgba(232,190,120,0.75)" },
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
 * Full-bleed molten scene with a real sign-in card in the artwork's style.
 * The card, fields, and button are form controls, not part of the picture.
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
        display: "grid",
        bgcolor: "#050403",
        color: "#f6f3ee",
        fontFamily: '"Segoe UI", "Helvetica Neue", Arial, sans-serif',
        gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1fr) minmax(380px, 460px)" },
        gridTemplateRows: { xs: "minmax(240px, 42dvh) auto", md: "100dvh" },
        position: "relative",
      }}
    >
      <Box
        aria-hidden
        sx={{
          minHeight: 0,
          backgroundImage: `linear-gradient(90deg, rgba(5,4,3,0) 72%, #050403 100%), url(${brandSrc("forge-login-scene.png")})`,
          backgroundSize: "cover",
          backgroundPosition: { xs: "center 42%", md: "right center" },
          backgroundRepeat: "no-repeat",
        }}
      />

      {dev ? (
        <Box
          component="a"
          href="?view=landing"
          sx={{
            position: "absolute",
            zIndex: 3,
            top: 16,
            left: 16,
            color: "#f3ddb8",
            textDecoration: "none",
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: "0.06em",
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
        sx={{
          minHeight: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "auto",
          px: { xs: 2.5, md: 4 },
          py: { xs: 3, md: 4 },
          background:
            "radial-gradient(90% 55% at 100% 0%, rgba(210,150,70,0.2), transparent 52%), #050403",
        }}
      >
        <Box sx={{ width: "100%", maxWidth: 400 }}>
          <ForgeMark />
          <Box
            component="form"
            onSubmit={submit}
            sx={{
              display: "flex",
              flexDirection: "column",
              gap: 1.5,
              px: 3,
              pt: 6.5,
              pb: 2.75,
              borderRadius: "6px 22px 6px 22px",
              background: "linear-gradient(180deg, rgba(24,22,20,0.96), rgba(8,8,8,0.94))",
              border: "1px solid rgba(214,176,112,0.38)",
              boxShadow: "0 28px 80px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,226,180,0.14)",
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

            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1.25,
                height: 50,
                px: 1.75,
                borderRadius: "12px",
                border: "1px solid rgba(255,255,255,0.16)",
                bgcolor: "rgba(8,7,6,0.55)",
              }}
            >
              <Box
                component="input"
                type="checkbox"
                aria-label="I'm not a robot"
                checked={robot}
                onChange={(event) => {
                  setRobot(event.target.checked);
                  setLocalError(null);
                }}
                sx={{ width: 18, height: 18, m: 0, accentColor: "#e8c48a", cursor: "pointer" }}
              />
              <Box component="span" sx={{ fontSize: 14, color: "#ece7e1" }}>
                I'm not a robot
              </Box>
              <Box sx={{ ml: "auto", display: "grid", placeItems: "center" }} aria-hidden>
                <svg width="26" height="26" viewBox="0 0 26 26">
                  <circle cx="13" cy="13" r="10" fill="none" stroke="#3aa0ff" strokeWidth="1.6" />
                  <path d="M8 13.2l3.1 3.1 6.6-7" fill="none" stroke="#8fd0ff" strokeWidth="1.6" />
                </svg>
              </Box>
            </Box>

            {message ? (
              <Box sx={{ color: "#ffb4b4", fontSize: 13, lineHeight: 1.35, mt: -0.5 }}>{message}</Box>
            ) : null}

            <Box
              component="button"
              type="submit"
              disabled={busy}
              sx={{
                mt: 0.5,
                height: 50,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: "none",
                borderRadius: "10px",
                cursor: busy ? "progress" : "pointer",
                color: "#1c140c",
                font: "inherit",
                fontSize: 16,
                fontWeight: 650,
                letterSpacing: "0.01em",
                background: "linear-gradient(180deg, #f6e2bc 0%, #e7c07a 38%, #c4893c 100%)",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.45), 0 8px 24px rgba(180,110,30,0.25)",
                "&:disabled": { opacity: 0.65 },
              }}
            >
              <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 1 }}>
                {busy ? "Please wait…" : mode === "login" ? "Sign In" : "Create account"}
                {busy ? null : (
                  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
                    <path d="M3 8h9M8.5 4.5 12.5 8 8.5 11.5" fill="none" stroke="#1c140c" strokeWidth="1.6" />
                  </svg>
                )}
              </Box>
            </Box>

            <Box
              component="button"
              type="button"
              onClick={() => onMode(mode === "login" ? "signup" : "login")}
              sx={{
                border: "none",
                bgcolor: "transparent",
                color: "#e7c79a",
                font: "inherit",
                fontSize: 14,
                cursor: "pointer",
                py: 0.5,
              }}
            >
              {mode === "login" ? "Create account" : "Back to sign in"}
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
