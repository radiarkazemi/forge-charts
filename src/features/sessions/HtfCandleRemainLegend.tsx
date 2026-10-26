/**
 * HTF candle remaining-time strip injected into the main-series legend
 * (after OHLC), blue — matching the Sessions+Midnight companion in TV samples.
 * Does not touch Sessions study Inputs / Style / defaults.
 */

import { useEffect } from "react";
import { useServices } from "@/app/use-services";
import { useStore } from "@/shared/hooks/useStore";
import { SESSIONS_STUDY_NAME } from "@/features/chart/sessions-indicator";

const ATTR = "data-forge-htf-candle-remain";
const COLOR = "#4594dc";

const HTF_STEPS = [
  { label: "4H", sec: 4 * 3600 },
  { label: "1H", sec: 3600 },
  { label: "30m", sec: 30 * 60 },
  { label: "15m", sec: 15 * 60 },
] as const;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function formatRemain(totalSec: number): string {
  const rem = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(rem / 3600);
  const m = Math.floor((rem % 3600) / 60);
  const s = rem % 60;
  if (h > 0) return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
  return `${pad2(m)}:${pad2(s)}`;
}

function remainForStep(stepSec: number, nowSec: number): number {
  return stepSec - (nowSec % stepSec);
}

export function formatHtfCandleRemainText(nowMs = Date.now()): string {
  const nowSec = Math.floor(nowMs / 1000);
  return HTF_STEPS.map(({ label, sec }, i) => {
    const prefix = i === 0 ? "" : " - ";
    return `${prefix}${label} Candle : ${formatRemain(remainForStep(sec, nowSec))}`;
  }).join("");
}

function chartDocs(): Document[] {
  const docs: Document[] = [document];
  try {
    for (const iframe of document.querySelectorAll("iframe")) {
      try {
        const doc = iframe.contentDocument;
        if (doc?.querySelector?.('[data-name="legend"]')) docs.push(doc);
      } catch {
        /* cross-origin */
      }
    }
  } catch {
    /* ignore */
  }
  return docs;
}

function sessionsStudyPresent(widget: {
  activeChart?: () => { getAllStudies?: () => { name?: string; id?: string }[] } | null;
} | null): boolean {
  try {
    const studies = widget?.activeChart?.()?.getAllStudies?.() ?? [];
    return studies.some((s) => {
      const name = `${s.name ?? ""} ${s.id ?? ""}`;
      return (
        /forge\s*sessions/i.test(name) ||
        /ForgeSessions@/i.test(name) ||
        /sessions\s*\+\s*midnight/i.test(name) ||
        /sessions\s*\[luxalgo\]/i.test(name) ||
        new RegExp(SESSIONS_STUDY_NAME.replace(/\s+/g, "\\s*"), "i").test(name)
      );
    });
  } catch {
    return false;
  }
}

function ensureRemainNode(doc: Document): HTMLElement | null {
  const legend = doc.querySelector<HTMLElement>('[data-name="legend"]');
  if (!legend) return null;
  const main =
    legend.querySelector<HTMLElement>('[class*="legendMainSourceWrapper"]') ||
    legend.querySelector<HTMLElement>('[data-name="legend-series-item"]');
  if (!main) return null;

  let el = legend.querySelector<HTMLElement>(`[${ATTR}]`);
  if (!el) {
    el = doc.createElement("span");
    el.setAttribute(ATTR, "1");
    el.style.cssText = [
      `color:${COLOR}`,
      "font-size:12px",
      "font-weight:500",
      "margin-left:14px",
      "white-space:nowrap",
      "letter-spacing:0.2px",
      "pointer-events:none",
      "line-height:1.2",
      "font-family:Trebuchet MS,Segoe UI,sans-serif",
    ].join(";");
    const values =
      main.querySelector<HTMLElement>('[class*="valuesWrapper"]') ||
      main.querySelector<HTMLElement>('[class*="valueItem"]')?.parentElement ||
      main.querySelector<HTMLElement>('[class*="titlesWrapper"]')?.parentElement;
    if (values) values.appendChild(el);
    else main.appendChild(el);
  }
  return el;
}

function clearRemainNodes(): void {
  for (const doc of chartDocs()) {
    for (const el of doc.querySelectorAll(`[${ATTR}]`)) el.remove();
  }
}

/**
 * When Forge Sessions is on the chart, show 4H/1H/30m/15m remaining
 * after the main OHLC values (blue), without altering Sessions settings.
 */
export function HtfCandleRemainLegend({ enabled = true }: { readonly enabled?: boolean }) {
  const { chart } = useServices();
  const ready = useStore(chart.state, (s) => s.ready);

  useEffect(() => {
    if (!enabled || !ready) {
      clearRemainNodes();
      return;
    }

    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      const widget = chart.getWidget();
      if (!sessionsStudyPresent(widget)) {
        clearRemainNodes();
        return;
      }
      const text = formatHtfCandleRemainText();
      let painted = false;
      for (const doc of chartDocs()) {
        const el = ensureRemainNode(doc);
        if (!el) continue;
        if (el.textContent !== text) el.textContent = text;
        painted = true;
      }
      if (!painted) {
        /* legend not ready yet */
      }
    };

    tick();
    const fast = window.setInterval(tick, 1_000);
    const rescue = window.setInterval(tick, 3_000);
    return () => {
      cancelled = true;
      window.clearInterval(fast);
      window.clearInterval(rescue);
      clearRemainNodes();
    };
  }, [chart, enabled, ready]);

  return null;
}
