import { useEffect, useRef, useState } from "react";
import { loadJson, saveJson } from "../persist";

export type LayoutArrangement = "1" | "2h" | "2v" | "3" | "4";

export type ChartLayout = {
  id: string;
  name: string;
  arrangement: LayoutArrangement;
  symbols: string[];
  updatedAt: number;
};

const LAYOUTS_KEY = "forge.chartLayouts";
const ACTIVE_LAYOUT_KEY = "forge.activeLayoutId";

export const ARRANGEMENTS: Array<{ id: LayoutArrangement; label: string; cols: number; rows: number; count: number }> = [
  { id: "1", label: "1 chart", cols: 1, rows: 1, count: 1 },
  { id: "2h", label: "2 charts · horizontal", cols: 2, rows: 1, count: 2 },
  { id: "2v", label: "2 charts · vertical", cols: 1, rows: 2, count: 2 },
  { id: "3", label: "3 charts", cols: 2, rows: 2, count: 3 },
  { id: "4", label: "4 charts", cols: 2, rows: 2, count: 4 },
];

export function loadLayouts(): ChartLayout[] {
  return loadJson<ChartLayout[]>(LAYOUTS_KEY, []);
}

export function saveLayouts(rows: ChartLayout[]): void {
  saveJson(LAYOUTS_KEY, rows);
}

export function loadActiveLayoutId(): string | null {
  return loadJson<string | null>(ACTIVE_LAYOUT_KEY, null);
}

export function saveActiveLayoutId(id: string | null): void {
  saveJson(ACTIVE_LAYOUT_KEY, id);
}

function uid(): string {
  return `lay_${Math.random().toString(36).slice(2, 9)}`;
}

type Props = {
  arrangement: LayoutArrangement;
  symbols: string[];
  onArrangement: (next: LayoutArrangement) => void;
  onOpenLayout: (layout: ChartLayout) => void;
  onSaveCurrent: (name: string) => ChartLayout;
};

export function LayoutMenu({ arrangement, symbols, onArrangement, onOpenLayout, onSaveCurrent }: Props) {
  const [open, setOpen] = useState(false);
  const [layouts, setLayouts] = useState<ChartLayout[]>(loadLayouts);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("Untitled layout");
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const persist = (rows: ChartLayout[]) => {
    setLayouts(rows);
    saveLayouts(rows);
  };

  const saveAs = () => {
    const name = saveName.trim() || "Untitled layout";
    const layout = onSaveCurrent(name);
    const next = [layout, ...layouts.filter((l) => l.id !== layout.id)];
    persist(next);
    saveActiveLayoutId(layout.id);
    setSaveOpen(false);
    setOpen(false);
  };

  return (
    <div className="menu-wrap layout-menu" ref={rootRef}>
      <button
        type="button"
        className={open ? "tb-icon on" : "tb-icon"}
        title="Select layout"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        ⊞
      </button>
      {open ? (
        <div className="menu wide layout-dropdown">
          <div className="iv-head">Arrangement</div>
          <div className="layout-grid-presets">
            {ARRANGEMENTS.map((a) => (
              <button
                key={a.id}
                type="button"
                className={arrangement === a.id ? "on" : ""}
                title={a.label}
                onClick={() => {
                  onArrangement(a.id);
                  setOpen(false);
                }}
              >
                <LayoutGlyph id={a.id} />
                <span>{a.label}</span>
              </button>
            ))}
          </div>
          <div className="iv-head">Saved layouts</div>
          <div className="layout-actions">
            <button
              type="button"
              onClick={() => {
                setSaveName(`${symbols[0] || "Chart"} layout`);
                setSaveOpen(true);
              }}
            >
              Save layout…
            </button>
          </div>
          {saveOpen ? (
            <div className="layout-save-row">
              <input value={saveName} onChange={(e) => setSaveName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveAs()} />
              <button type="button" className="primary" onClick={saveAs}>
                Save
              </button>
            </div>
          ) : null}
          <ul className="layout-list">
            {layouts.length ? (
              layouts.map((layout) => (
                <li key={layout.id}>
                  {renameId === layout.id ? (
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          persist(layouts.map((l) => (l.id === layout.id ? { ...l, name: renameValue.trim() || l.name } : l)));
                          setRenameId(null);
                        }
                        if (e.key === "Escape") setRenameId(null);
                      }}
                      onBlur={() => {
                        persist(layouts.map((l) => (l.id === layout.id ? { ...l, name: renameValue.trim() || l.name } : l)));
                        setRenameId(null);
                      }}
                    />
                  ) : (
                    <button type="button" className="layout-open" onClick={() => { onOpenLayout(layout); setOpen(false); }}>
                      <b>{layout.name}</b>
                      <em>
                        {ARRANGEMENTS.find((a) => a.id === layout.arrangement)?.label} · {layout.symbols.join(", ")}
                      </em>
                    </button>
                  )}
                  <span className="layout-item-acts">
                    <button
                      type="button"
                      title="Rename"
                      onClick={() => {
                        setRenameId(layout.id);
                        setRenameValue(layout.name);
                      }}
                    >
                      ✎
                    </button>
                    <button
                      type="button"
                      title="Duplicate"
                      onClick={() => {
                        const copy: ChartLayout = {
                          ...layout,
                          id: uid(),
                          name: `${layout.name} copy`,
                          updatedAt: Date.now(),
                        };
                        persist([copy, ...layouts]);
                      }}
                    >
                      ⎘
                    </button>
                    <button
                      type="button"
                      title="Delete"
                      onClick={() => persist(layouts.filter((l) => l.id !== layout.id))}
                    >
                      ×
                    </button>
                  </span>
                </li>
              ))
            ) : (
              <li className="muted">No saved layouts yet</li>
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function createLayout(name: string, arrangement: LayoutArrangement, symbols: string[]): ChartLayout {
  const meta = ARRANGEMENTS.find((a) => a.id === arrangement) ?? ARRANGEMENTS[0];
  const padded = [...symbols];
  while (padded.length < meta.count) padded.push(symbols[0] || "XAUUSD");
  return {
    id: uid(),
    name,
    arrangement,
    symbols: padded.slice(0, meta.count),
    updatedAt: Date.now(),
  };
}

function LayoutGlyph({ id }: { id: LayoutArrangement }) {
  if (id === "1") return <i className="lg lg-1" />;
  if (id === "2h") return <i className="lg lg-2h" />;
  if (id === "2v") return <i className="lg lg-2v" />;
  if (id === "3") return <i className="lg lg-3" />;
  return <i className="lg lg-4" />;
}
