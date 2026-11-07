/**
 * TradingView-style Indicators dialog (sidebar + search + grouped rows).
 * Opens instead of the native CL insertIndicator dialog for Forge Charts.
 */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Box from "@mui/material/Box";
import Dialog from "@mui/material/Dialog";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import CloseIcon from "@mui/icons-material/Close";
import SearchIcon from "@mui/icons-material/Search";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import StarIcon from "@mui/icons-material/Star";
import PersonOutlinedIcon from "@mui/icons-material/PersonOutlined";
import ShowChartIcon from "@mui/icons-material/ShowChart";
import AutoGraphIcon from "@mui/icons-material/AutoGraph";
import WhatshotIcon from "@mui/icons-material/Whatshot";
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents";
import { useServices } from "@/app/use-services";
import type { UiLanguage } from "@/application";
import { useStore } from "@/shared/hooks/useStore";
import {
  ALL_INDICATORS,
  type ForgeIndicatorEntry,
  type IndicatorNavId,
} from "./forge-indicators-catalog";

interface IndicatorsDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
}

const TITLE: Record<UiLanguage, string> = {
  en: "Indicators, metrics, and strategies",
  fa: "اندیکاتورها، متریک‌ها و استراتژی‌ها",
};

const PLACEHOLDER: Record<UiLanguage, string> = {
  en: "Search",
  fa: "جستجو",
};

const NAV_GROUPS: Record<
  UiLanguage,
  readonly { readonly heading: string; readonly items: readonly { id: IndicatorNavId; label: string }[] }[]
> = {
  en: [
    {
      heading: "PERSONAL",
      items: [
        { id: "favorites", label: "Favorites" },
        { id: "myScripts", label: "My scripts" },
      ],
    },
    {
      heading: "BUILT-IN",
      items: [{ id: "technicals", label: "Technicals" }],
    },
    {
      heading: "COMMUNITY",
      items: [
        { id: "editorsPicks", label: "Editors' picks" },
        { id: "top", label: "Top" },
        { id: "trending", label: "Trending" },
      ],
    },
  ],
  fa: [
    {
      heading: "شخصی",
      items: [
        { id: "favorites", label: "علاقه‌مندی‌ها" },
        { id: "myScripts", label: "اسکریپت‌های من" },
      ],
    },
    {
      heading: "داخلی",
      items: [{ id: "technicals", label: "تکنیکال" }],
    },
    {
      heading: "انجمن",
      items: [
        { id: "editorsPicks", label: "انتخاب سردبیر" },
        { id: "top", label: "برتر" },
        { id: "trending", label: "ترند" },
      ],
    },
  ],
};

const SECTION_LABEL: Record<UiLanguage, Record<"myScripts" | "technicals" | "community", string>> = {
  en: {
    myScripts: "MY SCRIPTS",
    technicals: "TECHNICALS",
    community: "COMMUNITY",
  },
  fa: {
    myScripts: "اسکریپت‌های من",
    technicals: "تکنیکال",
    community: "انجمن",
  },
};

function navIcon(id: IndicatorNavId, active: boolean): ReactNode {
  const sx = { fontSize: 18, opacity: active ? 1 : 0.75 };
  switch (id) {
    case "favorites":
      return active ? <StarIcon sx={sx} /> : <StarBorderIcon sx={sx} />;
    case "myScripts":
      return <PersonOutlinedIcon sx={sx} />;
    case "technicals":
      return <ShowChartIcon sx={sx} />;
    case "editorsPicks":
      return <EmojiEventsIcon sx={sx} />;
    case "top":
      return <AutoGraphIcon sx={sx} />;
    case "trending":
      return <WhatshotIcon sx={sx} />;
    default:
      return <ShowChartIcon sx={sx} />;
  }
}

function matchesQuery(entry: ForgeIndicatorEntry, q: string): boolean {
  if (!q) return true;
  const hay = `${entry.name} ${entry.author} ${entry.shortDescription} ${entry.tags.join(" ")}`.toLowerCase();
  return hay.includes(q);
}

function filterForNav(nav: IndicatorNavId, entry: ForgeIndicatorEntry, q: string): boolean {
  if (!matchesQuery(entry, q)) return false;
  switch (nav) {
    case "favorites":
      return entry.favorite;
    case "myScripts":
      return entry.section === "forge";
    case "technicals":
      return entry.section === "builtin" || entry.section === "forge";
    case "editorsPicks":
    case "top":
    case "trending":
      // Community tabs surface Forge scripts (no marketplace) + technicals.
      return true;
    default:
      return true;
  }
}

function Highlight({ text, query, color }: { text: string; query: string; color: string }) {
  if (!query) return <>{text}</>;
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  const idx = lower.indexOf(q);
  if (idx < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <Box component="span" sx={{ color, fontWeight: 700 }}>
        {text.slice(idx, idx + q.length)}
      </Box>
      {text.slice(idx + q.length)}
    </>
  );
}

export function IndicatorsDialog({ open, onClose }: IndicatorsDialogProps) {
  const { chart, settings } = useServices();
  const languageRaw = useStore(settings.settings, (s) => s.language);
  const language: UiLanguage = languageRaw === "fa" ? "fa" : "en";
  const dark = useStore(settings.settings, (s) => s.theme) === "dark";
  const rtl = language === "fa";
  const [query, setQuery] = useState("");
  const [nav, setNav] = useState<IndicatorNavId>("favorites");
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setNav("favorites");
    document.body.classList.add("forge-indicators-picker-open");
    try {
      const iframe = document.querySelector("iframe") as HTMLIFrameElement | null;
      iframe?.contentDocument?.body?.classList.add("forge-indicators-picker-open");
    } catch {
      /* ignore */
    }
    return () => {
      document.body.classList.remove("forge-indicators-picker-open");
      try {
        const iframe = document.querySelector("iframe") as HTMLIFrameElement | null;
        iframe?.contentDocument?.body?.classList.remove("forge-indicators-picker-open");
      } catch {
        /* ignore */
      }
    };
  }, [open]);

  const q = query.trim().toLowerCase();

  const filtered = useMemo(
    () => ALL_INDICATORS.filter((e) => filterForNav(nav, e, q)),
    [nav, q],
  );

  const groups = useMemo(() => {
    const forge = filtered.filter((e) => e.section === "forge");
    const builtin = filtered.filter((e) => e.section === "builtin");
    const out: { key: "myScripts" | "technicals" | "community"; items: ForgeIndicatorEntry[] }[] =
      [];
    if (nav === "favorites" || nav === "myScripts") {
      if (forge.length) out.push({ key: "myScripts", items: forge });
    } else if (nav === "technicals") {
      if (forge.length) out.push({ key: "myScripts", items: forge });
      if (builtin.length) out.push({ key: "technicals", items: builtin });
    } else {
      // Community-style: Forge first, then builtins
      if (forge.length) out.push({ key: "community", items: forge });
      if (builtin.length) out.push({ key: "technicals", items: builtin });
    }
    return out;
  }, [filtered, nav]);

  const pick = async (entry: ForgeIndicatorEntry) => {
    if (busyId) return;
    setBusyId(entry.id);
    try {
      await chart.addIndicator(entry.studyId, entry.name);
      onClose();
    } catch {
      /* chart may not be ready */
    } finally {
      setBusyId(null);
    }
  };

  const openNativeLibrary = () => {
    onClose();
    // Brief delay so our dialog unmounts before CL modal opens.
    window.setTimeout(() => {
      try {
        chart.openNativeIndicators();
      } catch {
        /* ignore */
      }
    }, 100);
  };

  const bg = dark ? "#1e222d" : "#ffffff";
  const fg = dark ? "#d1d4dc" : "#131722";
  const muted = dark ? "#787b86" : "#6a6d78";
  const border = dark ? "#2a2e39" : "#e0e3eb";
  const sidebarBg = dark ? "#131722" : "#f0f3fa";
  const activeBg = dark ? "rgba(41,98,255,0.22)" : "rgba(41,98,255,0.12)";
  const activeFg = dark ? "#8ab4ff" : "#2962ff";
  const hoverBg = dark ? "rgba(209,212,220,0.06)" : "rgba(19,23,34,0.04)";
  const highlight = activeFg;
  const authorBlue = dark ? "#8ab4ff" : "#2962ff";

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="md"
      dir={rtl ? "rtl" : "ltr"}
      sx={{
        zIndex: 20000,
        "& .MuiBackdrop-root": { bgcolor: "rgba(0,0,0,0.45)" },
      }}
      slotProps={{
        paper: {
          sx: {
            bgcolor: `${bg} !important`,
            color: `${fg} !important`,
            borderRadius: "8px",
            border: `1px solid ${border}`,
            overflow: "hidden",
            maxHeight: "min(720px, 88vh)",
            height: "min(680px, 86vh)",
            width: "min(860px, 96vw)",
            maxWidth: "860px",
            display: "flex",
            flexDirection: "column",
            zIndex: 20001,
            boxShadow: "0 12px 40px rgba(0,0,0,0.35)",
          },
        },
      }}
    >
      <Box
        sx={{
          px: 2,
          pt: 1.5,
          pb: 1,
          display: "flex",
          alignItems: "center",
          gap: 1,
          borderBottom: `1px solid ${border}`,
          flexShrink: 0,
          bgcolor: bg,
          color: fg,
        }}
      >
        <Typography sx={{ flex: 1, fontWeight: 700, fontSize: 16, color: `${fg} !important` }}>
          {TITLE[language]}
        </Typography>
        <IconButton size="small" onClick={onClose} sx={{ color: muted }} aria-label="Close">
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>

      <Box sx={{ display: "flex", flex: 1, minHeight: 0 }}>
        {/* Sidebar */}
        <Box
          sx={{
            width: 188,
            flexShrink: 0,
            bgcolor: sidebarBg,
            borderInlineEnd: `1px solid ${border}`,
            overflowY: "auto",
            py: 1.25,
            px: 1,
          }}
        >
          {NAV_GROUPS[language].map((group) => (
            <Box key={group.heading} sx={{ mb: 1.5 }}>
              <Typography
                sx={{
                  px: 1,
                  mb: 0.5,
                  fontSize: 10.5,
                  fontWeight: 700,
                  letterSpacing: 0.6,
                  color: muted,
                  textTransform: "uppercase",
                }}
              >
                {group.heading}
              </Typography>
              {group.items.map((item) => {
                const active = nav === item.id;
                return (
                  <Box
                    key={item.id}
                    component="button"
                    type="button"
                    onClick={() => setNav(item.id)}
                    sx={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      gap: 1,
                      border: 0,
                      borderRadius: "6px",
                      px: 1,
                      py: 0.7,
                      mb: 0.25,
                      cursor: "pointer",
                      bgcolor: active ? activeBg : "transparent",
                      color: active ? activeFg : fg,
                      fontSize: 13,
                      fontWeight: active ? 700 : 500,
                      textAlign: "start",
                      "&:hover": { bgcolor: active ? activeBg : hoverBg },
                    }}
                  >
                    {navIcon(item.id, active)}
                    <span>{item.label}</span>
                  </Box>
                );
              })}
            </Box>
          ))}
          <Box
            component="button"
            type="button"
            onClick={openNativeLibrary}
            sx={{
              width: "100%",
              mt: 0.5,
              border: `1px solid ${border}`,
              borderRadius: "6px",
              px: 1,
              py: 0.75,
              bgcolor: "transparent",
              color: muted,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              textAlign: "start",
              "&:hover": { color: fg, borderColor: activeFg },
            }}
          >
            {language === "fa" ? "کتابخانه کامل…" : "Full library…"}
          </Box>
        </Box>

        {/* Main */}
        <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          <Box sx={{ px: 2, pt: 1.5, pb: 1, flexShrink: 0 }}>
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
                  endAdornment: query ? (
                    <InputAdornment position="end">
                      <IconButton size="small" onClick={() => setQuery("")} sx={{ color: muted }}>
                        <CloseIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </InputAdornment>
                  ) : undefined,
                },
              }}
              sx={{
                "& .MuiOutlinedInput-root": {
                  borderRadius: "8px",
                  bgcolor: dark ? "rgba(120,123,134,0.1)" : "#f7f8fa",
                  color: fg,
                  "& fieldset": { borderColor: border },
                  "&:hover fieldset": { borderColor: activeFg },
                  "&.Mui-focused fieldset": { borderColor: activeFg, borderWidth: 1.5 },
                },
              }}
            />
          </Box>

          <List dense disablePadding sx={{ overflowY: "auto", flex: 1, pb: 1.5 }}>
            {groups.map((group) => (
              <Box key={group.key} sx={{ mb: 0.5 }}>
                <Typography
                  sx={{
                    px: 2,
                    pt: 1,
                    pb: 0.5,
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: 0.5,
                    color: muted,
                  }}
                >
                  {SECTION_LABEL[language][group.key]}
                </Typography>
                {group.items.map((entry) => {
                  const selected = busyId === entry.id;
                  return (
                    <ListItemButton
                      key={entry.id}
                      onClick={() => void pick(entry)}
                      disabled={Boolean(busyId)}
                      sx={{
                        px: 2,
                        py: 0.85,
                        gap: 1.5,
                        alignItems: "center",
                        bgcolor: selected ? activeBg : "transparent",
                        "&:hover": { bgcolor: hoverBg },
                        opacity: busyId && !selected ? 0.55 : 1,
                      }}
                    >
                      <Typography
                        sx={{
                          flex: "1 1 auto",
                          minWidth: 0,
                          fontSize: 13.5,
                          fontWeight: 600,
                          color: fg,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          pr: 1,
                        }}
                        title={entry.shortDescription}
                      >
                        <Highlight text={entry.name} query={q} color={highlight} />
                      </Typography>
                      <Typography
                        sx={{
                          flex: "0 0 88px",
                          width: 88,
                          fontSize: 12.5,
                          color: authorBlue,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          textAlign: rtl ? "left" : "right",
                        }}
                      >
                        {entry.author}
                      </Typography>
                      <Typography
                        sx={{
                          flex: "0 0 52px",
                          width: 52,
                          fontSize: 12,
                          color: muted,
                          textAlign: "end",
                          whiteSpace: "nowrap",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {entry.usesLabel}
                      </Typography>
                    </ListItemButton>
                  );
                })}
              </Box>
            ))}
            {groups.length === 0 ? (
              <Typography sx={{ px: 2, py: 4, color: muted, textAlign: "center" }}>
                {language === "fa" ? "نتیجه‌ای یافت نشد" : "No indicators found"}
              </Typography>
            ) : null}
          </List>
        </Box>
      </Box>
    </Dialog>
  );
}
