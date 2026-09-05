import type { Interval } from "../engine/types";
import { loadJson, saveJson } from "../persist";

const STORAGE_KEY = "forge.priceAlerts";

export type AlertCondition = "crossing" | "above" | "below";
export type AlertTrigger = "once" | "every";

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
  /** When set, alert was created from a drawing (DI-12). */
  drawingId?: string;
  drawingKind?: string;
};

export type AlertFire = {
  alertId: string;
  symbol: string;
  name: string;
  message: string;
  price: number;
  at: number;
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
}): PriceAlert {
  const price = Number(input.price);
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

/** Evaluate alerts for a symbol given previous and current close. Returns fires + next alert list. */
export function evaluateAlerts(
  alerts: PriceAlert[],
  symbol: string,
  prevClose: number | null,
  nextClose: number,
): { alerts: PriceAlert[]; fires: AlertFire[] } {
  if (prevClose == null || !Number.isFinite(prevClose) || !Number.isFinite(nextClose)) {
    return { alerts, fires: [] };
  }
  const fires: AlertFire[] = [];
  const next = alerts.map((alert) => {
    if (!alert.enabled || alert.symbol !== symbol) return alert;
    if (!crossed(prevClose, nextClose, alert.price, alert.condition)) return alert;
    const fired: PriceAlert = {
      ...alert,
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
    });
    return fired;
  });
  return { alerts: next, fires };
}
