import { useState } from "react";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";
import { useServices } from "@/app/use-services";
import { AVATAR_COLORS, activeProfile, type UserProfile } from "@/application";
import { useStore } from "@/shared/hooks/useStore";

interface ProfileDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
}

export function ProfileDialog({ open, onClose }: ProfileDialogProps) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("md"));
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs" fullScreen={fullScreen}>
      {open ? <ProfileDialogBody onClose={onClose} /> : null}
    </Dialog>
  );
}

/**
 * Edit only the signed-in account’s active profile.
 * Other accounts on this browser are never listed or readable here.
 */
function ProfileDialogBody({ onClose }: { readonly onClose: () => void }) {
  const { settings } = useServices();
  useStore(settings.settings); // re-render on settings changes
  const [editing, setEditing] = useState<UserProfile>(() => activeProfile(settings.settings.get()));

  const save = () => {
    const active = activeProfile(settings.settings.get());
    // Always write over the active profile id — never create a second “user-looking” profile.
    const initial =
      editing.avatarInitial.trim() ||
      editing.displayName.trim().slice(0, 1).toUpperCase() ||
      "F";
    settings.upsertProfile({
      ...active,
      displayName: editing.displayName.trim() || active.displayName || "Trader",
      // Username stays bound to the signed-in account handle from auth (scoped settings).
      username: active.username,
      avatarInitial: initial.slice(0, 2).toUpperCase(),
      avatarColor: editing.avatarColor || active.avatarColor,
    });
    onClose();
  };

  return (
    <>
      <DialogTitle sx={{ pb: 1 }}>Your account</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <Typography variant="body2" color="text.secondary">
            Only you can see and edit this profile. Other Forge accounts on this device keep their
            own private data.
          </Typography>
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
                {editing.displayName || "Trader"}
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
            fullWidth
            disabled
            helperText="Tied to your signed-in account — other users cannot see or change this"
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
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={save}>
          Save
        </Button>
      </DialogActions>
    </>
  );
}
