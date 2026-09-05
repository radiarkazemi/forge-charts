import type { Interval } from "../engine/types";
import { loadJson, saveJson } from "../persist";

const STORAGE_KEY = "forge.priceAlerts";

export type AlertCondition = "crossing" | "above" | "below";
export type AlertTrigger = "once" | "every";
export type AlertSource = "price" | "drawing" | "indicator";

export type PriceAlert = {
  id: string;
  symbol: string;
  exchange?: string;
  interval?: Interval;
  name: string;
  condition: AlertCondition;
  price: number;
  trigger: AlertTrigger;
  message: string;
  enabled: boolean;
  createdAt: number;
  firedAt: number | null;
  fireCount: number;
  /** When set, alert was created from a drawing (GAP-05 / DI-12). */
  drawingId?: string;
  drawingKind?: string;
  /** Indicator-condition alert (GAP-05). */
  indicatorId?: string;
  indicatorKind?: string;
  source?: AlertSource;
  /** Optional webhook URL — POSTed as JSON on fire (GAP-04). */
  webhookUrl?: string;
};

export type AlertFire = {
  alertId: string;
  symbol: string;
  name: string;
  message: string;
  price: number;
  at: number;
  webhookUrl?: string;
};

function uid(): string {
  return `al_${Math.random().toString(36).slice(2, 10)}`;
}

export function loadAlerts(): PriceAlert[] {
  const rows = loadJson<PriceAlert[] | null>(STORAGE_KEY, null);
  if (!rows?.length) return [];
  return rows.map((row) => ({
    ...row,
    enabled: row.enabled !== false,
    firedAt: row.firedAt ?? null,
    fireCount: row.fireCount ?? 0,
    message: row.message ?? "",
    trigger: row.trigger === "every" ? "every" : "once",
    condition: row.condition === "above" || row.condition === "below" ? row.condition : "crossing",
    source: row.source ?? (row.drawingId ? "drawing" : row.indicatorId ? "indicator" : "price"),
    webhookUrl: row.webhookUrl?.trim() || undefined,
  }));
}

export function saveAlerts(alerts: PriceAlert[]): void {
  saveJson(STORAGE_KEY, alerts);
}

export function createAlert(input: {
  symbol: string;
  exchange?: string;
  interval?: Interval;
  name?: string;
  condition: AlertCondition;
  price: number;
  trigger: AlertTrigger;
  message?: string;
  drawingId?: string;
  drawingKind?: string;
  indicatorId?: string;
  indicatorKind?: string;
  source?: AlertSource;
  webhookUrl?: string;
}): PriceAlert {
  const price = Number(input.price);
  const source: AlertSource =
    input.source ?? (input.drawingId ? "drawing" : input.indicatorId ? "indicator" : "price");
  const name =
    input.name?.trim() ||
    `${input.symbol} ${input.condition} ${Number.isFinite(price) ? price : ""}`.trim();
  return {
    id: uid(),
    symbol: input.symbol,
    exchange: input.exchange,
    interval: input.interval,
    name,
    condition: input.condition,
    price: Number.isFinite(price) ? price : 0,
    trigger: input.trigger,
    message: input.message?.trim() ?? "",
    enabled: true,
    createdAt: Date.now(),
    firedAt: null,
    fireCount: 0,
    drawingId: input.drawingId,
    drawingKind: input.drawingKind,
    indicatorId: input.indicatorId,
    indicatorKind: input.indicatorKind,
    source,
    webhookUrl: input.webhookUrl?.trim() || undefined,
  };
}

export function conditionLabel(condition: AlertCondition): string {
  if (condition === "above") return "Crossing up through";
  if (condition === "below") return "Crossing down through";
  return "Crossing";
}

function crossed(prev: number, next: number, level: number, condition: AlertCondition): boolean {
  if (!Number.isFinite(prev) || !Number.isFinite(next) || !Number.isFinite(level)) return false;
  if (condition === "above") return prev <= level && next > level;
  if (condition === "below") return prev >= level && next < level;
  return (prev < level && next >= level) || (prev > level && next <= level);
}

export type AlertEvalContext = {
  symbol: string;
  prevClose: number | null;
  nextClose: number;
  /** Resolved drawing break levels keyed by drawing id (GAP-05). */
  drawingLevels?: Record<string, number>;
  /** Resolved indicator values keyed by indicator id (GAP-05). */
  indicatorValues?: Record<string, number>;
};

/** Evaluate alerts for a symbol. Supports price, drawing-break, and indicator levels. */
export function evaluateAlerts(
  alerts: PriceAlert[],
  symbolOrCtx: string | AlertEvalContext,
  prevCloseArg?: number | null,
  nextCloseArg?: number,
): { alerts: PriceAlert[]; fires: AlertFire[] } {
  const ctx: AlertEvalContext =
    typeof symbolOrCtx === "string"
      ? { symbol: symbolOrCtx, prevClose: prevCloseArg ?? null, nextClose: nextCloseArg ?? NaN }
      : symbolOrCtx;
  const { symbol, prevClose, nextClose } = ctx;
  if (prevClose == null || !Number.isFinite(prevClose) || !Number.isFinite(nextClose)) {
    return { alerts, fires: [] };
  }
  const fires: AlertFire[] = [];
  const next = alerts.map((alert) => {
    if (!alert.enabled || alert.symbol !== symbol) return alert;
    let level = alert.price;
    if (alert.drawingId && ctx.drawingLevels && alert.drawingId in ctx.drawingLevels) {
      level = ctx.drawingLevels[alert.drawingId]!;
    } else if (alert.indicatorId && ctx.indicatorValues && alert.indicatorId in ctx.indicatorValues) {
      level = ctx.indicatorValues[alert.indicatorId]!;
    }
    // Drawing / indicator alerts compare close against the level (break / cross).
    if (!crossed(prevClose, nextClose, level, alert.condition)) return alert;
    const fired: PriceAlert = {
      ...alert,
      price: level,
      firedAt: Date.now(),
      fireCount: alert.fireCount + 1,
      enabled: alert.trigger === "every",
    };
    fires.push({
      alertId: alert.id,
      symbol: alert.symbol,
      name: alert.name,
      message: alert.message || `${alert.name}: ${nextClose}`,
      price: nextClose,
      at: fired.firedAt!,
      webhookUrl: alert.webhookUrl,
    });
    return fired;
  });
  return { alerts: next, fires };
}

/** Fire-and-forget webhook POST (GAP-04). Swallows network errors. */
export function dispatchWebhook(fire: AlertFire): void {
  const url = fire.webhookUrl?.trim();
  if (!url) return;
  const body = JSON.stringify({
    alertId: fire.alertId,
    symbol: fire.symbol,
    name: fire.name,
    message: fire.message,
    price: fire.price,
    at: fire.at,
  });
  try {
    void fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      mode: "cors",
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    /* ignore */
  }
}
