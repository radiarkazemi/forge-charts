import { useEffect, useMemo, useState } from "react";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Dialog from "@mui/material/Dialog";
import useMediaQuery from "@mui/material/useMediaQuery";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import CloseIcon from "@mui/icons-material/Close";
import SearchIcon from "@mui/icons-material/Search";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { useServices } from "@/app/use-services";
import type { UiLanguage } from "@/application";
import { SESSION_TSE, type SymbolInfo } from "@/domain";
import { StaticSymbolRepository } from "@/infrastructure";
import { useStore } from "@/shared/hooks/useStore";
import { brokerLogoForExchange } from "./broker-logos";
import { layoutSyncBus } from "./layout-sync";

interface SymbolSearchDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
}

type ChipId =
  | "all"
  | "iran"
  | "fxcm"
  | "forexcom"
  | "fxpro"
  | "binance"
  | "tse"
  | "indices"
  | "stocks";

const CHIP_LABELS: Record<UiLanguage, Record<ChipId, string>> = {
  en: {
    all: "All",
    iran: "Gold & currency",
    fxcm: "Global — FXCM",
    forexcom: "Global — FOREXCOM",
    fxpro: "Global — FXPRO",
    binance: "Binance",
    tse: "Tehran — TSETMC",
    indices: "Indices",
    stocks: "Stocks",
  },
  fa: {
    all: "همه",
    iran: "طلا و ارز",
    fxcm: "بازار جهانی - FXCM",
    forexcom: "بازار جهانی - FOREXCOM",
    fxpro: "بازار جهانی - FXPRO",
    binance: "بایننس",
    tse: "بورس تهران",
    indices: "شاخص‌ها",
    stocks: "سهام",
  },
};

const TITLE: Record<UiLanguage, string> = {
  en: "Select symbol",
  fa: "انتخاب نماد",
};

const PLACEHOLDER: Record<UiLanguage, string> = {
  en: "Search symbol by Persian or English name",
  fa: "جستجوی نماد، با نام فارسی یا انگلیسی",
};

const COUNT: Record<UiLanguage, (n: number) => string> = {
  en: (n) => `${n.toLocaleString("en-US")} symbols`,
  fa: (n) => `${n.toLocaleString("fa-IR")} نماد`,
};

const AVATAR_COLORS = ["#7e57c2", "#5c6bc0", "#26a69a", "#ef6c00", "#ec407a", "#42a5f5"] as const;

function avatarFor(symbol: SymbolInfo): { text: string; color: string } {
  const ex = symbol.exchange.toUpperCase();
  const t = symbol.ticker.toUpperCase();
  if (ex === "IRAN") {
    if (t.startsWith("AB") || t.includes("ABSHODE") || t === "MESGHAL17") return { text: "AB", color: "#5c6bc0" };
    if (t.startsWith("G")) return { text: "GE", color: "#7e57c2" };
    if (t.startsWith("SEK") || t === "NIM" || t === "ROB") return { text: "SK", color: "#26a69a" };
    return { text: t.slice(0, 2), color: "#7e57c2" };
  }
  if (symbol.type === "forex" || t.includes("USD") || t.includes("EUR") || t.includes("GBP")) {
    return { text: "FX", color: "#ef6c00" };
  }
  if (ex === "TSE") return { text: symbol.ticker.slice(0, 1) || "س", color: "#00897b" };
  if (symbol.type === "crypto" || ex === "BINANCE") return { text: "CR", color: "#f0b90b" };
  if (symbol.type === "index") return { text: "IX", color: "#42a5f5" };
  const hash = (t.charCodeAt(0) + t.charCodeAt(1) || 0) % AVATAR_COLORS.length;
  return { text: t.slice(0, 2), color: AVATAR_COLORS[hash]! };
}

function chipMatches(chip: ChipId, s: SymbolInfo): boolean {
  const ex = s.exchange.toUpperCase();
  switch (chip) {
    case "all":
      return true;
    case "iran":
      return ex === "IRAN";
    case "fxcm":
      return ex === "FXCM";
    case "forexcom":
      return ex === "FOREXCOM";
    case "fxpro":
      return ex === "FXPRO";
    case "binance":
      return ex === "BINANCE";
    case "tse":
      return ex === "TSE";
    case "indices":
      return s.type === "index" || ["TVC", "SP", "DJ"].includes(ex);
    case "stocks":
      return ex !== "TSE" && (s.type === "stock" || ex === "NASDAQ" || ex === "NYSE");
    default:
      return true;
  }
}

function categoryLabel(language: UiLanguage, s: SymbolInfo): string {
  const ex = s.exchange.toUpperCase();
  if (ex === "IRAN") return language === "fa" ? "طلا و ارز" : "Gold & currency";
  if (ex === "FXCM") return language === "fa" ? "بازار جهانی - FXCM" : "Global — FXCM";
  if (ex === "FOREXCOM") return language === "fa" ? "بازار جهانی - FOREXCOM" : "Global — FOREXCOM";
  if (ex === "FXPRO") return language === "fa" ? "بازار جهانی - FXPRO" : "Global — FXPRO";
  if (ex === "BINANCE") return "Binance";
  if (ex === "TSE") return language === "fa" ? "بورس تهران · تعدیل‌شده" : "Tehran · adjusted";
  return s.exchange;
}

/** Faraz-style symbol picker (theme follows chart; copy follows UI language). */
export function SymbolSearchDialog({ open, onClose }: SymbolSearchDialogProps) {
  const { symbols, chart, settings } = useServices();
  const language = useStore(settings.settings, (s) => s.language);
  const theme = useStore(settings.settings, (s) => s.theme);
  const dark = theme === "dark";
  const rtl = language === "fa";
  const phone = useMediaQuery("(max-width:900px)");
  const [query, setQuery] = useState("");
  const [chip, setChip] = useState<ChipId>("all");
  const [remote, setRemote] = useState<SymbolInfo[]>([]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setChip("all");
    document.body.classList.add("forge-symbol-picker-open");
    const iframe = document.querySelector<HTMLIFrameElement>(".chart-page iframe, iframe");
    try {
      iframe?.contentDocument?.body?.classList.add("forge-symbol-picker-open");
    } catch {
      /* ignore */
    }
    return () => {
      document.body.classList.remove("forge-symbol-picker-open");
      try {
        iframe?.contentDocument?.body?.classList.remove("forge-symbol-picker-open");
      } catch {
        /* ignore */
      }
    };
  }, [open]);

  useEffect(() => {
    const q = query.trim();
    if (!open || q.length < 1) {
      setRemote([]);
      return;
    }
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => {
      void fetch(`/iran-gold/tsetmc/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        .then((response) => (response.ok ? response.json() : { hits: [] }))
        .then((data: { hits?: Array<{ symbol?: string; name?: string }> }) => {
          const repo = symbols instanceof StaticSymbolRepository ? symbols : null;
          const next: SymbolInfo[] = [];
          for (const hit of data.hits ?? []) {
            const ticker = String(hit.symbol ?? "").trim();
            if (!ticker) continue;
            const info: SymbolInfo = {
              ticker,
              name: String(hit.name || ticker),
              exchange: "TSE",
              type: "stock",
              pricePrecision: 0,
              session: SESSION_TSE,
              timezone: "Asia/Tehran",
            };
            next.push(repo ? repo.registerDynamic(info) : info);
          }
          setRemote(next);
        })
        .catch(() => {
          /* seeded names still resolve when the VPS search is unreachable */
        });
    }, 320);
    return () => {
      window.clearTimeout(timer);
      ctrl.abort();
    };
  }, [open, query, symbols]);

  const all = useMemo(() => symbols.all(), [symbols, remote]);
  const chips = useMemo(() => {
    const present = new Set(all.map((s) => s.exchange.toUpperCase()));
    const ids: ChipId[] = ["all"];
    if (present.has("IRAN")) ids.push("iran");
    if (present.has("FXCM")) ids.push("fxcm");
    if (present.has("FOREXCOM")) ids.push("forexcom");
    if (present.has("FXPRO")) ids.push("fxpro");
    if (present.has("BINANCE")) ids.push("binance");
    if (present.has("TSE")) ids.push("tse");
    if (all.some((s) => s.type === "index")) ids.push("indices");
    if (all.some((s) => s.type === "stock")) ids.push("stocks");
    return ids;
  }, [all]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const seen = new Set(all.map((s) => `${s.exchange}:${s.ticker}`));
    const extra = remote.filter((s) => !seen.has(`${s.exchange}:${s.ticker}`));
    return [...all, ...extra]
      .filter((s) => chipMatches(chip, s))
      .filter((s) => {
        if (!q) return true;
        return `${s.ticker} ${s.name} ${s.exchange}`.toLowerCase().includes(q);
      })
      .slice(0, 200);
  }, [all, remote, chip, query]);

  const pick = (s: SymbolInfo) => {
    const ticker = `${s.exchange}:${s.ticker}`;
    // Route through layout sync so the active pane (and Symbol-sync peers) update —
    // chart.setSymbol alone always hits pane 0 and left the header on NAS100
    // while a focused XAUUSD pane stayed unchanged.
    if (layoutSyncBus.getActiveCount() > 1) {
      layoutSyncBus.setActivePaneSymbol(ticker);
      const active = layoutSyncBus.getActivePane();
      settings.setPaneSymbol(active, ticker);
      if (active === 0 || layoutSyncBus.getFlags().symbol) {
        settings.rememberChart(ticker, settings.settings.get().lastInterval);
      }
    } else {
      chart.setSymbol(ticker);
      settings.rememberChart(ticker, settings.settings.get().lastInterval);
    }
    onClose();
  };

  const bg = dark ? "#1e222d" : "#ffffff";
  const fg = dark ? "#d1d4dc" : "#131722";
  const muted = dark ? "#787b86" : "#6a6d78";
  const border = dark ? "#2a2e39" : "#e0e3eb";
  const chipIdle = dark ? "rgba(120,123,134,0.12)" : "#f0f3fa";
  const chipActiveBg = dark ? "rgba(41,98,255,0.2)" : "rgba(41,98,255,0.12)";
  const chipActiveFg = dark ? "#8ab4ff" : "#2962ff";
  const titleBlue = dark ? "#8ab4ff" : "#2962ff";

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen={phone}
      fullWidth
      maxWidth="sm"
      dir={rtl ? "rtl" : "ltr"}
      slotProps={{
        paper: {
          sx: {
            bgcolor: bg,
            color: fg,
            borderRadius: phone ? 0 : "16px",
            border: phone ? "none" : `1px solid ${border}`,
            overflow: "hidden",
            maxHeight: phone ? "100%" : "min(820px, 88vh)",
            height: phone ? "100%" : undefined,
            display: "flex",
            flexDirection: "column",
          },
        },
      }}
    >
      <Box sx={{ px: 2, pt: 1.5, pb: 1, display: "flex", alignItems: "center", gap: 1 }}>
        <IconButton size="small" onClick={onClose} sx={{ color: muted }} aria-label="Close">
          <CloseIcon fontSize="small" />
        </IconButton>
        <Typography sx={{ flex: 1, fontWeight: 700, fontSize: 17, textAlign: rtl ? "right" : "center" }}>
          {TITLE[language]}
        </Typography>
        <Box
          sx={{
            width: 34,
            height: 34,
            borderRadius: "50%",
            border: `1.5px solid ${chipActiveFg}`,
            color: chipActiveFg,
            display: "grid",
            placeItems: "center",
          }}
        >
          <SearchIcon sx={{ fontSize: 18 }} />
        </Box>
      </Box>

      <Box sx={{ px: 2, pb: 1 }}>
        <TextField
          autoFocus
          fullWidth
          size="small"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={PLACEHOLDER[language]}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ color: muted, fontSize: 18 }} />
                </InputAdornment>
              ),
            },
          }}
          sx={{
            "& .MuiOutlinedInput-root": {
              borderRadius: "10px",
              bgcolor: dark ? "rgba(120,123,134,0.08)" : "#f7f8fa",
              color: fg,
              "& fieldset": { borderColor: border },
              "&:hover fieldset": { borderColor: chipActiveFg },
              "&.Mui-focused fieldset": { borderColor: chipActiveFg, borderWidth: 1.5 },
            },
            "& .MuiInputBase-input::placeholder": { color: muted, opacity: 1 },
          }}
        />
      </Box>

      <Box
        sx={{
          px: 2,
          pb: 0.5,
          display: "flex",
          flexWrap: "wrap",
          gap: 0.75,
          rowGap: 0.75,
          // Keep category chips clear of the count row below.
          position: "relative",
          zIndex: 1,
        }}
      >
        {chips.map((id) => {
          const active = chip === id;
          return (
            <Box
              key={id}
              component="button"
              type="button"
              onClick={() => setChip(id)}
              sx={{
                flex: "0 0 auto",
                border: `1px solid ${active ? chipActiveFg : border}`,
                bgcolor: active ? chipActiveBg : chipIdle,
                color: active ? chipActiveFg : fg,
                borderRadius: "999px",
                px: 1.25,
                py: 0.55,
                fontSize: 12.5,
                fontWeight: 600,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {CHIP_LABELS[language][id]}
            </Box>
          );
        })}
      </Box>

      <Typography
        sx={{
          px: 2,
          pt: 0.85,
          pb: 0.65,
          color: muted,
          fontSize: 12,
          flexShrink: 0,
          lineHeight: 1.3,
        }}
      >
        {COUNT[language](filtered.length)}
      </Typography>

      <List dense disablePadding sx={{ overflowY: "auto", flex: 1, pb: 1 }}>
        {filtered.map((s) => {
          const av = avatarFor(s);
          const broker = brokerLogoForExchange(s.exchange);
          // Iran: always show Faraz Farsi title (آبشده نقدی, گرم طلا ۱۸, …).
          const title =
            s.exchange.toUpperCase() === "IRAN" || /[\u0600-\u06FF]/.test(s.name) ? s.name : s.ticker;
          const sub =
            s.exchange.toUpperCase() === "IRAN"
              ? language === "fa"
                ? `${s.ticker} — محاسبه اختصاصی فورج`
                : `${s.ticker} — Faraz`
              : `${s.exchange} — ${s.name}`;
          return (
            <ListItemButton
              key={`${s.exchange}:${s.ticker}`}
              onClick={() => pick(s)}
              sx={{
                px: 2,
                py: 1.15,
                gap: 1.25,
                alignItems: "center",
                "&:hover": { bgcolor: dark ? "rgba(209,212,220,0.05)" : "rgba(19,23,34,0.04)" },
              }}
            >
              <Avatar
                sx={{
                  width: 36,
                  height: 36,
                  bgcolor: av.color,
                  color: "#fff",
                  fontSize: 12,
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                {av.text}
              </Avatar>
              <Box sx={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
                <Typography sx={{ color: titleBlue, fontWeight: 700, fontSize: 14.5 }} noWrap>
                  {title}
                </Typography>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 0.85,
                    mt: 0.25,
                    minWidth: 0,
                    width: "100%",
                  }}
                >
                  <Typography
                    sx={{
                      color: muted,
                      fontSize: 12,
                      flex: "1 1 auto",
                      minWidth: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {sub}
                  </Typography>
                  <Box
                    component="span"
                    sx={{
                      flex: "0 0 auto",
                      border: `1px solid ${border}`,
                      borderRadius: "4px",
                      px: 0.7,
                      py: 0.1,
                      fontSize: 10.5,
                      color: muted,
                      lineHeight: 1.35,
                      whiteSpace: "nowrap",
                      maxWidth: "46%",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {categoryLabel(language, s)}
                  </Box>
                </Box>
              </Box>
              {broker ? (
                <Box
                  component="img"
                  src={broker.src}
                  alt={broker.label}
                  title={broker.label}
                  sx={{
                    width: 28,
                    height: 28,
                    borderRadius: "6px",
                    objectFit: "contain",
                    flexShrink: 0,
                    bgcolor: dark ? "rgba(255,255,255,0.06)" : "rgba(19,23,34,0.04)",
                    border: `1px solid ${border}`,
                    p: "3px",
                  }}
                />
              ) : (
                <Box
                  sx={{
                    width: 28,
                    height: 28,
                    borderRadius: "6px",
                    flexShrink: 0,
                    display: "grid",
                    placeItems: "center",
                    bgcolor: dark ? "rgba(255,255,255,0.06)" : "rgba(19,23,34,0.04)",
                    border: `1px solid ${border}`,
                    color: muted,
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: 0.2,
                  }}
                  title={s.exchange}
                >
                  {s.exchange.slice(0, 3).toUpperCase()}
                </Box>
              )}
              <OpenInNewIcon sx={{ fontSize: 16, color: muted, opacity: 0.7 }} />
            </ListItemButton>
          );
        })}
        {filtered.length === 0 ? (
          <Typography sx={{ px: 2, py: 3, color: muted, textAlign: "center" }}>
            {language === "fa" ? "نمادی یافت نشد" : "No symbols found"}
          </Typography>
        ) : null}
      </List>
    </Dialog>
  );
}
