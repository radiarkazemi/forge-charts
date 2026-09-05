import React, { useEffect, useState } from "react";
import { indicatorInputs, indicatorTitle, toolLabelForDraw } from "../catalog";
import type { ChartEngine } from "../engine/ChartEngine";
import {
  defaultFibStyleForKind,
  defaultPatternStyle,
  formatFibRatio,
  resolveFibStyleForKind,
} from "../engine/drawings";
import type {
  ChartSource,
  Drawing,
  DrawingVisibility,
  FibLevelStyle,
  FibRetraceStyle,
  IndicatorInstance,
  LineStyle,
} from "../engine/types";
import type { LineEnd } from "../engine/types";
import { DEFAULT_DRAWING_VISIBILITY,
  DEFAULT_INDICATOR_VISIBILITY } from "../engine/types";
import {
  createDrawingTemplate,
  drawingTemplateSummary,
  loadDrawingTemplates,
  saveDrawingTemplates,
  templatePatch,
  type DrawingTemplate,
} from "../data/drawingTemplates";
import { useEngine } from "./useEngine";

const PALETTE = ["#2962ff", "#f23645", "#089981", "#ff9800", "#ab47bc", "#e1a218", "#26a69a", "#d1d4dc"];
const WIDTHS = [1, 2, 3, 4];
const STYLES: { id: LineStyle; label: string }[] = [
  { id: "solid", label: "—" },
  { id: "dashed", label: "- -" },
  { id: "dotted", label: "···" },
];
const SOURCES: ChartSource[] = ["open", "high", "low", "close", "hl2", "hlc3", "ohlc4"];
const EDITOR_TABS = ["Inputs", "Style", "Visibility"] as const;
type EditorTab = (typeof EDITOR_TABS)[number];
const DRAW_TABS = ["Style", "Text", "Coordinates", "Visibility"] as const;
type DrawTab = (typeof DRAW_TABS)[number];

const VIS_ROWS: { key: keyof DrawingVisibility; label: string }[] = [
  { key: "seconds", label: "Seconds" },
  { key: "minutes", label: "Minutes" },
  { key: "hours", label: "Hours" },
  { key: "daily", label: "Daily" },
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
];

function hasTextField(kind: Drawing["kind"]): boolean {
  return (
    kind === "text" ||
    kind === "anchoredtext" ||
    kind === "note" ||
    kind === "signpost" ||
    kind === "callout" ||
    kind === "comment" ||
    kind === "pricenote" ||
    kind === "pricelabel" ||
    kind === "sticker" ||
    kind === "flagmark"
  );
}

function toLocalInput(sec: number): string {
  const d = new Date(sec * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

function fromLocalInput(value: string): number | null {
  if (!value) return null;
  const ms = Date.parse(value.endsWith("Z") ? value : `${value}Z`);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}

export function ChartInspectors({
  engine,
  onAlertDrawing,
  onAlertPrice,
}: {
  engine: ChartEngine | null;
  onAlertDrawing?: (drawing: Drawing) => void;
  onAlertPrice?: (price: number) => void;
}) {
  const snap = useEngine(engine);
  const [indOpen, setIndOpen] = useState<string | null>(null);
  const [moreInd, setMoreInd] = useState<string | null>(null);
  const selected = snap?.drawings.find((d) => d.id === snap.selectedId) ?? null;
  const propsDrawing = snap?.drawings.find((d) => d.id === snap.drawingPropsId) ?? null;
  const menuDrawing = snap?.drawings.find((d) => d.id === snap.drawingMenu?.id) ?? null;
  const editingInd = snap?.indicators.find((i) => i.id === (indOpen ?? snap.selectedIndicatorId)) ?? null;
  const symLine = snap?.legend.find((l) => l.id === "sym" || l.id === "symbol");

  if (!snap) return null;
  return (
    <>
      <div className="legend">
        {symLine ? (
          <div className="legend-row legend-symbol">
            <span className="legend-swatch" style={{ background: symLine.color }} />
            <span>{symLine.text}</span>
          </div>
        ) : null}
        {snap.legend
          .filter((l) => l.id !== "sym" && l.id !== "symbol" && l.id !== "cmp")
          .map((line) => {
            const ind = snap.indicators.find((i) => i.id === line.id);
            if (!ind) return null;
            const on = snap.selectedIndicatorId === ind.id;
            return (
              <div
                key={ind.id}
                className={on ? "legend-row on" : "legend-row"}
                onClick={() => {
                  engine?.selectIndicator(ind.id);
                  setIndOpen(null);
                }}
              >
                <span className="legend-swatch" style={{ background: ind.color }} />
                <span className={ind.visible ? "" : "muted"}>{line.text}</span>
                <span className="legend-acts">
                  <button title={ind.visible ? "Hide" : "Show"} onClick={(e) => { e.stopPropagation(); engine?.toggleIndicator(ind.id); }}>
                    {ind.visible ? "◉" : "○"}
                  </button>
                  <button
                    title="Settings"
                    onClick={(e) => {
                      e.stopPropagation();
                      engine?.selectIndicator(ind.id);
                      setIndOpen(ind.id);
                    }}
                  >
                    ⚙
                  </button>
                  <button
                    title="More"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMoreInd((cur) => (cur === ind.id ? null : ind.id));
                    }}
                  >
                    ⋯
                  </button>
                  <button title="Remove" onClick={(e) => { e.stopPropagation(); engine?.removeIndicator(ind.id); }}>
                    ×
                  </button>
                </span>
                {moreInd === ind.id ? (
                  <div className="legend-more" onClick={(e) => e.stopPropagation()}>
                    <button type="button" onClick={() => { engine?.reorderIndicator(ind.id, "front"); setMoreInd(null); }}>Bring to front</button>
                    <button type="button" onClick={() => { engine?.reorderIndicator(ind.id, "back"); setMoreInd(null); }}>Send to back</button>
                    <button type="button" onClick={() => { engine?.cloneIndicator(ind.id); setMoreInd(null); }}>Clone</button>
                    {ind.pane !== "main" && ind.pane !== "volume" ? (
                      <>
                        <button type="button" onClick={() => { engine?.setMaximizedPane(snap.maximizedPaneId === ind.id ? null : ind.id); setMoreInd(null); }}>
                          {snap.maximizedPaneId === ind.id ? "Restore pane" : "Maximize pane"}
                        </button>
                        <button type="button" onClick={() => { engine?.updateIndicator(ind.id, { collapsed: !ind.collapsed }); setMoreInd(null); }}>
                          {ind.collapsed ? "Expand pane" : "Collapse pane"}
                        </button>
                        <button type="button" onClick={() => { engine?.updateIndicator(ind.id, { pane: "main" }); setMoreInd(null); }}>Move to main pane</button>
                      </>
                    ) : (
                      <button type="button" onClick={() => { engine?.updateIndicator(ind.id, { pane: "rsi" }); setMoreInd(null); }}>Move to new pane</button>
                    )}
                    <button type="button" onClick={() => { engine?.updateIndicator(ind.id, { scaleSide: ind.scaleSide === "left" ? "right" : "left" }); setMoreInd(null); }}>
                      Pin scale: {ind.scaleSide === "left" ? "left" : "right"}
                    </button>
                    <button type="button" onClick={() => { engine?.updateIndicator(ind.id, { visible: !ind.visible }); setMoreInd(null); }}>
                      {ind.visible ? "Hide" : "Show"}
                    </button>
                    <button type="button" className="danger" onClick={() => { engine?.removeIndicator(ind.id); setMoreInd(null); }}>Remove</button>
                  </div>
                ) : null}
              </div>
            );
          })}
      </div>
      {selected && !propsDrawing ? (
        <DrawingEditor engine={engine} drawing={selected} onAlertDrawing={onAlertDrawing} />
      ) : null}
      {propsDrawing ? <DrawingPropertiesDialog engine={engine} drawing={propsDrawing} /> : null}
      {menuDrawing && snap.drawingMenu ? (
        <DrawingContextMenu
          engine={engine}
          drawing={menuDrawing}
          x={snap.drawingMenu.x}
          y={snap.drawingMenu.y}
          onAlertDrawing={onAlertDrawing}
        />
      ) : null}
      {editingInd && indOpen === editingInd.id ? (
        <IndicatorEditor
          engine={engine}
          ind={editingInd}
          onClose={() => setIndOpen(null)}
        />
      ) : null}
      {snap.chartMenu ? (
        <ChartMenuPanel
          engine={engine}
          menu={snap.chartMenu}
          onAlertPrice={onAlertPrice}
        />
      ) : null}
    </>
  );
}

function ChartMenuPanel({
  engine,
  menu,
  onAlertPrice,
}: {
  engine: ChartEngine | null;
  menu: import("../engine/types").ChartContextMenu;
  onAlertPrice?: (price: number) => void;
}) {
  const close = () => engine?.closeChartMenu();
  const cv = engine?.getSnapshot().canvas;
  const style: React.CSSProperties = {
    position: "fixed",
    left: Math.min(menu.x, window.innerWidth - 220),
    top: Math.min(menu.y, window.innerHeight - 260),
    zIndex: 80,
  };
  return (
    <div className="ctx-menu" style={style} onPointerDown={(e) => e.stopPropagation()}>
      {menu.kind === "price" ? (
        <>
          <button type="button" onClick={() => { if (menu.price != null) onAlertPrice?.(menu.price); close(); }}>Add alert at price…</button>
          <button type="button" onClick={() => { engine?.toggle("logScale"); close(); }}>Toggle log scale</button>
          <button type="button" onClick={() => { engine?.toggle("percentScale"); close(); }}>Toggle percent</button>
          <button type="button" onClick={() => { engine?.toggle("indexedScale"); close(); }}>Toggle indexed 100</button>
          <button
            type="button"
            onClick={() => {
              engine?.setCanvasSettings({ invertScale: !cv?.invertScale });
              close();
            }}
          >
            Invert scale
          </button>
          <button type="button" onClick={() => { engine?.resetPriceScale(); close(); }}>Reset price scale</button>
        </>
      ) : null}
      {menu.kind === "time" ? (
        <>
          <button type="button" onClick={() => { engine?.fitTimeScale(); close(); }}>Fit time scale</button>
          <button type="button" onClick={() => { if (menu.time != null) engine?.scrollToTime(menu.time, "center"); close(); }}>Scroll here</button>
          <button
            type="button"
            onClick={() => {
              engine?.setCanvasSettings({ pinLeft: !cv?.pinLeft });
              close();
            }}
          >
            {cv?.pinLeft ? "Unpin left" : "Pin left on interval change"}
          </button>
        </>
      ) : null}
      {menu.kind === "chart" ? (
        <>
          <button type="button" onClick={() => { engine?.fitContent(); close(); }}>Reset chart view</button>
          <button type="button" onClick={() => { engine?.resetPriceScale(); close(); }}>Auto price scale</button>
          <button type="button" onClick={() => { engine?.setCanvasSettings({ sessionBreaks: !cv?.sessionBreaks }); close(); }}>Toggle session breaks</button>
          <button type="button" onClick={() => { engine?.setCanvasSettings({ showEvents: !cv?.showEvents }); close(); }}>Toggle events</button>
          <button type="button" onClick={() => { engine?.setCanvasSettings({ volumeOverlay: !cv?.volumeOverlay }); close(); }}>Toggle volume overlay</button>
          <div className="ctx-sep" />
          <button type="button" onClick={() => { engine?.clearDrawings(); close(); }}>Remove drawings</button>
        </>
      ) : null}
      <div className="ctx-sep" />
      <button type="button" onClick={close}>Close</button>
    </div>
  );
}

function DrawingEditor({
  engine,
  drawing,
  onAlertDrawing,
}: {
  engine: ChartEngine | null;
  drawing: Drawing;
  onAlertDrawing?: (drawing: Drawing) => void;
}) {
  const [tplOpen, setTplOpen] = useState(false);
  const [templates, setTemplates] = useState<DrawingTemplate[]>(() => loadDrawingTemplates());
  const fib = drawing.fib;
  const isLinear =
    drawing.kind === "trend" ||
    drawing.kind === "arrow" ||
    drawing.kind === "ray" ||
    drawing.kind === "info" ||
    drawing.kind === "extended" ||
    drawing.kind === "hline" ||
    drawing.kind === "horzray";

  const refreshTpl = () => setTemplates(loadDrawingTemplates());

  const saveTpl = () => {
    const name = window.prompt("Template name", `${drawing.kind} style`);
    if (!name) return;
    const next = [createDrawingTemplate({ name, drawing }), ...loadDrawingTemplates()];
    saveDrawingTemplates(next);
    refreshTpl();
    setTplOpen(false);
  };

  const applyTpl = (tpl: DrawingTemplate) => {
    engine?.updateDrawing(drawing.id, templatePatch(tpl.style));
    setTplOpen(false);
  };

  return (
    <div className="obj-bar" onPointerDown={(e) => e.stopPropagation()}>
      {PALETTE.map((c) => (
        <button
          key={c}
          className={drawing.color === c ? "swatch on" : "swatch"}
          style={{ background: c }}
          title={c}
          onClick={() => engine?.updateDrawing(drawing.id, { color: c })}
        />
      ))}
      <span className="obj-sep" />
      {WIDTHS.map((w) => (
        <button
          key={w}
          className={(drawing.lineWidth ?? 1) === w ? "on" : ""}
          title={`Width ${w}`}
          onClick={() => engine?.updateDrawing(drawing.id, { lineWidth: w })}
        >
          <i className="width-mark" style={{ height: w + 1 }} />
        </button>
      ))}
      <span className="obj-sep" />
      {STYLES.map((s) => (
        <button
          key={s.id}
          className={(drawing.lineStyle ?? "solid") === s.id ? "on" : ""}
          title={s.id}
          onClick={() => engine?.updateDrawing(drawing.id, { lineStyle: s.id })}
        >
          {s.label}
        </button>
      ))}
      {isLinear ? (
        <>
          <span className="obj-sep" />
          <button
            className={fib?.extendLeft ? "on" : ""}
            title="Extend left"
            onClick={() =>
              engine?.updateDrawing(drawing.id, {
                fib: { ...(fib ?? resolveFibStyleForKind(drawing)), extendLeft: !fib?.extendLeft },
              })
            }
          >
            ⬅
          </button>
          <button
            className={fib?.extendRight ? "on" : ""}
            title="Extend right"
            onClick={() =>
              engine?.updateDrawing(drawing.id, {
                fib: { ...(fib ?? resolveFibStyleForKind(drawing)), extendRight: !fib?.extendRight },
              })
            }
          >
            ➡
          </button>
          <select
            title="Left end"
            value={drawing.leftEnd ?? "normal"}
            onChange={(e) => engine?.updateDrawing(drawing.id, { leftEnd: e.target.value as LineEnd })}
          >
            <option value="normal">L ·</option>
            <option value="arrow">L ▶</option>
            <option value="circle">L ●</option>
          </select>
          <select
            title="Right end"
            value={drawing.rightEnd ?? (drawing.kind === "arrow" ? "arrow" : "normal")}
            onChange={(e) => engine?.updateDrawing(drawing.id, { rightEnd: e.target.value as LineEnd })}
          >
            <option value="normal">R ·</option>
            <option value="arrow">R ▶</option>
            <option value="circle">R ●</option>
          </select>
        </>
      ) : null}
      <span className="obj-sep" />
      <button title="Alert on drawing" onClick={() => onAlertDrawing?.(drawing)}>
        ⏰
      </button>
      <div className="tpl-mini">
        <button title="Drawing template" className={tplOpen ? "on" : ""} onClick={() => { refreshTpl(); setTplOpen((v) => !v); }}>
          ▤
        </button>
        {tplOpen ? (
          <div className="tpl-mini-menu" onPointerDown={(e) => e.stopPropagation()}>
            <button type="button" onClick={saveTpl}>Save template…</button>
            {templates.map((tpl) => (
              <button key={tpl.id} type="button" title={drawingTemplateSummary(tpl)} onClick={() => applyTpl(tpl)}>
                {tpl.name}
              </button>
            ))}
            {!templates.length ? <div className="tpl-empty">No templates yet</div> : null}
          </div>
        ) : null}
      </div>
      <button title="Settings" onClick={() => engine?.openDrawingProperties(drawing.id)}>
        ⚙
      </button>
      <button
        className={drawing.locked ? "on" : ""}
        title={drawing.locked ? "Unlock" : "Lock"}
        onClick={() => engine?.updateDrawing(drawing.id, { locked: !drawing.locked })}
      >
        {drawing.locked ? "🔒" : "🔓"}
      </button>
      <button
        className={drawing.visible === false ? "on" : ""}
        title={drawing.visible === false ? "Show" : "Hide"}
        onClick={() => engine?.updateDrawing(drawing.id, { visible: drawing.visible === false })}
      >
        {drawing.visible === false ? "○" : "◉"}
      </button>
      <button title="Clone" onClick={() => engine?.cloneDrawing(drawing.id)}>
        ⎘
      </button>
      <button title="Remove" onClick={() => engine?.removeDrawing(drawing.id)}>
        ⌫
      </button>
    </div>
  );
}

function DrawingPropertiesDialog({ engine, drawing }: { engine: ChartEngine | null; drawing: Drawing }) {
  const [tab, setTab] = useState<DrawTab>("Style");
  const vis = { ...DEFAULT_DRAWING_VISIBILITY, ...drawing.visibility };
  const textOk = hasTextField(drawing.kind);

  useEffect(() => {
    if (tab === "Text" && !textOk) setTab("Style");
  }, [tab, textOk]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        engine?.closeDrawingProperties();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [engine]);

  return (
    <div className="ind-card ind-card-tabs draw-props-card" onPointerDown={(e) => e.stopPropagation()}>
      <header>
        <b>{toolLabelForDraw(drawing.kind)}</b>
        <button type="button" onClick={() => engine?.closeDrawingProperties()} aria-label="Close">
          ×
        </button>
      </header>
      <div className="ind-tab-row">
        {DRAW_TABS.filter((item) => item !== "Text" || textOk).map((item) => (
          <button key={item} type="button" className={tab === item ? "on" : ""} onClick={() => setTab(item)}>
            {item}
          </button>
        ))}
      </div>
      {tab === "Style" ? (
        <div className="ind-tab-panel">
          {FIB_STYLE_KINDS.has(drawing.kind) ? (
            <FibRetraceStylePanel engine={engine} drawing={drawing} />
          ) : PATTERN_STYLE_KINDS.has(drawing.kind) ? (
            <PatternStylePanel engine={engine} drawing={drawing} />
          ) : (
            <>
              <label className="row">
                Color
                <span className="swatch-row">
                  {PALETTE.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={drawing.color === c ? "swatch on" : "swatch"}
                      style={{ background: c }}
                      onClick={() => engine?.updateDrawing(drawing.id, { color: c })}
                    />
                  ))}
                </span>
              </label>
              <label className="row">
                Line style
                <span className="style-row">
                  {STYLES.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className={(drawing.lineStyle ?? "solid") === s.id ? "on" : ""}
                      onClick={() => engine?.updateDrawing(drawing.id, { lineStyle: s.id })}
                    >
                      {s.label}
                    </button>
                  ))}
                </span>
              </label>
              <label className="row">
                Thickness
                <select
                  value={drawing.lineWidth ?? 1}
                  onChange={(e) => engine?.updateDrawing(drawing.id, { lineWidth: Number(e.target.value) })}
                >
                  {WIDTHS.map((w) => (
                    <option key={w} value={w}>
                      {w}
                    </option>
                  ))}
                </select>
              </label>
              <label className="row check-row">
                <input
                  type="checkbox"
                  checked={!!drawing.locked}
                  onChange={() => engine?.updateDrawing(drawing.id, { locked: !drawing.locked })}
                />
                Locked
              </label>
            </>
          )}
        </div>
      ) : null}
      {tab === "Text" && textOk ? (
        <div className="ind-tab-panel">
          <label className="row stack-row">
            Text
            <textarea
              rows={3}
              value={drawing.text ?? ""}
              onChange={(e) => engine?.updateDrawing(drawing.id, { text: e.target.value })}
            />
          </label>
        </div>
      ) : null}
      {tab === "Coordinates" ? (
        <div className="ind-tab-panel">
          {drawing.points.map((pt, index) => (
            <div key={index} className="coord-block">
              <div className="fly-title">Point {index + 1}</div>
              <label className="row stack-row">
                Time (UTC)
                <input
                  type="datetime-local"
                  step={1}
                  value={toLocalInput(pt.time)}
                  onChange={(e) => {
                    const time = fromLocalInput(e.target.value);
                    if (time == null) return;
                    engine?.setDrawingPoint(drawing.id, index, { time, price: pt.price });
                  }}
                />
              </label>
              <label className="row">
                Price
                <input
                  type="number"
                  step="any"
                  value={pt.price}
                  onChange={(e) => {
                    const price = Number(e.target.value);
                    if (!Number.isFinite(price)) return;
                    engine?.setDrawingPoint(drawing.id, index, { time: pt.time, price });
                  }}
                />
              </label>
            </div>
          ))}
          {!drawing.points.length ? <p className="hint">No anchors on this drawing.</p> : null}
        </div>
      ) : null}
      {tab === "Visibility" ? (
        <div className="ind-tab-panel">
          <label className="row check-row">
            <input
              type="checkbox"
              checked={drawing.visible !== false}
              onChange={() => engine?.updateDrawing(drawing.id, { visible: drawing.visible === false })}
            />
            Visible on chart
          </label>
          <p className="hint">Show on these chart intervals</p>
          {VIS_ROWS.map((row) => (
            <label key={row.key} className="row check-row">
              <input
                type="checkbox"
                checked={vis[row.key]}
                onChange={() =>
                  engine?.updateDrawing(drawing.id, {
                    visibility: { ...vis, [row.key]: !vis[row.key] },
                  })
                }
              />
              {row.label}
            </label>
          ))}
        </div>
      ) : null}
      <div className="ind-actions">
        <button type="button" onClick={() => engine?.cloneDrawing(drawing.id)}>
          Clone
        </button>
        <button
          type="button"
          className="danger"
          onClick={() => {
            engine?.removeDrawing(drawing.id);
            engine?.closeDrawingProperties();
          }}
        >
          Remove
        </button>
      </div>
    </div>
  );
}

const FIB_STYLE_KINDS = new Set([
  "fib",
  "fibext",
  "fibchannel",
  "fibtimezone",
  "fibfan",
  "fibtime",
  "fibcircles",
  "fibspiral",
  "fibarcs",
  "fibwedge",
  "pitchfan",
  "pitchfork",
  "schiff",
  "modschiff",
  "insidepitchfork",
  "gannbox",
  "gannsquare",
  "gannsquarefixed",
  "gannfan",
]);

const PATTERN_STYLE_KINDS = new Set([
  "xabcd",
  "cypher",
  "abcd",
  "headshoulders",
  "trianglepattern",
  "threedrives",
  "elliottimpulse",
  "elliottcorrection",
  "elliotttriangle",
  "elliottdouble",
  "elliotttriple",
  "cycliclines",
  "timecycles",
  "sineline",
  "long",
  "short",
  "forecast",
  "daterange",
  "pricerange",
  "datepricerange",
  "barspattern",
  "ghostfeed",
  "projection",
  "sector",
  "volprofile",
  "anchoredvolprofile",
  "measure",
  "brush",
  "highlighter",
  "rect",
  "rotatedrect",
  "path",
  "circle",
  "ellipse",
  "polyline",
  "triangle",
  "arc",
  "curve",
  "doublecurve",
  "text",
  "anchoredtext",
  "note",
  "anchorednote",
  "signpost",
  "callout",
  "comment",
  "pricelabel",
  "pricenote",
  "arrowmarker",
  "arrowmarkleft",
  "arrowmarkright",
  "arrowup",
  "arrowdown",
  "flagmark",
  "sticker",
  "table",
  "image",
  "trend",
  "arrow",
  "ray",
  "info",
  "extended",
  "trendangle",
  "hline",
  "horzray",
  "vline",
  "crossline",
  "parallel",
  "regression",
  "flattop",
  "disjoint",
  "anchoredvwap",
]);

function PatternStylePanel({ engine, drawing }: { engine: ChartEngine | null; drawing: Drawing }) {
  const fib = resolveFibStyleForKind(drawing);
  const resetDefaults = () => defaultPatternStyle(drawing.kind);
  const patchFib = (next: Partial<FibRetraceStyle>) => {
    engine?.updateDrawing(drawing.id, { fib: { ...fib, ...next } });
  };
  const isPosition = drawing.kind === "long" || drawing.kind === "short";
  const isCycle = drawing.kind === "cycliclines" || drawing.kind === "timecycles" || drawing.kind === "sineline";
  const isTrendLine =
    drawing.kind === "trend" ||
    drawing.kind === "arrow" ||
    drawing.kind === "ray" ||
    drawing.kind === "info" ||
    drawing.kind === "extended" ||
    drawing.kind === "trendangle" ||
    drawing.kind === "hline" ||
    drawing.kind === "horzray" ||
    drawing.kind === "vline" ||
    drawing.kind === "crossline";
  const isChannel =
    drawing.kind === "parallel" || drawing.kind === "regression" || drawing.kind === "flattop" || drawing.kind === "disjoint";
  const isAvwap = drawing.kind === "anchoredvwap";
  return (
    <div className="fib-style-panel">
      <label className="row check-row">
        <input
          type="checkbox"
          checked={fib.showBackground}
          onChange={() => patchFib({ showBackground: !fib.showBackground })}
        />
        {isPosition
          ? "Risk / reward fill"
          : isChannel || isAvwap
            ? "Channel / band fill"
            : isTrendLine
              ? "Label background"
              : "Background fill"}
      </label>
      <label className="row check-row">
        <input type="checkbox" checked={fib.showLevels} onChange={() => patchFib({ showLevels: !fib.showLevels })} />
        {isPosition
          ? "Entry labels"
          : isCycle
            ? "Cycle / phase labels"
            : isAvwap || drawing.kind === "regression"
              ? "Band / σ labels"
              : isChannel
                ? "Middle line / labels"
                : isTrendLine
                  ? "Angle / axis labels"
                  : "Point labels"}
      </label>
      <label className="row check-row">
        <input type="checkbox" checked={fib.showPrices} onChange={() => patchFib({ showPrices: !fib.showPrices })} />
        {isPosition
          ? "Prices & RR"
          : isCycle
            ? "Period readout"
            : isTrendLine || isChannel
              ? "Price / % stats"
              : "Leg ratios"}
      </label>
      {(drawing.kind.startsWith("elliott") || drawing.kind === "sineline") && (
        <label className="row check-row">
          <input
            type="checkbox"
            checked={fib.showTrendLine}
            onChange={() => patchFib({ showTrendLine: !fib.showTrendLine })}
          />
          {drawing.kind === "sineline" ? "Baseline" : "Guide / channel"}
        </label>
      )}
      {(isCycle || isTrendLine || isChannel || isAvwap) && (
        <>
          <label className="row check-row">
            <input
              type="checkbox"
              checked={fib.extendLeft}
              onChange={() => patchFib({ extendLeft: !fib.extendLeft })}
            />
            Extend left
          </label>
          <label className="row check-row">
            <input
              type="checkbox"
              checked={fib.extendRight}
              onChange={() => patchFib({ extendRight: !fib.extendRight })}
            />
            Extend right
          </label>
          {(isTrendLine || isChannel) && (
            <label className="row check-row">
              <input
                type="checkbox"
                checked={fib.showStats ?? fib.showPrices}
                onChange={() => patchFib({ showStats: !(fib.showStats ?? fib.showPrices) })}
              />
              Stats on line
            </label>
          )}
          {isTrendLine && (
            <>
              <label className="row">
                Left end
                <select
                  value={drawing.leftEnd ?? "normal"}
                  onChange={(e) => engine?.updateDrawing(drawing.id, { leftEnd: e.target.value as LineEnd })}
                >
                  <option value="normal">Normal</option>
                  <option value="arrow">Arrow</option>
                  <option value="circle">Circle</option>
                </select>
              </label>
              <label className="row">
                Right end
                <select
                  value={drawing.rightEnd ?? (drawing.kind === "arrow" ? "arrow" : "normal")}
                  onChange={(e) => engine?.updateDrawing(drawing.id, { rightEnd: e.target.value as LineEnd })}
                >
                  <option value="normal">Normal</option>
                  <option value="arrow">Arrow</option>
                  <option value="circle">Circle</option>
                </select>
              </label>
            </>
          )}
        </>
      )}
      <label className="row">
        Line color
        <span className="swatch-row">
          {PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              className={fib.trendColor === c ? "swatch on" : "swatch"}
              style={{ background: c }}
              onClick={() => patchFib({ trendColor: c })}
            />
          ))}
        </span>
      </label>
      <label className="row">
        Thickness
        <select value={fib.trendWidth} onChange={(e) => patchFib({ trendWidth: Number(e.target.value) })}>
          {WIDTHS.map((w) => (
            <option key={w} value={w}>
              {w}
            </option>
          ))}
        </select>
      </label>
      <label className="row">
        Line style
        <span className="style-row">
          {STYLES.map((s) => (
            <button
              key={s.id}
              type="button"
              className={fib.trendStyle === s.id || fib.levelsStyle === s.id ? "on" : ""}
              onClick={() => patchFib({ trendStyle: s.id, levelsStyle: s.id })}
            >
              {s.label}
            </button>
          ))}
        </span>
      </label>
      <button
        type="button"
        className="fib-reset"
        onClick={() => engine?.updateDrawing(drawing.id, { fib: resetDefaults() })}
      >
        Reset to Supercharts defaults
      </button>
      <label className="row check-row">
        <input
          type="checkbox"
          checked={!!drawing.locked}
          onChange={() => engine?.updateDrawing(drawing.id, { locked: !drawing.locked })}
        />
        Locked
      </label>
    </div>
  );
}

function FibRetraceStylePanel({ engine, drawing }: { engine: ChartEngine | null; drawing: Drawing }) {
  const fib = resolveFibStyleForKind(drawing);
  const resetDefaults = () => defaultFibStyleForKind(drawing.kind) ?? fib;

  const patchFib = (next: Partial<FibRetraceStyle>) => {
    engine?.updateDrawing(drawing.id, { fib: { ...fib, ...next } });
  };

  const patchLevel = (index: number, patch: Partial<FibLevelStyle>) => {
    const levels = fib.levels.map((l, i) => (i === index ? { ...l, ...patch } : { ...l }));
    patchFib({ levels });
  };

  const trendLabel =
    drawing.kind === "fibext"
      ? "Trend lines (A–B / B–C)"
      : drawing.kind === "fibchannel" || drawing.kind.startsWith("pitch") || drawing.kind.includes("schiff")
        ? "Base / median guide"
        : drawing.kind.startsWith("gann")
          ? "Anchor line"
          : "Trend line";

  return (
    <div className="fib-style-panel">
      <label className="row check-row">
        <input
          type="checkbox"
          checked={fib.showTrendLine}
          onChange={() => patchFib({ showTrendLine: !fib.showTrendLine })}
        />
        {trendLabel}
      </label>
      <label className="row">
        Trend style
        <span className="style-row">
          {STYLES.map((s) => (
            <button
              key={s.id}
              type="button"
              className={fib.trendStyle === s.id ? "on" : ""}
              onClick={() => patchFib({ trendStyle: s.id })}
            >
              {s.label}
            </button>
          ))}
        </span>
      </label>
      <label className="row check-row">
        <input type="checkbox" checked={fib.extendLeft} onChange={() => patchFib({ extendLeft: !fib.extendLeft })} />
        Extend left
      </label>
      <label className="row check-row">
        <input type="checkbox" checked={fib.extendRight} onChange={() => patchFib({ extendRight: !fib.extendRight })} />
        Extend right
      </label>
      <label className="row check-row">
        <input type="checkbox" checked={fib.reverse} onChange={() => patchFib({ reverse: !fib.reverse })} />
        Reverse
      </label>
      <label className="row check-row">
        <input
          type="checkbox"
          checked={fib.showBackground}
          onChange={() => patchFib({ showBackground: !fib.showBackground })}
        />
        Background fill
      </label>
      <label className="row check-row">
        <input type="checkbox" checked={fib.showLevels} onChange={() => patchFib({ showLevels: !fib.showLevels })} />
        Level values
      </label>
      <label className="row check-row">
        <input type="checkbox" checked={fib.showPrices} onChange={() => patchFib({ showPrices: !fib.showPrices })} />
        Prices / ranges
      </label>
      {drawing.kind === "gannsquarefixed" ? (
        <p className="hint">
          Scale ratio locked
          {drawing.scaleRatio != null && Number.isFinite(drawing.scaleRatio)
            ? `: ${drawing.scaleRatio.toPrecision(5)} price/bar`
            : " at creation"}
        </p>
      ) : null}
      <label className="row">
        Levels width
        <select value={fib.levelsWidth} onChange={(e) => patchFib({ levelsWidth: Number(e.target.value) })}>
          {WIDTHS.map((w) => (
            <option key={w} value={w}>
              {w}
            </option>
          ))}
        </select>
      </label>
      <label className="row">
        Levels style
        <span className="style-row">
          {STYLES.map((s) => (
            <button
              key={s.id}
              type="button"
              className={fib.levelsStyle === s.id ? "on" : ""}
              onClick={() => patchFib({ levelsStyle: s.id })}
            >
              {s.label}
            </button>
          ))}
        </span>
      </label>
      <div className="fly-title">Levels</div>
      <div className="fib-level-list">
        {fib.levels.map((lvl, index) => (
          <div key={`${lvl.ratio}-${index}`} className="fib-level-row">
            <input
              type="checkbox"
              checked={lvl.visible}
              onChange={() => patchLevel(index, { visible: !lvl.visible })}
              title="Toggle level"
            />
            <input
              type="number"
              step="0.001"
              className="fib-ratio"
              value={lvl.ratio}
              onChange={(e) => {
                const ratio = Number(e.target.value);
                if (!Number.isFinite(ratio)) return;
                patchLevel(index, { ratio });
              }}
              title={formatFibRatio(lvl.ratio)}
            />
            <input
              type="color"
              className="fib-color"
              value={lvl.color.length === 7 ? lvl.color : "#2962ff"}
              onChange={(e) => patchLevel(index, { color: e.target.value })}
              title="Level color"
            />
          </div>
        ))}
      </div>
      <button
        type="button"
        className="fib-reset"
        onClick={() => engine?.updateDrawing(drawing.id, { fib: resetDefaults() })}
      >
        Reset to Supercharts defaults
      </button>
      <label className="row check-row">
        <input
          type="checkbox"
          checked={!!drawing.locked}
          onChange={() => engine?.updateDrawing(drawing.id, { locked: !drawing.locked })}
        />
        Locked
      </label>
    </div>
  );
}

function DrawingContextMenu({
  engine,
  drawing,
  x,
  y,
  onAlertDrawing,
}: {
  engine: ChartEngine | null;
  drawing: Drawing;
  x: number;
  y: number;
  onAlertDrawing?: (drawing: Drawing) => void;
}) {
  useEffect(() => {
    const close = () => engine?.closeDrawingMenu();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [engine]);

  const left = Math.min(x, window.innerWidth - 220);
  const top = Math.min(y, window.innerHeight - 320);

  const saveTpl = () => {
    const name = window.prompt("Template name", `${drawing.kind} style`);
    if (!name) return;
    const next = [createDrawingTemplate({ name, drawing }), ...loadDrawingTemplates()];
    saveDrawingTemplates(next);
    engine?.closeDrawingMenu();
  };

  return (
    <div
      className="draw-ctx-menu"
      style={{ left, top }}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => {
          engine?.openDrawingProperties(drawing.id);
        }}
      >
        Settings…
      </button>
      <button
        type="button"
        onClick={() => {
          onAlertDrawing?.(drawing);
          engine?.closeDrawingMenu();
        }}
      >
        Add alert…
      </button>
      <button type="button" onClick={saveTpl}>
        Save as template…
      </button>
      <div className="ctx-sep" />
      <button type="button" onClick={() => { engine?.reorderDrawing(drawing.id, "front"); engine?.closeDrawingMenu(); }}>
        Bring to front
      </button>
      <button type="button" onClick={() => { engine?.reorderDrawing(drawing.id, "forward"); engine?.closeDrawingMenu(); }}>
        Bring forward
      </button>
      <button type="button" onClick={() => { engine?.reorderDrawing(drawing.id, "backward"); engine?.closeDrawingMenu(); }}>
        Send backward
      </button>
      <button type="button" onClick={() => { engine?.reorderDrawing(drawing.id, "back"); engine?.closeDrawingMenu(); }}>
        Send to back
      </button>
      <div className="ctx-sep" />
      <button type="button" onClick={() => { engine?.cloneDrawing(drawing.id); }}>
        Clone
      </button>
      <button
        type="button"
        onClick={() => {
          engine?.updateDrawing(drawing.id, { locked: !drawing.locked });
          engine?.closeDrawingMenu();
        }}
      >
        {drawing.locked ? "Unlock" : "Lock"}
      </button>
      <button
        type="button"
        onClick={() => {
          engine?.updateDrawing(drawing.id, { visible: drawing.visible === false });
          engine?.closeDrawingMenu();
        }}
      >
        {drawing.visible === false ? "Show" : "Hide"}
      </button>
      <div className="ctx-sep" />
      <button
        type="button"
        className="danger"
        onClick={() => {
          engine?.removeDrawing(drawing.id);
        }}
      >
        Remove
      </button>
    </div>
  );
}

function IndicatorEditor({
  engine,
  ind,
  onClose,
}: {
  engine: ChartEngine | null;
  ind: IndicatorInstance;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<EditorTab>("Inputs");
  const inputs = indicatorInputs(ind.kind);
  const showSource = ind.kind !== "vol" && ind.kind !== "vwap";

  return (
    <div className="ind-card ind-card-tabs" onPointerDown={(e) => e.stopPropagation()}>
      <header>
        <b>{indicatorTitle(ind.kind)}</b>
        <button onClick={onClose}>×</button>
      </header>
      <div className="ind-tab-row">
        {EDITOR_TABS.map((item) => (
          <button key={item} type="button" className={tab === item ? "on" : ""} onClick={() => setTab(item)}>
            {item}
          </button>
        ))}
      </div>
      {tab === "Inputs" ? (
        <div className="ind-tab-panel">
          {showSource ? (
            <label className="row">
              Source
              <select
                value={ind.source ?? "close"}
                onChange={(e) => engine?.updateIndicator(ind.id, { source: e.target.value as ChartSource })}
              >
                {SOURCES.map((source) => (
                  <option key={source} value={source}>
                    {source.toUpperCase()}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {inputs.map((inp) => (
            <label key={inp.index} className="row">
              {inp.label}
              <input
                type="number"
                value={ind.params[inp.index] ?? ""}
                onChange={(e) => {
                  const next = [...ind.params];
                  next[inp.index] = Number(e.target.value) || 1;
                  engine?.updateIndicator(ind.id, { params: next });
                }}
              />
            </label>
          ))}
          {!inputs.length && !showSource ? <p className="hint">No configurable inputs.</p> : null}
          <label className="row">
            Pane
            <select
              value={ind.pane}
              onChange={(e) => engine?.updateIndicator(ind.id, { pane: e.target.value as IndicatorInstance["pane"] })}
            >
              <option value="main">Overlay</option>
              <option value="rsi">RSI pane</option>
              <option value="macd">MACD pane</option>
              <option value="stoch">Stoch pane</option>
              <option value="atr">ATR pane</option>
              <option value="volume">Volume</option>
            </select>
          </label>
          {(ind.kind === "rsi" || ind.kind === "stoch" || (ind.levels && ind.levels.length)) ? (
            <label className="row">
              Levels
              <input
                type="text"
                value={(ind.levels ?? (ind.kind === "rsi" ? [30, 50, 70] : ind.kind === "stoch" ? [20, 50, 80] : [])).join(", ")}
                onChange={(e) => {
                  const levels = e.target.value.split(/[\s,]+/).map(Number).filter((n) => Number.isFinite(n));
                  engine?.updateIndicator(ind.id, { levels });
                }}
              />
            </label>
          ) : null}
        </div>
      ) : null}
      {tab === "Style" ? (
        <div className="ind-tab-panel">
          <label className="row">
            Color
            <span className="swatch-row">
              {PALETTE.map((c) => (
                <button
                  key={c}
                  className={ind.color === c ? "swatch on" : "swatch"}
                  style={{ background: c }}
                  onClick={() => engine?.updateIndicator(ind.id, { color: c })}
                />
              ))}
            </span>
          </label>
          <label className="row">
            Line style
            <span className="style-row">
              {STYLES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={(ind.lineStyle ?? "solid") === s.id ? "on" : ""}
                  onClick={() => engine?.updateIndicator(ind.id, { lineStyle: s.id })}
                >
                  {s.label}
                </button>
              ))}
            </span>
          </label>
          <label className="row">
            Thickness
            <select
              value={ind.lineWidth ?? 1}
              onChange={(e) => engine?.updateIndicator(ind.id, { lineWidth: Number(e.target.value) })}
            >
              {WIDTHS.map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}
      {tab === "Visibility" ? (
        <div className="ind-tab-panel">
          <label className="row check-row">
            <input type="checkbox" checked={ind.visible} onChange={() => engine?.toggleIndicator(ind.id)} />
            Visible on chart
          </label>
          {VIS_ROWS.map((row) => {
            const vis = { ...DEFAULT_INDICATOR_VISIBILITY, ...ind.visibility };
            return (
              <label key={row.key} className="row check-row">
                <input
                  type="checkbox"
                  checked={vis[row.key]}
                  onChange={() =>
                    engine?.updateIndicator(ind.id, {
                      visibility: { ...vis, [row.key]: !vis[row.key] },
                    })
                  }
                />
                {row.label}
              </label>
            );
          })}
        </div>
      ) : null}
      <div className="ind-actions">
        <button onClick={() => engine?.toggleIndicator(ind.id)}>{ind.visible ? "Hide" : "Show"}</button>
        <button
          className="danger"
          onClick={() => {
            engine?.removeIndicator(ind.id);
            onClose();
          }}
        >
          Remove
        </button>
      </div>
    </div>
  );
}
