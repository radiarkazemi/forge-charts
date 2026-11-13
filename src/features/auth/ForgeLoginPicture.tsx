import { useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
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

function LockIcon() {
  return (
    <svg width="4.3cqw" height="4.3cqw" viewBox="0 0 24 24" aria-hidden fill="none" stroke="#f2efe9" strokeWidth="1.6">
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function PersonIcon() {
  return (
    <svg width="4.3cqw" height="4.3cqw" viewBox="0 0 24 24" aria-hidden fill="none" stroke="#f2efe9" strokeWidth="1.6">
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5 19c1.4-3 3.8-4.5 7-4.5S17.6 16 19 19" />
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
        gap: "5cqw",
        height: "9.9cqw",
        px: "4.6cqw",
        borderRadius: "2.6cqw",
        border: "1px solid rgba(214,206,192,0.55)",
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
        sx={{ ...inputSx, fontSize: "2.7cqw" }}
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
  const [captchaReady, setCaptchaReady] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [captchaBox, setCaptchaBox] = useState({ left: 0, top: 0, width: 0, height: 0 });
  const formRef = useRef<HTMLFormElement>(null);
  const captchaSlotRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const form = formRef.current;
    const slot = captchaSlotRef.current;
    if (!form || !slot) return;
    const place = () => {
      const formBox = form.getBoundingClientRect();
      const slotBox = slot.getBoundingClientRect();
      const next = {
        left: slotBox.left - formBox.left,
        top: slotBox.top - formBox.top,
        width: slotBox.width,
        height: slotBox.height,
      };
      setCaptchaBox((prev) => (
        Math.abs(prev.left - next.left) < 0.5
        && Math.abs(prev.top - next.top) < 0.5
        && Math.abs(prev.width - next.width) < 0.5
        && Math.abs(prev.height - next.height) < 0.5
          ? prev
          : next
      ));
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(form);
    observer.observe(slot);
    if (slot.parentElement) observer.observe(slot.parentElement);
    window.addEventListener("resize", place);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
    };
  }, [mode]);
  const dev = isDevSite();
  const message = localError || error;
  const art = (file: string) => (
    <Box
      component="img"
      src={brandSrc(file)}
      alt=""
      sx={{ width: "100%", height: "auto", display: "block", userSelect: "none", pointerEvents: "none" }}
    />
  );
  const hole = (filled: boolean) => ({
    position: "absolute" as const,
    border: "none",
    outline: "none",
    color: "#f4f1ec",
    font: "inherit",
    fontSize: "3cqw",
    lineHeight: 1,
    padding: "0 1cqw",
    caretColor: "#f0c27a",
    bgcolor: filled ? "#0c0c0c" : "transparent",
    "&:focus": { bgcolor: "#0c0c0c" },
    "&:-webkit-autofill, &:-webkit-autofill:hover, &:-webkit-autofill:focus": {
      WebkitTextFillColor: "#f4f1ec",
      WebkitBoxShadow: "0 0 0 1000px #0c0c0c inset",
      caretColor: "#f0c27a",
    },
  });
  const credentialHoles = (frame: "full" | "fields") => {
    const emailBox = frame === "full"
      ? { left: "25.2%", top: "37%", width: "57.9%", height: "7.58%" }
      : { left: "25.2%", top: "10.7%", width: "57.9%", height: "33.5%" };
    const passwordBox = frame === "full"
      ? { left: "25.2%", top: "48.64%", width: "50.3%", height: "7.58%" }
      : { left: "25.2%", top: "62.5%", width: "50.3%", height: "33.5%" };
    const eyeBox = frame === "full"
      ? { left: "77.6%", top: "49.6%", width: "6.7%", height: "6.1%" }
      : { left: "77.6%", top: "66.8%", width: "6.7%", height: "23.4%" };
    return (
      <>
        <Box
          component="input"
          aria-label="Email"
          type="email"
          required
          value={username}
          autoComplete="username"
          onChange={(event) => onUsername(event.target.value)}
          sx={{ ...hole(Boolean(username)), ...emailBox }}
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
          sx={{ ...hole(Boolean(password)), ...passwordBox }}
        />
        <Box
          component="button"
          type="button"
          aria-label={showPassword ? "Hide password" : "Show password"}
          onClick={() => setShowPassword((value) => !value)}
          sx={{ position: "absolute", p: 0, border: "none", bgcolor: "transparent", cursor: "pointer", ...eyeBox }}
        />
      </>
    );
  };
  const footControls = (frame: "full" | "foot") => {
    // Same column as the email field. Inset a few pixels so the painted stroke stays visible.
    const captcha = frame === "full"
      ? { left: "14.01%", top: "59.92%", width: "71.98%", height: "10.15%" }
      : { left: "14.01%", top: "2.76%", width: "71.98%", height: "24.63%" };
    const button = frame === "full"
      ? { left: "14%", top: "74.1%", width: "72%", height: "9.2%" }
      : { left: "14%", top: "37.1%", width: "72%", height: "22.8%" };
    const link = frame === "full"
      ? { left: "28%", top: "85.4%", width: "44%" }
      : { left: "28%", top: "64.7%", width: "44%" };
    return (
      <>
        <Box
          ref={captchaSlotRef}
          sx={{
            position: "absolute",
            ...captcha,
            overflow: "hidden",
            borderRadius: "2.4cqw",
          }}
        />
        {message ? (
          <Box
            sx={{
              position: "absolute",
              left: "16%",
              top: frame === "full" ? "71.2%" : "29.6%",
              width: "68%",
              color: "#ffb4b4",
              fontSize: "2.2cqw",
              lineHeight: 1.15,
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
          sx={{
            position: "absolute",
            ...button,
            border: "none",
            borderRadius: "14px",
            cursor: busy ? "progress" : "pointer",
            color: busy || mode === "signup" ? "#1a120c" : "transparent",
            font: "inherit",
            fontSize: "3.4cqw",
            fontWeight: 650,
            opacity: 1,
            background: busy || mode === "signup"
              ? "linear-gradient(180deg, #f8e7b0 0%, #f5b24e 22%, #f1ae4a 78%, #e39a32 100%)"
              : "transparent",
            "&:disabled": { opacity: 1, color: "#1a120c" },
          }}
        >
          {busy ? "Please wait…" : mode === "login" ? "Sign In" : "Create account"}
        </Box>
        <Box
          component="button"
          type="button"
          onClick={() => {
            setLocalError(null);
            onMode(mode === "login" ? "signup" : "login");
          }}
          sx={{
            position: "absolute",
            ...link,
            border: "none",
            bgcolor: "transparent",
            color: "#e7c79a",
            font: "inherit",
            fontSize: "2.6cqw",
            cursor: "pointer",
            textShadow: "0 1px 2px #000",
          }}
        >
          {mode === "login" ? "Create account" : "Back to sign in"}
        </Box>
      </>
    );
  };

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
            aria-label="Forge"
            sx={{
              position: "fixed",
              zIndex: 2,
              top: 16,
              left: 16,
              lineHeight: 0,
            }}
          >
            <Box
              component="img"
              src={brandSrc("forge-f.png")}
              alt=""
              sx={{ height: 52, width: "auto", display: "block" }}
            />
          </Box>
        ) : null}

        <Box
          ref={formRef}
          component="form"
          onSubmit={submit}
          sx={{
            position: "relative",
            width: mode === "signup"
              ? "min(640px, calc((100dvh - 64px) / 1.36), 100%)"
              : "min(640px, calc((100dvh - 64px) / 1.108), 100%)",
            containerType: "inline-size",
            fontFamily: '"Segoe UI", "Helvetica Neue", Arial, sans-serif',
            color: "#f6f3ee",
          }}
        >
          {mode === "signup" ? (
            <>
              {art("forge-form-top.png")}
              <Box
                sx={{
                  backgroundImage: `url(${brandSrc("forge-form-side.png")})`,
                  backgroundRepeat: "repeat-y",
                  backgroundSize: "100% auto",
                  pl: "13.76%",
                  pr: "13.76%",
                  pt: "1.5cqw",
                  pb: "1.34cqw",
                }}
              >
                <FieldRow
                  icon={<PersonIcon />}
                  label="Name"
                  value={displayName}
                  onChange={onDisplayName}
                  autoComplete="nickname"
                  required={false}
                />
              </Box>
              <Box sx={{ position: "relative", containerType: "inline-size" }}>
                {art("forge-form-fields.png")}
                {credentialHoles("fields")}
              </Box>
              <Box
                sx={{
                  backgroundImage: `url(${brandSrc("forge-form-side.png")})`,
                  backgroundRepeat: "repeat-y",
                  backgroundSize: "100% auto",
                  pl: "13.76%",
                  pr: "13.76%",
                  pt: "2.68cqw",
                  pb: "2.18cqw",
                }}
              >
                <FieldRow
                  icon={<LockIcon />}
                  label="Confirm password"
                  type="password"
                  value={confirm}
                  onChange={onConfirm}
                  autoComplete="new-password"
                  minLength={6}
                />
              </Box>
              <Box sx={{ position: "relative", containerType: "inline-size" }}>
                {art("forge-form-foot.png")}
                {footControls("foot")}
              </Box>
            </>
          ) : (
            <Box sx={{ position: "relative", containerType: "inline-size" }}>
              {art("forge-login-form.png")}
              {credentialHoles("full")}
              {footControls("full")}
            </Box>
          )}
          <Box
            sx={{
              position: "absolute",
              left: captchaBox.left,
              top: captchaBox.top,
              width: captchaBox.width,
              height: captchaBox.height,
              overflow: "hidden",
              borderRadius: "2.4cqw",
              visibility: captchaBox.width > 0 ? "visible" : "hidden",
              pointerEvents: captchaReady ? "auto" : "none",
            }}
          >
            <Box
              sx={{
                width: 304,
                height: 78,
                overflow: "hidden",
                position: "relative",
                transformOrigin: "top left",
                transform: captchaBox.width
                  ? `scaleX(${captchaBox.width / 304}) scaleY(${captchaBox.height / 78})`
                  : "none",
              }}
            >
              <RecaptchaField
                onToken={(token) => {
                  setCaptchaToken(token);
                  if (token) setLocalError(null);
                }}
                onError={(next) => setLocalError(next)}
                onReady={() => setCaptchaReady(true)}
              />
              {captchaReady ? (
                <>
                  <Box sx={{ position: "absolute", left: 0, top: 0, width: 304, height: 12, bgcolor: "#222", pointerEvents: "none" }} />
                  <Box sx={{ position: "absolute", left: 0, top: 12, width: 236, height: 11, bgcolor: "#222", pointerEvents: "none" }} />
                </>
              ) : null}
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
