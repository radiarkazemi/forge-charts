/** Demo / paper trading + optional broker bridge (GAP-63 / GAP-66). */

export type TradeSide = "buy" | "sell";
export type OrderType = "market" | "limit";
export type ExecMode = "paper" | "broker";
export type OrderStatus = "working" | "filled" | "cancelled" | "rejected" | "sent";

export type PaperOrder = {
  id: string;
  symbol: string;
  side: TradeSide;
  type: OrderType;
  qty: number;
  limitPrice?: number;
  status: OrderStatus;
  filledPrice?: number;
  createdAt: number;
  updatedAt: number;
  note?: string;
};

export type PaperPosition = {
  symbol: string;
  qty: number; // signed
  avgPrice: number;
  realizedPnl: number;
};

export type PaperFill = {
  id: string;
  orderId: string;
  symbol: string;
  side: TradeSide;
  qty: number;
  price: number;
  at: number;
};

export type PaperAccount = {
  mode: ExecMode;
  currency: string;
  cash: number;
  equity: number;
  orders: PaperOrder[];
  positions: PaperPosition[];
  fills: PaperFill[];
};

export type BrokerBridgeRequest = {
  source: "forge-charts";
  type: "brokerOrderRequest";
  requestId: string;
  symbol: string;
  side: TradeSide;
  orderType: OrderType;
  qty: number;
  limitPrice?: number;
};

export type BrokerBridgeUpdate = {
  source: "forge-charts" | string;
  type: "brokerOrderUpdate";
  requestId: string;
  status: "filled" | "rejected" | "cancelled" | "working";
  fillPrice?: number;
  message?: string;
};

const KEY = "forge.paperTrading.v1";

function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function defaultAccount(mode: ExecMode = "paper"): PaperAccount {
  return {
    mode,
    currency: "USD",
    cash: 100_000,
    equity: 100_000,
    orders: [],
    positions: [],
    fills: [],
  };
}

export function loadAccount(): PaperAccount {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultAccount();
    const parsed = JSON.parse(raw) as Partial<PaperAccount>;
    return {
      ...defaultAccount(parsed.mode === "broker" ? "broker" : "paper"),
      ...parsed,
      orders: parsed.orders ?? [],
      positions: parsed.positions ?? [],
      fills: parsed.fills ?? [],
    };
  } catch {
    return defaultAccount();
  }
}

export function saveAccount(account: PaperAccount): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(account));
  } catch {
    /* ignore */
  }
}

export function resetAccount(mode: ExecMode = "paper"): PaperAccount {
  const next = defaultAccount(mode);
  saveAccount(next);
  return next;
}

function upsertPosition(
  positions: PaperPosition[],
  symbol: string,
  side: TradeSide,
  qty: number,
  price: number,
): PaperPosition[] {
  const signed = side === "buy" ? qty : -qty;
  const next = positions.map((p) => ({ ...p }));
  const idx = next.findIndex((p) => p.symbol === symbol);
  if (idx < 0) {
    next.push({ symbol, qty: signed, avgPrice: price, realizedPnl: 0 });
    return next.filter((p) => Math.abs(p.qty) > 1e-9);
  }
  const cur = next[idx]!;
  const newQty = cur.qty + signed;
  if (Math.sign(cur.qty) === Math.sign(signed) || cur.qty === 0) {
    const total = Math.abs(cur.qty) * cur.avgPrice + qty * price;
    cur.avgPrice = total / Math.max(1e-9, Math.abs(cur.qty) + qty);
    cur.qty = newQty;
  } else {
    const closed = Math.min(Math.abs(cur.qty), qty);
    const dir = Math.sign(cur.qty);
    cur.realizedPnl += dir * closed * (price - cur.avgPrice);
    cur.qty = newQty;
    if (Math.sign(cur.qty) !== dir && Math.abs(cur.qty) > 1e-9) cur.avgPrice = price;
  }
  next[idx] = cur;
  return next.filter((p) => Math.abs(p.qty) > 1e-9);
}

export function markEquity(account: PaperAccount, marks: Record<string, number>): PaperAccount {
  let unrealized = 0;
  for (const p of account.positions) {
    const m = marks[p.symbol];
    if (m == null) continue;
    unrealized += p.qty * (m - p.avgPrice);
  }
  return { ...account, equity: account.cash + unrealized };
}

export function placePaperOrder(
  account: PaperAccount,
  input: {
    symbol: string;
    side: TradeSide;
    type: OrderType;
    qty: number;
    limitPrice?: number;
    lastPrice: number;
  },
): { account: PaperAccount; order: PaperOrder } {
  const now = Date.now();
  const order: PaperOrder = {
    id: uid("ord"),
    symbol: input.symbol,
    side: input.side,
    type: input.type,
    qty: input.qty,
    limitPrice: input.limitPrice,
    status: "working",
    createdAt: now,
    updatedAt: now,
  };

  const fillNow =
    input.type === "market" ||
    (input.type === "limit" &&
      input.limitPrice != null &&
      ((input.side === "buy" && input.lastPrice <= input.limitPrice) ||
        (input.side === "sell" && input.lastPrice >= input.limitPrice)));

  if (!fillNow) {
    const working = { ...account, orders: [order, ...account.orders].slice(0, 100) };
    saveAccount(working);
    return { account: working, order };
  }

  const fillPrice = input.type === "market" ? input.lastPrice : (input.limitPrice as number);
  const notional = fillPrice * input.qty;
  const cashDelta = input.side === "buy" ? -notional : notional;
  if (input.side === "buy" && account.cash + cashDelta < -1e-6) {
    order.status = "rejected";
    order.note = "Insufficient buying power";
    order.updatedAt = now;
    const rejected = { ...account, orders: [order, ...account.orders].slice(0, 100) };
    saveAccount(rejected);
    return { account: rejected, order };
  }

  order.status = "filled";
  order.filledPrice = fillPrice;
  order.updatedAt = now;
  const positions = upsertPosition(account.positions, input.symbol, input.side, input.qty, fillPrice);
  const fill: PaperFill = {
    id: uid("fill"),
    orderId: order.id,
    symbol: input.symbol,
    side: input.side,
    qty: input.qty,
    price: fillPrice,
    at: now,
  };
  const next = markEquity(
    {
      ...account,
      cash: account.cash + cashDelta,
      orders: [order, ...account.orders].slice(0, 100),
      positions,
      fills: [fill, ...account.fills].slice(0, 200),
    },
    { [input.symbol]: fillPrice },
  );
  saveAccount(next);
  return { account: next, order };
}

export function cancelOrder(account: PaperAccount, orderId: string): PaperAccount {
  const next = {
    ...account,
    orders: account.orders.map((o) =>
      o.id === orderId && o.status === "working" ? { ...o, status: "cancelled" as const, updatedAt: Date.now() } : o,
    ),
  };
  saveAccount(next);
  return next;
}

export function matchWorkingOrders(account: PaperAccount, symbol: string, lastPrice: number): PaperAccount {
  let next = account;
  const working = account.orders.filter((o) => o.status === "working" && o.symbol === symbol && o.type === "limit");
  for (const order of working) {
    const hit =
      (order.side === "buy" && order.limitPrice != null && lastPrice <= order.limitPrice) ||
      (order.side === "sell" && order.limitPrice != null && lastPrice >= order.limitPrice);
    if (!hit) continue;
    const stripped = {
      ...next,
      orders: next.orders.filter((o) => o.id !== order.id),
    };
    next = placePaperOrder(stripped, {
      symbol: order.symbol,
      side: order.side,
      type: "market",
      qty: order.qty,
      lastPrice: order.limitPrice ?? lastPrice,
    }).account;
  }
  return next;
}

export function queueBrokerOrder(
  account: PaperAccount,
  input: {
    symbol: string;
    side: TradeSide;
    type: OrderType;
    qty: number;
    limitPrice?: number;
    targetOrigin?: string;
  },
): { account: PaperAccount; order: PaperOrder; requestId: string } {
  const now = Date.now();
  const requestId = uid("req");
  const order: PaperOrder = {
    id: requestId,
    symbol: input.symbol,
    side: input.side,
    type: input.type,
    qty: input.qty,
    limitPrice: input.limitPrice,
    status: "sent",
    createdAt: now,
    updatedAt: now,
    note: "Sent to broker bridge",
  };
  const msg: BrokerBridgeRequest = {
    source: "forge-charts",
    type: "brokerOrderRequest",
    requestId,
    symbol: input.symbol,
    side: input.side,
    orderType: input.type,
    qty: input.qty,
    limitPrice: input.limitPrice,
  };
  try {
    window.parent?.postMessage(msg, input.targetOrigin || "*");
  } catch {
    /* ignore */
  }
  const next = { ...account, mode: "broker" as const, orders: [order, ...account.orders].slice(0, 100) };
  saveAccount(next);
  return { account: next, order, requestId };
}

export function applyBrokerUpdate(account: PaperAccount, update: BrokerBridgeUpdate, lastPrice: number): PaperAccount {
  const order = account.orders.find((o) => o.id === update.requestId);
  if (!order) return account;
  if (update.status === "filled") {
    const stripped = { ...account, orders: account.orders.filter((o) => o.id !== order.id) };
    return placePaperOrder(stripped, {
      symbol: order.symbol,
      side: order.side,
      type: "market",
      qty: order.qty,
      lastPrice: update.fillPrice ?? lastPrice,
    }).account;
  }
  const next = {
    ...account,
    orders: account.orders.map((o) =>
      o.id === order.id
        ? {
            ...o,
            status: update.status === "working" ? ("working" as const) : update.status,
            note: update.message ?? o.note,
            updatedAt: Date.now(),
          }
        : o,
    ),
  };
  saveAccount(next);
  return next;
}
