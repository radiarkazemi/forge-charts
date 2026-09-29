import { createStore, type KeyValueStorage, type Store } from "@/application";
import {
  bareDemoTicker,
  bidAskFromMid,
  DEFAULT_XAU_INSTRUMENT,
  demoInstrumentFor,
  markPriceForSide,
  requiredMargin,
  roundToTick,
  tradeValue,
  unrealizedPnl,
  type DemoAccount,
  type DemoInstrument,
  type DemoOrder,
  type DemoOrderType,
  type DemoPosition,
  type DemoSide,
  type DemoSpaceState,
  type DemoTradingSnapshot,
} from "./types";

const STORAGE_KEY = "forge.demoTrading.v1";
const DEFAULT_EXIT_TICKS = 200;

function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function defaultAccount(balance = 100_000): DemoAccount {
  const now = Date.now();
  return {
    id: uid("acct"),
    name: "Demo Account",
    currency: "USD",
    balance,
    equity: balance,
    createdAt: now,
    leverage: DEFAULT_XAU_INSTRUMENT.leverage,
    spreadPoints: DEFAULT_XAU_INSTRUMENT.spreadPoints,
  };
}

const IDLE_SPACE: DemoSpaceState = {
  active: false,
  symbol: "",
  startTimeSec: null,
  cursorTimeSec: null,
  lastPrice: null,
  playing: false,
};

function initialSnapshot(account: DemoAccount): DemoTradingSnapshot {
  return {
    accounts: [account],
    activeAccountId: account.id,
    positions: [],
    orders: [],
    history: [],
    qty: 0.02,
    orderType: "market",
    side: "buy",
    entryPrice: null,
    takeProfitEnabled: false,
    stopLossEnabled: false,
    takeProfitPrice: null,
    stopLossPrice: null,
    takeProfitTicks: null,
    stopLossTicks: null,
    ticketOpen: false,
    dockOpen: true,
    space: IDLE_SPACE,
    instrument: { ...DEFAULT_XAU_INSTRUMENT, leverage: account.leverage, spreadPoints: account.spreadPoints },
  };
}

/**
 * Simulated broker for Forge Demo Trading (TradingView FxPro paper parity).
 *
 * Market: buy @ ask / sell @ bid.
 * Limit: buy ≤ ask, sell ≥ bid; fill when price crosses.
 * Stop: buy ≥ ask, sell ≤ bid; fill when price crosses.
 * Brackets: TP/SL vs fill (or pending entry); long TP>entry>SL, sell inverse.
 */
export class DemoTradingService {
  readonly state: Store<DemoTradingSnapshot>;

  constructor(private readonly storage: KeyValueStorage) {
    const loaded = this.load();
    this.state = createStore(loaded ?? initialSnapshot(defaultAccount()));
    this.state.subscribe(() => this.persist());
  }

  activeAccount(): DemoAccount {
    const s = this.state.get();
    return s.accounts.find((a) => a.id === s.activeAccountId) ?? s.accounts[0]!;
  }

  setDockOpen(open: boolean): void {
    this.patch({ dockOpen: open });
  }

  setTicketOpen(open: boolean): void {
    this.patch({ ticketOpen: open });
  }

  setQty(qty: number): void {
    this.patch({ qty: this.clampQty(qty) });
  }

  setOrderType(orderType: DemoOrderType): void {
    const s = this.state.get();
    const mid = s.space.lastPrice;
    let entryPrice = s.entryPrice;
    if (orderType !== "market" && mid != null && (entryPrice == null || s.orderType === "market")) {
      entryPrice = roundToTick(mid, s.instrument.tickSize);
    }
    if (orderType === "market") entryPrice = null;
    this.patch({ orderType, entryPrice });
    this.rebuildExitsFromTicks();
  }

  setSide(side: DemoSide): void {
    this.patch({ side });
    this.rebuildExitsFromTicks();
  }

  setEntryPrice(price: number | null): void {
    const s = this.state.get();
    const snapped = price == null ? null : roundToTick(price, s.instrument.tickSize);
    this.patch({ entryPrice: snapped });
    this.rebuildExitsFromTicks();
  }

  setTakeProfitEnabled(on: boolean): void {
    const s = this.state.get();
    if (!on) {
      this.patch({ takeProfitEnabled: false });
      return;
    }
    const entry = this.referenceEntry(s);
    const ticks = s.takeProfitTicks ?? DEFAULT_EXIT_TICKS;
    let tp = s.takeProfitPrice;
    if (tp == null && entry != null) {
      tp = this.priceFromTicks("tp", s.side, entry, ticks, s.instrument.tickSize);
    }
    const nextTicks =
      tp != null && entry != null
        ? Math.round(Math.abs(tp - entry) / s.instrument.tickSize)
        : ticks;
    this.patch({ takeProfitEnabled: true, takeProfitPrice: tp, takeProfitTicks: nextTicks });
  }

  setStopLossEnabled(on: boolean): void {
    const s = this.state.get();
    if (!on) {
      this.patch({ stopLossEnabled: false });
      return;
    }
    const entry = this.referenceEntry(s);
    const ticks = s.stopLossTicks ?? DEFAULT_EXIT_TICKS;
    let sl = s.stopLossPrice;
    if (sl == null && entry != null) {
      sl = this.priceFromTicks("sl", s.side, entry, ticks, s.instrument.tickSize);
    }
    const nextTicks =
      sl != null && entry != null
        ? Math.round(Math.abs(sl - entry) / s.instrument.tickSize)
        : ticks;
    this.patch({ stopLossEnabled: true, stopLossPrice: sl, stopLossTicks: nextTicks });
  }

  setTakeProfitPrice(price: number | null): void {
    const s = this.state.get();
    const entry = this.referenceEntry(s);
    const snapped = price == null ? null : roundToTick(price, s.instrument.tickSize);
    let ticks = s.takeProfitTicks;
    if (snapped != null && entry != null) {
      ticks = Math.round(Math.abs(snapped - entry) / s.instrument.tickSize);
    }
    this.patch({ takeProfitPrice: snapped, takeProfitTicks: ticks, takeProfitEnabled: snapped != null });
  }

  setStopLossPrice(price: number | null): void {
    const s = this.state.get();
    const entry = this.referenceEntry(s);
    const snapped = price == null ? null : roundToTick(price, s.instrument.tickSize);
    let ticks = s.stopLossTicks;
    if (snapped != null && entry != null) {
      ticks = Math.round(Math.abs(snapped - entry) / s.instrument.tickSize);
    }
    this.patch({ stopLossPrice: snapped, stopLossTicks: ticks, stopLossEnabled: snapped != null });
  }

  setTakeProfitTicks(ticks: number | null): void {
    const s = this.state.get();
    const entry = this.referenceEntry(s);
    if (ticks == null || entry == null) {
      this.patch({ takeProfitTicks: ticks });
      return;
    }
    const price = this.priceFromTicks("tp", s.side, entry, ticks, s.instrument.tickSize);
    this.patch({ takeProfitTicks: ticks, takeProfitPrice: price, takeProfitEnabled: true });
  }

  setStopLossTicks(ticks: number | null): void {
    const s = this.state.get();
    const entry = this.referenceEntry(s);
    if (ticks == null || entry == null) {
      this.patch({ stopLossTicks: ticks });
      return;
    }
    const price = this.priceFromTicks("sl", s.side, entry, ticks, s.instrument.tickSize);
    this.patch({ stopLossTicks: ticks, stopLossPrice: price, stopLossEnabled: true });
  }

  createAccount(name: string, balance: number, leverage?: number, spreadPoints?: number): DemoAccount {
    const acct: DemoAccount = {
      ...defaultAccount(balance),
      name: name.trim() || "Demo Account",
      leverage: leverage ?? DEFAULT_XAU_INSTRUMENT.leverage,
      spreadPoints: spreadPoints ?? DEFAULT_XAU_INSTRUMENT.spreadPoints,
    };
    const s = this.state.get();
    this.patch({
      accounts: [...s.accounts, acct],
      activeAccountId: acct.id,
      instrument: {
        ...s.instrument,
        leverage: acct.leverage,
        spreadPoints: acct.spreadPoints,
      },
    });
    return acct;
  }

  selectAccount(id: string): void {
    const acct = this.state.get().accounts.find((a) => a.id === id);
    if (!acct) return;
    this.patch({
      activeAccountId: id,
      instrument: {
        ...this.state.get().instrument,
        leverage: acct.leverage,
        spreadPoints: acct.spreadPoints,
      },
    });
    this.recalcEquity(this.state.get().space.lastPrice);
  }

  updateAccountSettings(partial: { leverage?: number; spreadPoints?: number; name?: string }): void {
    const s = this.state.get();
    const accounts = s.accounts.map((a) => {
      if (a.id !== s.activeAccountId) return a;
      return {
        ...a,
        leverage: partial.leverage ?? a.leverage,
        spreadPoints: partial.spreadPoints ?? a.spreadPoints,
        name: partial.name?.trim() || a.name,
      };
    });
    const active = accounts.find((a) => a.id === s.activeAccountId)!;
    this.patch({
      accounts,
      instrument: {
        ...s.instrument,
        leverage: active.leverage,
        spreadPoints: active.spreadPoints,
      },
    });
  }

  resetBalance(balance: number): void {
    const s = this.state.get();
    const accounts = s.accounts.map((a) =>
      a.id === s.activeAccountId ? { ...a, balance, equity: balance } : a,
    );
    const closed = s.positions
      .filter((p) => p.accountId === s.activeAccountId && p.status === "open")
      .map((p) => ({
        ...p,
        status: "closed" as const,
        closePrice: s.space.lastPrice ?? p.entryPrice,
        closeTime: Date.now(),
        realizedPnl: 0,
      }));
    this.patch({
      accounts,
      positions: s.positions.filter((p) => !(p.accountId === s.activeAccountId && p.status === "open")),
      history: [...closed, ...s.history].slice(0, 200),
      orders: s.orders.filter((o) => o.accountId !== s.activeAccountId || o.status !== "working"),
    });
  }

  /**
   * Chart ticker changed — drop stale mark from the previous symbol and swap
   * instrument specs (XAU ticks must not stick on Iran IRR gold).
   */
  onChartSymbol(symbol: string): void {
    const bare = bareDemoTicker(symbol);
    const s = this.state.get();
    if (s.space.active) return;
    if (!bare) return;
    if (s.instrument.symbol === bare && s.space.lastPrice != null) return;
    const instrument = this.instrumentFor(bare, s.instrument);
    const tickerChanged = s.instrument.symbol !== bare;
    this.patch({
      instrument: tickerChanged
        ? { ...instrument, leverage: this.activeAccount().leverage }
        : s.instrument,
      space: tickerChanged ? { ...s.space, lastPrice: null } : s.space,
    });
  }

  /** Update mark price (live quote or demo-space bar close). Evaluates TP/SL + working orders. */
  onMarkPrice(symbol: string, mid: number): void {
    const bare = bareDemoTicker(symbol);
    const s = this.state.get();
    if (s.space.active && s.space.symbol && bareDemoTicker(s.space.symbol) !== bare) return;
    if (!Number.isFinite(mid) || mid <= 0) return;
    const switched = s.instrument.symbol !== bare;
    const instrument = switched
      ? { ...this.instrumentFor(bare, s.instrument), leverage: this.activeAccount().leverage }
      : s.instrument;
    this.patch({
      space: { ...s.space, lastPrice: mid },
      instrument,
    });
    this.recalcEquity(mid);
    this.evaluateExits(bare, mid);
    this.evaluateWorkingOrders(bare, mid);
  }

  /** Mid for the charted symbol — never reuse another ticker’s lastPrice. */
  midForSymbol(symbol: string, quotePrice?: number | null): number | null {
    const bare = bareDemoTicker(symbol);
    const s = this.state.get();
    if (quotePrice != null && Number.isFinite(quotePrice) && quotePrice > 0) return quotePrice;
    if (s.instrument.symbol === bare && s.space.lastPrice != null && s.space.lastPrice > 0) {
      return s.space.lastPrice;
    }
    return null;
  }

  quotes(mid: number | null): { bid: number; ask: number; spreadPoints: number } | null {
    if (mid == null || !Number.isFinite(mid)) return null;
    return bidAskFromMid(mid, this.state.get().instrument);
  }

  ticketMetrics(mid: number | null): {
    tradeValue: number;
    margin: number;
    tickValue: number;
    bid: number;
    ask: number;
  } | null {
    if (mid == null || !Number.isFinite(mid)) return null;
    const s = this.state.get();
    const q = bidAskFromMid(mid, s.instrument);
    // Pending ticket uses limit/stop price; market uses ask/bid.
    const px =
      s.orderType !== "market" && s.entryPrice != null
        ? s.entryPrice
        : s.side === "buy"
          ? q.ask
          : q.bid;
    return {
      tradeValue: tradeValue(px, s.qty, s.instrument.contractSize),
      margin: requiredMargin(px, s.qty, s.instrument.contractSize, s.instrument.leverage),
      tickValue: s.qty * s.instrument.contractSize * s.instrument.tickSize,
      bid: q.bid,
      ask: q.ask,
    };
  }

  /** Place market / limit / stop from the order ticket or quick buttons. */
  placeOrder(opts: {
    side: DemoSide;
    type?: DemoOrderType;
    qty?: number;
    limitPrice?: number | null;
    mid: number;
    symbol: string;
    takeProfit?: number | null;
    stopLoss?: number | null;
  }): { ok: boolean; message: string; positionId?: string; orderId?: string } {
    const s = this.state.get();
    const type = opts.type ?? s.orderType;
    const qty = this.clampQty(opts.qty ?? s.qty);
    const instrument = this.instrumentFor(opts.symbol, s.instrument);
    const q = bidAskFromMid(opts.mid, { ...instrument, spreadPoints: s.instrument.spreadPoints });
    const fillPx = opts.side === "buy" ? q.ask : q.bid;
    const tp = opts.takeProfit ?? (s.takeProfitEnabled ? s.takeProfitPrice : null);
    const sl = opts.stopLoss ?? (s.stopLossEnabled ? s.stopLossPrice : null);

    if (type === "market") {
      const brackets = this.validateBrackets(opts.side, fillPx, tp, sl);
      if (!brackets.ok) return brackets;
      const opened = this.openPosition({
        side: opts.side,
        qty,
        price: fillPx,
        symbol: opts.symbol,
        takeProfit: tp,
        stopLoss: sl,
      });
      if (opened.ok) {
        this.recordFilledMarketOrder({
          side: opts.side,
          qty,
          symbol: opts.symbol,
          fillPrice: fillPx,
          takeProfit: tp,
          stopLoss: sl,
          positionId: opened.positionId ?? null,
        });
        this.evaluateExits(opts.symbol, opts.mid);
      }
      return opened;
    }

    const rawEntry = opts.limitPrice ?? s.entryPrice ?? fillPx;
    if (rawEntry == null || !Number.isFinite(rawEntry)) {
      return { ok: false, message: "Enter a limit/stop price" };
    }
    const entry = roundToTick(rawEntry, instrument.tickSize);

    const sideCheck = this.validatePendingSide(type, opts.side, entry, q.bid, q.ask);
    if (!sideCheck.ok) return sideCheck;

    const brackets = this.validateBrackets(opts.side, entry, tp, sl);
    if (!brackets.ok) return brackets;

    // Already marketable → fill immediately like TV.
    const marketable =
      type === "limit"
        ? opts.side === "buy"
          ? q.ask <= entry
          : q.bid >= entry
        : opts.side === "buy"
          ? q.ask >= entry
          : q.bid <= entry;
    if (marketable) {
      const opened = this.openPosition({
        side: opts.side,
        qty,
        price: fillPx,
        symbol: opts.symbol,
        takeProfit: tp,
        stopLoss: sl,
      });
      if (!opened.ok) return opened;
      this.recordFilledMarketOrder({
        side: opts.side,
        qty,
        symbol: opts.symbol,
        fillPrice: fillPx,
        takeProfit: tp,
        stopLoss: sl,
        positionId: opened.positionId ?? null,
        type,
        requestedPrice: entry,
      });
      this.evaluateExits(opts.symbol, opts.mid);
      return {
        ok: true,
        message: `${type.toUpperCase()} filled immediately @ ${fillPx}`,
        positionId: opened.positionId,
      };
    }

    const order: DemoOrder = {
      id: uid("ord"),
      accountId: s.activeAccountId,
      symbol: opts.symbol,
      side: opts.side,
      type,
      qty,
      price: entry,
      status: "working",
      createdAt: Date.now(),
      filledAt: null,
      fillPrice: null,
      takeProfit: tp,
      stopLoss: sl,
      positionId: null,
    };
    this.patch({ orders: [order, ...s.orders].slice(0, 100), ticketOpen: true });
    return { ok: true, message: `${type.toUpperCase()} order accepted @ ${entry}`, orderId: order.id };
  }

  openPosition(opts: {
    side: DemoSide;
    qty: number;
    price: number;
    symbol: string;
    takeProfit?: number | null;
    stopLoss?: number | null;
  }): { ok: boolean; message: string; positionId?: string } {
    const s = this.state.get();
    const acct = this.activeAccount();
    const margin = requiredMargin(opts.price, opts.qty, s.instrument.contractSize, s.instrument.leverage);
    const free = this.freeMargin(acct, s);
    if (free < margin) {
      return { ok: false, message: "Insufficient free margin" };
    }
    const pos: DemoPosition = {
      id: uid("pos"),
      accountId: acct.id,
      symbol: opts.symbol,
      side: opts.side,
      qty: opts.qty,
      entryPrice: opts.price,
      openTime: Date.now(),
      status: "open",
      takeProfit: opts.takeProfit ?? null,
      stopLoss: opts.stopLoss ?? null,
      closePrice: null,
      closeTime: null,
      realizedPnl: null,
      commission: 0,
    };
    this.patch({
      positions: [pos, ...s.positions],
      ticketOpen: true,
      side: opts.side,
    });
    this.recalcEquity(opts.price);
    return {
      ok: true,
      message: `${opts.side === "buy" ? "Buy" : "Sell"} ${opts.qty} filled @ ${opts.price}`,
      positionId: pos.id,
    };
  }

  closePosition(positionId: string, mark: number): { ok: boolean; message: string } {
    const s = this.state.get();
    const pos = s.positions.find((p) => p.id === positionId && p.status === "open");
    if (!pos) return { ok: false, message: "Position not found" };
    const closePx = markPriceForSide(pos.side, mark, s.instrument);
    const pnl = unrealizedPnl(pos.side, pos.qty, pos.entryPrice, closePx, s.instrument.contractSize);
    const closed: DemoPosition = {
      ...pos,
      status: "closed",
      closePrice: closePx,
      closeTime: Date.now(),
      realizedPnl: pnl,
    };
    const accounts = s.accounts.map((a) =>
      a.id === pos.accountId ? { ...a, balance: a.balance + pnl, equity: a.equity } : a,
    );
    this.patch({
      accounts,
      positions: s.positions.filter((p) => p.id !== positionId),
      history: [closed, ...s.history].slice(0, 200),
    });
    this.recalcEquity(mark);
    return {
      ok: true,
      message: `Closed ${pos.side} ${pos.qty} @ ${closePx} (${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)} USD)`,
    };
  }

  reversePosition(positionId: string, mark: number): { ok: boolean; message: string } {
    const s = this.state.get();
    const pos = s.positions.find((p) => p.id === positionId && p.status === "open");
    if (!pos) return { ok: false, message: "Position not found" };
    const close = this.closePosition(positionId, mark);
    if (!close.ok) return close;
    const side: DemoSide = pos.side === "buy" ? "sell" : "buy";
    return this.openPosition({
      side,
      qty: pos.qty,
      price: bidAskFromMid(mark, this.state.get().instrument)[side === "buy" ? "ask" : "bid"],
      symbol: pos.symbol,
      takeProfit: null,
      stopLoss: null,
    });
  }

  cancelOrder(orderId: string): void {
    const s = this.state.get();
    this.patch({
      orders: s.orders.map((o) => (o.id === orderId ? { ...o, status: "canceled" as const } : o)),
    });
  }

  updatePositionExits(positionId: string, takeProfit: number | null, stopLoss: number | null): void {
    const s = this.state.get();
    this.patch({
      positions: s.positions.map((p) => (p.id === positionId ? { ...p, takeProfit, stopLoss } : p)),
    });
  }

  updateOrderExits(orderId: string, takeProfit: number | null, stopLoss: number | null): void {
    const s = this.state.get();
    this.patch({
      orders: s.orders.map((o) => (o.id === orderId ? { ...o, takeProfit, stopLoss } : o)),
    });
  }

  activateSpace(symbol: string, startTimeSec: number, mid: number | null): void {
    this.patch({
      space: {
        active: true,
        symbol,
        startTimeSec,
        cursorTimeSec: startTimeSec,
        lastPrice: mid,
        playing: true,
      },
      ticketOpen: true,
      dockOpen: true,
    });
  }

  updateSpaceCursor(timeSec: number, mid: number): void {
    const s = this.state.get();
    if (!s.space.active) return;
    this.patch({
      space: { ...s.space, cursorTimeSec: timeSec, lastPrice: mid, playing: true },
    });
    this.onMarkPrice(s.space.symbol, mid);
  }

  deactivateSpace(): void {
    this.patch({ space: IDLE_SPACE });
  }

  openPositionsForSymbol(symbol: string): DemoPosition[] {
    const bare = symbol.includes(":") ? symbol.slice(symbol.lastIndexOf(":") + 1) : symbol;
    const acctId = this.state.get().activeAccountId;
    return this.state.get().positions.filter(
      (p) =>
        p.status === "open" &&
        p.accountId === acctId &&
        (p.symbol === symbol || p.symbol === bare || p.symbol.endsWith(bare)),
    );
  }

  workingOrdersForSymbol(symbol: string): DemoOrder[] {
    const bare = symbol.includes(":") ? symbol.slice(symbol.lastIndexOf(":") + 1) : symbol;
    const acctId = this.state.get().activeAccountId;
    return this.state.get().orders.filter(
      (o) =>
        o.status === "working" &&
        o.accountId === acctId &&
        (o.symbol === symbol || o.symbol === bare || o.symbol.endsWith(bare)),
    );
  }

  private evaluateExits(symbol: string, mid: number): void {
    const open = this.openPositionsForSymbol(symbol);
    for (const pos of open) {
      const mark = markPriceForSide(pos.side, mid, this.state.get().instrument);
      if (pos.takeProfit != null) {
        const hit = pos.side === "buy" ? mark >= pos.takeProfit : mark <= pos.takeProfit;
        if (hit) {
          this.closePosition(pos.id, mid);
          continue;
        }
      }
      if (pos.stopLoss != null) {
        const hit = pos.side === "buy" ? mark <= pos.stopLoss : mark >= pos.stopLoss;
        if (hit) this.closePosition(pos.id, mid);
      }
    }
  }

  private evaluateWorkingOrders(symbol: string, mid: number): void {
    const s = this.state.get();
    const q = bidAskFromMid(mid, s.instrument);
    const working = this.workingOrdersForSymbol(symbol);
    for (const order of working) {
      const px = order.price;
      if (px == null) continue;
      let fill = false;
      if (order.type === "limit") {
        fill = order.side === "buy" ? q.ask <= px : q.bid >= px;
      } else if (order.type === "stop") {
        fill = order.side === "buy" ? q.ask >= px : q.bid <= px;
      }
      if (!fill) continue;
      const fillPx = order.side === "buy" ? q.ask : q.bid;
      // Atomic: open first, then mark filled (TV does not leave orphan filled orders).
      const opened = this.openPosition({
        side: order.side,
        qty: order.qty,
        price: fillPx,
        symbol: order.symbol,
        takeProfit: order.takeProfit,
        stopLoss: order.stopLoss,
      });
      if (!opened.ok) {
        this.patch({
          orders: this.state.get().orders.map((o) =>
            o.id === order.id ? { ...o, status: "rejected" as const } : o,
          ),
        });
        continue;
      }
      this.patch({
        orders: this.state.get().orders.map((o) =>
          o.id === order.id
            ? {
                ...o,
                status: "filled" as const,
                filledAt: Date.now(),
                fillPrice: fillPx,
                positionId: opened.positionId ?? null,
              }
            : o,
        ),
      });
      this.evaluateExits(order.symbol, mid);
    }
  }

  private recordFilledMarketOrder(opts: {
    side: DemoSide;
    qty: number;
    symbol: string;
    fillPrice: number;
    takeProfit: number | null;
    stopLoss: number | null;
    positionId: string | null;
    type?: DemoOrderType;
    requestedPrice?: number;
  }): void {
    const s = this.state.get();
    const order: DemoOrder = {
      id: uid("ord"),
      accountId: s.activeAccountId,
      symbol: opts.symbol,
      side: opts.side,
      type: opts.type ?? "market",
      qty: opts.qty,
      price: opts.requestedPrice ?? opts.fillPrice,
      status: "filled",
      createdAt: Date.now(),
      filledAt: Date.now(),
      fillPrice: opts.fillPrice,
      takeProfit: opts.takeProfit,
      stopLoss: opts.stopLoss,
      positionId: opts.positionId,
    };
    this.patch({ orders: [order, ...s.orders].slice(0, 100) });
  }

  private validatePendingSide(
    type: DemoOrderType,
    side: DemoSide,
    entry: number,
    bid: number,
    ask: number,
  ): { ok: boolean; message: string } {
    if (type === "limit") {
      if (side === "buy" && entry > ask) {
        return { ok: false, message: `Buy Limit must be ≤ ask (${ask})` };
      }
      if (side === "sell" && entry < bid) {
        return { ok: false, message: `Sell Limit must be ≥ bid (${bid})` };
      }
    }
    if (type === "stop") {
      if (side === "buy" && entry < ask) {
        return { ok: false, message: `Buy Stop must be ≥ ask (${ask})` };
      }
      if (side === "sell" && entry > bid) {
        return { ok: false, message: `Sell Stop must be ≤ bid (${bid})` };
      }
    }
    return { ok: true, message: "" };
  }

  private validateBrackets(
    side: DemoSide,
    entry: number,
    tp: number | null | undefined,
    sl: number | null | undefined,
  ): { ok: boolean; message: string } {
    if (tp != null) {
      const ok = side === "buy" ? tp > entry : tp < entry;
      if (!ok) {
        return {
          ok: false,
          message: side === "buy" ? "Take profit must be above entry" : "Take profit must be below entry",
        };
      }
    }
    if (sl != null) {
      const ok = side === "buy" ? sl < entry : sl > entry;
      if (!ok) {
        return {
          ok: false,
          message: side === "buy" ? "Stop loss must be below entry" : "Stop loss must be above entry",
        };
      }
    }
    return { ok: true, message: "" };
  }

  private referenceEntry(s: DemoTradingSnapshot): number | null {
    if (s.orderType !== "market" && s.entryPrice != null) return s.entryPrice;
    const mid = s.space.lastPrice;
    if (mid == null) return s.entryPrice;
    const q = bidAskFromMid(mid, s.instrument);
    return s.side === "buy" ? q.ask : q.bid;
  }

  private rebuildExitsFromTicks(): void {
    const s = this.state.get();
    const entry = this.referenceEntry(s);
    if (entry == null) return;
    const patch: {
      takeProfitPrice?: number;
      stopLossPrice?: number;
    } = {};
    if (s.takeProfitEnabled && s.takeProfitTicks != null) {
      patch.takeProfitPrice = this.priceFromTicks("tp", s.side, entry, s.takeProfitTicks, s.instrument.tickSize);
    }
    if (s.stopLossEnabled && s.stopLossTicks != null) {
      patch.stopLossPrice = this.priceFromTicks("sl", s.side, entry, s.stopLossTicks, s.instrument.tickSize);
    }
    if (Object.keys(patch).length) this.patch(patch);
  }

  private priceFromTicks(
    kind: "tp" | "sl",
    side: DemoSide,
    entry: number,
    ticks: number,
    tickSize: number,
  ): number {
    const delta = ticks * tickSize;
    if (kind === "tp") {
      return roundToTick(side === "buy" ? entry + delta : entry - delta, tickSize);
    }
    return roundToTick(side === "buy" ? entry - delta : entry + delta, tickSize);
  }

  private clampQty(qty: number): number {
    const { instrument } = this.state.get();
    return Math.max(instrument.minLot, Math.min(instrument.maxLot, roundToTick(qty, instrument.lotStep)));
  }

  private freeMargin(acct: DemoAccount, s: DemoTradingSnapshot): number {
    let used = 0;
    for (const p of s.positions.filter((x) => x.accountId === acct.id && x.status === "open")) {
      used += requiredMargin(p.entryPrice, p.qty, s.instrument.contractSize, s.instrument.leverage);
    }
    return acct.equity - used;
  }

  private recalcEquity(mid: number | null): void {
    const s = this.state.get();
    const acct = this.activeAccount();
    let unrealized = 0;
    if (mid != null) {
      for (const p of s.positions.filter((x) => x.accountId === acct.id && x.status === "open")) {
        const mark = markPriceForSide(p.side, mid, s.instrument);
        unrealized += unrealizedPnl(p.side, p.qty, p.entryPrice, mark, s.instrument.contractSize);
      }
    }
    const equity = acct.balance + unrealized;
    this.patch({
      accounts: s.accounts.map((a) => (a.id === acct.id ? { ...a, equity } : a)),
    });
  }

  private instrumentFor(symbol: string, base: DemoInstrument): DemoInstrument {
    return demoInstrumentFor(symbol, base);
  }

  private patch(partial: Partial<DemoTradingSnapshot>): void {
    this.state.update((s) => ({ ...s, ...partial }));
  }

  private persist(): void {
    try {
      const s = this.state.get();
      const toSave: DemoTradingSnapshot = {
        ...s,
        space: IDLE_SPACE,
        ticketOpen: false,
      };
      this.storage.set(STORAGE_KEY, toSave);
    } catch {
      /* ignore */
    }
  }

  private load(): DemoTradingSnapshot | null {
    try {
      const raw = this.storage.get<DemoTradingSnapshot | null>(STORAGE_KEY, null);
      if (!raw || !Array.isArray(raw.accounts) || raw.accounts.length === 0) return null;
      return {
        ...initialSnapshot(raw.accounts[0]!),
        ...raw,
        space: IDLE_SPACE,
        ticketOpen: false,
        dockOpen: raw.dockOpen !== false,
        instrument: { ...DEFAULT_XAU_INSTRUMENT, ...raw.instrument },
      };
    } catch {
      return null;
    }
  }
}
