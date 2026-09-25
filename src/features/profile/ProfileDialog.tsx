import { useEffect, useState } from "react";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useServices } from "@/app/use-services";
import { AVATAR_COLORS, activeProfile, type UserProfile } from "@/application";
import { useStore } from "@/shared/hooks/useStore";

interface ProfileDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
}

export function ProfileDialog({ open, onClose }: ProfileDialogProps) {
  const { settings } = useServices();
  const snap = useStore(settings.settings);
  const current = activeProfile(snap);

  const [editing, setEditing] = useState<UserProfile>(current);
  const [mode, setMode] = useState<"list" | "edit">("list");

  useEffect(() => {
    if (!open) return;
    setEditing(activeProfile(settings.settings.get()));
    setMode("list");
  }, [open, settings]);

  const save = () => {
    const initial =
      editing.avatarInitial.trim() ||
      editing.displayName.trim().slice(0, 1).toUpperCase() ||
      "F";
    settings.upsertProfile({
      ...editing,
      displayName: editing.displayName.trim() || "Trader",
      username: editing.username.trim().replace(/\s+/g, "").toLowerCase() || "trader",
      avatarInitial: initial.slice(0, 2).toUpperCase(),
    });
    setMode("list");
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle sx={{ pb: 1 }}>{mode === "list" ? "Profiles" : "Edit profile"}</DialogTitle>
      <DialogContent>
        {mode === "list" ? (
          <Stack spacing={1.5}>
            <Typography variant="body2" color="text.secondary">
              Each person can keep their own name and avatar on this device.
            </Typography>
            <List dense disablePadding>
              {snap.profiles.map((p) => (
                <ListItemButton
                  key={p.id}
                  selected={p.id === snap.activeProfileId}
                  onClick={() => settings.setActiveProfile(p.id)}
                  sx={{ borderRadius: 1, mb: 0.5 }}
                >
                  <Avatar
                    sx={{
                      width: 36,
                      height: 36,
                      mr: 1.5,
                      bgcolor: p.avatarColor,
                      fontSize: 14,
                      fontWeight: 700,
                    }}
                  >
                    {p.avatarInitial}
                  </Avatar>
                  <ListItemText
                    primary={p.displayName}
                    secondary={`@${p.username}`}
                    slotProps={{
                      primary: { sx: { fontWeight: p.id === snap.activeProfileId ? 700 : 500 } },
                    }}
                  />
                  {p.id === snap.activeProfileId ? (
                    <Typography variant="caption" color="primary">
                      Active
                    </Typography>
                  ) : null}
                </ListItemButton>
              ))}
            </List>
            <Stack direction="row" spacing={1}>
              <Button
                size="small"
                variant="outlined"
                onClick={() => {
                  setEditing(activeProfile(settings.settings.get()));
                  setMode("edit");
                }}
              >
                Edit active
              </Button>
              <Button
                size="small"
                variant="contained"
                onClick={() => {
                  const created = settings.addProfile();
                  setEditing(created);
                  setMode("edit");
                }}
              >
                Add profile
              </Button>
              {snap.profiles.length > 1 ? (
                <Button size="small" color="error" onClick={() => settings.removeProfile(snap.activeProfileId)}>
                  Remove
                </Button>
              ) : null}
            </Stack>
          </Stack>
        ) : (
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
              <Avatar
                sx={{
                  width: 56,
                  height: 56,
                  bgcolor: editing.avatarColor,
                  fontSize: 22,
                  fontWeight: 700,
                }}
              >
                {editing.avatarInitial || editing.displayName.slice(0, 1).toUpperCase() || "F"}
              </Avatar>
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                  {editing.displayName || "New trader"}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  @{editing.username || "username"}
                </Typography>
              </Box>
            </Stack>
            <TextField
              label="Display name"
              value={editing.displayName}
              onChange={(e) => setEditing({ ...editing, displayName: e.target.value })}
              autoFocus
              fullWidth
            />
            <TextField
              label="Username"
              value={editing.username}
              onChange={(e) => setEditing({ ...editing, username: e.target.value })}
              fullWidth
              helperText="Shown like TradingView (@username)"
            />
            <TextField
              label="Avatar initial"
              value={editing.avatarInitial}
              onChange={(e) => setEditing({ ...editing, avatarInitial: e.target.value.slice(0, 2) })}
              fullWidth
              slotProps={{ htmlInput: { maxLength: 2 } }}
            />
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 0.75, display: "block" }}>
                Avatar color
              </Typography>
              <Stack direction="row" spacing={1}>
                {AVATAR_COLORS.map((color) => (
                  <IconButton
                    key={color}
                    size="small"
                    onClick={() => setEditing({ ...editing, avatarColor: color })}
                    sx={{
                      width: 28,
                      height: 28,
                      bgcolor: color,
                      border: editing.avatarColor === color ? "2px solid #fff" : "2px solid transparent",
                      boxShadow: editing.avatarColor === color ? `0 0 0 2px ${color}` : "none",
                      "&:hover": { bgcolor: color },
                    }}
                  />
                ))}
              </Stack>
            </Box>
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        {mode === "edit" ? (
          <>
            <Button onClick={() => setMode("list")}>Back</Button>
            <Button variant="contained" onClick={save}>
              Save
            </Button>
          </>
        ) : (
          <Button onClick={onClose}>Close</Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
