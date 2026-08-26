import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type SVGProps } from "react";
import { TOOL_GROUPS, type ToolGroup, type ToolItem } from "../catalog";
import type { ChartEngine } from "../engine/ChartEngine";
import { useEngine } from "./useEngine";
import { ToolGlyph } from "./toolIcons";

function I(props: SVGProps<SVGSVGElement> & { children: ReactNode }) {
  const { children, ...rest } = props;
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" {...rest}>
      {children}
    </svg>
  );
}

function lastFor(groupId: string, saved: Record<string, string>, tools: ToolItem[]): ToolItem {
  return tools.find((t) => t.id === saved[groupId]) ?? tools[0];
}

function toolsOf(group: ToolGroup): ToolItem[] {
  return group.sections.flatMap((section) => section.tools);
}

export function DrawingToolbar({ engine }: { engine: ChartEngine | null }) {
  const snap = useEngine(engine);
  const railRef = useRef<HTMLElement | null>(null);
  const groupRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const openTimer = useRef(0);
  const closeTimer = useRef(0);
  const [open, setOpen] = useState<string | null>(null);
  const [pinned, setPinned] = useState(false);
  const [saved, setSaved] = useState<Record<string, string>>({});
  const [flyStyle, setFlyStyle] = useState<CSSProperties>({});

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!railRef.current?.contains(e.target as Node)) {
        setOpen(null);
        setPinned(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    const el = groupRefs.current[open];
    if (!el) return;
    const place = () => {
      const r = el.getBoundingClientRect();
      const maxH = Math.min(window.innerHeight * 0.7, 560);
      const top = Math.max(8, Math.min(r.top, window.innerHeight - maxH - 8));
      setFlyStyle({
        position: "fixed",
        left: r.right - 2,
        top,
        maxHeight: maxH,
      });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  if (!snap) return <aside className="draw-rail" />;

  const cancelTimers = () => {
    window.clearTimeout(openTimer.current);
    window.clearTimeout(closeTimer.current);
  };

  const scheduleClose = () => {
    if (pinned) return;
    window.clearTimeout(openTimer.current);
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => {
      setOpen(null);
      setPinned(false);
    }, 280);
  };

  const hoverGroup = (id: string) => {
    cancelTimers();
    if (open === id) return;
    openTimer.current = window.setTimeout(
      () => {
        setOpen(id);
        setPinned(false);
      },
      open ? 0 : 90,
    );
  };

  const pinGroup = (id: string) => {
    cancelTimers();
    if (open === id && pinned) {
      setOpen(null);
      setPinned(false);
      return;
    }
    setOpen(id);
    setPinned(true);
  };

  const pick = (item: ToolItem, groupId: string) => {
    engine?.setTool(item.draw, item.glyph ? { text: item.glyph } : undefined);
    setSaved((s) => ({ ...s, [groupId]: item.id }));
    setOpen(null);
    setPinned(false);
  };

  const activateGroup = (groupId: string, tools: ToolItem[]) => {
    const item = lastFor(groupId, saved, tools);
    engine?.setTool(item.draw, item.glyph ? { text: item.glyph } : undefined);
  };

  return (
    <aside className="draw-rail" ref={railRef}>
      {TOOL_GROUPS.map((g) => {
        const groupTools = toolsOf(g);
        const current = lastFor(g.id, saved, groupTools);
        const groupActive = groupTools.some((t) => t.draw === snap.tool);
        return (
          <div
            key={g.id}
            ref={(node) => {
              groupRefs.current[g.id] = node;
            }}
            className={open === g.id ? "draw-group open" : "draw-group"}
            onPointerEnter={() => hoverGroup(g.id)}
            onPointerLeave={scheduleClose}
          >
            <button
              className={groupActive ? "tool on" : "tool"}
              title={`${current.label} · ${g.title}`}
              onClick={() => activateGroup(g.id, groupTools)}
            >
              {current.glyph ? <span className="tool-emoji">{current.glyph}</span> : <ToolGlyph id={current.id} />}
            </button>
            <button
              className="chev"
              title={`${g.title} tools`}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                pinGroup(g.id);
              }}
            >
              ▸
            </button>
            {open === g.id ? (
              <div
                className="flyout"
                style={flyStyle}
                onPointerEnter={cancelTimers}
                onPointerLeave={scheduleClose}
              >
                <div className="flyout-list">
                  {g.sections.map((section, index) => (
                    <div key={section.id} className={index > 0 ? "fly-section separated" : "fly-section"}>
                      {section.title ? <div className="fly-title">{section.title}</div> : null}
                      {section.tools.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          className={current.id === t.id && groupActive ? "on" : ""}
                          onPointerDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            pick(t, g.id);
                          }}
                        >
                          {t.glyph ? <span className="tool-emoji">{t.glyph}</span> : <ToolGlyph id={t.id} />}
                          {t.label}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        );
      })}

      <div className="rail-gap" />

      <button className={snap.tool === "measure" ? "tool on" : "tool"} title="Measure" onClick={() => engine?.setTool("measure")}>
        <I>
          <path d="M4 18 L20 6" />
          <path d="M4 18h3M17 6h3" />
        </I>
      </button>
      <button className={snap.tool === "zoom" ? "tool on" : "tool"} title="Zoom In" onClick={() => engine?.setTool("zoom")}>
        <I>
          <circle cx="11" cy="11" r="6" />
          <path d="M16 16 L20 20M8 11h6M11 8v6" />
        </I>
      </button>
      <button
        className={snap.magnet !== "off" ? "tool on" : "tool"}
        title={`Magnet (${snap.magnet})`}
        onClick={() => engine?.cycleMagnet()}
      >
        <I>
          <path d="M7 4v8a5 5 0 0 0 10 0V4" />
          <path d="M7 4h3v8M14 4h3v8" />
        </I>
      </button>
      <button className={snap.stayMode ? "tool on" : "tool"} title="Stay in drawing mode" onClick={() => engine?.toggle("stayMode")}>
        <I>
          <rect x="7" y="11" width="10" height="8" rx="1" />
          <path d="M9 11V8a3 3 0 0 1 6 0" />
          <path d="M12 3v3" />
        </I>
      </button>
      <button className={snap.lockDrawings ? "tool on" : "tool"} title="Lock all drawing tools" onClick={() => engine?.toggle("lockDrawings")}>
        <I>
          <rect x="6" y="11" width="12" height="9" rx="1.5" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </I>
      </button>
      <button className={snap.hideDrawings ? "tool on" : "tool"} title="Hide all drawings" onClick={() => engine?.toggle("hideDrawings")}>
        <I>
          <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
          <circle cx="12" cy="12" r="3" />
        </I>
      </button>
      <button className="tool" title="Remove drawings" onClick={() => engine?.clearDrawings()}>
        <I>
          <path d="M5 7h14M9 7V5h6v2M8 7l1 12h6l1-12" />
        </I>
      </button>
    </aside>
  );
}
