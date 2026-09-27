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

export function formatUsd(n: number, digits = 2): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(digits)} USD`;
}
