import type { ChartEngine } from "../engine/ChartEngine";
import { CHART_TYPES, TOOL_GROUPS } from "../catalog";
import { useEffect, useMemo, useRef, useState } from "react";

export type QuickSearchAction = {
  id: string;
  label: string;
  group: string;
  hint?: string;
  run: () => void;
};

type Props = {
  open: boolean;
  onClose: () => void;
  engine: ChartEngine | null;
  onOpenSymbol: () => void;
  onOpenIndicators: () => void;
  onOpenSettings: () => void;
  onOpenAlert: () => void;
  onReplay: () => void;
};

function buildActions(props: Omit<Props, "open" | "onClose">): QuickSearchAction[] {
  const eng = props.engine;
  const tools: QuickSearchAction[] = TOOL_GROUPS.flatMap((group) =>
    group.sections.flatMap((section) =>
      section.tools.map((tool) => ({
        id: `tool:${tool.id}`,
        label: tool.label,
        group: `Drawing · ${group.title}`,
        hint: "Tool",
        run: () => eng?.setTool(tool.draw),
      })),
    ),
  );

  const chartTypes: QuickSearchAction[] = CHART_TYPES.map((t) => ({
    id: `type:${t.id}`,
    label: t.label,
    group: `Chart type · ${t.group}`,
    hint: "Type",
    run: () => eng?.setChartType(t.id),
  }));

  const actions: QuickSearchAction[] = [
    { id: "act:symbol", label: "Symbol search", group: "Actions", hint: "⌘K", run: props.onOpenSymbol },
    { id: "act:indicators", label: "Indicators", group: "Actions", hint: "Alt+I", run: props.onOpenIndicators },
    { id: "act:alert", label: "Create alert", group: "Actions", hint: "Alt+A", run: props.onOpenAlert },
    { id: "act:settings", label: "Chart settings", group: "Actions", run: props.onOpenSettings },
    { id: "act:replay", label: "Bar Replay", group: "Actions", hint: "Shift+Alt+R", run: props.onReplay },
    { id: "act:undo", label: "Undo", group: "Actions", hint: "⌘Z", run: () => eng?.undo() },
    { id: "act:redo", label: "Redo", group: "Actions", hint: "⌘⇧Z", run: () => eng?.redo() },
    { id: "act:theme", label: "Toggle theme", group: "Settings", run: () => eng?.setTheme(eng.getSnapshot().theme === "dark" ? "light" : "dark") },
    { id: "act:fullscreen", label: "Fullscreen", group: "Actions", run: () => document.documentElement.requestFullscreen?.() },
    { id: "act:snapshot", label: "Take a snapshot", group: "Actions", run: () => eng?.screenshot() },
    ...chartTypes,
    ...tools,
  ];
  return actions;
}

/** Supercharts-style quick search: tools, drawings, settings, actions (not only symbols). */
export function QuickSearchModal({ open, onClose, ...rest }: Props) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const actions = useMemo(() => buildActions(rest), [rest.engine, rest.onOpenAlert, rest.onOpenIndicators, rest.onOpenSettings, rest.onOpenSymbol, rest.onReplay]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return actions.slice(0, 40);
    return actions
      .filter((a) => a.label.toLowerCase().includes(q) || a.group.toLowerCase().includes(q) || a.id.toLowerCase().includes(q))
      .slice(0, 60);
  }, [actions, query]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
    const id = window.setTimeout(() => inputRef.current?.focus(), 20);
    return () => window.clearTimeout(id);
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  if (!open) return null;

  const run = (item: QuickSearchAction) => {
    item.run();
    onClose();
  };

  return (
    <div className="modal-bg" onMouseDown={onClose}>
      <div
        className="modal quick-search-modal"
        role="dialog"
        aria-label="Quick search"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          placeholder="Search tools, drawings, settings…"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              onClose();
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((v) => Math.min(filtered.length - 1, v + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((v) => Math.max(0, v - 1));
            } else if (e.key === "Enter") {
              e.preventDefault();
              const item = filtered[active];
              if (item) run(item);
            }
          }}
        />
        <ul className="quick-search-list">
          {filtered.length ? (
            filtered.map((item, i) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={i === active ? "on" : ""}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => run(item)}
                >
                  <span>
                    <b>{item.label}</b>
                    <em>{item.group}</em>
                  </span>
                  {item.hint ? <kbd>{item.hint}</kbd> : null}
                </button>
              </li>
            ))
          ) : (
            <li className="quick-empty">No matches</li>
          )}
        </ul>
        <footer>
          <span>↑↓ navigate</span>
          <span>↵ select</span>
          <span>esc close</span>
          <button type="button" className="link" onClick={rest.onOpenSymbol}>
            Symbol search…
          </button>
        </footer>
      </div>
    </div>
  );
}
