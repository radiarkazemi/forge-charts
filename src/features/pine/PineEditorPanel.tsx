import { useEffect, useMemo, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import ListItemText from "@mui/material/ListItemText";
import Typography from "@mui/material/Typography";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import CloudUploadOutlinedIcon from "@mui/icons-material/CloudUploadOutlined";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import TerminalIcon from "@mui/icons-material/Terminal";
import CloseIcon from "@mui/icons-material/Close";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import RocketLaunchOutlinedIcon from "@mui/icons-material/RocketLaunchOutlined";
import OpenInFullIcon from "@mui/icons-material/OpenInFull";
import RemoveIcon from "@mui/icons-material/Remove";
import NoteAddOutlinedIcon from "@mui/icons-material/NoteAddOutlined";
import {
  pineTemplate,
  type PineTemplateId,
  TV_DEFAULT_INDICATOR,
} from "./pine-runner";

const DRAFT_KEY = "forge.pine.draft.v3";
const TITLE_KEY = "forge.pine.title.v3";

interface PineEditorPanelProps {
  readonly onClose: () => void;
  readonly onOpenObjectTree?: () => void;
  readonly onRun?: (code: string) => Promise<{ ok: boolean; message: string }>;
}

function highlightPine(code: string): string {
  const esc = code
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return esc
    .replace(/(\/\/[^\n]*)/g, '<span style="color:#787b86">$1</span>')
    .replace(/(@version=\d+)/g, '<span style="color:#787b86">$1</span>')
    .replace(
      /\b(indicator|strategy|library|plot|plotshape|hline|fill|color|input|ta|math|str|array|map|matrix|request|ticker|timeframe|barstate|session|syminfo|chart|line|label|box|table|polyline|alert|alertcondition)\b/g,
      '<span style="color:#2962ff">$1</span>',
    )
    .replace(/("[^"]*")/g, '<span style="color:#ef5350">$1</span>')
    .replace(
      /\b(close|open|high|low|volume|hl2|hlc3|ohlc4|time|timenow|bar_index|last_bar_index)\b/g,
      '<span style="color:#ff9800">$1</span>',
    )
    .replace(/\b(\d+(?:\.\d+)?)\b/g, '<span style="color:#26a69a">$1</span>');
}

/**
 * TradingView-style Pine Editor (right-docked chrome).
 * Add to chart maps supported drafts onto Charting Library studies.
 */
export function PineEditorPanel({ onClose, onOpenObjectTree, onRun }: PineEditorPanelProps) {
  const [title, setTitle] = useState(() => {
    try {
      return localStorage.getItem(TITLE_KEY) ?? "Untitled script";
    } catch {
      return "Untitled script";
    }
  });
  const [code, setCode] = useState(() => {
    try {
      return localStorage.getItem(DRAFT_KEY) ?? TV_DEFAULT_INDICATOR;
    } catch {
      return TV_DEFAULT_INDICATOR;
    }
  });
  const [status, setStatus] = useState("Ready");
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [consoleLog, setConsoleLog] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [onChart, setOnChart] = useState(false);
  const [cursor, setCursor] = useState({ line: 1, col: 1 });
  const [scriptMenuEl, setScriptMenuEl] = useState<null | HTMLElement>(null);
  const [moreMenuEl, setMoreMenuEl] = useState<null | HTMLElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const highlight = useMemo(() => highlightPine(code), [code]);
  const lines = code.split("\n");

  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, code);
      localStorage.setItem(TITLE_KEY, title);
    } catch {
      /* ignore */
    }
  }, [code, title]);

  const updateCursor = () => {
    const el = areaRef.current;
    if (!el) return;
    const pos = el.selectionStart;
    const before = code.slice(0, pos);
    const line = before.split("\n").length;
    const col = before.length - before.lastIndexOf("\n");
    setCursor({ line, col });
  };

  const pushLog = (msg: string) => {
    setConsoleLog((prev) => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 40));
  };

  const loadTemplate = (id: PineTemplateId) => {
    const t = pineTemplate(id);
    setTitle(t.title);
    setCode(t.code);
    setOnChart(false);
    setStatus("Script loaded — click Add to chart");
    pushLog(`Opened template: ${t.title}`);
    setScriptMenuEl(null);
  };

  const handleRun = async () => {
    if (!onRun) {
      setStatus("Run is not connected");
      return;
    }
    setRunning(true);
    setStatus(onChart ? "Updating on chart…" : "Adding to chart…");
    pushLog(onChart ? "Update script on chart…" : "Add to chart…");
    try {
      const result = await onRun(code);
      setStatus(result.message);
      pushLog(result.message);
      if (result.ok) {
        setOnChart(true);
        setConsoleOpen(false);
      } else {
        setConsoleOpen(true);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Run failed";
      setStatus(msg);
      pushLog(msg);
      setConsoleOpen(true);
    } finally {
      setRunning(false);
    }
  };

  const handleSave = () => {
    try {
      localStorage.setItem(DRAFT_KEY, code);
      localStorage.setItem(TITLE_KEY, title);
      setStatus("Script saved");
      pushLog(`Saved “${title}” locally`);
    } catch {
      setStatus("Save failed");
    }
  };

  const rename = () => {
    const next = window.prompt("Rename script", title);
    if (next?.trim()) {
      setTitle(next.trim());
      pushLog(`Renamed to “${next.trim()}”`);
    }
    setScriptMenuEl(null);
  };

  return (
    <Box
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        bgcolor: "#131722",
        color: "#d1d4dc",
        minHeight: 0,
        borderLeft: "1px solid #2a2e39",
      }}
    >
      {/* Title bar — TradingView: Pine Editor + window controls */}
      <Box
        sx={{
          px: 1.25,
          py: 0.6,
          borderBottom: "1px solid #2a2e39",
          display: "flex",
          alignItems: "center",
          gap: 0.75,
          bgcolor: "#1e222d",
        }}
      >
        <NoteAddOutlinedIcon sx={{ fontSize: 18, color: "#787b86" }} />
        <Typography variant="subtitle2" sx={{ fontWeight: 600, flex: 1, color: "#d1d4dc" }}>
          Pine Editor
        </Typography>
        <IconButton size="small" aria-label="Minimize" onClick={onClose} sx={{ color: "#787b86" }}>
          <RemoveIcon fontSize="small" />
        </IconButton>
        <IconButton size="small" aria-label="Expand" sx={{ color: "#787b86" }}>
          <OpenInFullIcon sx={{ fontSize: 16 }} />
        </IconButton>
        <IconButton size="small" aria-label="Close" onClick={onClose} sx={{ color: "#787b86" }}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>

      {/* Action ribbon — Untitled / Add to chart / Save / Publish */}
      <Box
        sx={{
          px: 1.25,
          py: 0.65,
          borderBottom: "1px solid #2a2e39",
          display: "flex",
          alignItems: "center",
          gap: 1,
          flexWrap: "wrap",
          bgcolor: "#131722",
        }}
      >
        <Box
          component="button"
          type="button"
          onClick={(e) => setScriptMenuEl(e.currentTarget)}
          sx={{
            display: "inline-flex",
            alignItems: "center",
            gap: 0.25,
            px: 1,
            py: 0.45,
            borderRadius: 1,
            bgcolor: "transparent",
            border: "1px solid transparent",
            color: "#d1d4dc",
            cursor: "pointer",
            font: "inherit",
            fontSize: 13,
            fontWeight: 600,
            "&:hover": { bgcolor: "#1e222d" },
          }}
        >
          {title}
          <KeyboardArrowDownIcon sx={{ fontSize: 16, color: "#787b86" }} />
        </Box>
        <Menu
          anchorEl={scriptMenuEl}
          open={Boolean(scriptMenuEl)}
          onClose={() => setScriptMenuEl(null)}
          slotProps={{ paper: { sx: { bgcolor: "#1e222d", color: "#d1d4dc", minWidth: 220 } } }}
        >
          <MenuItem onClick={() => loadTemplate("blank")}>
            <ListItemText primary="Create new indicator" secondary="Blank plot(close)" />
          </MenuItem>
          <MenuItem onClick={() => loadTemplate("sma")}>
            <ListItemText primary="Create new / SMA 14" />
          </MenuItem>
          <MenuItem onClick={() => loadTemplate("rsi")}>
            <ListItemText primary="Create new / RSI 14" />
          </MenuItem>
          <MenuItem onClick={() => loadTemplate("macd")}>
            <ListItemText primary="Create new / MACD" secondary="From Pine docs" />
          </MenuItem>
          <Divider sx={{ borderColor: "#2a2e39" }} />
          <MenuItem
            onClick={() => {
              handleSave();
              setScriptMenuEl(null);
            }}
          >
            Save script
          </MenuItem>
          <MenuItem onClick={rename}>Rename…</MenuItem>
          <MenuItem
            onClick={() => {
              setTitle(`${title} copy`);
              setOnChart(false);
              setScriptMenuEl(null);
              pushLog("Made a copy");
            }}
          >
            Make a copy
          </MenuItem>
        </Menu>

        <Button
          size="small"
          variant="outlined"
          disabled={running}
          onClick={() => void handleRun()}
          startIcon={<PlayArrowIcon />}
          sx={{
            textTransform: "none",
            color: "#d1d4dc",
            borderColor: "#434651",
            fontWeight: 600,
            bgcolor: "#1e222d",
            "&:hover": { borderColor: "#787b86", bgcolor: "#2a2e39" },
          }}
        >
          {running ? "Running…" : onChart ? "Update on chart" : "Add to chart"}
        </Button>

        <Button
          size="small"
          onClick={handleSave}
          startIcon={<CloudUploadOutlinedIcon />}
          sx={{ textTransform: "none", color: "#2962ff", fontWeight: 600 }}
        >
          Save
        </Button>

        <Button
          size="small"
          variant="outlined"
          startIcon={<RocketLaunchOutlinedIcon />}
          onClick={() => {
            setStatus("Publish requires a TradingView account — draft stays local");
            pushLog("Publish script is not available in Forge embed");
            setConsoleOpen(true);
          }}
          sx={{
            textTransform: "none",
            color: "#d1d4dc",
            borderColor: "#434651",
            fontWeight: 600,
          }}
        >
          Publish script
        </Button>

        <Box sx={{ flex: 1 }} />
        <IconButton size="small" aria-label="More" onClick={(e) => setMoreMenuEl(e.currentTarget)} sx={{ color: "#d1d4dc" }}>
          <MoreVertIcon fontSize="small" />
        </IconButton>
        <Menu
          anchorEl={moreMenuEl}
          open={Boolean(moreMenuEl)}
          onClose={() => setMoreMenuEl(null)}
          slotProps={{ paper: { sx: { bgcolor: "#1e222d", color: "#d1d4dc", minWidth: 200 } } }}
        >
          <MenuItem
            onClick={() => {
              onOpenObjectTree?.();
              setMoreMenuEl(null);
            }}
          >
            Open object tree
          </MenuItem>
          <MenuItem
            onClick={() => {
              setConsoleOpen((v) => !v);
              setMoreMenuEl(null);
            }}
          >
            Pine logs…
          </MenuItem>
          <MenuItem
            component="a"
            href="https://www.tradingview.com/pine-script-docs/primer/first-steps/"
            target="_blank"
            rel="noopener"
            onClick={() => setMoreMenuEl(null)}
          >
            Pine Script® docs
          </MenuItem>
        </Menu>
      </Box>

      {/* Code area + minimap */}
      <Box sx={{ flex: 1, minHeight: 0, position: "relative", display: "flex" }}>
        <Box
          aria-hidden
          sx={{
            width: 44,
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
        <Box sx={{ flex: 1, minWidth: 0, position: "relative" }}>
          <Box
            aria-hidden
            sx={{
              position: "absolute",
              inset: 0,
              p: 1.5,
              m: 0,
              overflow: "hidden",
              pointerEvents: "none",
              whiteSpace: "pre",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
              fontSize: 13,
              lineHeight: "20px",
              color: "#d1d4dc",
            }}
            dangerouslySetInnerHTML={{ __html: highlight + "\n" }}
          />
          <Box
            component="textarea"
            ref={areaRef}
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              setOnChart(false);
            }}
            onSelect={updateCursor}
            onKeyUp={updateCursor}
            onScroll={(e) => {
              const pre = e.currentTarget.previousElementSibling as HTMLElement | null;
              if (pre) {
                pre.scrollTop = e.currentTarget.scrollTop;
                pre.scrollLeft = e.currentTarget.scrollLeft;
              }
            }}
            spellCheck={false}
            sx={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              resize: "none",
              border: 0,
              outline: "none",
              p: 1.5,
              m: 0,
              bgcolor: "transparent",
              color: "transparent",
              caretColor: "#d1d4dc",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
              fontSize: 13,
              lineHeight: "20px",
              tabSize: 4,
              whiteSpace: "pre",
              overflow: "auto",
            }}
          />
        </Box>
        <Box
          aria-hidden
          title="Minimap"
          sx={{
            width: 52,
            flexShrink: 0,
            bgcolor: "#1e222d",
            borderLeft: "1px solid #2a2e39",
            opacity: 0.85,
            backgroundImage: `repeating-linear-gradient(
              180deg,
              transparent,
              transparent 2px,
              rgba(41,98,255,0.18) 2px,
              rgba(41,98,255,0.18) 3px
            )`,
          }}
        />
      </Box>

      {consoleOpen ? (
        <Box
          sx={{
            maxHeight: 120,
            overflow: "auto",
            borderTop: "1px solid #2a2e39",
            bgcolor: "#0c0e15",
            px: 1.5,
            py: 1,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            fontSize: 12,
            color: "#b2b5be",
          }}
        >
          {consoleLog.length === 0 ? (
            <Typography variant="caption" sx={{ color: "#787b86" }}>
              No log output. Add to chart to run the script bridge.
            </Typography>
          ) : (
            consoleLog.map((line, i) => <div key={`${i}-${line}`}>{line}</div>)
          )}
        </Box>
      ) : null}

      {/* Status bar */}
      <Box
        sx={{
          px: 1.5,
          py: 0.45,
          borderTop: "1px solid #2a2e39",
          bgcolor: "#1e222d",
          display: "flex",
          alignItems: "center",
          gap: 1,
        }}
      >
        <IconButton
          size="small"
          aria-label="Console"
          onClick={() => setConsoleOpen((v) => !v)}
          sx={{ color: consoleOpen ? "#2962ff" : "#787b86", p: 0.25 }}
        >
          <TerminalIcon sx={{ fontSize: 16 }} />
        </IconButton>
        <Typography
          variant="caption"
          sx={{ flex: 1, color: status.startsWith("Added") || status.startsWith("Script saved") ? "#26a69a" : "#787b86" }}
        >
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
