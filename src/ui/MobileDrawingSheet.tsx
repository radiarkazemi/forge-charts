import { useState } from "react";
import type { ChartEngine } from "../engine/ChartEngine";
import { TOOL_GROUPS } from "../catalog";
import { useEngine } from "./useEngine";
import type { Tool } from "../engine/types";

type Props = {
  open: boolean;
  onClose: () => void;
  engine: ChartEngine | null;
};

/** Mobile drawing tool picker — bottom sheet style with large touch targets. */
export function MobileDrawingSheet({ open, onClose, engine }: Props) {
  const snap = useEngine(engine);
  const [groupIdx, setGroupIdx] = useState(0);
  if (!open) return null;

  const groups = TOOL_GROUPS.map((g) => ({
    ...g,
    tools: g.sections.flatMap((s) => s.tools),
  }));

  const activeGroup = groups[groupIdx] ?? groups[0];

  const pick = (tool: Tool) => {
    engine?.setTool(tool);
    onClose();
  };

  return (
    <div className="bottom-sheet-bg" onMouseDown={onClose} onTouchStart={onClose}>
      <div
        className="bottom-sheet bottom-sheet-tall"
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
      >
        <div className="bottom-sheet-handle" />
        <div className="mobile-draw-tabs">
          {groups.map((g, i) => (
            <button
              key={g.id}
              type="button"
              className={i === groupIdx ? "on" : ""}
              onClick={() => setGroupIdx(i)}
            >
              {g.title}
            </button>
          ))}
        </div>
        <div className="mobile-draw-tools">
          {activeGroup.tools.map((tool) => (
            <button
              key={tool.id}
              type="button"
              className={snap?.tool === tool.draw ? "mobile-tool-btn on" : "mobile-tool-btn"}
              onClick={() => pick(tool.draw)}
            >
              {tool.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
