import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import Box from "@mui/material/Box";
import useMediaQuery from "@mui/material/useMediaQuery";
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

type Lang = "en" | "fa";

const SETTINGS_KEY = "forge.settings.v1";
const REMEMBER_KEY = "forge.auth.rememberEmail.v1";

const COPY = {
  en: {
    taglineLead: "Forge a",
    taglineEm: "stronger",
    taglineTail: "tomorrow",
    email: "Email",
    password: "Password",
    name: "Name",
    confirm: "Confirm password",
    remember: "Remember me",
    forgot: "Forgot password?",
    forgotNote: "Password reset isn't available yet. Use the password for this account.",
    signIn: "Sign In",
    create: "Create account",
    google: "Continue with Google",
    googleNote: "Google sign-in isn't available yet. Use your email and password.",
    about: "About Us",
    terms: "Terms",
    privacy: "Privacy Policy",
    help: "Help",
    newHere: "New to Forge?",
    haveAccount: "Already on Forge?",
    switchSign: "Sign in",
  },
  fa: {
    taglineLead: "آینده‌ای",
    taglineEm: "قوی‌تر",
    taglineTail: "بساز",
    email: "ایمیل",
    password: "رمز عبور",
    name: "نام",
    confirm: "تکرار رمز",
    remember: "مرا به خاطر بسپار",
    forgot: "رمز را فراموش کرده‌اید؟",
    forgotNote: "بازیابی رمز هنوز آماده نیست. از رمز همین حساب استفاده کنید.",
    signIn: "ورود",
    create: "ساخت حساب",
    google: "ادامه با گوگل",
    googleNote: "ورود با گوگل هنوز آماده نیست. از ایمیل و رمز استفاده کنید.",
    about: "درباره ما",
    terms: "قوانین",
    privacy: "حریم خصوصی",
    help: "راهنما",
    newHere: "تازه‌وارد فورج هستید؟",
    haveAccount: "حساب دارید؟",
    switchSign: "ورود",
  },
} as const;

const QUOTES = [
  { id: "BTC", price: "$67,843.25", change: "+2.48%" },
  { id: "XAU", price: "$2,346.80", change: "+1.72%" },
  { id: "ETH", price: "$3,487.21", change: "+3.12%" },
  { id: "WTI", price: "$78.32", change: "+1.27%" },
] as const;

function readLanguage(): Lang {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return "en";
    const parsed = JSON.parse(raw) as { language?: string };
    return parsed.language === "fa" ? "fa" : "en";
  } catch {
    return "en";
  }
}

function writeLanguage(language: Lang): void {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const parsed = raw ? JSON.parse(raw) as Record<string, unknown> : {};
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return;
    parsed.language = language;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(parsed));
  } catch {
    /* private mode */
  }
}

function readRememberedEmail(): string {
  try {
    return localStorage.getItem(REMEMBER_KEY) ?? "";
  } catch {
    return "";
  }
}

const holeInput = {
  position: "absolute",
  border: "none",
  outline: "none",
  background: "#121110",
  color: "#f3f0ea",
  font: "inherit",
  fontWeight: 500,
  fontSize: "2.45cqw",
  padding: "0 0.4cqw",
  borderRadius: "10px",
  "&::placeholder": { color: "#ece7e0", opacity: 1, fontWeight: 500 },
  "&:-webkit-autofill, &:-webkit-autofill:hover, &:-webkit-autofill:focus": {
    WebkitTextFillColor: "#f3f0ea",
    WebkitBoxShadow: "0 0 0 1000px #121110 inset",
    caretColor: "#f0c27a",
    transition: "background-color 99999s ease-out",
  },
} as const;

function QuoteMark({ id }: { readonly id: string }) {
  if (id === "BTC") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
        <circle cx="12" cy="12" r="10" fill="#f7931a" />
        <path fill="#fff" d="M13.2 11.6c.9-.3 1.5-1 1.4-2-.1-1.1-1.1-1.7-2.4-1.8V6.4h-1.2v1.3c-.3 0-.6 0-.9.1V6.4H9v1.4H7.6v1.2H9c.1 1.6.2 3.1.2 4.7H7.6V15H9v1.5h1.1V15c.4 0 .7 0 1 .1v1.4h1.2v-1.5c1.5-.2 2.6-1 2.7-2.3.1-1-.4-1.7-1.8-2.1zM11.4 9.2c.7.1 1.1.4 1.1.9s-.5.8-1.3.9c-.1-1.2-.1-1.4.2-1.8zm.4 4.9c-.2.6-.8.8-1.5.9.1-.6.1-1.2.2-1.8.8.1 1.4.4 1.3.9z" />
      </svg>
    );
  }
  if (id === "XAU") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
        <rect x="4" y="8" width="16" height="9" rx="1.5" fill="#e6b325" />
        <rect x="7" y="5.5" width="10" height="3" rx="0.8" fill="#f3d27a" />
      </svg>
    );
  }
  if (id === "ETH") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
        <path fill="#8c8dff" d="M12 2l7 11-7 4-7-4 7-11z" />
        <path fill="#c7c8ff" d="M12 17l7-4-7 9-7-9 7 4z" />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
      <path fill="#e39a32" d="M12 2s6 7 6 12a6 6 0 1 1-12 0c0-5 6-12 6-12z" />
    </svg>
  );
}

type CopyText = (typeof COPY)[Lang];

function Tagline({ text, compact }: { readonly text: CopyText; readonly compact?: boolean }) {
  return (
    <Box sx={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: compact ? 1 : 1.5,
      color: "#f3ece2",
      fontSize: compact ? "3.6cqw" : 15,
      letterSpacing: "0.01em",
      whiteSpace: "nowrap",
    }}>
      <Box sx={{ width: compact ? "7cqw" : 42, height: "1px", background: "linear-gradient(90deg, transparent, #e7c27a)" }} />
      <Box>
        {text.taglineLead}{" "}
        <Box component="span" sx={{ color: "#f0c36a", fontWeight: 650 }}>{text.taglineEm}</Box>
        {" "}{text.taglineTail}
      </Box>
      <Box sx={{ width: compact ? "7cqw" : 42, height: "1px", background: "linear-gradient(90deg, #e7c27a, transparent)" }} />
    </Box>
  );
}

function FooterLinks({ labels, compact }: { readonly labels: readonly string[]; readonly compact?: boolean }) {
  return (
    <Box dir="ltr" sx={{
      display: "flex",
      justifyContent: "center",
      flexWrap: "wrap",
      gap: compact ? "1.2cqw" : 1.25,
      color: "#d5cfc6",
      fontSize: compact ? "2.35cqw" : 13,
      whiteSpace: "nowrap",
    }}>
      {labels.map((label, index) => (
        <Box key={label} sx={{ display: "flex", alignItems: "center", gap: compact ? "1.6cqw" : 1.25 }}>
          {index ? <Box sx={{ opacity: 0.55 }}>|</Box> : null}
          <Box component="span">{label}</Box>
        </Box>
      ))}
    </Box>
  );
}

function Ticker({ quotes, stacked }: { readonly quotes: readonly (typeof QUOTES)[number][]; readonly stacked: boolean }) {
  return (
    <Box dir="ltr" sx={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-around",
      gap: 1,
      px: stacked ? 1 : 3,
      py: stacked ? 0.6 : 1,
      color: "#f4f0ea",
      fontSize: stacked ? 11 : 13,
    }}>
      {quotes.map((quote, index) => (
        <Box key={quote.id} sx={{ display: "flex", alignItems: "center", gap: 0.75, minWidth: 0, flex: stacked ? 1 : "0 1 auto" }}>
          {index && !stacked ? <Box sx={{ width: "1px", height: 16, bgcolor: "rgba(232,196,130,0.35)", mr: 1.5 }} /> : null}
          {index && stacked ? <Box sx={{ width: "1px", alignSelf: "stretch", bgcolor: "rgba(232,196,130,0.28)", mr: 0.5 }} /> : null}
          <QuoteMark id={quote.id} />
          <Box sx={{ minWidth: 0, lineHeight: 1.25 }}>
            {stacked ? (
              <>
                <Box sx={{ fontWeight: 750, letterSpacing: "0.04em" }}>{quote.id}</Box>
                <Box sx={{ display: "flex", gap: 0.4, fontSize: 10, whiteSpace: "nowrap" }}>
                  <span>{quote.price}</span>
                  <Box component="span" sx={{ color: "#3ddc84", unicodeBidi: "isolate" }}>▲{quote.change}</Box>
                </Box>
              </>
            ) : (
              <Box sx={{ display: "flex", alignItems: "baseline", gap: 0.8 }}>
                <Box component="span" sx={{ fontWeight: 750 }}>{quote.id}</Box>
                <span>{quote.price}</span>
                <Box component="span" sx={{ color: "#3ddc84" }}>▲ {quote.change}</Box>
              </Box>
            )}
          </Box>
        </Box>
      ))}
    </Box>
  );
}

function hitStyle(area: { left: string; top: string; width: string; height: string }) {
  return {
    position: "absolute" as const,
    ...area,
    border: "none",
    background: "transparent",
    padding: 0,
    margin: 0,
    cursor: "pointer",
    color: "inherit",
    font: "inherit",
  };
}

/** The painted card, with real controls in the holes. */
function ArtCard({
  lang,
  t,
  username,
  password,
  showPassword,
  remember,
  busy,
  dev,
  onLanguage,
  onUsername,
  onPassword,
  onTogglePassword,
  onRemember,
  onForgot,
  onGoogle,
}: {
  readonly lang: Lang;
  readonly t: CopyText;
  readonly username: string;
  readonly password: string;
  readonly showPassword: boolean;
  readonly remember: boolean;
  readonly busy: boolean;
  readonly dev: boolean;
  readonly onLanguage: (lang: Lang) => void;
  readonly onUsername: (value: string) => void;
  readonly onPassword: (value: string) => void;
  readonly onTogglePassword: () => void;
  readonly onRemember: (value: boolean) => void;
  readonly onForgot: () => void;
  readonly onGoogle: () => void;
}) {
  const fa = lang === "fa";
  return (
    <Box dir="ltr" sx={{ position: "relative", width: "100%", containerType: "inline-size" }}>
      <Box
        component="img"
        src={brandSrc("forge-mobile-v2-form.png")}
        alt=""
        sx={{ width: "100%", height: "auto", display: "block", pointerEvents: "none", userSelect: "none" }}
      />
      {dev ? (
        <Box component="a" href="?view=landing" aria-label="Forge" sx={{ position: "absolute", left: "28%", top: "2%", width: "38%", height: "28%" }} />
      ) : null}
      <Box sx={{
        position: "absolute",
        left: "65.5%",
        top: "15.1%",
        width: "20.2%",
        height: "7.6%",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        px: "0.6%",
        borderRadius: 999,
        bgcolor: "#0b0a08",
        border: "1px solid rgba(226, 176, 90, 0.9)",
        boxSizing: "border-box",
      }}>
        {(["en", "fa"] as const).map((code) => (
          <Box
            key={code}
            component="button"
            type="button"
            onClick={() => onLanguage(code)}
            sx={{
              flex: 1,
              height: "78%",
              border: "none",
              borderRadius: 999,
              cursor: "pointer",
              font: "inherit",
              fontWeight: 800,
              fontSize: "2.05cqw",
              letterSpacing: "0.04em",
              color: lang === code ? "#1a1208" : "#f4efe6",
              bgcolor: lang === code ? "#f0b03a" : "transparent",
            }}
          >
            {code.toUpperCase()}
          </Box>
        ))}
      </Box>
      <Box
        component="input"
        aria-label={t.email}
        placeholder={t.email}
        type="email"
        required
        value={username}
        autoComplete="username"
        onChange={(event) => onUsername(event.target.value)}
        dir="ltr"
        sx={{ ...holeInput, left: "20.2%", top: "36.6%", width: "58%", height: "7.6%" }}
      />
      <Box
        component="input"
        aria-label={t.password}
        placeholder={t.password}
        type={showPassword ? "text" : "password"}
        required
        minLength={6}
        value={password}
        autoComplete="current-password"
        onChange={(event) => onPassword(event.target.value)}
        dir="ltr"
        sx={{ ...holeInput, left: "20.2%", top: "48.7%", width: "52%", height: "7.6%" }}
      />
      <Box
        component="button"
        type="button"
        aria-label={showPassword ? "Hide password" : "Show password"}
        onClick={onTogglePassword}
        sx={hitStyle({ left: "75.8%", top: "49.6%", width: "6.2%", height: "5.6%" })}
      />
      <Box
        component="button"
        type="button"
        aria-label={t.remember}
        aria-pressed={remember}
        onClick={() => onRemember(!remember)}
        sx={hitStyle({ left: "15.5%", top: "59.4%", width: "36%", height: "6.4%" })}
      />
      {remember ? (
        <Box sx={{
          position: "absolute",
          left: "16.7%",
          top: "61.3%",
          width: "2.2%",
          height: "2.6%",
          color: "#f0c36a",
          fontSize: "2.3cqw",
          lineHeight: 1,
          pointerEvents: "none",
        }}>✓</Box>
      ) : null}
      {fa ? (
        <Box sx={{
          position: "absolute",
          left: "22%",
          top: "60.6%",
          width: "24%",
          height: "4%",
          bgcolor: "#100e0c",
          color: "#f3f0ea",
          fontSize: "2.15cqw",
          display: "flex",
          alignItems: "center",
          pointerEvents: "none",
        }}>{t.remember}</Box>
      ) : null}
      <Box
        component="button"
        type="button"
        aria-label={t.forgot}
        onClick={onForgot}
        sx={{
          ...hitStyle({ left: "58%", top: "59.6%", width: "26%", height: "5.8%" }),
          ...(fa ? {
            background: "#100e0c",
            color: "#f3f0ea",
            fontSize: "2.05cqw",
            textDecoration: "underline",
            textUnderlineOffset: "2px",
          } : null),
        }}
      >
        {fa ? t.forgot : ""}
      </Box>
      <Box
        component="button"
        type="submit"
        aria-label={t.signIn}
        disabled={busy}
        sx={{
          ...hitStyle({ left: "16.2%", top: "68.8%", width: "67.5%", height: "10.2%" }),
          cursor: busy ? "progress" : "pointer",
          color: "#1a1208",
          fontWeight: 750,
          fontSize: "3.1cqw",
          ...(fa || busy ? {
            background: "linear-gradient(180deg, #f8e7b0 0%, #f6d98a 42%, #e7a84a 100%)",
            borderRadius: "999px",
          } : null),
        }}
      >
        {fa || busy ? `${busy ? "…" : t.signIn} →` : ""}
      </Box>
      <Box
        component="button"
        type="button"
        aria-label={t.google}
        onClick={onGoogle}
        sx={hitStyle({ left: "22%", top: "82.2%", width: "56%", height: "6.4%" })}
      />
      {fa ? (
        <Box sx={{
          position: "absolute",
          left: "40%",
          top: "83.4%",
          width: "30%",
          height: "3.8%",
          bgcolor: "#0c0b09",
          color: "#f3f0ea",
          fontSize: "2.15cqw",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
        }}>{t.google}</Box>
      ) : null}
    </Box>
  );
}

function SignupCard({
  t,
  displayName,
  username,
  password,
  confirm,
  busy,
  error,
  onDisplayName,
  onUsername,
  onPassword,
  onConfirm,
  onSignIn,
}: {
  readonly t: CopyText;
  readonly displayName: string;
  readonly username: string;
  readonly password: string;
  readonly confirm: string;
  readonly busy: boolean;
  readonly error: string | null;
  readonly onDisplayName: (value: string) => void;
  readonly onUsername: (value: string) => void;
  readonly onPassword: (value: string) => void;
  readonly onConfirm: (value: string) => void;
  readonly onSignIn: () => void;
}) {
  const field = {
    height: 48,
    borderRadius: "12px",
    border: "1px solid rgba(226,214,196,0.4)",
    bgcolor: "rgba(0,0,0,0.35)",
    color: "#f6f3ee",
    px: 1.5,
    font: "inherit",
    fontSize: 15,
    outline: "none",
    "&:focus": { borderColor: "rgba(232,196,130,0.85)" },
  };
  return (
    <Box sx={{
      px: 2.5,
      pt: 2,
      pb: 2.25,
      borderRadius: "22px",
      border: "1px solid rgba(214,170,90,0.55)",
      background: "linear-gradient(180deg, rgba(22,16,12,0.94), rgba(8,7,6,0.92))",
      boxShadow: "0 24px 60px rgba(0,0,0,0.45)",
    }}>
      <Box sx={{ display: "flex", justifyContent: "center", mb: 1.5 }}>
        <Box component="img" src={brandSrc("forge-f.png")} alt="" sx={{ height: 56, width: "auto" }} />
      </Box>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1.1 }}>
        <Box component="input" aria-label={t.name} placeholder={t.name} value={displayName} onChange={(event) => onDisplayName(event.target.value)} sx={field} />
        <Box component="input" aria-label={t.email} placeholder={t.email} type="email" required value={username} autoComplete="username" onChange={(event) => onUsername(event.target.value)} sx={field} />
        <Box component="input" aria-label={t.password} placeholder={t.password} type="password" required minLength={6} value={password} autoComplete="new-password" onChange={(event) => onPassword(event.target.value)} sx={field} />
        <Box component="input" aria-label={t.confirm} placeholder={t.confirm} type="password" required minLength={6} value={confirm} autoComplete="new-password" onChange={(event) => onConfirm(event.target.value)} sx={field} />
        {error ? <Box sx={{ color: "#ffb4b4", fontSize: 13, textAlign: "center" }}>{error}</Box> : null}
        <Box component="button" type="submit" disabled={busy} sx={{
          height: 48,
          border: "none",
          borderRadius: "12px",
          cursor: busy ? "progress" : "pointer",
          color: "#1a1208",
          font: "inherit",
          fontWeight: 750,
          fontSize: 16,
          background: "linear-gradient(180deg, #f8e7b0, #f3c56a 40%, #e39a32)",
        }}>{busy ? "…" : `${t.create} →`}</Box>
        <Box sx={{ textAlign: "center", color: "#d9d3cb", fontSize: 13 }}>
          {t.haveAccount}{" "}
          <Box component="button" type="button" onClick={onSignIn} sx={{ p: 0, border: "none", bgcolor: "transparent", color: "#e4b15a", font: "inherit", fontWeight: 700, cursor: "pointer" }}>
            {t.switchSign}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

/** Sign-in from the design art: scene behind, card in front. No captcha. */
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
  const mobile = useMediaQuery("(max-width:900px)", { noSsr: true });
  const [lang, setLang] = useState<Lang>("en");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const dev = isDevSite();
  const t = COPY[lang];
  const signup = mode === "signup";
  const message = notice || error;

  useEffect(() => {
    const stored = readLanguage();
    setLang(stored);
    const email = readRememberedEmail();
    if (email) {
      setRemember(true);
      if (!username) onUsername(email);
    }
    // Prefill once from this browser.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang === "fa" ? "fa" : "en";
  }, [lang]);

  const chooseLanguage = (next: Lang) => {
    setLang(next);
    writeLanguage(next);
    setNotice(null);
  };

  const submit = (event: FormEvent) => {
    setNotice(null);
    try {
      if (!signup && remember && username.trim()) localStorage.setItem(REMEMBER_KEY, username.trim());
      else if (!signup) localStorage.removeItem(REMEMBER_KEY);
    } catch {
      /* ignore */
    }
    onSubmit(event);
  };

  const quotes = mobile ? QUOTES.slice(0, 3) : QUOTES;
  const footer = [t.about, t.terms, t.privacy, t.help];

  const card = signup ? (
    <SignupCard
      t={t}
      displayName={displayName}
      username={username}
      password={password}
      confirm={confirm}
      busy={busy}
      error={message}
      onDisplayName={onDisplayName}
      onUsername={onUsername}
      onPassword={onPassword}
      onConfirm={onConfirm}
      onSignIn={() => { setNotice(null); onMode("login"); }}
    />
  ) : (
    <ArtCard
      lang={lang}
      t={t}
      username={username}
      password={password}
      showPassword={showPassword}
      remember={remember}
      busy={busy}
      dev={dev}
      onLanguage={chooseLanguage}
      onUsername={onUsername}
      onPassword={onPassword}
      onTogglePassword={() => setShowPassword((value) => !value)}
      onRemember={setRemember}
      onForgot={() => setNotice(t.forgotNote)}
      onGoogle={() => setNotice(t.googleNote)}
    />
  );

  const shell = (scene: ReactNode, column: ReactNode) => (
    <Box dir={lang === "fa" ? "rtl" : "ltr"} sx={{ height: "100dvh", overflow: "hidden", position: "relative", bgcolor: "#050403", color: "#f4f0ea", fontFamily: '"Segoe UI", Tahoma, "Helvetica Neue", Arial, sans-serif' }}>
      {scene}
      <Box sx={{ position: "relative", zIndex: 1, height: "100%", overflowY: "auto", WebkitOverflowScrolling: "touch", display: "flex", flexDirection: "column" }}>
        {column}
      </Box>
    </Box>
  );

  if (mobile) {
    return shell(
      null,
      <Box component="form" onSubmit={submit} sx={{ width: "min(100%, 480px)", mx: "auto", position: "relative", containerType: "inline-size" }}>
        <Box component="img" src={brandSrc("forge-mobile-v2-background.png")} alt="" sx={{ width: "100%", height: "auto", display: "block", pointerEvents: "none", userSelect: "none" }} />
        <Box sx={{ position: "absolute", left: 0, right: 0, top: "29.2%", containerType: "inline-size" }}>
          <Tagline text={t} compact />
        </Box>
        <Box sx={{ position: "absolute", top: "32.6%", left: signup ? "6%" : "-7.5%", width: signup ? "88%" : "122%" }}>
          {card}
        </Box>
        {!signup && message ? (
          <Box sx={{ position: "absolute", left: "8%", right: "8%", top: "84.2%", color: "#ffb4b4", fontSize: "2.6cqw", textAlign: "center" }}>{message}</Box>
        ) : null}
        {!signup ? (
          <Box sx={{ position: "absolute", left: "4%", right: "4%", top: "86.8%", textAlign: "center", fontSize: "2.35cqw", whiteSpace: "nowrap" }}>
            <Box component="button" type="button" onClick={() => { setNotice(null); onMode("signup"); }} sx={{ border: "none", bgcolor: "transparent", color: "#e4b15a", font: "inherit", fontSize: "inherit", cursor: "pointer" }}>
              {t.newHere} {t.create}
            </Box>
          </Box>
        ) : null}
        <Box sx={{ position: "absolute", left: 0, right: 0, top: "89.2%", containerType: "inline-size" }}>
          <FooterLinks labels={footer} compact />
        </Box>
        <Box sx={{ position: "absolute", left: 0, right: 0, top: "93%" }}>
          <Ticker quotes={quotes} stacked />
        </Box>
      </Box>,
    );
  }

  return shell(
    <Box component="img" src={brandSrc("forge-background-hi.webp")} alt="" sx={{
      position: "fixed",
      inset: 0,
      width: "100%",
      height: "100%",
      objectFit: "cover",
      objectPosition: "left center",
      pointerEvents: "none",
      userSelect: "none",
    }} />,
    <Box component="form" onSubmit={submit} sx={{ flex: 1, display: "flex", flexDirection: "column", minHeight: "100%" }}>
      <Box sx={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "flex-end", pr: "6vw", pb: "64px" }}>
        <Box sx={{ width: "min(640px, 42vw)" }}>
          <Box sx={{ mb: 1 }}>
            <Tagline text={t} />
          </Box>
          {card}
          {message && !signup ? (
            <Box sx={{ color: "#ffb4b4", fontSize: 13, textAlign: "center", mt: 1 }}>{message}</Box>
          ) : null}
          <Box sx={{ mt: 1.75 }}>
            <FooterLinks labels={footer} />
          </Box>
          {!signup ? (
            <Box sx={{ textAlign: "center", mt: 0.75 }}>
              <Box component="button" type="button" onClick={() => { setNotice(null); onMode("signup"); }} sx={{ border: "none", bgcolor: "transparent", color: "#e4b15a", font: "inherit", fontSize: 13, cursor: "pointer" }}>
                {t.newHere} {t.create}
              </Box>
            </Box>
          ) : null}
        </Box>
      </Box>
      <Box sx={{ borderTop: "1px solid rgba(224,176,90,0.28)", bgcolor: "rgba(0,0,0,0.28)" }}>
        <Ticker quotes={quotes} stacked={false} />
      </Box>
    </Box>,
  );
}
