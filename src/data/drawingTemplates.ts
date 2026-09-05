import type { Drawing, DrawingKind, FibRetraceStyle, LineEnd, LineStyle } from "../engine/types";
import { loadJson, saveJson } from "../persist";

const STORAGE_KEY = "forge.drawingTemplates";

export type DrawingTemplateStyle = {
  color: string;
  lineWidth?: number;
  lineStyle?: LineStyle;
  leftEnd?: LineEnd;
  rightEnd?: LineEnd;
  fib?: FibRetraceStyle;
};

export type DrawingTemplate = {
  id: string;
  name: string;
  kind: DrawingKind;
  createdAt: number;
  updatedAt: number;
  style: DrawingTemplateStyle;
};

function uid(): string {
  return `dtpl_${Math.random().toString(36).slice(2, 9)}`;
}

export function loadDrawingTemplates(): DrawingTemplate[] {
  const rows = loadJson<DrawingTemplate[] | null>(STORAGE_KEY, null);
  if (!rows?.length) return [];
  return rows.map((row) => ({
    ...row,
    style: {
      color: row.style?.color ?? "#2962ff",
      lineWidth: row.style?.lineWidth,
      lineStyle: row.style?.lineStyle,
      leftEnd: row.style?.leftEnd,
      rightEnd: row.style?.rightEnd,
      fib: row.style?.fib
        ? {
            ...row.style.fib,
            levels: Array.isArray(row.style.fib.levels)
              ? row.style.fib.levels.map((l) => ({ ...l }))
              : [],
          }
        : undefined,
    },
  }));
}

export function saveDrawingTemplates(templates: DrawingTemplate[]): void {
  saveJson(STORAGE_KEY, templates);
}

export function snapshotDrawingStyle(drawing: Drawing): DrawingTemplateStyle {
  return {
    color: drawing.color,
    lineWidth: drawing.lineWidth,
    lineStyle: drawing.lineStyle,
    leftEnd: drawing.leftEnd,
    rightEnd: drawing.rightEnd,
    fib: drawing.fib
      ? {
          ...drawing.fib,
          levels: drawing.fib.levels.map((l) => ({ ...l })),
        }
      : undefined,
  };
}

export function createDrawingTemplate(input: { name: string; drawing: Drawing }): DrawingTemplate {
  const now = Date.now();
  return {
    id: uid(),
    name: input.name.trim() || `${input.drawing.kind} template`,
    kind: input.drawing.kind,
    createdAt: now,
    updatedAt: now,
    style: snapshotDrawingStyle(input.drawing),
  };
}

export function templatePatch(
  style: DrawingTemplateStyle,
): Partial<Pick<Drawing, "color" | "lineWidth" | "lineStyle" | "leftEnd" | "rightEnd" | "fib">> {
  return {
    color: style.color,
    lineWidth: style.lineWidth,
    lineStyle: style.lineStyle,
    leftEnd: style.leftEnd ?? "normal",
    rightEnd: style.rightEnd ?? "normal",
    ...(style.fib
      ? {
          fib: {
            ...style.fib,
            levels: style.fib.levels.map((l) => ({ ...l })),
          },
        }
      : {}),
  };
}

export function drawingTemplateSummary(tpl: DrawingTemplate): string {
  const bits = [tpl.kind, tpl.style.color];
  if (tpl.style.lineWidth) bits.push(`w${tpl.style.lineWidth}`);
  if (tpl.style.lineStyle && tpl.style.lineStyle !== "solid") bits.push(tpl.style.lineStyle);
  return bits.join(" · ");
}
