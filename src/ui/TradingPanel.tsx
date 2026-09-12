import { useEffect, useMemo, useState } from "react";
import {
  applyBrokerUpdate,
  buyingPower,
  cancelOrder,
  flattenPosition,
  loadAccount,
  markEquity,
  matchWorkingOrders,
  placePaperOrder,
  queueBrokerOrder,
  resetAccount,
  reversePosition,
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

type PanelTab = "trade" | "positions" | "orders" | "history" | "account";

/** TradingView-style Trading Panel (paper demo + optional broker bridge). */
export function TradingPanel({ symbol, lastPrice, precision = 2, brokerOrigin }: Props) {
  const [account, setAccount] = useState<PaperAccount>(() => loadAccount());
  const [side, setSide] = useState<TradeSide>("buy");
  const [orderType, setOrderType] = useState<OrderType>("market");
  const [qty, setQty] = useState(1);
  const [limit, setLimit] = useState(lastPrice);
  const [stop, setStop] = useState(lastPrice);
  const [takeProfit, setTakeProfit] = useState("");
  const [stopLoss, setStopLoss] = useState("");
  const [riskPct, setRiskPct] = useState("");
  const [tab, setTab] = useState<PanelTab>("trade");
  const [msg, setMsg] = useState<string | null>(null);

  const bid = lastPrice * 0.9999;
  const ask = lastPrice * 1.0001;
  const spread = ask - bid;

  useEffect(() => {
    setLimit(lastPrice);
    setStop(lastPrice);
  }, [lastPrice, symbol]);

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
      const data = ev.data as { type?: string } | null;
      if (!data || data.type !== "brokerOrderUpdate") return;
      if (brokerOrigin && brokerOrigin !== "*" && ev.origin !== brokerOrigin) return;
      setAccount((prev) => applyBrokerUpdate(prev, data as Parameters<typeof applyBrokerUpdate>[1], lastPrice));
      setMsg(`Broker: ${(data as { status?: string }).status ?? "update"}`);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [brokerOrigin, lastPrice]);

  const pos = account.positions.find((p) => p.symbol === symbol);
  const unrealized = pos ? pos.qty * (lastPrice - pos.avgPrice) : 0;
  const bp = buyingPower(account);

  const applyRiskQty = (pct: number) => {
    if (!Number.isFinite(pct) || pct <= 0 || lastPrice <= 0) return;
    const riskCash = account.equity * (pct / 100);
    setQty(Math.max(0.0001, Math.floor((riskCash / lastPrice) * 10_000) / 10_000));
  };

  const setMode = (mode: ExecMode) => {
    const next = { ...account, mode };
    saveAccount(next);
    setAccount(next);
    setMsg(mode === "paper" ? "Paper trading" : "Broker bridge");
  };

  const brackets = () => ({
    takeProfit: takeProfit.trim() ? Number(takeProfit) : undefined,
    stopLoss: stopLoss.trim() ? Number(stopLoss) : undefined,
  });

  const submit = (forcedSide?: TradeSide) => {
    const s = forcedSide ?? side;
    const q = Math.max(0.0001, Number(qty) || 0);
    if (!Number.isFinite(q) || q <= 0) {
      setMsg("Enter a valid quantity");
      return;
    }
    const needsLimit = orderType === "limit" || orderType === "stop_limit";
    const needsStop = orderType === "stop" || orderType === "stop_limit";
    if (needsLimit && !Number.isFinite(Number(limit))) {
      setMsg("Enter a limit price");
      return;
    }
    if (needsStop && !Number.isFinite(Number(stop))) {
      setMsg("Enter a stop price");
      return;
    }
    const br = brackets();
    if (account.mode === "broker") {
      const { account: next, requestId } = queueBrokerOrder(account, {
        symbol,
        side: s,
        type: orderType,
        qty: q,
        limitPrice: needsLimit ? Number(limit) : undefined,
        stopPrice: needsStop ? Number(stop) : undefined,
        takeProfit: br.takeProfit,
        stopLoss: br.stopLoss,
        targetOrigin: brokerOrigin,
      });
      setAccount(next);
      setMsg(`Sent ${requestId} to broker`);
      return;
    }
    const { account: next, order } = placePaperOrder(account, {
      symbol,
      side: s,
      type: orderType,
      qty: q,
      limitPrice: needsLimit ? Number(limit) : undefined,
      stopPrice: needsStop ? Number(stop) : undefined,
      takeProfit: br.takeProfit,
      stopLoss: br.stopLoss,
      lastPrice: s === "buy" ? ask : bid,
    });
    setAccount(next);
    setMsg(
      `${s.toUpperCase()} ${order.status}${
        order.filledPrice != null ? ` @ ${formatPrice(order.filledPrice, precision)}` : ""
      }`,
    );
  };

  const onFlatten = () => {
    const { account: next, order } = flattenPosition(account, symbol, lastPrice);
    setAccount(next);
    setMsg(order ? `Flattened ${symbol}` : "No position to flatten");
  };

  const onReverse = () => {
    const { account: next, order } = reversePosition(account, symbol, lastPrice);
    setAccount(next);
    setMsg(order ? `Reversed ${symbol}` : "No position to reverse");
  };

  const working = useMemo(
    () => account.orders.filter((o) => o.status === "working" || o.status === "sent"),
    [account.orders],
  );

  const orderSummary = (() => {
    const px =
      orderType === "market"
        ? side === "buy"
          ? ask
          : bid
        : orderType === "stop"
          ? Number(stop)
          : Number(limit);
    return Number.isFinite(px) ? px * Math.max(0, Number(qty) || 0) : 0;
  })();

  return (
    <div className="tv-trade">
      <header className="tv-trade-head">
        <div className="tv-trade-account">
          <strong>{account.mode === "paper" ? "Paper Trading" : "Broker bridge"}</strong>
          <em>
            {formatPrice(account.equity, 2)} {account.currency}
          </em>
        </div>
        <div className="tv-trade-mode">
          <button type="button" className={account.mode === "paper" ? "on" : ""} onClick={() => setMode("paper")}>
            Paper
          </button>
          <button type="button" className={account.mode === "broker" ? "on" : ""} onClick={() => setMode("broker")}>
            Broker
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => {
              setAccount(resetAccount(account.mode));
              setMsg("Account reset · $100,000");
            }}
          >
            Reset
          </button>
        </div>
      </header>

      <div className="tv-trade-quotes">
        <button type="button" className="tv-bid" onClick={() => setSide("sell")} title="Sell at bid">
          <span>Bid</span>
          <b>{formatPrice(bid, precision)}</b>
        </button>
        <div className="tv-spread">
          <span>Spread</span>
          <b>{formatPrice(spread, Math.max(precision, 4))}</b>
        </div>
        <button type="button" className="tv-ask" onClick={() => setSide("buy")} title="Buy at ask">
          <span>Ask</span>
          <b>{formatPrice(ask, precision)}</b>
        </button>
      </div>

      <nav className="tv-trade-tabs" aria-label="Trading panel">
        {(
          [
            ["trade", "Trade"],
            ["positions", "Positions"],
            ["orders", "Orders"],
            ["history", "History"],
            ["account", "Account"],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" className={tab === id ? "on" : ""} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </nav>

      {tab === "trade" ? (
        <div className="tv-trade-ticket">
          <div className="tv-side-pair">
            <button type="button" className={side === "buy" ? "buy on" : "buy"} onClick={() => setSide("buy")}>
              Buy
            </button>
            <button type="button" className={side === "sell" ? "sell on" : "sell"} onClick={() => setSide("sell")}>
              Sell
            </button>
          </div>

          <div className="tv-order-types">
            {(
              [
                ["market", "Market"],
                ["limit", "Limit"],
                ["stop", "Stop"],
                ["stop_limit", "Stop Limit"],
              ] as const
            ).map(([id, label]) => (
              <button key={id} type="button" className={orderType === id ? "on" : ""} onClick={() => setOrderType(id)}>
                {label}
              </button>
            ))}
          </div>

          <div className="tv-fields">
            <label>
              Units
              <input type="number" min={0} step="any" value={qty} onChange={(e) => setQty(Number(e.target.value))} />
            </label>
            <label>
              Risk %
              <input
                type="number"
                min={0}
                step="0.1"
                placeholder="e.g. 1"
                value={riskPct}
                onChange={(e) => {
                  setRiskPct(e.target.value);
                  applyRiskQty(Number(e.target.value));
                }}
              />
            </label>
            {orderType === "limit" || orderType === "stop_limit" ? (
              <label>
                Limit
                <input type="number" step="any" value={limit} onChange={(e) => setLimit(Number(e.target.value))} />
              </label>
            ) : null}
            {orderType === "stop" || orderType === "stop_limit" ? (
              <label>
                Stop
                <input type="number" step="any" value={stop} onChange={(e) => setStop(Number(e.target.value))} />
              </label>
            ) : null}
            <label>
              Take profit
              <input
                type="number"
                step="any"
                placeholder="Optional"
                value={takeProfit}
                onChange={(e) => setTakeProfit(e.target.value)}
              />
            </label>
            <label>
              Stop loss
              <input
                type="number"
                step="any"
                placeholder="Optional"
                value={stopLoss}
                onChange={(e) => setStopLoss(e.target.value)}
              />
            </label>
          </div>

          <div className="tv-order-summary">
            <span>
              {symbol} · {orderType.replace("_", " ")}
            </span>
            <span>
              Est. value <b>{formatPrice(orderSummary, 2)}</b> {account.currency}
            </span>
            <span>
              Buying power <b>{formatPrice(bp, 2)}</b>
            </span>
          </div>

          <div className="tv-submit-row">
            <button type="button" className="buy-submit" onClick={() => submit("buy")}>
              Buy {symbol}
            </button>
            <button type="button" className="sell-submit" onClick={() => submit("sell")}>
              Sell {symbol}
            </button>
          </div>

          <div className="tv-pos-actions">
            <button type="button" disabled={!pos} onClick={onFlatten}>
              Flatten
            </button>
            <button type="button" disabled={!pos} onClick={onReverse}>
              Reverse
            </button>
            {pos ? (
              <em className={unrealized >= 0 ? "up" : "down"}>
                {pos.qty > 0 ? "Long" : "Short"} {Math.abs(pos.qty)} · P/L {formatPrice(unrealized, 2)}
              </em>
            ) : (
              <em className="muted">No position in {symbol}</em>
            )}
          </div>
        </div>
      ) : null}

      {tab === "positions" ? (
        <div className="tv-trade-table-wrap">
          <table className="tv-trade-table">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Side</th>
                <th>Qty</th>
                <th>Avg</th>
                <th>P/L</th>
                <th>TP / SL</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {account.positions.length ? (
                account.positions.map((p) => {
                  const mark = p.symbol === symbol ? lastPrice : p.avgPrice;
                  const u = p.qty * (mark - p.avgPrice);
                  return (
                    <tr key={p.symbol}>
                      <td>
                        <strong>{p.symbol}</strong>
                      </td>
                      <td className={p.qty > 0 ? "up" : "down"}>{p.qty > 0 ? "Long" : "Short"}</td>
                      <td>{Math.abs(p.qty)}</td>
                      <td>{formatPrice(p.avgPrice, precision)}</td>
                      <td className={u >= 0 ? "up" : "down"}>{formatPrice(u, 2)}</td>
                      <td>
                        {p.takeProfit != null ? formatPrice(p.takeProfit, precision) : "—"} /{" "}
                        {p.stopLoss != null ? formatPrice(p.stopLoss, precision) : "—"}
                      </td>
                      <td>
                        <button
                          type="button"
                          onClick={() => {
                            const { account: next } = flattenPosition(account, p.symbol, mark);
                            setAccount(next);
                          }}
                        >
                          Close
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="muted">
                    No open positions
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : null}

      {tab === "orders" ? (
        <div className="tv-trade-table-wrap">
          <table className="tv-trade-table">
            <thead>
              <tr>
                <th>Side</th>
                <th>Qty</th>
                <th>Symbol</th>
                <th>Type</th>
                <th>Price</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {working.length ? (
                working.map((o) => (
                  <tr key={o.id}>
                    <td className={o.side === "buy" ? "up" : "down"}>{o.side.toUpperCase()}</td>
                    <td>{o.qty}</td>
                    <td>{o.symbol}</td>
                    <td>{o.type.replace("_", " ")}</td>
                    <td>
                      {o.stopPrice != null ? `STP ${formatPrice(o.stopPrice, precision)} ` : ""}
                      {o.limitPrice != null
                        ? `LMT ${formatPrice(o.limitPrice, precision)}`
                        : o.type === "market"
                          ? "MKT"
                          : ""}
                    </td>
                    <td>{o.status}</td>
                    <td>
                      {o.status === "working" ? (
                        <button type="button" onClick={() => setAccount(cancelOrder(account, o.id))}>
                          Cancel
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="muted">
                    No working orders
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : null}

      {tab === "history" ? (
        <div className="tv-trade-table-wrap">
          <table className="tv-trade-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Side</th>
                <th>Qty</th>
                <th>Symbol</th>
                <th>Price</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {account.fills.length ? (
                account.fills.slice(0, 40).map((f) => (
                  <tr key={f.id}>
                    <td>{new Date(f.at).toLocaleString()}</td>
                    <td className={f.side === "buy" ? "up" : "down"}>{f.side.toUpperCase()}</td>
                    <td>{f.qty}</td>
                    <td>{f.symbol}</td>
                    <td>{formatPrice(f.price, precision)}</td>
                    <td>filled</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="muted">
                    No trade history
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : null}

      {tab === "account" ? (
        <div className="tv-trade-account-panel">
          <ul className="objects">
            <li>Account — {account.mode === "paper" ? "Paper Trading (demo)" : "External broker bridge"}</li>
            <li>
              Equity — {formatPrice(account.equity, 2)} {account.currency}
            </li>
            <li>
              Cash — {formatPrice(account.cash, 2)} {account.currency}
            </li>
            <li>
              Buying power — {formatPrice(bp, 2)} {account.currency}
            </li>
            <li>
              Open P/L — <span className={unrealized >= 0 ? "up" : "down"}>{formatPrice(unrealized, 2)}</span>
            </li>
            <li>Open positions — {account.positions.length}</li>
            <li>Working orders — {working.length}</li>
            <li>Fills — {account.fills.length}</li>
          </ul>
          <p className="hint">
            {account.mode === "broker"
              ? "Parent posts brokerOrderUpdate for each brokerOrderRequest. No broker passwords are stored in Forge."
              : "Paper fills use bid/ask around last. Brackets (TP/SL) and stop orders are simulated locally."}
          </p>
        </div>
      ) : null}

      {msg ? <div className="tv-trade-msg">{msg}</div> : null}
    </div>
  );
}
