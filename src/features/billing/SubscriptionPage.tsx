import { useState } from "react";
import Box from "@mui/material/Box";
import { isDevSite } from "@/dev-site";
import {
  YEAR_AT_MONTHLY,
  formatPrice,
  formatToman,
  formatUsd,
  readPlanChoice,
  writePlanChoice,
  type PayCurrency,
  type PlanChoice,
  type PlanId,
} from "./plans";

type Lang = "en" | "fa";

const SETTINGS_KEY = "forge.settings.v1";

function brandSrc(file: string): string {
  const base = import.meta.env.BASE_URL || "/";
  const root = base.endsWith("/") ? base : `${base}/`;
  return `${root}brand/${file}`;
}

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
    const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return;
    parsed.language = language;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(parsed));
  } catch {
    /* private mode */
  }
}

const COPY = {
  en: {
    backChart: "Back to chart",
    backSignIn: "Back to sign in",
    title: "Forge Charts subscription",
    lede: "One desk. Monthly or yearly. The yearly toman price is 20% off twelve months.",
    toman: "Toman",
    dollar: "Dollar",
    month: "Monthly",
    year: "Yearly",
    perMonth: "per month",
    perYear: "per year",
    off: "20% off",
    was: "Twelve months at the monthly price",
    chooseMonth: "Choose monthly",
    chooseYear: "Choose yearly",
    selected: "Selected",
    signInMonth: "Sign in and choose monthly",
    signInYear: "Sign in and choose yearly",
    saved: "This plan is saved on this account.",
    savedGuest: "Sign in so this plan stays with your account.",
    note: "Forge is the charting desk. The plan is the subscription for the charts. It is not a broker account and it does not move real trading funds.",
  },
  fa: {
    backChart: "بازگشت به نمودار",
    backSignIn: "بازگشت به ورود",
    title: "اشتراک فورج چارت",
    lede: "یک میز نمودار. ماهانه یا سالانه. قیمت سالانه به تومان ۲۰٪ کمتر از دوازده ماه است.",
    toman: "تومان",
    dollar: "دلار",
    month: "ماهانه",
    year: "سالانه",
    perMonth: "در ماه",
    perYear: "در سال",
    off: "۲۰٪ تخفیف",
    was: "دوازده ماه با قیمت ماهانه",
    chooseMonth: "انتخاب ماهانه",
    chooseYear: "انتخاب سالانه",
    selected: "انتخاب شد",
    signInMonth: "ورود و انتخاب ماهانه",
    signInYear: "ورود و انتخاب سالانه",
    saved: "این طرح روی حساب شما ذخیره شد.",
    savedGuest: "وارد شوید تا این طرح با حساب شما بماند.",
    note: "فورج میز نمودار است. این طرح اشتراک نمودارهاست. حساب کارگزاری نیست و پول معامله را جابه‌جا نمی‌کند.",
  },
} as const;

interface SubscriptionPageProps {
  readonly signedIn: boolean;
  readonly onBack: () => void;
  readonly onSignIn: () => void;
}

export function SubscriptionPage({ signedIn, onBack, onSignIn }: SubscriptionPageProps) {
  const [lang, setLang] = useState<Lang>(() => readLanguage());
  const [currency, setCurrency] = useState<PayCurrency>(() => (readLanguage() === "fa" ? "toman" : "usd"));
  const [choice, setChoice] = useState<PlanChoice | null>(() => readPlanChoice());
  const [notice, setNotice] = useState<string | null>(null);
  const fa = lang === "fa";
  const t = COPY[lang];
  const home = isDevSite() ? "?view=landing" : "https://forgechart.ir/";

  const chooseLanguage = (next: Lang) => {
    setLang(next);
    writeLanguage(next);
    setCurrency(next === "fa" ? "toman" : "usd");
    setNotice(null);
  };

  const choose = (plan: PlanId) => {
    const next = writePlanChoice(plan, currency);
    setChoice(next);
    setNotice(signedIn ? t.saved : t.savedGuest);
    if (!signedIn) onSignIn();
  };

  const priceLine = (plan: PlanId) => formatPrice(plan, currency, fa);
  const compare = currency === "toman" ? formatToman(YEAR_AT_MONTHLY.toman, fa) : formatUsd(YEAR_AT_MONTHLY.usd);

  return (
    <Box
      dir={fa ? "rtl" : "ltr"}
      sx={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        overflow: "auto",
        bgcolor: "#050403",
        color: "#f4f0ea",
        fontFamily: '"Segoe UI", Tahoma, "Helvetica Neue", Arial, sans-serif',
      }}
    >
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
          objectPosition: "left center",
          opacity: 0.28,
          pointerEvents: "none",
        }}
      />
      <Box sx={{ position: "relative", zIndex: 1, maxWidth: 880, mx: "auto", px: { xs: 2, sm: 3 }, py: 3 }}>
        <Box dir="ltr" sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2.5 }}>
          <Box component="a" href={home} aria-label="Forge" sx={{ display: "flex", lineHeight: 0 }}>
            <Box component="img" src={brandSrc("forge-f.png")} alt="" sx={{ height: 42, width: "auto" }} />
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Box
              component="button"
              type="button"
              onClick={() => chooseLanguage(fa ? "en" : "fa")}
              sx={ghostButton}
            >
              {fa ? "EN" : "فا"}
            </Box>
            <Box component="button" type="button" onClick={onBack} sx={ghostButton}>
              {signedIn ? t.backChart : t.backSignIn}
            </Box>
          </Box>
        </Box>

        <Box sx={{ fontSize: { xs: 26, sm: 32 }, fontWeight: 750 }}>{t.title}</Box>
        <Box sx={{ mt: 1, color: "#e7d7b8", fontSize: 16, lineHeight: 1.55, maxWidth: 640 }}>{t.lede}</Box>

        <Box dir="ltr" sx={{ display: "flex", gap: 1, mt: 2.2 }}>
          <CurrencyButton active={currency === "toman"} onClick={() => setCurrency("toman")}>
            {t.toman}
          </CurrencyButton>
          <CurrencyButton active={currency === "usd"} onClick={() => setCurrency("usd")}>
            {t.dollar}
          </CurrencyButton>
        </Box>

        <Box
          sx={{
            mt: 2.4,
            display: "grid",
            gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
            gap: 1.6,
          }}
        >
          <PlanCard
            title={t.month}
            price={priceLine("month")}
            period={t.perMonth}
            selected={choice?.plan === "month"}
            selectedLabel={t.selected}
            action={signedIn ? t.chooseMonth : t.signInMonth}
            onChoose={() => choose("month")}
          />
          <PlanCard
            title={t.year}
            price={priceLine("year")}
            period={t.perYear}
            badge={currency === "toman" ? t.off : undefined}
            compare={compare}
            compareLabel={t.was}
            selected={choice?.plan === "year"}
            selectedLabel={t.selected}
            action={signedIn ? t.chooseYear : t.signInYear}
            highlight
            onChoose={() => choose("year")}
          />
        </Box>

        {notice ? (
          <Box sx={{ mt: 2, color: "#f0c36a", fontSize: 14 }}>{notice}</Box>
        ) : null}
        <Box sx={{
          mt: 2.2,
          maxWidth: 680,
          px: 1.5,
          py: 1.2,
          borderRadius: "14px",
          bgcolor: "rgba(8,7,6,0.82)",
          color: "#cbbfaa",
          fontSize: 13,
          lineHeight: 1.6,
        }}>{t.note}</Box>
      </Box>
    </Box>
  );
}

function CurrencyButton({
  active,
  onClick,
  children,
}: {
  readonly active: boolean;
  readonly onClick: () => void;
  readonly children: string;
}) {
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      sx={{
        border: `1px solid ${active ? "rgba(240,195,106,0.85)" : "rgba(224,176,90,0.35)"}`,
        bgcolor: active ? "rgba(240,195,106,0.16)" : "rgba(8,7,6,0.72)",
        color: active ? "#f0c36a" : "#d5cfc6",
        borderRadius: 999,
        px: 1.7,
        py: 0.7,
        font: "inherit",
        fontSize: 13,
        fontWeight: 700,
        cursor: "pointer",
      }}
    >
      {children}
    </Box>
  );
}

function PlanCard({
  title,
  price,
  period,
  badge,
  compare,
  compareLabel,
  selected,
  selectedLabel,
  action,
  highlight,
  onChoose,
}: {
  readonly title: string;
  readonly price: string;
  readonly period: string;
  readonly badge?: string;
  readonly compare?: string;
  readonly compareLabel?: string;
  readonly selected: boolean;
  readonly selectedLabel: string;
  readonly action: string;
  readonly highlight?: boolean;
  readonly onChoose: () => void;
}) {
  return (
    <Box
      sx={{
        border: `1px solid ${highlight ? "rgba(240,195,106,0.7)" : "rgba(214,170,90,0.35)"}`,
        borderRadius: "22px",
        bgcolor: "rgba(8,7,6,0.9)",
        boxShadow: "0 24px 60px rgba(0,0,0,0.4)",
        px: { xs: 2.2, sm: 2.6 },
        py: { xs: 2.2, sm: 2.6 },
        display: "flex",
        flexDirection: "column",
        minHeight: 240,
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
        <Box sx={{ fontSize: 18, fontWeight: 750 }}>{title}</Box>
        {badge ? (
          <Box
            sx={{
              px: 1,
              py: 0.25,
              borderRadius: 999,
              bgcolor: "rgba(240,195,106,0.16)",
              color: "#f0c36a",
              fontSize: 12,
              fontWeight: 750,
            }}
          >
            {badge}
          </Box>
        ) : null}
      </Box>
      {compare ? (
        <Box sx={{ mt: 1.6, color: "#8d8478", fontSize: 13 }}>
          <Box component="span" sx={{ textDecoration: "line-through" }}>{compare}</Box>
          {compareLabel ? <Box component="span">{` · ${compareLabel}`}</Box> : null}
        </Box>
      ) : (
        <Box sx={{ mt: 1.6, height: 20 }} />
      )}
      <Box dir="ltr" sx={{ mt: 0.6, fontSize: { xs: 28, sm: 34 }, fontWeight: 780, letterSpacing: "-0.03em", unicodeBidi: "isolate" }}>
        {price}
      </Box>
      <Box sx={{ color: "#cbbfaa", fontSize: 14, mt: 0.4 }}>{period}</Box>
      <Box sx={{ flex: 1 }} />
      <Box
        component="button"
        type="button"
        onClick={onChoose}
        sx={{
          mt: 2.2,
          border: "none",
          borderRadius: 999,
          py: 1.15,
          font: "inherit",
          fontSize: 15,
          fontWeight: 750,
          cursor: "pointer",
          color: "#1a1208",
          background: selected
            ? "linear-gradient(180deg, #efe0b8, #c9a15a)"
            : "linear-gradient(180deg, #f3d48a, #d7a24a)",
        }}
      >
        {selected ? selectedLabel : action}
      </Box>
    </Box>
  );
}

const ghostButton = {
  border: "1px solid rgba(224,176,90,0.45)",
  bgcolor: "rgba(8,7,6,0.72)",
  color: "#f0c36a",
  borderRadius: 999,
  px: 1.6,
  py: 0.7,
  font: "inherit",
  fontSize: 13,
  cursor: "pointer",
};
