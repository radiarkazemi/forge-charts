import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Menu from "@mui/material/Menu";
import Switch from "@mui/material/Switch";
import Typography from "@mui/material/Typography";
import Avatar from "@mui/material/Avatar";
import HomeOutlinedIcon from "@mui/icons-material/HomeOutlined";
import PersonOutlinedIcon from "@mui/icons-material/PersonOutlined";
import NotificationsNoneOutlinedIcon from "@mui/icons-material/NotificationsNoneOutlined";
import HelpOutlineOutlinedIcon from "@mui/icons-material/HelpOutlineOutlined";
import SupportAgentOutlinedIcon from "@mui/icons-material/SupportAgentOutlined";
import DarkModeOutlinedIcon from "@mui/icons-material/DarkModeOutlined";
import LanguageIcon from "@mui/icons-material/Language";
import LogoutIcon from "@mui/icons-material/Logout";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import CreditCardOutlinedIcon from "@mui/icons-material/CreditCardOutlined";
import type { UiLanguage, UserProfile } from "@/application";

interface ProfileMenuProps {
  readonly anchorPosition?: { top: number; left: number } | null;
  readonly anchorEl?: HTMLElement | null;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly profile: UserProfile;
  readonly darkTheme: boolean;
  readonly language: UiLanguage;
  readonly onToggleTheme: () => void;
  readonly onCycleLanguage: () => void;
  readonly onOpenProfile: () => void;
  readonly onSignOut: () => void;
  readonly alertCount?: number;
}

const COPY = {
  en: {
    plan: "Forge Basic",
    home: "Home",
    account: "Account",
    notifications: "Notifications",
    help: "Help Center",
    support: "Support",
    night: "Dark theme",
    language: "Language",
    langValue: "English",
    signOut: "Sign out",
    subscription: "Subscription status",
    active: "Active",
    credit: "Open access",
  },
  fa: {
    plan: "فورج پایه",
    home: "صفحه اصلی",
    account: "حساب کاربری",
    notifications: "اعلانات",
    help: "مرکز راهنما",
    support: "پشتیبانی",
    night: "حالت شب",
    language: "زبان",
    langValue: "فارسی",
    signOut: "خروج از حساب",
    subscription: "وضعیت اشتراک",
    active: "فعال",
    credit: "دسترسی آزاد",
  },
} as const;

function formatNow(language: UiLanguage): string {
  try {
    return new Intl.DateTimeFormat(language === "fa" ? "fa-IR" : "en-GB", {
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      timeZone: "Asia/Tehran",
    }).format(new Date());
  } catch {
    return new Date().toLocaleString();
  }
}

/** Faraz-style account menu — theme matches the chart (light/dark). */
export function ProfileMenu({
  anchorPosition = null,
  anchorEl = null,
  open,
  onClose,
  profile,
  darkTheme,
  language,
  onToggleTheme,
  onCycleLanguage,
  onOpenProfile,
  onSignOut,
  alertCount = 0,
}: ProfileMenuProps) {
  const usePos = Boolean(anchorPosition);
  const t = COPY[language];
  const rtl = language === "fa";
  const bg = darkTheme ? "#1e222d" : "#ffffff";
  const fg = darkTheme ? "#d1d4dc" : "#131722";
  const muted = darkTheme ? "#787b86" : "#6a6d78";
  const border = darkTheme ? "#2a2e39" : "#e0e3eb";
  const hover = darkTheme ? "rgba(209,212,220,0.06)" : "rgba(19,23,34,0.04)";
  const cardBg = darkTheme ? "rgba(120,123,134,0.08)" : "#f5f7fb";

  return (
    <Menu
      anchorReference={usePos ? "anchorPosition" : "anchorEl"}
      anchorPosition={usePos ? (anchorPosition ?? undefined) : undefined}
      anchorEl={usePos ? null : anchorEl}
      open={open}
      onClose={onClose}
      anchorOrigin={{ vertical: "bottom", horizontal: rtl ? "right" : "left" }}
      transformOrigin={{ vertical: "top", horizontal: rtl ? "right" : "left" }}
      slotProps={{
        paper: {
          dir: rtl ? "rtl" : "ltr",
          sx: {
            width: 320,
            bgcolor: bg,
            color: fg,
            border: `1px solid ${border}`,
            borderRadius: "12px",
            mt: 0.75,
            boxShadow: darkTheme
              ? "0 12px 40px rgba(0,0,0,0.45)"
              : "0 12px 32px rgba(15,20,30,0.14)",
            overflow: "hidden",
          },
        },
      }}
    >
      <Box sx={{ px: 2, pt: 1.75, pb: 1.25, display: "flex", gap: 1.25, alignItems: "center" }}>
        <Avatar
          sx={{
            width: 40,
            height: 40,
            bgcolor: profile.avatarColor || "#00bcd4",
            color: "#0b0e14",
            fontWeight: 700,
            fontSize: 16,
          }}
        >
          {profile.avatarInitial || profile.displayName.slice(0, 1).toUpperCase()}
        </Avatar>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography sx={{ fontWeight: 700, fontSize: 15, lineHeight: 1.2 }} noWrap>
            {profile.displayName}
          </Typography>
          <Typography sx={{ color: muted, fontSize: 11.5, mt: 0.35 }} noWrap>
            {formatNow(language)}
          </Typography>
        </Box>
      </Box>

      <Box
        onClick={() => {
          onClose();
          onOpenProfile();
        }}
        sx={{
          mx: 1.5,
          mb: 1,
          px: 1.25,
          py: 1,
          borderRadius: "10px",
          border: `1px solid ${border}`,
          bgcolor: cardBg,
          display: "flex",
          alignItems: "center",
          gap: 1,
          cursor: "pointer",
          "&:hover": { bgcolor: hover },
        }}
      >
        <Box
          sx={{
            width: 32,
            height: 32,
            borderRadius: "8px",
            bgcolor: darkTheme ? "rgba(41,98,255,0.18)" : "rgba(0,188,212,0.16)",
            color: darkTheme ? "#5b9cff" : "#00838f",
            display: "grid",
            placeItems: "center",
            flexShrink: 0,
          }}
        >
          <CreditCardOutlinedIcon sx={{ fontSize: 18 }} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap" }}>
            <Typography sx={{ fontWeight: 600, fontSize: 12.5 }}>{t.subscription}</Typography>
            <Box
              component="span"
              sx={{
                px: 0.75,
                py: 0.1,
                borderRadius: 999,
                bgcolor: "rgba(8,153,129,0.15)",
                color: "#089981",
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              {t.active}
            </Box>
          </Box>
          <Typography sx={{ color: muted, fontSize: 11, mt: 0.2 }}>{t.credit}</Typography>
        </Box>
        <ChevronRightIcon
          fontSize="small"
          sx={{ color: muted, transform: rtl ? "scaleX(-1)" : undefined }}
        />
      </Box>

      <List dense disablePadding>
        <ListItemButton component="a" href="https://forgechart.ir/" target="_blank" rel="noopener" sx={{ py: 1.1, "&:hover": { bgcolor: hover } }}>
          <ListItemIcon sx={{ minWidth: 40, color: "inherit" }}>
            <HomeOutlinedIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primary={t.home} />
        </ListItemButton>
        <ListItemButton
          onClick={() => {
            onClose();
            onOpenProfile();
          }}
          sx={{ py: 1.1, "&:hover": { bgcolor: hover } }}
        >
          <ListItemIcon sx={{ minWidth: 40, color: "inherit" }}>
            <PersonOutlinedIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primary={t.account} />
          <ChevronRightIcon fontSize="small" sx={{ color: muted, transform: rtl ? "scaleX(-1)" : undefined }} />
        </ListItemButton>
        <ListItemButton onClick={onClose} sx={{ py: 1.1, "&:hover": { bgcolor: hover } }}>
          <ListItemIcon sx={{ minWidth: 40, color: "inherit" }}>
            <NotificationsNoneOutlinedIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primary={t.notifications} />
          {alertCount > 0 ? (
            <Box
              sx={{
                bgcolor: "#f23645",
                color: "#fff",
                px: 0.75,
                py: 0.1,
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 700,
                minWidth: 20,
                textAlign: "center",
              }}
            >
              {alertCount}
            </Box>
          ) : null}
        </ListItemButton>
        <ListItemButton component="a" href="https://forgechart.ir/" target="_blank" rel="noopener" sx={{ py: 1.1, "&:hover": { bgcolor: hover } }}>
          <ListItemIcon sx={{ minWidth: 40, color: "inherit" }}>
            <HelpOutlineOutlinedIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primary={t.help} />
        </ListItemButton>
        <ListItemButton onClick={onClose} sx={{ py: 1.1, "&:hover": { bgcolor: hover } }}>
          <ListItemIcon sx={{ minWidth: 40, color: "inherit" }}>
            <SupportAgentOutlinedIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primary={t.support} />
        </ListItemButton>
      </List>

      <Divider sx={{ borderColor: border, my: 0.5 }} />

      <List dense disablePadding>
        <ListItemButton onClick={() => onToggleTheme()} sx={{ py: 1.1, "&:hover": { bgcolor: hover } }}>
          <ListItemIcon sx={{ minWidth: 40, color: "inherit" }}>
            <DarkModeOutlinedIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primary={t.night} />
          <Switch
            edge={rtl ? "start" : "end"}
            size="small"
            checked={darkTheme}
            onChange={() => onToggleTheme()}
            onClick={(e) => e.stopPropagation()}
          />
        </ListItemButton>
        <ListItemButton
          onClick={() => {
            onCycleLanguage();
          }}
          sx={{ py: 1.1, "&:hover": { bgcolor: hover } }}
        >
          <ListItemIcon sx={{ minWidth: 40, color: "inherit" }}>
            <LanguageIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primary={t.language} />
          <Typography variant="body2" sx={{ color: muted, mr: 0.5 }}>
            {t.langValue}
          </Typography>
          <ChevronRightIcon fontSize="small" sx={{ color: muted, transform: rtl ? "scaleX(-1)" : undefined }} />
        </ListItemButton>
      </List>

      <Divider sx={{ borderColor: border, my: 0.5 }} />

      <ListItemButton
        onClick={() => {
          onClose();
          onSignOut();
        }}
        sx={{ color: "#f23645", py: 1.15, "&:hover": { bgcolor: hover } }}
      >
        <ListItemIcon sx={{ minWidth: 40, color: "inherit" }}>
          <LogoutIcon fontSize="small" />
        </ListItemIcon>
        <ListItemText primary={t.signOut} />
      </ListItemButton>
    </Menu>
  );
}
