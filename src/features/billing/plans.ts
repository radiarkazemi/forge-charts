export type PlanId = "month" | "year";
export type PayCurrency = "toman" | "usd";

/** Monthly price. Yearly toman is 20% off twelve months (4,800,000 → 3,840,000). */
export const PLAN_PRICE = {
  month: { toman: 400_000, usd: 3 },
  year: { toman: 3_840_000, usd: 28.9 },
} as const;

export const YEAR_AT_MONTHLY = {
  toman: PLAN_PRICE.month.toman * 12,
  usd: PLAN_PRICE.month.usd * 12,
} as const;

const CHOICE_KEY = "forge.billing.choice.v1";

export interface PlanChoice {
  readonly plan: PlanId;
  readonly currency: PayCurrency;
  readonly chosenAt: number;
}

export function readPlanChoice(): PlanChoice | null {
  try {
    const raw = localStorage.getItem(CHOICE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PlanChoice>;
    if (parsed.plan !== "month" && parsed.plan !== "year") return null;
    if (parsed.currency !== "toman" && parsed.currency !== "usd") return null;
    return {
      plan: parsed.plan,
      currency: parsed.currency,
      chosenAt: typeof parsed.chosenAt === "number" ? parsed.chosenAt : Date.now(),
    };
  } catch {
    return null;
  }
}

export function writePlanChoice(plan: PlanId, currency: PayCurrency): PlanChoice {
  const choice: PlanChoice = { plan, currency, chosenAt: Date.now() };
  try {
    localStorage.setItem(CHOICE_KEY, JSON.stringify(choice));
  } catch {
    /* private mode — the page still shows the choice for this visit */
  }
  return choice;
}

export function formatToman(amount: number, fa: boolean): string {
  const digits = new Intl.NumberFormat(fa ? "fa-IR" : "en-US").format(amount);
  return fa ? `${digits} تومان` : `${digits} toman`;
}

export function formatUsd(amount: number): string {
  const text = Number.isInteger(amount) ? String(amount) : amount.toFixed(1);
  return `$${text}`;
}

export function formatPrice(plan: PlanId, currency: PayCurrency, fa: boolean): string {
  const amount = PLAN_PRICE[plan][currency];
  return currency === "toman" ? formatToman(amount, fa) : formatUsd(amount);
}
