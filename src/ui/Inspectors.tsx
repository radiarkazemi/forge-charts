import { useEffect, useState } from "react";
import { indicatorInputs, indicatorTitle, toolLabelForDraw } from "../catalog";
import type { ChartEngine } from "../engine/ChartEngine";
import { defaultFibChannelStyle, defaultFibExtensionStyle, defaultFibRetraceStyle, formatFibRatio, resolveFibChannelStyle, resolveFibExtStyle, resolveFibStyle } from "../engine/drawings";
import type {
  ChartSource,
  Drawing,
  DrawingVisibility,
  FibLevelStyle,
  FibRetraceStyle,
  IndicatorInstance,
  LineStyle,
} from "../engine/types";
import { DEFAULT_DRAWING_VISIBILITY } from "../engine/types";
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

export function ChartInspectors({ engine }: { engine: ChartEngine | null }) {
  const snap = useEngine(engine);
  const [indOpen, setIndOpen] = useState<string | null>(null);
  const selected = snap?.drawings.find((d) => d.id === snap.selectedId) ?? null;
  const propsDrawing = snap?.drawings.find((d) => d.id === snap.drawingPropsId) ?? null;
  const menuDrawing = snap?.drawings.find((d) => d.id === snap.drawingMenu?.id) ?? null;
  const editingInd = snap?.indicators.find((i) => i.id === (indOpen ?? snap.selectedIndicatorId)) ?? null;

  if (!snap) return null;
  return (
    <>
      <div className="legend">
        {snap.legend
          .filter((l) => l.id !== "sym" && l.id !== "cmp")
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
                  <button title="Remove" onClick={(e) => { e.stopPropagation(); engine?.removeIndicator(ind.id); }}>
                    ×
                  </button>
                </span>
              </div>
            );
          })}
      </div>
      {selected && !propsDrawing ? <DrawingEditor engine={engine} drawing={selected} /> : null}
      {propsDrawing ? <DrawingPropertiesDialog engine={engine} drawing={propsDrawing} /> : null}
      {menuDrawing && snap.drawingMenu ? (
        <DrawingContextMenu
          engine={engine}
          drawing={menuDrawing}
          x={snap.drawingMenu.x}
          y={snap.drawingMenu.y}
        />
      ) : null}
      {editingInd && indOpen === editingInd.id ? (
        <IndicatorEditor
          engine={engine}
          ind={editingInd}
          onClose={() => setIndOpen(null)}
        />
      ) : null}
    </>
  );
}

function DrawingEditor({ engine, drawing }: { engine: ChartEngine | null; drawing: Drawing }) {
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
      <span className="obj-sep" />
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
          {drawing.kind === "fib" || drawing.kind === "fibext" || drawing.kind === "fibchannel" ? (
            <FibRetraceStylePanel engine={engine} drawing={drawing} />
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

function FibRetraceStylePanel({ engine, drawing }: { engine: ChartEngine | null; drawing: Drawing }) {
  const isExt = drawing.kind === "fibext";
  const isChannel = drawing.kind === "fibchannel";
  const fib = isExt
    ? resolveFibExtStyle(drawing)
    : isChannel
      ? resolveFibChannelStyle(drawing)
      : resolveFibStyle(drawing);
  const resetDefaults = () =>
    isExt ? defaultFibExtensionStyle() : isChannel ? defaultFibChannelStyle() : defaultFibRetraceStyle();

  const patchFib = (next: Partial<FibRetraceStyle>) => {
    engine?.updateDrawing(drawing.id, { fib: { ...fib, ...next } });
  };

  const patchLevel = (index: number, patch: Partial<FibLevelStyle>) => {
    const levels = fib.levels.map((l, i) => (i === index ? { ...l, ...patch } : { ...l }));
    patchFib({ levels });
  };

  const trendLabel = isExt ? "Trend lines (A–B / B–C)" : isChannel ? "Base trend line (A–B)" : "Trend line";

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
        Prices
      </label>
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
}: {
  engine: ChartEngine | null;
  drawing: Drawing;
  x: number;
  y: number;
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
  const top = Math.min(y, window.innerHeight - 280);

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
          <p className="hint">Per-timeframe visibility will mirror TradingView&apos;s Visibility tab in a later pass.</p>
          <label className="row check-row">
            <input type="checkbox" checked={ind.visible} onChange={() => engine?.toggleIndicator(ind.id)} />
            Visible on chart
          </label>
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
