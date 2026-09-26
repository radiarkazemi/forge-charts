import { useEffect, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import CloudUploadOutlinedIcon from "@mui/icons-material/CloudUploadOutlined";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import TerminalIcon from "@mui/icons-material/Terminal";
import CloseIcon from "@mui/icons-material/Close";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";

const DEFAULT_SCRIPT = `//@version=6
indicator("Forge Script", overlay=true)

len = input.int(14, "Length")
src = close
ma = ta.sma(src, len)

plot(ma, "MA", color=color.new(color.blue, 0))
`;

interface PineEditorPanelProps {
  readonly onClose: () => void;
  readonly onOpenObjectTree?: () => void;
}

/** TradingView-style Pine Editor chrome (local editor; scripts are not compiled). */
export function PineEditorPanel({ onClose, onOpenObjectTree }: PineEditorPanelProps) {
  const [code, setCode] = useState(() => {
    try {
      return localStorage.getItem("forge.pine.draft") ?? DEFAULT_SCRIPT;
    } catch {
      return DEFAULT_SCRIPT;
    }
  });
  const [status, setStatus] = useState("Ready");
  const [cursor, setCursor] = useState({ line: 1, col: 1 });
  const areaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem("forge.pine.draft", code);
    } catch {
      /* ignore */
    }
  }, [code]);

  const updateCursor = () => {
    const el = areaRef.current;
    if (!el) return;
    const pos = el.selectionStart;
    const before = code.slice(0, pos);
    const line = before.split("\n").length;
    const col = before.length - before.lastIndexOf("\n");
    setCursor({ line, col });
  };

  const lines = code.split("\n");

  return (
    <Box
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        bgcolor: "#131722",
        color: "#d1d4dc",
        minHeight: 0,
      }}
    >
      <Box
        sx={{
          px: 1,
          py: 0.5,
          borderBottom: "1px solid #2a2e39",
          display: "flex",
          alignItems: "center",
          gap: 0.5,
        }}
      >
        <IconButton size="small" aria-label="Back" onClick={onClose} sx={{ color: "#d1d4dc" }}>
          <ArrowBackIcon fontSize="small" />
        </IconButton>
        <Typography variant="subtitle2" sx={{ fontWeight: 600, flex: 1, color: "#d1d4dc" }}>
          Pine Editor
        </Typography>
        <IconButton size="small" aria-label="Close" onClick={onClose} sx={{ color: "#787b86" }}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>

      <Box
        sx={{
          px: 1.25,
          py: 0.5,
          borderBottom: "1px solid #2a2e39",
          display: "flex",
          alignItems: "center",
          gap: 0.75,
          flexWrap: "wrap",
        }}
      >
        <Box
          sx={{
            display: "inline-flex",
            alignItems: "center",
            gap: 0.25,
            px: 1,
            py: 0.35,
            borderRadius: 1,
            bgcolor: "#1e222d",
            cursor: "default",
            minWidth: 130,
          }}
        >
          <Typography variant="body2" sx={{ color: "#d1d4dc", fontSize: 13 }}>
            Untitled script
          </Typography>
          <KeyboardArrowDownIcon sx={{ fontSize: 16, color: "#787b86" }} />
        </Box>
        <IconButton
          size="small"
          aria-label="Add to chart"
          title="Open object tree to manage studies"
          onClick={() => {
            setStatus("Open Object tree to manage studies");
            onOpenObjectTree?.();
          }}
          sx={{ color: "#2962ff" }}
        >
          <PlayArrowIcon fontSize="small" />
        </IconButton>
        <IconButton size="small" aria-label="Save" title="Save draft locally" sx={{ color: "#d1d4dc" }}>
          <CloudUploadOutlinedIcon fontSize="small" />
        </IconButton>
        <Box sx={{ flex: 1 }} />
        <Button
          size="small"
          variant="contained"
          disableElevation
          sx={{
            textTransform: "none",
            bgcolor: "#2962ff",
            "&:hover": { bgcolor: "#1e53e5" },
            fontWeight: 600,
          }}
        >
          Publish script
        </Button>
        <IconButton size="small" aria-label="More" sx={{ color: "#d1d4dc" }}>
          <MoreVertIcon fontSize="small" />
        </IconButton>
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, position: "relative", display: "flex" }}>
        <Box
          aria-hidden
          sx={{
            width: 40,
            flexShrink: 0,
            bgcolor: "#1e222d",
            color: "#787b86",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            fontSize: 12,
            lineHeight: "20px",
            pt: 1.5,
            textAlign: "right",
            pr: 1,
            userSelect: "none",
            overflow: "hidden",
            borderRight: "1px solid #2a2e39",
          }}
        >
          {lines.map((_, i) => (
            <div key={i} style={{ height: 20 }}>
              {i + 1}
            </div>
          ))}
        </Box>
        <Box
          component="textarea"
          ref={areaRef}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onSelect={updateCursor}
          onKeyUp={updateCursor}
          spellCheck={false}
          sx={{
            flex: 1,
            resize: "none",
            border: 0,
            outline: "none",
            p: 1.5,
            m: 0,
            bgcolor: "#131722",
            color: "#d1d4dc",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            fontSize: 13,
            lineHeight: "20px",
            tabSize: 4,
            minWidth: 0,
          }}
        />
        {/* Minimap strip */}
        <Box
          aria-hidden
          sx={{
            width: 48,
            flexShrink: 0,
            bgcolor: "#1e222d",
            borderLeft: "1px solid #2a2e39",
            opacity: 0.7,
            backgroundImage: `repeating-linear-gradient(
              180deg,
              transparent,
              transparent 2px,
              rgba(209,212,220,0.12) 2px,
              rgba(209,212,220,0.12) 3px
            )`,
          }}
        />
      </Box>

      <Box
        sx={{
          px: 1.5,
          py: 0.4,
          borderTop: "1px solid #2a2e39",
          bgcolor: "#1e222d",
          display: "flex",
          alignItems: "center",
          gap: 1,
        }}
      >
        <TerminalIcon sx={{ fontSize: 15, color: "#787b86" }} />
        <Typography variant="caption" sx={{ flex: 1, color: "#787b86" }}>
          {status}
        </Typography>
        <Typography variant="caption" sx={{ color: "#787b86" }}>
          Line {cursor.line}, Col {cursor.col}
        </Typography>
        <Typography variant="caption" sx={{ color: "#d1d4dc", fontWeight: 600 }}>
          Pine Script® v6
        </Typography>
      </Box>
    </Box>
  );
}
