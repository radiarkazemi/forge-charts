import {
  createPriceAlert,
  describeAlert,
  markTriggered,
  shouldTrigger,
  type NewPriceAlert,
  type PriceAlert,
  type QuoteBook,
} from "@/domain";
import type { KeyValueStorage, Notifier, SymbolRepository } from "../ports";
import { createPersistentStore, createStore, type Store } from "../store";

export interface AlertEvent {
  readonly alert: PriceAlert;
  readonly price: number;
  readonly message: string;
}

export interface AlertServiceDeps {
  readonly storage: KeyValueStorage;
  readonly symbols: SymbolRepository;
  readonly notifier: Notifier;
  readonly generateId: () => string;
  readonly now?: () => number;
}

const STORAGE_KEY = "forge.alerts.v1";
const MAX_EVENTS = 50;

/**
 * Owns the list of price alerts, evaluates them against incoming quotes and
 * publishes trigger events for the UI and system notifications.
 */
export class AlertService {
  readonly alerts: Store<readonly PriceAlert[]>;
  readonly events: Store<readonly AlertEvent[]> = createStore<readonly AlertEvent[]>([]);

  private readonly deps: Required<AlertServiceDeps>;
  private readonly lastPrices = new Map<string, number>();

  constructor(deps: AlertServiceDeps) {
    this.deps = { now: () => Date.now(), ...deps };
    this.alerts = createPersistentStore<readonly PriceAlert[]>(deps.storage, STORAGE_KEY, []);
  }

  add(input: NewPriceAlert): PriceAlert {
    const alert = createPriceAlert(input, this.deps.generateId(), this.deps.now());
    this.alerts.update((list) => [alert, ...list]);
    return alert;
  }

  remove(id: string): void {
    this.alerts.update((list) => list.filter((a) => a.id !== id));
  }

  /** Re-arm a triggered alert. */
  reactivate(id: string): void {
    this.alerts.update((list) =>
      list.map((a) => (a.id === id ? { ...a, status: "active", triggeredAt: null } : a)),
    );
  }

  clearTriggered(): void {
    this.alerts.update((list) => list.filter((a) => a.status === "active"));
  }

  dismissEvent(alertId: string): void {
    this.events.update((list) => list.filter((e) => e.alert.id !== alertId));
  }

  activeFor(ticker: string): PriceAlert[] {
    return this.alerts.get().filter((a) => a.ticker === ticker && a.status === "active");
  }

  /** Feed the latest quote book; fires any alerts that were crossed. */
  evaluate(quotes: QuoteBook): void {
    const fired: AlertEvent[] = [];
    const now = this.deps.now();

    const next = this.alerts.get().map((alert) => {
      const quote = quotes[alert.ticker];
      if (!quote) return alert;
      const previous = this.lastPrices.get(alert.ticker) ?? null;
      if (!shouldTrigger(alert, previous, quote.price)) return alert;

      const triggered = markTriggered(alert, now);
      const precision = this.deps.symbols.findByTicker(alert.ticker)?.pricePrecision ?? 2;
      fired.push({
        alert: triggered,
        price: quote.price,
        message: `${describeAlert(triggered, precision)} — now ${quote.price.toFixed(precision)}`,
      });
      return triggered;
    });

    for (const [ticker, quote] of Object.entries(quotes)) this.lastPrices.set(ticker, quote.price);

    if (fired.length === 0) return;
    this.alerts.set(next);
    this.events.update((list) => [...fired, ...list].slice(0, MAX_EVENTS));
    for (const event of fired) {
      this.deps.notifier.notify({ title: "Price alert", body: event.message });
    }
  }
}
