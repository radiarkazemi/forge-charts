import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import CloseIcon from "@mui/icons-material/Close";

interface PanelHeaderProps {
  readonly title: string;
  readonly actions?: ReactNode;
  readonly onClose?: () => void;
}

export function PanelHeader({ title, actions, onClose }: PanelHeaderProps) {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1,
        px: 1.5,
        minHeight: 44,
        borderBottom: 1,
        borderColor: "divider",
      }}
    >
      <Typography variant="subtitle2" sx={{ flex: 1, fontWeight: 700 }}>
        {title}
      </Typography>
      {actions}
      {onClose ? (
        <Tooltip title="Close panel">
          <IconButton size="small" onClick={onClose} aria-label="Close panel">
            <CloseIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      ) : null}
    </Box>
  );
}
