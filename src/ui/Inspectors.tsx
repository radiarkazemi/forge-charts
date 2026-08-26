import { useState } from "react";
import { indicatorInputs, indicatorTitle } from "../catalog";
import type { ChartEngine } from "../engine/ChartEngine";
import type { ChartSource, Drawing, IndicatorInstance, LineStyle } from "../engine/types";
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

export function ChartInspectors({ engine }: { engine: ChartEngine | null }) {
  const snap = useEngine(engine);
  const [indOpen, setIndOpen] = useState<string | null>(null);
  const selected = snap?.drawings.find((d) => d.id === snap.selectedId) ?? null;
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
      {selected ? <DrawingEditor engine={engine} drawing={selected} /> : null}
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
      <button
        className={drawing.locked ? "on" : ""}
        title={drawing.locked ? "Unlock" : "Lock"}
        onClick={() => engine?.updateDrawing(drawing.id, { locked: !drawing.locked })}
      >
        {drawing.locked ? "🔒" : "🔓"}
      </button>
      <button title="Remove" onClick={() => engine?.removeDrawing(drawing.id)}>
        ⌫
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
