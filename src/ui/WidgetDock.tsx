import { useMemo, useState } from "react";
import { EXCHANGES, watchlistSymbols } from "../data/feed";
import type { ChartEngine } from "../engine/ChartEngine";
import { formatPrice, formatVolume } from "../engine/math";
import type { SymbolInfo } from "../engine/types";
import { useEngine } from "./useEngine";

export type WidgetId = "watchlist" | "alerts" | "object" | "data" | "news" | "calendar";

const ICONS: { id: WidgetId; label: string; glyph: string }[] = [
  { id: "watchlist", label: "Watchlist", glyph: "☰" },
  { id: "alerts", label: "Alerts", glyph: "⏰" },
  { id: "object", label: "Object tree", glyph: "▣" },
  { id: "data", label: "Data Window", glyph: "▤" },
  { id: "news", label: "News", glyph: "◉" },
  { id: "calendar", label: "Calendar", glyph: "▦" },
];

type Props = {
  engine: ChartEngine | null;
  active: WidgetId | null;
  onActive: (id: WidgetId | null) => void;
  quotes: Record<string, { price: number; change: number }>;
  universe: SymbolInfo[];
  onPick: (s: SymbolInfo) => void;
  alerts: string[];
};

export function WidgetDock({ engine, active, onActive, quotes, universe, onPick, alerts }: Props) {
  const snap = useEngine(engine);
  const bar = snap?.hover ?? snap?.last;
  const [exchange, setExchange] = useState<"ALL" | "BINANCE" | "FOREXCOM">("ALL");
  const [q, setQ] = useState("");
  const rows = useMemo(() => {
    const query = q.trim().toLowerCase();
    const base = watchlistSymbols(universe).filter((s) => exchange === "ALL" || s.exchange === exchange);
    const filtered = query
      ? universe.filter(
          (s) =>
            (exchange === "ALL" || s.exchange === exchange) &&
            `${s.ticker} ${s.name} ${s.exchange}`.toLowerCase().includes(query),
        )
      : base;
    return filtered.slice(0, query ? 200 : 40);
  }, [universe, exchange, q]);

  return (
    <div className="widget-dock">
      {active ? (
        <div className="widget-panel">
          <header>
            <b>{ICONS.find((i) => i.id === active)?.label}</b>
            <button onClick={() => onActive(null)}>×</button>
          </header>
          {active === "watchlist" ? (
            <>
              <div className="seg modal-seg">
                <button className={exchange === "ALL" ? "on" : ""} onClick={() => setExchange("ALL")}>
                  All
                </button>
                {EXCHANGES.map((id) => (
                  <button key={id} className={exchange === id ? "on" : ""} onClick={() => setExchange(id)}>
                    {id}
                  </button>
                ))}
              </div>
              <input
                className="watch-search"
                placeholder="Filter symbols"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              <ul className="watch">
                {rows.map((s) => {
                  const qrow = quotes[s.ticker];
                  const on = snap?.symbol.ticker === s.ticker && snap?.symbol.exchange === s.exchange;
                  return (
                    <li key={`${s.exchange}:${s.ticker}`} className={on ? "on" : ""} onClick={() => onPick(s)}>
                      <div>
                        <strong>{s.ticker}</strong>
                        <span>{s.exchange}</span>
                      </div>
                      <div className={(qrow?.change ?? 0) >= 0 ? "up" : "down"}>
                        {qrow ? formatPrice(qrow.price, s.pricePrecision) : "—"}
                        <small>
                          {(qrow?.change ?? 0) >= 0 ? "+" : ""}
                          {(qrow?.change ?? 0).toFixed(2)}%
                        </small>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : null}
          {active === "object" ? (
            <ul className="objects">
              {snap?.indicators.map((ind) => (
                <li key={ind.id}>
                  <button className="link" onClick={() => engine?.toggleIndicator(ind.id)}>
                    {ind.visible ? "●" : "○"} {ind.kind.toUpperCase()} {ind.params.join(",")}
                  </button>
                  <button onClick={() => engine?.removeIndicator(ind.id)}>×</button>
                </li>
              ))}
              {snap?.drawings.map((d) => (
                <li key={d.id}>
                  <span>{d.kind}</span>
                  <button onClick={() => engine?.removeDrawing(d.id)}>×</button>
                </li>
              ))}
            </ul>
          ) : null}
          {active === "data" && bar ? (
            <dl className="data-win">
              <div>
                <dt>Open</dt>
                <dd>{formatPrice(bar.open, snap?.symbol.pricePrecision ?? 2)}</dd>
              </div>
              <div>
                <dt>High</dt>
                <dd>{formatPrice(bar.high, snap?.symbol.pricePrecision ?? 2)}</dd>
              </div>
              <div>
                <dt>Low</dt>
                <dd>{formatPrice(bar.low, snap?.symbol.pricePrecision ?? 2)}</dd>
              </div>
              <div>
                <dt>Close</dt>
                <dd>{formatPrice(bar.close, snap?.symbol.pricePrecision ?? 2)}</dd>
              </div>
              <div>
                <dt>Volume</dt>
                <dd>{formatVolume(bar.volume)}</dd>
              </div>
              <div>
                <dt>Time</dt>
                <dd>{new Date(bar.time * 1000).toUTCString()}</dd>
              </div>
            </dl>
          ) : null}
          {active === "alerts" ? (
            <ul className="objects">
              {alerts.length ? alerts.map((a) => <li key={a}>{a}</li>) : <li className="muted">No alerts yet. Use Alert on the toolbar.</li>}
            </ul>
          ) : null}
          {active === "news" ? (
            <ul className="objects">
              <li>Fed holds rates — markets mixed</li>
              <li>{snap?.symbol.ticker} liquidity stays elevated</li>
              <li>Dollar index ticks higher into the close</li>
            </ul>
          ) : null}
          {active === "calendar" ? (
            <ul className="objects">
              <li>CPI — tomorrow 12:30 UTC</li>
              <li>FOMC minutes — Wed</li>
              <li>NFP — Friday</li>
            </ul>
          ) : null}
        </div>
      ) : null}
      <nav className="widget-icons">
        {ICONS.map((i) => (
          <button
            key={i.id}
            className={active === i.id ? "on" : ""}
            title={i.label}
            onClick={() => onActive(active === i.id ? null : i.id)}
          >
            {i.glyph}
          </button>
        ))}
      </nav>
    </div>
  );
}
