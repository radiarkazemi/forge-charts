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
import HelpOutlineOutlinedIcon from "@mui/icons-material/HelpOutlineOutlined";
import EmailOutlinedIcon from "@mui/icons-material/EmailOutlined";
import BoltOutlinedIcon from "@mui/icons-material/BoltOutlined";
import DarkModeOutlinedIcon from "@mui/icons-material/DarkModeOutlined";
import LanguageIcon from "@mui/icons-material/Language";
import KeyboardIcon from "@mui/icons-material/Keyboard";
import DesktopWindowsOutlinedIcon from "@mui/icons-material/DesktopWindowsOutlined";
import LogoutIcon from "@mui/icons-material/Logout";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import type { UserProfile } from "@/application";

interface ProfileMenuProps {
  readonly anchorEl: HTMLElement | null;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly profile: UserProfile;
  readonly darkTheme: boolean;
  readonly onToggleTheme: () => void;
  readonly onOpenProfile: () => void;
  readonly alertCount?: number;
}

/** TradingView-style account menu (Dark theme toggle, Help, etc.). */
export function ProfileMenu({
  anchorEl,
  open,
  onClose,
  profile,
  darkTheme,
  onToggleTheme,
  onOpenProfile,
  alertCount = 0,
}: ProfileMenuProps) {
  return (
    <Menu
      anchorEl={anchorEl}
      open={open}
      onClose={onClose}
      anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      transformOrigin={{ vertical: "top", horizontal: "right" }}
      slotProps={{
        paper: {
          sx: {
            width: 300,
            bgcolor: "#1e222d",
            color: "#d1d4dc",
            border: "1px solid #2a2e39",
            mt: 0.5,
          },
        },
      }}
    >
      <Box sx={{ px: 2, pt: 1.5, pb: 1 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, letterSpacing: 0.2 }}>
          Forge Basic
        </Typography>
      </Box>
      <ListItemButton
        onClick={() => {
          onClose();
          onOpenProfile();
        }}
        sx={{ py: 1.25 }}
      >
        <ListItemIcon sx={{ minWidth: 44 }}>
          <Avatar sx={{ width: 32, height: 32, bgcolor: profile.avatarColor, fontSize: 14, fontWeight: 700 }}>
            {profile.avatarInitial}
          </Avatar>
        </ListItemIcon>
        <ListItemText primary={<Typography sx={{ fontWeight: 600 }}>{profile.username}</Typography>} />
        <ChevronRightIcon fontSize="small" sx={{ color: "text.secondary" }} />
      </ListItemButton>

      <Divider sx={{ borderColor: "#2a2e39" }} />

      <List dense disablePadding>
        <ListItemButton component="a" href="https://forgechart.ir/" target="_blank" rel="noopener">
          <ListItemIcon sx={{ minWidth: 40, color: "inherit" }}>
            <HomeOutlinedIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primary="Home" />
        </ListItemButton>
        <ListItemButton component="a" href="https://forgechart.ir/" target="_blank" rel="noopener">
          <ListItemIcon sx={{ minWidth: 40, color: "inherit" }}>
            <HelpOutlineOutlinedIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primary="Help Center" />
        </ListItemButton>
        <ListItemButton onClick={onClose}>
          <ListItemIcon sx={{ minWidth: 40, color: "inherit" }}>
            <EmailOutlinedIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primary="Support requests" />
        </ListItemButton>
        <ListItemButton onClick={onClose}>
          <ListItemIcon sx={{ minWidth: 40, color: "inherit" }}>
            <BoltOutlinedIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primary="What's new" />
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
      </List>

      <Divider sx={{ borderColor: "#2a2e39" }} />

      <List dense disablePadding>
        <ListItemButton onClick={() => onToggleTheme()}>
          <ListItemIcon sx={{ minWidth: 40, color: "inherit" }}>
            <DarkModeOutlinedIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primary="Dark theme" />
          <Switch
            edge="end"
            size="small"
            checked={darkTheme}
            onChange={() => onToggleTheme()}
            onClick={(e) => e.stopPropagation()}
          />
        </ListItemButton>
        <ListItemButton onClick={onClose}>
          <ListItemIcon sx={{ minWidth: 40, color: "inherit" }}>
            <LanguageIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primary="Language" />
          <Typography variant="body2" color="text.secondary" sx={{ mr: 0.5 }}>
            English
          </Typography>
          <ChevronRightIcon fontSize="small" sx={{ color: "text.secondary" }} />
        </ListItemButton>
        <ListItemButton onClick={onClose}>
          <ListItemIcon sx={{ minWidth: 40, color: "inherit" }}>
            <KeyboardIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primary="Keyboard shortcuts" />
          <Typography variant="caption" color="text.secondary">
            Ctrl + /
          </Typography>
        </ListItemButton>
        <ListItemButton component="a" href="https://forgechart.ir/" target="_blank" rel="noopener">
          <ListItemIcon sx={{ minWidth: 40, color: "inherit" }}>
            <DesktopWindowsOutlinedIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primary="Get desktop app" />
        </ListItemButton>
      </List>

      <Divider sx={{ borderColor: "#2a2e39" }} />

      <ListItemButton
        onClick={() => {
          onClose();
          onOpenProfile();
        }}
        sx={{ color: "#f23645" }}
      >
        <ListItemIcon sx={{ minWidth: 40, color: "inherit" }}>
          <LogoutIcon fontSize="small" />
        </ListItemIcon>
        <ListItemText primary="Sign out" />
      </ListItemButton>
    </Menu>
  );
}
