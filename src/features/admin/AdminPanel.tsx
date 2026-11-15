import { useEffect, useMemo, useState } from "react";
import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";
import { useServices } from "@/app/use-services";
import type { UiLanguage } from "@/application";
import { loadTsetmcBoard, type TsetmcBoard, type TsetmcKind } from "@/infrastructure/market-data/tsetmc-catalog";
import { useStore } from "@/shared/hooks/useStore";

type Section = "system" | "sources" | "tehran";

const COPY = {
  en: {
    title: "Forge data",
    back: "Back to the chart",
    system: "System",
    sources: "Sources",
    tehran: "Tehran",
    intro: "Where each price comes from, and the cleaned Tehran board.",
    kept: "Kept",
    leaving: "Leaving",
    waiting: "Waiting for the board",
    rulesTitle: "How the Tehran rows are cleaned",
    rules: [
      "The exchange publishes one mixed sheet: shares, rights, funds, bonds, options, blank rows, and Latin junk.",
      "A symbol that ends with ح is a right (حق تقدم), not the share.",
      "A symbol that starts with ض or ط is an option. صندوق in the name is a fund. اخزا، اجاره، مرابحه and اوراق are bonds.",
      "Rows with no Persian symbol, and names marked deleted, are dropped. The same symbol is kept once.",
      "Chart history uses the backward-adjusted close (قیمت تعدیل‌شده). Volume stays the raw print.",
      "Last trade and the official close are stored apart. A session with no trade does not copy the close into the last.",
    ],
    brokerTitle: "Broker books",
    brokerBody:
      "Spot gold, FX, indices, and crypto stay on the chart broker books (FXCM, FOREXCOM, FXPRO, BINANCE, and the other books). Those prices stay.",
    farazTitle: "Faraz",
    farazBody:
      "Faraz is not a price source we are keeping. Domestic rial gold (آبشده، گرم، سکه) still prints through the old Faraz relay until that book has its own feed. It is listed here so it is not hidden.",
    tsetmcTitle: "TSETMC",
    tsetmcBody:
      "Tehran prices come from TSETMC. The chart used to ship a short fixed list. The board below is the full cleaned list from the exchange sheet.",
    names: "names",
    dropped: "Dropped",
    empty: "Blank",
    latin: "No Persian name",
    removed: "Deleted",
    duplicate: "Duplicate",
    source: "Sheet",
    updated: "Updated",
    unavailable:
      "The board has not arrived yet. The browser does not call TSETMC itself. The server reads the sheet and serves the cleaned list.",
    search: "Search the board",
    kindAll: "All",
    showing: "Showing",
    of: "of",
    last: "Last",
    close: "Close",
    volume: "Volume",
    market: "Market",
  },
  fa: {
    title: "دادهٔ فورج",
    back: "بازگشت به نمودار",
    system: "سامانه",
    sources: "منابع",
    tehran: "تهران",
    intro: "هر قیمت از کجا می‌آید، و تابلوی تمیز تهران.",
    kept: "می‌ماند",
    leaving: "کنار گذاشته می‌شود",
    waiting: "در انتظار تابلو",
    rulesTitle: "تمیز کردن ردیف‌های تهران",
    rules: [
      "بورس یک برگهٔ مخلوط می‌دهد: سهم، حق تقدم، صندوق، اوراق، اختیار، ردیف خالی و نام لاتین.",
      "نمادی که به ح ختم شود حق تقدم است، نه خود سهم.",
      "نمادی که با ض یا ط شروع شود اختیار است. «صندوق» در نام یعنی صندوق. اخزا، اجاره، مرابحه و اوراق، اوراق بدهی‌اند.",
      "ردیف بدون نماد فارسی، و نام حذف‌شده، کنار گذاشته می‌شود. هر نماد یک بار می‌ماند.",
      "تاریخچهٔ نمودار قیمت پایانی تعدیل‌شده است. حجم، عدد خام معامله است.",
      "آخرین معامله و قیمت پایانی جدا ذخیره می‌شوند. روز بدون معامله، پایانی را به‌جای آخرین نمی‌گذارد.",
    ],
    brokerTitle: "دفتر کارگزارها",
    brokerBody:
      "انس، ارز، شاخص و رمزارز روی دفتر کارگزار نمودار می‌مانند (FXCM، FOREXCOM، FXPRO، BINANCE و بقیه). این قیمت‌ها می‌مانند.",
    farazTitle: "فراز",
    farazBody:
      "فراز منبع قیمتی نیست که نگه می‌داریم. طلای ریالی (آبشده، گرم، سکه) هنوز از رلهٔ قدیمی فراز می‌آید تا وقتی دفتر خودش را داشته باشد. اینجا هست تا پنهان نماند.",
    tsetmcTitle: "TSETMC",
    tsetmcBody:
      "قیمت تهران از TSETMC می‌آید. نمودار قبلاً فقط یک فهرست کوتاه و ثابت داشت. تابلوی پایین فهرست کامل و تمیز همان برگهٔ بورس است.",
    names: "نماد",
    dropped: "کنار گذاشته‌شده",
    empty: "خالی",
    latin: "بدون نام فارسی",
    removed: "حذف‌شده",
    duplicate: "تکراری",
    source: "برگه",
    updated: "به‌روزرسانی",
    unavailable:
      "تابلو هنوز نرسیده. مرورگر خودش به TSETMC وصل نمی‌شود. سرور برگه را می‌خواند و فهرست تمیز را می‌دهد.",
    search: "جستجوی تابلو",
    kindAll: "همه",
    showing: "نمایش",
    of: "از",
    last: "آخرین",
    close: "پایانی",
    volume: "حجم",
    market: "بازار",
  },
} as const;

const KIND_LABEL: Record<UiLanguage, Record<TsetmcKind | "all", string>> = {
  en: {
    all: "All",
    stock: "Share",
    right: "Right",
    fund: "Fund",
    bond: "Bond",
    futures: "Futures",
    option: "Option",
  },
  fa: {
    all: "همه",
    stock: "سهم",
    right: "حق تقدم",
    fund: "صندوق",
    bond: "اوراق",
    futures: "آتی",
    option: "اختیار",
  },
};

function sectionFromHash(): Section {
  const hash = window.location.hash.replace("#", "");
  if (hash === "sources" || hash === "tehran" || hash === "system") return hash;
  return "system";
}

function formatWhen(ms: number, language: UiLanguage): string {
  if (!ms) return "—";
  try {
    return new Intl.DateTimeFormat(language === "fa" ? "fa-IR" : "en-GB", {
      timeZone: "Asia/Tehran",
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(ms));
  } catch {
    return new Date(ms).toISOString();
  }
}

function formatNum(value: number, language: UiLanguage): string {
  if (!value) return "—";
  try {
    return new Intl.NumberFormat(language === "fa" ? "fa-IR" : "en-US", {
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return String(value);
  }
}

export function AdminPanel({ onBack }: { readonly onBack: () => void }) {
  const mui = useTheme();
  const dark = mui.palette.mode === "dark";
  const { settings } = useServices();
  const language = useStore(settings.settings, (s) => s.language);
  const t = COPY[language];
  const [section, setSection] = useState<Section>(sectionFromHash);
  const [board, setBoard] = useState<TsetmcBoard | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<TsetmcKind | "all">("all");

  useEffect(() => {
    const onHash = () => setSection(sectionFromHash());
    window.addEventListener("hashchange", onHash);
    if (!window.location.hash) {
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#system`);
    }
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    let dead = false;
    void loadTsetmcBoard().then((next) => {
      if (dead) return;
      if (!next || next.total === 0) setFailed(true);
      setBoard(next);
    });
    return () => {
      dead = true;
    };
  }, []);

  const bg = dark ? "#0f1218" : "#f4f6fa";
  const card = dark ? "#1a1e28" : "#ffffff";
  const fg = dark ? "#d1d4dc" : "#131722";
  const muted = dark ? "#8b8f9a" : "#5d606b";
  const line = dark ? "#2a2e39" : "#e0e3eb";
  const accent = "#2962ff";

  const openSection = (next: Section) => {
    window.location.hash = next;
    setSection(next);
  };

  const visible = useMemo(() => {
    const rows = board?.rows ?? [];
    const q = query.trim();
    return rows
      .filter((row) => (kind === "all" ? true : row.kind === kind))
      .filter((row) => (q ? `${row.symbol} ${row.name} ${row.market}`.includes(q) : true))
      .slice(0, 200);
  }, [board, query, kind]);

  const matched = useMemo(() => {
    const rows = board?.rows ?? [];
    const q = query.trim();
    return rows.filter((row) => (kind === "all" ? true : row.kind === kind)).filter((row) =>
      q ? `${row.symbol} ${row.name} ${row.market}`.includes(q) : true,
    ).length;
  }, [board, query, kind]);

  const chip = (active: boolean) => ({
    border: `1px solid ${active ? accent : line}`,
    background: active ? "rgba(41,98,255,0.16)" : "transparent",
    color: active ? (dark ? "#9db7ff" : accent) : fg,
    borderRadius: "999px",
    padding: "6px 12px",
    fontSize: 13,
    cursor: "pointer",
    fontFamily: "inherit",
  });

  return (
    <Box
      dir={language === "fa" ? "rtl" : "ltr"}
      sx={{
        position: "fixed",
        inset: 0,
        zIndex: 1400,
        overflow: "auto",
        bgcolor: bg,
        color: fg,
      }}
    >
      <Box sx={{ maxWidth: 1080, mx: "auto", px: 2.5, py: 2.5 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2 }}>
          <Box
            component="button"
            type="button"
            onClick={onBack}
            sx={{
              border: `1px solid ${line}`,
              background: "transparent",
              color: muted,
              borderRadius: "8px",
              px: 1.25,
              py: 0.6,
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: 13,
            }}
          >
            {t.back}
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography sx={{ fontWeight: 700, fontSize: 22, lineHeight: 1.2 }}>{t.title}</Typography>
            <Typography sx={{ color: muted, fontSize: 13, mt: 0.4 }}>{t.intro}</Typography>
          </Box>
        </Box>

        <Box sx={{ display: "flex", gap: 1, mb: 2.5, flexWrap: "wrap" }}>
          {(
            [
              ["system", t.system],
              ["sources", t.sources],
              ["tehran", t.tehran],
            ] as const
          ).map(([id, label]) => (
            <Box key={id} component="button" type="button" onClick={() => openSection(id)} sx={chip(section === id)}>
              {label}
            </Box>
          ))}
        </Box>

        {section === "system" || section === "sources" ? (
          <Box sx={{ display: "grid", gap: 1.25, gridTemplateColumns: { xs: "1fr", md: "1fr 1fr 1fr" }, mb: 2 }}>
            <SourceCard
              card={card}
              line={line}
              muted={muted}
              title={t.brokerTitle}
              body={t.brokerBody}
              status={t.kept}
              tone="kept"
            />
            <SourceCard
              card={card}
              line={line}
              muted={muted}
              title={t.tsetmcTitle}
              body={t.tsetmcBody}
              status={board && board.total > 0 ? `${formatNum(board.total, language)} ${t.names}` : t.waiting}
              tone={board && board.total > 0 ? "kept" : "wait"}
            />
            <SourceCard
              card={card}
              line={line}
              muted={muted}
              title={t.farazTitle}
              body={t.farazBody}
              status={t.leaving}
              tone="leave"
            />
          </Box>
        ) : null}

        {section === "system" ? (
          <Box sx={{ bgcolor: card, border: `1px solid ${line}`, borderRadius: "12px", p: 2 }}>
            <Typography sx={{ fontWeight: 700, mb: 1 }}>{t.rulesTitle}</Typography>
            <Box component="ol" sx={{ m: 0, pl: language === "fa" ? 0 : 2.25, pr: language === "fa" ? 2.25 : 0 }}>
              {t.rules.map((rule) => (
                <Typography key={rule} component="li" sx={{ color: muted, fontSize: 14, mb: 0.8, lineHeight: 1.55 }}>
                  {rule}
                </Typography>
              ))}
            </Box>
          </Box>
        ) : null}

        {section === "tehran" ? (
          <Box sx={{ bgcolor: card, border: `1px solid ${line}`, borderRadius: "12px", p: 2 }}>
            <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", mb: 1.5, color: muted, fontSize: 13 }}>
              <span>
                {t.source}: {board?.source || "—"}
              </span>
              <span>
                {t.updated}: {formatWhen(board?.updatedAt ?? 0, language)} ({language === "fa" ? "تهران" : "Tehran"})
              </span>
              <span>
                {t.names}: {formatNum(board?.total ?? 0, language)}
              </span>
            </Box>
            {board && board.total > 0 ? (
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 1.5, color: muted, fontSize: 12.5 }}>
                <span>
                  {t.dropped}: {t.empty} {formatNum(board.dropped.empty, language)}
                </span>
                <span>
                  {t.latin} {formatNum(board.dropped.not_persian, language)}
                </span>
                <span>
                  {t.removed} {formatNum(board.dropped.removed, language)}
                </span>
                <span>
                  {t.duplicate} {formatNum(board.dropped.duplicate, language)}
                </span>
              </Box>
            ) : (
              <Typography sx={{ color: muted, fontSize: 14, mb: 1.5 }}>
                {failed ? t.unavailable : t.waiting}
              </Typography>
            )}
            <TextField
              fullWidth
              size="small"
              value={query}
              placeholder={t.search}
              onChange={(event) => setQuery(event.target.value)}
              sx={{
                mb: 1.25,
                "& .MuiOutlinedInput-root": {
                  color: fg,
                  borderRadius: "10px",
                  "& fieldset": { borderColor: line },
                },
              }}
            />
            <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap", mb: 1.5 }}>
              {(["all", "stock", "fund", "right", "bond", "futures", "option"] as const).map((id) => (
                <Box key={id} component="button" type="button" onClick={() => setKind(id)} sx={chip(kind === id)}>
                  {KIND_LABEL[language][id]}
                  {id !== "all" && board?.counts[id] ? ` ${formatNum(board.counts[id], language)}` : ""}
                </Box>
              ))}
            </Box>
            <Typography sx={{ color: muted, fontSize: 12.5, mb: 1 }}>
              {t.showing} {formatNum(visible.length, language)} {t.of} {formatNum(matched, language)}
            </Typography>
            <Box sx={{ display: "grid", gap: 0.5 }}>
              {visible.map((row) => (
                <Box
                  key={`${row.kind}:${row.symbol}`}
                  sx={{
                    display: "grid",
                    gridTemplateColumns: { xs: "1fr", sm: "120px 1fr 90px 90px 90px 80px" },
                    gap: 1,
                    alignItems: "center",
                    borderTop: `1px solid ${line}`,
                    py: 0.8,
                    fontSize: 13,
                  }}
                >
                  <Typography sx={{ fontWeight: 700, fontSize: 13 }}>{row.symbol}</Typography>
                  <Typography sx={{ color: muted, fontSize: 13 }} noWrap>
                    {row.name}
                    {row.market ? ` — ${row.market}` : ""}
                  </Typography>
                  <Typography sx={{ fontSize: 12, color: muted }}>{KIND_LABEL[language][row.kind]}</Typography>
                  <Typography sx={{ fontSize: 12 }}>
                    {t.last} {formatNum(row.last, language)}
                  </Typography>
                  <Typography sx={{ fontSize: 12 }}>
                    {t.close} {formatNum(row.close, language)}
                  </Typography>
                  <Typography sx={{ fontSize: 12, color: muted }}>
                    {t.volume} {formatNum(row.volume, language)}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Box>
        ) : null}
      </Box>
    </Box>
  );
}

function SourceCard({
  card,
  line,
  muted,
  title,
  body,
  status,
  tone,
}: {
  readonly card: string;
  readonly line: string;
  readonly muted: string;
  readonly title: string;
  readonly body: string;
  readonly status: string;
  readonly tone: "kept" | "leave" | "wait";
}) {
  const color = tone === "kept" ? "#089981" : tone === "leave" ? "#f5a623" : muted;
  return (
    <Box sx={{ bgcolor: card, border: `1px solid ${line}`, borderRadius: "12px", p: 1.75 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1, mb: 1, alignItems: "center" }}>
        <Typography sx={{ fontWeight: 700 }}>{title}</Typography>
        <Box sx={{ color, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>{status}</Box>
      </Box>
      <Typography sx={{ color: muted, fontSize: 13.5, lineHeight: 1.55 }}>{body}</Typography>
    </Box>
  );
}
