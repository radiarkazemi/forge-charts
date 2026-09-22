export type AlertCondition = "crossing" | "above" | "below";

export type AlertStatus = "active" | "triggered";

export interface PriceAlert {
  readonly id: string;
  readonly ticker: string;
  readonly price: number;
  readonly condition: AlertCondition;
  readonly note: string;
  readonly status: AlertStatus;
  readonly createdAt: number;
  readonly triggeredAt: number | null;
}

export const ALERT_CONDITION_LABELS: Readonly<Record<AlertCondition, string>> = {
  crossing: "Crossing",
  above: "Crossing up",
  below: "Crossing down",
};

export interface NewPriceAlert {
  readonly ticker: string;
  readonly price: number;
  readonly condition: AlertCondition;
  readonly note?: string;
}

export function createPriceAlert(input: NewPriceAlert, id: string, now: number): PriceAlert {
  return {
    id,
    ticker: input.ticker,
    price: input.price,
    condition: input.condition,
    note: input.note?.trim() ?? "",
    status: "active",
    createdAt: now,
    triggeredAt: null,
  };
}

/**
 * Decide whether a price move from `previous` to `current` fires the alert.
 * `previous` is `null` on the very first observation; in that case we only
 * fire for one-sided conditions that are already satisfied.
 */
export function shouldTrigger(alert: PriceAlert, previous: number | null, current: number): boolean {
  if (alert.status !== "active") return false;
  const level = alert.price;

  if (previous === null) {
    return (alert.condition === "above" && current >= level) || (alert.condition === "below" && current <= level);
  }

  const crossedUp = previous < level && current >= level;
  const crossedDown = previous > level && current <= level;

  switch (alert.condition) {
    case "crossing":
      return crossedUp || crossedDown;
    case "above":
      return crossedUp;
    case "below":
      return crossedDown;
  }
}

export function markTriggered(alert: PriceAlert, now: number): PriceAlert {
  return { ...alert, status: "triggered", triggeredAt: now };
}

export function describeAlert(alert: PriceAlert, precision: number): string {
  return `${alert.ticker} ${ALERT_CONDITION_LABELS[alert.condition].toLowerCase()} ${alert.price.toFixed(precision)}`;
}
