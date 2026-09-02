import { useEffect, useMemo, useRef, useState } from "react";
import {
  createTemplate,
  findBoundTemplate,
  loadActiveTemplateId,
  loadTemplates,
  saveActiveTemplateId,
  saveTemplates,
  templateSummary,
  type IndicatorTemplate,
} from "../data/indicatorTemplates";
import type { ChartEngine } from "../engine/ChartEngine";
import type { Interval } from "../engine/types";
import { useEngine } from "./useEngine";

type Props = {
  engine: ChartEngine | null;
};

export function IndicatorTemplatesMenu({ engine }: Props) {
  const snap = useEngine(engine);
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<IndicatorTemplate[]>(() => loadTemplates());
  const [activeId, setActiveId] = useState<string | null>(() => loadActiveTemplateId());
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [remember, setRemember] = useState(true);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const active = useMemo(() => templates.find((tpl) => tpl.id === activeId) ?? null, [activeId, templates]);
  const symbol = snap?.symbol.ticker ?? "";
  const interval = (snap?.interval ?? "15") as Interval;

  useEffect(() => {
    saveTemplates(templates);
  }, [templates]);

  useEffect(() => {
    saveActiveTemplateId(activeId);
  }, [activeId]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setSaving(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // Auto-apply templates bound to the current symbol + interval.
  const lastBoundKey = useRef<string>("");
  useEffect(() => {
    if (!engine || !symbol) return;
    const key = `${symbol}::${interval}`;
    const bound = findBoundTemplate(templates, symbol, interval);
    if (!bound) {
      lastBoundKey.current = key;
      return;
    }
    if (lastBoundKey.current === `${key}::${bound.id}` && activeId === bound.id) return;
    engine.setIndicatorsFromTemplate(bound.indicators);
    setActiveId(bound.id);
    lastBoundKey.current = `${key}::${bound.id}`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, symbol, interval, templates]);

  const applyTemplate = (tpl: IndicatorTemplate) => {
    engine?.setIndicatorsFromTemplate(tpl.indicators);
    setActiveId(tpl.id);
    setOpen(false);
    setSaving(false);
  };

  const beginSave = () => {
    const suggested =
      remember && symbol ? `${symbol} · ${interval}` : active?.name ? `${active.name} copy` : "My template";
    setName(suggested);
    setRemember(true);
    setSaving(true);
  };

  const confirmSave = () => {
    if (!snap) return;
    const tpl = createTemplate({
      name,
      indicators: snap.indicators,
      bindSymbol: remember ? symbol : null,
      bindInterval: remember ? interval : null,
    });
    setTemplates((prev) => [tpl, ...prev]);
    setActiveId(tpl.id);
    setSaving(false);
    setOpen(false);
  };

  const updateActive = (keepBinding: boolean) => {
    if (!snap || !active) return;
    setTemplates((prev) =>
      prev.map((tpl) =>
        tpl.id === active.id
          ? {
              ...tpl,
              updatedAt: Date.now(),
              indicators: snap.indicators.map((ind) => ({
                kind: ind.kind,
                params: [...ind.params],
                visible: ind.visible,
                color: ind.color,
                lineWidth: ind.lineWidth,
                lineStyle: ind.lineStyle,
                source: ind.source,
                pane: ind.pane,
              })),
              bindSymbol: keepBinding ? symbol : null,
              bindInterval: keepBinding ? interval : null,
            }
          : tpl,
      ),
    );
    setOpen(false);
    setSaving(false);
  };

  const removeTemplate = (id: string) => {
    setTemplates((prev) => prev.filter((tpl) => tpl.id !== id));
    if (activeId === id) setActiveId(null);
  };

  const clearBinding = (id: string) => {
    setTemplates((prev) =>
      prev.map((tpl) => (tpl.id === id ? { ...tpl, bindSymbol: null, bindInterval: null, updatedAt: Date.now() } : tpl)),
    );
  };

  return (
    <div className="menu-wrap tpl-wrap" ref={wrapRef}>
      <button
        type="button"
        className={open ? "tb-icon on" : "tb-icon"}
        title="Indicator templates"
        aria-label="Indicator templates"
        onClick={() => {
          setOpen((v) => !v);
          setSaving(false);
        }}
      >
        ▦
      </button>
      {open ? (
        <div className="menu wide tpl-menu">
          <div className="tpl-menu-head">
            <strong>Indicator templates</strong>
            {active ? <span className="tpl-active">Active: {active.name}</span> : <span className="tpl-active">No active template</span>}
          </div>

          {saving ? (
            <div className="tpl-save">
              <label>
                Template name
                <input value={name} onChange={(e) => setName(e.target.value)} autoFocus onKeyDown={(e) => e.key === "Enter" && confirmSave()} />
              </label>
              <label className="tpl-check">
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                Remember for {symbol || "symbol"} · {interval}
              </label>
              <div className="tpl-save-actions">
                <button type="button" className="primary" onClick={confirmSave} disabled={!name.trim()}>
                  Save
                </button>
                <button type="button" onClick={() => setSaving(false)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <button type="button" onClick={beginSave}>
                Save indicator template…
              </button>
              {active ? (
                <button type="button" onClick={() => updateActive(!!(active.bindSymbol && active.bindInterval))}>
                  Update “{active.name}”
                </button>
              ) : null}
              <div className="tpl-sep" />
              {templates.map((tpl) => (
                <div key={tpl.id} className={`tpl-row${tpl.id === activeId ? " on" : ""}`}>
                  <button type="button" className="tpl-apply" onClick={() => applyTemplate(tpl)} title={templateSummary(tpl)}>
                    <b>{tpl.name}</b>
                    <em>{templateSummary(tpl)}</em>
                  </button>
                  <div className="tpl-row-actions">
                    {tpl.bindSymbol && tpl.bindInterval ? (
                      <button type="button" title="Clear symbol/interval binding" onClick={() => clearBinding(tpl.id)}>
                        ⌂
                      </button>
                    ) : null}
                    <button type="button" title="Delete template" onClick={() => removeTemplate(tpl.id)}>
                      ×
                    </button>
                  </div>
                </div>
              ))}
              {!templates.length ? <div className="tpl-empty">No templates yet.</div> : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
