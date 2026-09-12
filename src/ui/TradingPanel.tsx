import { useEffect, useMemo, useState } from "react";
import {
  applyBrokerUpdate,
  cancelOrder,
  loadAccount,
  markEquity,
  matchWorkingOrders,
  placePaperOrder,
  queueBrokerOrder,
  resetAccount,
  saveAccount,
  type ExecMode,
  type OrderType,
  type PaperAccount,
  type TradeSide,
} from "../data/paperTrading";
import { formatPrice } from "../engine/math";

type Props = {
  symbol: string;
  lastPrice: number;
  precision?: number;
  brokerOrigin?: string;
};

export function TradingPanel({ symbol, lastPrice, precision = 2, brokerOrigin }: Props) {
  const [account, setAccount] = useState<PaperAccount>(() => loadAccount());
  const [side, setSide] = useState<TradeSide>("buy");
  const [orderType, setOrderType] = useState<OrderType>("market");
  const [qty, setQty] = useState(1);
  const [limit, setLimit] = useState(lastPrice);
  const [tab, setTab] = useState<"ticket" | "positions" | "orders" | "fills">("ticket");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => setLimit(lastPrice), [lastPrice, symbol]);

  useEffect(() => {
    setAccount((prev) => {
      const matched = matchWorkingOrders(prev, symbol, lastPrice);
      const marked = markEquity(matched, { [symbol]: lastPrice });
      saveAccount(marked);
      return marked;
    });
  }, [lastPrice, symbol]);

  useEffect(() => {
    const onMsg = (ev: MessageEvent) => {
      const data = ev.data as { type?: string; source?: string } | null;
      if (!data || data.type !== "brokerOrderUpdate") return;
      if (brokerOrigin && brokerOrigin !== "*" && ev.origin !== brokerOrigin) return;
      setAccount((prev) =>
        applyBrokerUpdate(
          prev,
          data as Parameters<typeof applyBrokerUpdate>[1],
          lastPrice,
        ),
      );
      setMsg(`Broker update: ${(data as { status?: string }).status ?? "ok"}`);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [brokerOrigin, lastPrice]);

  const pos = account.positions.find((p) => p.symbol === symbol);
  const unrealized = pos ? pos.qty * (lastPrice - pos.avgPrice) : 0;

  const setMode = (mode: ExecMode) => {
    const next = { ...account, mode };
    saveAccount(next);
    setAccount(next);
    setMsg(mode === "paper" ? "Paper trading mode" : "Broker bridge mode");
  };

  const submit = () => {
    const q = Math.max(0.0001, Number(qty) || 0);
    if (!Number.isFinite(q) || q <= 0) {
      setMsg("Enter a valid quantity");
      return;
    }
    if (account.mode === "broker") {
      const { account: next, requestId } = queueBrokerOrder(account, {
        symbol,
        side,
        type: orderType,
        qty: q,
        limitPrice: orderType === "limit" ? Number(limit) : undefined,
        targetOrigin: brokerOrigin,
      });
      setAccount(next);
      setMsg(`Order ${requestId} sent to broker bridge`);
      return;
    }
    const { account: next, order } = placePaperOrder(account, {
      symbol,
      side,
      type: orderType,
      qty: q,
      limitPrice: orderType === "limit" ? Number(limit) : undefined,
      lastPrice,
    });
    setAccount(next);
    setMsg(
      `Order ${order.status}${order.filledPrice != null ? ` @ ${formatPrice(order.filledPrice, precision)}` : ""}`,
    );
  };

  const working = useMemo(
    () => account.orders.filter((o) => o.status === "working" || o.status === "sent"),
    [account.orders],
  );

  return (
    <div className="trading-panel">
      <div className="trading-mode">
        <button type="button" className={account.mode === "paper" ? "on" : ""} onClick={() => setMode("paper")}>
          Paper demo
        </button>
        <button type="button" className={account.mode === "broker" ? "on" : ""} onClick={() => setMode("broker")}>
          My broker
        </button>
        <button
          type="button"
          className="ghost"
          onClick={() => {
            setAccount(resetAccount(account.mode));
            setMsg("Account reset to $100,000");
          }}
        >
          Reset
        </button>
      </div>
      <div className="trading-equity">
        <span>
          Equity <b>{formatPrice(account.equity, 2)}</b> {account.currency}
        </span>
        <span>
          Cash <b>{formatPrice(account.cash, 2)}</b>
        </span>
        <span className={unrealized >= 0 ? "up" : "down"}>
          Open P/L <b>{formatPrice(unrealized, 2)}</b>
        </span>
      </div>
      <div className="trading-tabs">
        {(
          [
            ["ticket", "Ticket"],
            ["positions", "Positions"],
            ["orders", "Orders"],
            ["fills", "Fills"],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" className={tab === id ? "on" : ""} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {tab === "ticket" ? (
        <div className="trading-ticket">
          <div className="trading-side">
            <button type="button" className={side === "buy" ? "buy on" : "buy"} onClick={() => setSide("buy")}>
              Buy
            </button>
            <button type="button" className={side === "sell" ? "sell on" : "sell"} onClick={() => setSide("sell")}>
              Sell
            </button>
          </div>
          <label>
            Type
            <select value={orderType} onChange={(e) => setOrderType(e.target.value as OrderType)}>
              <option value="market">Market</option>
              <option value="limit">Limit</option>
            </select>
          </label>
          <label>
            Qty
            <input type="number" min={0} step="any" value={qty} onChange={(e) => setQty(Number(e.target.value))} />
          </label>
          {orderType === "limit" ? (
            <label>
              Limit
              <input type="number" step="any" value={limit} onChange={(e) => setLimit(Number(e.target.value))} />
            </label>
          ) : (
            <div className="trading-last">
              Last {formatPrice(lastPrice, precision)} · {symbol}
            </div>
          )}
          <button type="button" className={side === "buy" ? "primary buy-submit" : "primary sell-submit"} onClick={submit}>
            {account.mode === "broker" ? "Send to broker" : side === "buy" ? "Buy" : "Sell"} {symbol}
          </button>
          <p className="hint">
            {account.mode === "broker"
              ? "Parent app handles brokerOrderRequest and replies with brokerOrderUpdate."
              : "Paper fills simulate at last/limit. No real broker risk."}
          </p>
        </div>
      ) : null}

      {tab === "positions" ? (
        <ul className="objects trading-list">
          {account.positions.length ? (
            account.positions.map((p) => {
              const mark = p.symbol === symbol ? lastPrice : p.avgPrice;
              const u = p.qty * (mark - p.avgPrice);
              return (
                <li key={p.symbol}>
                  <strong>{p.symbol}</strong>
                  <span>
                    {p.qty > 0 ? "Long" : "Short"} {Math.abs(p.qty)} @ {formatPrice(p.avgPrice, precision)}
                  </span>
                  <em className={u >= 0 ? "up" : "down"}>{formatPrice(u, 2)}</em>
                </li>
              );
            })
          ) : (
            <li className="muted">No open positions</li>
          )}
        </ul>
      ) : null}

      {tab === "orders" ? (
        <ul className="objects trading-list">
          {working.length ? (
            working.map((o) => (
              <li key={o.id}>
                <strong>
                  {o.side.toUpperCase()} {o.qty} {o.symbol}
                </strong>
                <span>
                  {o.type} · {o.status}
                  {o.limitPrice != null ? ` · LMT ${formatPrice(o.limitPrice, precision)}` : ""}
                </span>
                {o.status === "working" ? (
                  <button type="button" onClick={() => setAccount(cancelOrder(account, o.id))}>
                    Cancel
                  </button>
                ) : null}
              </li>
            ))
          ) : (
            <li className="muted">No working orders</li>
          )}
        </ul>
      ) : null}

      {tab === "fills" ? (
        <ul className="objects trading-list">
          {account.fills.length ? (
            account.fills.slice(0, 30).map((f) => (
              <li key={f.id}>
                <strong>
                  {f.side.toUpperCase()} {f.qty} {f.symbol}
                </strong>
                <span>@ {formatPrice(f.price, precision)}</span>
                <em>{new Date(f.at).toLocaleString()}</em>
              </li>
            ))
          ) : (
            <li className="muted">No fills yet</li>
          )}
        </ul>
      ) : null}

      {msg ? <div className="trading-msg">{msg}</div> : null}
    </div>
  );
}
