import { useEffect, useState } from "react";
import {
  deleteNamedWorkspace,
  loadActiveWorkspaceId,
  loadNamedWorkspaces,
  type NamedWorkspace,
} from "../data/workspaceProfile";

type Props = {
  open: boolean;
  onClose: () => void;
  currentName: string;
  onLoad: (ws: NamedWorkspace) => void;
  onSaveAs: (name: string) => void;
};

/** TV-style “My layouts” manager for local chart workspaces. */
export function WorkspaceManager({ open, onClose, currentName, onLoad, onSaveAs }: Props) {
  const [rows, setRows] = useState<NamedWorkspace[]>(() => loadNamedWorkspaces());
  const [activeId, setActiveId] = useState<string | null>(() => loadActiveWorkspaceId());
  const [saveName, setSaveName] = useState(currentName || "My layout");

  useEffect(() => {
    if (!open) return;
    setRows(loadNamedWorkspaces());
    setActiveId(loadActiveWorkspaceId());
    setSaveName(currentName || "My layout");
  }, [open, currentName]);

  if (!open) return null;

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal tall workspace-manager" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2>Chart layouts</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <p className="muted workspace-manager-hint">
          Save chart type, indicators, drawings, multi-chart grid, and sync options — like TradingView layouts
          (stored locally in this browser).
        </p>
        <div className="workspace-save-row">
          <input
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            placeholder="Layout name"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onSaveAs(saveName.trim() || "My layout");
                setRows(loadNamedWorkspaces());
                setActiveId(loadActiveWorkspaceId());
              }
            }}
          />
          <button
            type="button"
            className="primary"
            onClick={() => {
              onSaveAs(saveName.trim() || "My layout");
              setRows(loadNamedWorkspaces());
              setActiveId(loadActiveWorkspaceId());
            }}
          >
            Save current
          </button>
        </div>
        <ul className="workspace-list">
          {rows.length ? (
            rows.map((ws) => (
              <li key={ws.id} className={ws.id === activeId ? "on" : ""}>
                <button
                  type="button"
                  className="workspace-open"
                  onClick={() => {
                    onLoad(ws);
                    onClose();
                  }}
                >
                  <b>{ws.name}</b>
                  <em>
                    {ws.arrangement} · {ws.panes.map((p) => p.symbol).join(", ")} ·{" "}
                    {new Date(ws.updatedAt).toLocaleString()}
                  </em>
                </button>
                <button
                  type="button"
                  className="danger-ghost"
                  title="Delete"
                  onClick={() => {
                    deleteNamedWorkspace(ws.id);
                    setRows(loadNamedWorkspaces());
                    setActiveId(loadActiveWorkspaceId());
                  }}
                >
                  ×
                </button>
              </li>
            ))
          ) : (
            <li className="muted">No saved layouts yet</li>
          )}
        </ul>
      </div>
    </div>
  );
}
