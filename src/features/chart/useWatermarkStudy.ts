/**
 * Watches Indicators “Watermark” and publishes the screen overlay state.
 */

import { useEffect } from "react";
import { useServices } from "@/app/use-services";
import { useStore } from "@/shared/hooks/useStore";
import type { EntityId } from "@/infrastructure/tradingview";
import {
  publishWatermarkOverlay,
  WATERMARK_DEFAULTS,
  type WatermarkHAlign,
  type WatermarkInputs,
  type WatermarkVAlign,
} from "@/features/watermark/runtime";
import {
  WATERMARK_STUDY_DEFAULTS,
  WM_STYLE_SUBTITLE,
  WM_STYLE_SYMBOL,
  WM_STYLE_TITLE,
} from "./watermark-indicator";
import { readStylePlot } from "./study-style-plots";
import { studyIsVisible } from "./study-paint-gate";

const STUDY_DEBOUNCE_MS = 250;
const PRESENCE_POLL_MS = 5_000;

function asVAlign(raw: unknown, fallback: WatermarkVAlign): WatermarkVAlign {
  const s = String(raw ?? "").toLowerCase();
  if (s === "top" || s === "middle" || s === "bottom") return s;
  return fallback;
}

function asHAlign(raw: unknown, fallback: WatermarkHAlign): WatermarkHAlign {
  const s = String(raw ?? "").toLowerCase();
  if (s === "left" || s === "center" || s === "right") return s;
  return fallback;
}

export function useWatermarkStudy(enabled = true): void {
  const { chart } = useServices();
  const ready = useStore(chart.state, (s) => s.ready);
  const symbol = useStore(chart.state, (s) => s.symbol);
  const interval = useStore(chart.state, (s) => s.interval);

  useEffect(() => {
    if (!enabled || !ready) {
      publishWatermarkOverlay(null);
      return;
    }
    const widget = chart.getWidget();
    if (!widget) {
      publishWatermarkOverlay(null);
      return;
    }

    let cancelled = false;
    let studyTimer: number | undefined;

    const findStudyIds = (): EntityId[] => {
      try {
        const studies = widget.activeChart()?.getAllStudies() ?? [];
        return studies
          .filter((s: { name?: string; id?: string | EntityId }) => {
            const name = `${s.name ?? ""} ${s.id ?? ""}`;
            return (
              /^watermark$/i.test(String(s.name ?? "").trim()) ||
              /ForgeWatermark@/i.test(name) ||
              /ag\s*fx\s*[-–]?\s*watermark/i.test(name)
            );
          })
          .map((s: { id?: string | EntityId }) => s.id as EntityId);
      } catch {
        return [];
      }
    };

    const readInputs = (studyId: EntityId): WatermarkInputs | null => {
      try {
        const api = widget.activeChart()?.getStudyById(studyId);
        if (!api) return null;
        const values = api.getInputValues() ?? [];
        const map = new Map<string, unknown>();
        for (const item of values) map.set(String(item.id), item.value);

        const num = (id: string, fallback: number) => {
          const v = Number(map.get(id));
          return Number.isFinite(v) ? v : fallback;
        };
        const bool = (id: string, fallback: boolean) => {
          const v = map.get(id);
          if (typeof v === "boolean") return v;
          if (typeof v === "number") return v !== 0;
          return fallback;
        };
        const str = (id: string, fallback: string) => {
          const v = map.get(id);
          return typeof v === "string" ? v : fallback;
        };

        const titleStyle = readStylePlot(api, WM_STYLE_TITLE, {
          color: WATERMARK_DEFAULTS.titleColor,
          visible: true,
          transparency: WATERMARK_DEFAULTS.titleTransparency,
          linewidth: 2,
          linestyle: 0,
        });
        const subStyle = readStylePlot(api, WM_STYLE_SUBTITLE, {
          color: WATERMARK_DEFAULTS.subtitleColor,
          visible: true,
          transparency: WATERMARK_DEFAULTS.subtitleTransparency,
          linewidth: 1,
          linestyle: 0,
        });
        const symStyle = readStylePlot(api, WM_STYLE_SYMBOL, {
          color: WATERMARK_DEFAULTS.symbolColor,
          visible: true,
          transparency: WATERMARK_DEFAULTS.symbolTransparency,
          linewidth: 1,
          linestyle: 0,
        });

        return {
          title: str("title", WATERMARK_STUDY_DEFAULTS.title).slice(0, 80),
          subtitle: str("subtitle", WATERMARK_STUDY_DEFAULTS.subtitle).slice(0, 120),
          showTitle:
            bool("showTitle", WATERMARK_STUDY_DEFAULTS.showTitle) &&
            titleStyle.visible,
          showSubtitle:
            bool("showSubtitle", WATERMARK_STUDY_DEFAULTS.showSubtitle) &&
            subStyle.visible,
          showSymbolInfo:
            bool("showSymbolInfo", WATERMARK_STUDY_DEFAULTS.showSymbolInfo) &&
            symStyle.visible,
          vertPos: asVAlign(
            map.get("vertPos") ?? WATERMARK_STUDY_DEFAULTS.vertPos,
            WATERMARK_DEFAULTS.vertPos,
          ),
          horzPos: asHAlign(
            map.get("horzPos") ?? WATERMARK_STUDY_DEFAULTS.horzPos,
            WATERMARK_DEFAULTS.horzPos,
          ),
          symbolVertPos: asVAlign(
            map.get("symbolVertPos") ?? WATERMARK_STUDY_DEFAULTS.symbolVertPos,
            WATERMARK_DEFAULTS.symbolVertPos,
          ),
          titleSize: Math.max(
            10,
            Math.min(72, Math.floor(num("titleSize", WATERMARK_STUDY_DEFAULTS.titleSize))),
          ),
          subtitleSize: Math.max(
            8,
            Math.min(
              48,
              Math.floor(num("subtitleSize", WATERMARK_STUDY_DEFAULTS.subtitleSize)),
            ),
          ),
          symbolSize: Math.max(
            8,
            Math.min(
              32,
              Math.floor(num("symbolSize", WATERMARK_STUDY_DEFAULTS.symbolSize)),
            ),
          ),
          titleBold: bool("titleBold", WATERMARK_STUDY_DEFAULTS.titleBold),
          subtitleBold: bool("subtitleBold", WATERMARK_STUDY_DEFAULTS.subtitleBold),
          letterSpacing: Math.max(
            0,
            Math.min(
              0.4,
              num("letterSpacing", WATERMARK_STUDY_DEFAULTS.letterSpacing),
            ),
          ),
          lineGap: Math.max(
            0,
            Math.min(40, Math.floor(num("lineGap", WATERMARK_STUDY_DEFAULTS.lineGap))),
          ),
          offsetX: Math.max(
            -200,
            Math.min(200, Math.floor(num("offsetX", WATERMARK_STUDY_DEFAULTS.offsetX))),
          ),
          offsetY: Math.max(
            0,
            Math.min(200, Math.floor(num("offsetY", WATERMARK_STUDY_DEFAULTS.offsetY))),
          ),
          titleColor: titleStyle.color,
          subtitleColor: subStyle.color,
          symbolColor: symStyle.color,
          titleTransparency: titleStyle.transparency,
          subtitleTransparency: subStyle.transparency,
          symbolTransparency: symStyle.transparency,
        };
      } catch {
        return null;
      }
    };

    const publish = () => {
      if (cancelled) return;
      const studyIds = findStudyIds();
      if (studyIds.length === 0) {
        publishWatermarkOverlay(null);
        return;
      }
      const studyId = studyIds[0]!;
      const studyApi = widget.activeChart()?.getStudyById(studyId);
      if (!studyIsVisible(studyApi)) {
        publishWatermarkOverlay(null);
        return;
      }
      const inputs = readInputs(studyId);
      if (!inputs) {
        publishWatermarkOverlay(null);
        return;
      }
      const sym = String(symbol || "").trim() || "—";
      const tf = String(interval || "").trim();
      publishWatermarkOverlay({
        ...inputs,
        symbolLabel: tf ? `${sym} · ${tf}` : sym,
        visible: true,
      });
    };

    const schedule = () => {
      window.clearTimeout(studyTimer);
      studyTimer = window.setTimeout(publish, STUDY_DEBOUNCE_MS);
    };

    publish();

    const onStudyEvent = (id: string, eventType: string) => {
      if (/remove/i.test(eventType) && findStudyIds().length === 0) {
        publishWatermarkOverlay(null);
        return;
      }
      if (findStudyIds().some((s) => String(s) === String(id))) schedule();
      else if (/add|create/i.test(eventType)) schedule();
    };
    const unSubStudy = chart.onStudyEvent(onStudyEvent);

    const onStudyProperties = () => {
      if (findStudyIds().length === 0) return;
      schedule();
    };
    try {
      widget.subscribe("study_properties_changed", onStudyProperties as never);
    } catch {
      /* older CL builds */
    }

    const presence = window.setInterval(() => {
      if (cancelled) return;
      const ids = findStudyIds();
      if (ids.length === 0) {
        publishWatermarkOverlay(null);
        return;
      }
      try {
        const api = widget.activeChart()?.getStudyById(ids[0]!);
        if (!studyIsVisible(api)) {
          publishWatermarkOverlay(null);
          return;
        }
      } catch {
        /* ignore */
      }
      schedule();
    }, PRESENCE_POLL_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(studyTimer);
      window.clearInterval(presence);
      try {
        unSubStudy?.();
      } catch {
        /* ignore */
      }
      try {
        widget.unsubscribe("study_properties_changed", onStudyProperties as never);
      } catch {
        /* ignore */
      }
      publishWatermarkOverlay(null);
    };
  }, [enabled, ready, chart, symbol, interval]);
}
