/** Demo / paper trading domain types (TradingView-style simulated broker). */

export type DemoSide = "buy" | "sell";
export type DemoOrderType = "market" | "limit" | "stop";
export type DemoOrderStatus = "working" | "filled" | "canceled" | "rejected";
export type DemoPositionStatus = "open" | "closed";

export interface DemoInstrument {
  readonly symbol: string;
  /** Minimum price increment (e.g. 0.01 for XAU). */
  readonly tickSize: number;
  /** Spread displayed in “points” (tick multiples), e.g. 6.0 → 6 ticks. */
  readonly spreadPoints: number;
  /** Contract size per 1.0 lot (XAU CFD often 100). */
  readonly contractSize: number;
  /** Account leverage, e.g. 10000. */
  readonly leverage: number;
  readonly minLot: number;
  readonly lotStep: number;
  readonly maxLot: number;
}

export interface DemoAccount {
  readonly id: string;
  readonly name: string;
  readonly currency: string;
  readonly balance: number;
  readonly equity: number;
  readonly createdAt: number;
  readonly leverage: number;
  readonly spreadPoints: number;
}

export interface DemoPosition {
  readonly id: string;
  readonly accountId: string;
  readonly symbol: string;
  readonly side: DemoSide;
  readonly qty: number;
  readonly entryPrice: number;
  readonly openTime: number;
  readonly status: DemoPositionStatus;
  readonly takeProfit: number | null;
  readonly stopLoss: number | null;
  readonly closePrice: number | null;
  readonly closeTime: number | null;
  readonly realizedPnl: number | null;
  readonly commission: number;
}

export interface DemoOrder {
  readonly id: string;
  readonly accountId: string;
  readonly symbol: string;
  readonly side: DemoSide;
  readonly type: DemoOrderType;
  readonly qty: number;
  readonly price: number | null;
  readonly status: DemoOrderStatus;
  readonly createdAt: number;
  readonly filledAt: number | null;
  readonly fillPrice: number | null;
  readonly takeProfit: number | null;
  readonly stopLoss: number | null;
  readonly positionId: string | null;
}

export interface DemoSpaceState {
  readonly active: boolean;
  readonly symbol: string;
  readonly startTimeSec: number | null;
  readonly cursorTimeSec: number | null;
  readonly lastPrice: number | null;
  readonly playing: boolean;
}

export interface DemoTradingSnapshot {
  readonly accounts: readonly DemoAccount[];
  readonly activeAccountId: string;
  readonly positions: readonly DemoPosition[];
  readonly orders: readonly DemoOrder[];
  readonly history: readonly DemoPosition[];
  readonly qty: number;
  readonly orderType: DemoOrderType;
  readonly side: DemoSide;
  /** Limit / stop entry price (ignored for market). */
  readonly entryPrice: number | null;
  readonly takeProfitEnabled: boolean;
  readonly stopLossEnabled: boolean;
  readonly takeProfitPrice: number | null;
  readonly stopLossPrice: number | null;
  /** TP distance in ticks when editing via ticks field. */
  readonly takeProfitTicks: number | null;
  readonly stopLossTicks: number | null;
  readonly ticketOpen: boolean;
  readonly dockOpen: boolean;
  readonly space: DemoSpaceState;
  readonly instrument: DemoInstrument;
}

export const DEFAULT_XAU_INSTRUMENT: DemoInstrument = {
  symbol: "XAUUSD",
  tickSize: 0.01,
  spreadPoints: 6,
  contractSize: 100,
  leverage: 10_000,
  minLot: 0.01,
  lotStep: 0.01,
  maxLot: 100,
};

/** Iran domestic gold (IRR) — Faraz آبشده / گرم ۱۸ / سکه. */
export const DEFAULT_IRAN_GOLD_INSTRUMENT: DemoInstrument = {
  symbol: "G18",
  tickSize: 1,
  /** Total spread in ticks (IRR). ~20k IRR is a small retail-style spread on ~25M گرم. */
  spreadPoints: 20_000,
  contractSize: 1,
  leverage: 100,
  minLot: 0.01,
  lotStep: 0.01,
  maxLot: 100,
};

const IRAN_GOLD_TICKERS = new Set([
  "ABSHODE",
  "MESGHAL17",
  "G18",
  "G24",
  "SEKKE",
  "SEKKE_EMAMI",
  "NIM",
  "ROB",
  "ONS",
]);

export function bareDemoTicker(symbol: string): string {
  return symbol.includes(":") ? symbol.slice(symbol.lastIndexOf(":") + 1) : symbol;
}

export function isIranGoldTicker(symbol: string): boolean {
  return IRAN_GOLD_TICKERS.has(bareDemoTicker(symbol).toUpperCase());
}

/** Resolve demo instrument specs for the charted ticker (keeps leverage from `base`). */
export function demoInstrumentFor(symbol: string, base: DemoInstrument): DemoInstrument {
  const bare = bareDemoTicker(symbol);
  const upper = bare.toUpperCase();
  if (IRAN_GOLD_TICKERS.has(upper)) {
    const tickSize = upper === "ONS" ? 0.01 : DEFAULT_IRAN_GOLD_INSTRUMENT.tickSize;
    const spreadPoints =
      upper === "ONS" ? 6 : DEFAULT_IRAN_GOLD_INSTRUMENT.spreadPoints;
    return {
      ...DEFAULT_IRAN_GOLD_INSTRUMENT,
      symbol: bare,
      tickSize,
      spreadPoints,
      leverage: base.leverage > 0 ? base.leverage : DEFAULT_IRAN_GOLD_INSTRUMENT.leverage,
    };
  }
  if (upper === "XAUUSD" || upper.startsWith("XAU")) {
    return {
      ...DEFAULT_XAU_INSTRUMENT,
      symbol: bare,
      leverage: base.leverage > 0 ? base.leverage : DEFAULT_XAU_INSTRUMENT.leverage,
      spreadPoints: base.spreadPoints > 0 ? base.spreadPoints : DEFAULT_XAU_INSTRUMENT.spreadPoints,
    };
  }
  return { ...base, symbol: bare };
}

/** Format bid/ask for the trade band (IRR integers vs FX decimals). */
export function formatDemoPrice(n: number | undefined | null, tickSize = 0.01): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const digits = tickSize >= 1 ? 0 : tickSize >= 0.01 ? 2 : 5;
  return n.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function bidAskFromMid(
  mid: number,
  instrument: DemoInstrument,
): { bid: number; ask: number; spreadPoints: number; spreadPrice: number } {
  const half = (instrument.spreadPoints * instrument.tickSize) / 2;
  const bid = roundToTick(mid - half, instrument.tickSize);
  const ask = roundToTick(mid + half, instrument.tickSize);
  return {
    bid,
    ask,
    spreadPoints: instrument.spreadPoints,
    spreadPrice: ask - bid,
  };
}

export function roundToTick(price: number, tick: number): number {
  if (!Number.isFinite(price) || tick <= 0) return price;
  return Math.round(price / tick) * tick;
}

/** Notional trade value = price × lots × contractSize (matches TV paper ticket). */
export function tradeValue(price: number, lots: number, contractSize: number): number {
  return price * lots * contractSize;
}

export function requiredMargin(price: number, lots: number, contractSize: number, leverage: number): number {
  if (leverage <= 0) return tradeValue(price, lots, contractSize);
  return tradeValue(price, lots, contractSize) / leverage;
}

export function tickValue(lots: number, contractSize: number, tickSize: number): number {
  return lots * contractSize * tickSize;
}

/** Unrealized PnL in account currency. */
export function unrealizedPnl(
  side: DemoSide,
  qty: number,
  entry: number,
  mark: number,
  contractSize: number,
): number {
  const diff = side === "buy" ? mark - entry : entry - mark;
  return diff * qty * contractSize;
}

/** Close/mark price: long @ bid, short @ ask (TradingView FxPro). */
export function markPriceForSide(
  side: DemoSide,
  mid: number,
  instrument: DemoInstrument,
): number {
  const q = bidAskFromMid(mid, instrument);
  return side === "buy" ? q.bid : q.ask;
}

export function formatUsd(n: number, digits = 2): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(digits)} USD`;
}
