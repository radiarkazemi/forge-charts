import { createStore, type KeyValueStorage, type Store } from "@/application";
import {
  bidAskFromMid,
  DEFAULT_XAU_INSTRUMENT,
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
    side: "sell",
    takeProfitEnabled: false,
    stopLossEnabled: false,
    takeProfitPrice: null,
    stopLossPrice: null,
    ticketOpen: false,
    dockOpen: true,
    space: IDLE_SPACE,
    instrument: { ...DEFAULT_XAU_INSTRUMENT, leverage: account.leverage, spreadPoints: account.spreadPoints },
  };
}

/**
 * Simulated broker for Forge Demo Trading (TradingView paper-trading parity on Advanced Charts).
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
    const { instrument } = this.state.get();
    const stepped = Math.max(instrument.minLot, Math.min(instrument.maxLot, roundToTick(qty, instrument.lotStep)));
    this.patch({ qty: stepped });
  }

  setOrderType(orderType: DemoOrderType): void {
    this.patch({ orderType });
  }

  setSide(side: DemoSide): void {
    this.patch({ side });
  }

  setTakeProfitEnabled(on: boolean): void {
    this.patch({ takeProfitEnabled: on });
  }

  setStopLossEnabled(on: boolean): void {
    this.patch({ stopLossEnabled: on });
  }

  setTakeProfitPrice(price: number | null): void {
    this.patch({ takeProfitPrice: price });
  }

  setStopLossPrice(price: number | null): void {
    this.patch({ stopLossPrice: price });
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
    // Close all open positions on this account when resetting.
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

  /** Update mark price (live quote or demo-space bar close). Evaluates TP/SL. */
  onMarkPrice(symbol: string, mid: number): void {
    const s = this.state.get();
    if (s.space.active && s.space.symbol && s.space.symbol !== symbol) return;
    const instrument = this.instrumentFor(symbol, s.instrument);
    this.patch({
      space: { ...s.space, lastPrice: mid },
      instrument: s.instrument.symbol === symbol ? s.instrument : instrument,
    });
    this.recalcEquity(mid);
    this.evaluateExits(symbol, mid);
    this.evaluateWorkingOrders(symbol, mid);
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
    const px = s.side === "buy" ? q.ask : q.bid;
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
    const qty = opts.qty ?? s.qty;
    const instrument = this.instrumentFor(opts.symbol, s.instrument);
    const q = bidAskFromMid(opts.mid, { ...instrument, spreadPoints: s.instrument.spreadPoints });
    const fillPx = opts.side === "buy" ? q.ask : q.bid;
    const tp = opts.takeProfit ?? (s.takeProfitEnabled ? s.takeProfitPrice : null);
    const sl = opts.stopLoss ?? (s.stopLossEnabled ? s.stopLossPrice : null);

    if (type === "market") {
      return this.openPosition({
        side: opts.side,
        qty,
        price: fillPx,
        symbol: opts.symbol,
        takeProfit: tp,
        stopLoss: sl,
      });
    }

    const order: DemoOrder = {
      id: uid("ord"),
      accountId: s.activeAccountId,
      symbol: opts.symbol,
      side: opts.side,
      type,
      qty,
      price: opts.limitPrice ?? fillPx,
      status: "working",
      createdAt: Date.now(),
      filledAt: null,
      fillPrice: null,
      takeProfit: tp,
      stopLoss: sl,
      positionId: null,
    };
    this.patch({ orders: [order, ...s.orders].slice(0, 100), ticketOpen: true });
    return { ok: true, message: `${type.toUpperCase()} order accepted`, orderId: order.id };
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
    if (acct.equity < margin) {
      return { ok: false, message: "Insufficient margin" };
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
    return { ok: true, message: `${opts.side === "buy" ? "Buy" : "Sell"} ${opts.qty} filled @ ${opts.price}`, positionId: pos.id };
  }

  closePosition(positionId: string, mark: number): { ok: boolean; message: string } {
    const s = this.state.get();
    const pos = s.positions.find((p) => p.id === positionId && p.status === "open");
    if (!pos) return { ok: false, message: "Position not found" };
    const q = bidAskFromMid(mark, s.instrument);
    // Close long at bid, close short at ask (standard).
    const closePx = pos.side === "buy" ? q.bid : q.ask;
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
    return { ok: true, message: `Closed ${pos.side} ${pos.qty} @ ${closePx} (${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)} USD)` };
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
      positions: s.positions.map((p) =>
        p.id === positionId ? { ...p, takeProfit, stopLoss } : p,
      ),
    });
  }

  /** Enter historical demo space (caller drives bar playback). */
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
    return this.state.get().positions.filter(
      (p) => p.status === "open" && (p.symbol === symbol || p.symbol === bare || p.symbol.endsWith(bare)),
    );
  }

  private evaluateExits(symbol: string, mid: number): void {
    const open = this.openPositionsForSymbol(symbol);
    for (const pos of open) {
      const q = bidAskFromMid(mid, this.state.get().instrument);
      const mark = pos.side === "buy" ? q.bid : q.ask;
      if (pos.takeProfit != null) {
        const hit =
          pos.side === "buy" ? mark >= pos.takeProfit : mark <= pos.takeProfit;
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
    for (const order of s.orders.filter((o) => o.status === "working")) {
      const bare = order.symbol.includes(":")
        ? order.symbol.slice(order.symbol.lastIndexOf(":") + 1)
        : order.symbol;
      const symBare = symbol.includes(":") ? symbol.slice(symbol.lastIndexOf(":") + 1) : symbol;
      if (bare !== symBare) continue;
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
      this.patch({
        orders: this.state.get().orders.map((o) =>
          o.id === order.id
            ? { ...o, status: "filled" as const, filledAt: Date.now(), fillPrice: fillPx }
            : o,
        ),
      });
      this.openPosition({
        side: order.side,
        qty: order.qty,
        price: fillPx,
        symbol: order.symbol,
        takeProfit: order.takeProfit,
        stopLoss: order.stopLoss,
      });
    }
  }

  private recalcEquity(mid: number | null): void {
    const s = this.state.get();
    const acct = this.activeAccount();
    let unrealized = 0;
    if (mid != null) {
      for (const p of s.positions.filter((x) => x.accountId === acct.id && x.status === "open")) {
        const q = bidAskFromMid(mid, s.instrument);
        const mark = p.side === "buy" ? q.bid : q.ask;
        unrealized += unrealizedPnl(p.side, p.qty, p.entryPrice, mark, s.instrument.contractSize);
      }
    }
    const equity = acct.balance + unrealized;
    this.patch({
      accounts: s.accounts.map((a) => (a.id === acct.id ? { ...a, equity } : a)),
    });
  }

  private instrumentFor(symbol: string, base: DemoInstrument): DemoInstrument {
    const bare = symbol.includes(":") ? symbol.slice(symbol.lastIndexOf(":") + 1) : symbol;
    return { ...base, symbol: bare };
  }

  private patch(partial: Partial<DemoTradingSnapshot>): void {
    this.state.update((s) => ({ ...s, ...partial }));
  }

  private persist(): void {
    try {
      const s = this.state.get();
      // Don't persist ephemeral space playback cursor deeply — keep start flag off after reload.
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
