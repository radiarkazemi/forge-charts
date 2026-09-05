import { useEffect, useRef } from "react";
import { conditionLabel, type PriceAlert } from "../data/alerts";
import { UNIVERSE } from "../data/feed";
import type { ChartEngine } from "../engine/ChartEngine";
import { formatPrice, formatVolume } from "../engine/math";
import type { SymbolInfo } from "../engine/types";
import { alertStatusText } from "./AlertModal";
import { useEngine } from "./useEngine";

export type WidgetId = "watchlist" | "alerts" | "object" | "data" | "news" | "calendar" | "ideas" | "screener" | "options" | "macro" | "fundamentals" | "yields" | "help";

const ICONS: { id: WidgetId; label: string; glyph: string }[] = [
  { id: "watchlist", label: "Watchlist", glyph: "☰" },
  { id: "alerts", label: "Alerts", glyph: "⏰" },
  { id: "object", label: "Object tree", glyph: "▣" },
  { id: "data", label: "Data Window", glyph: "▤" },
  { id: "news", label: "News", glyph: "◉" },
  { id: "calendar", label: "Calendar", glyph: "▦" },
  { id: "ideas", label: "Ideas", glyph: "✎" },
  { id: "screener", label: "Screener", glyph: "⌕" },
  { id: "options", label: "Options", glyph: "⌥" },
  { id: "macro", label: "Macro Maps", glyph: "◎" },
  { id: "fundamentals", label: "Fundamentals", glyph: "Σ" },
  { id: "yields", label: "Yield Curves", glyph: "∿" },
  { id: "help", label: "Help Center", glyph: "?" },
];

type Props = {
  engine: ChartEngine | null;
  active: WidgetId | null;
  onActive: (id: WidgetId | null) => void;
  quotes: Record<string, { price: number; change: number }>;
  onPick: (s: SymbolInfo) => void;
  alerts: PriceAlert[];
  onCreateAlert?: () => void;
  onToggleAlert?: (id: string) => void;
  onDeleteAlert?: (id: string) => void;
};

export function WidgetDock({
  engine,
  active,
  onActive,
  quotes,
  onPick,
  alerts,
  onCreateAlert,
  onToggleAlert,
  onDeleteAlert,
}: Props) {
  const snap = useEngine(engine);
  const objTreeRef = useRef<HTMLUListElement | null>(null);
  useEffect(() => {
    if (active !== "object") return;
    const el = objTreeRef.current?.querySelector("li.on");
    el?.scrollIntoView({ block: "nearest" });
  }, [active, snap?.selectedId, snap?.selectedIndicatorId]);
  const bar = snap?.hover ?? snap?.last;
  return (
    <div className="widget-dock">
      {active ? (
        <div className="widget-panel">
          <header>
            <b>{ICONS.find((i) => i.id === active)?.label}</b>
            <button onClick={() => onActive(null)}>×</button>
          </header>
          {active === "watchlist" ? (
            <ul className="watch">
              {UNIVERSE.map((s) => {
                const q = quotes[s.ticker];
                return (
                  <li key={s.ticker} className={snap?.symbol.ticker === s.ticker ? "on" : ""} onClick={() => onPick(s)}>
                    <div>
                      <strong>{s.ticker}</strong>
                      <span>{s.exchange}</span>
                    </div>
                    <div className={(q?.change ?? 0) >= 0 ? "up" : "down"}>
                      {q ? formatPrice(q.price, s.pricePrecision) : "—"}
                      <small>
                        {(q?.change ?? 0) >= 0 ? "+" : ""}
                        {(q?.change ?? 0).toFixed(2)}%
                      </small>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : null}
          {active === "object" ? (
            <ul className="objects" ref={objTreeRef}>
              {snap?.indicators.map((ind) => (
                <li key={ind.id} className={snap.selectedIndicatorId === ind.id ? "on" : ""}>
                  <button
                    className="link"
                    onClick={() => engine?.selectIndicator(ind.id)}
                  >
                    {ind.visible ? "●" : "○"} {ind.kind.toUpperCase()} {ind.params.join(",")}
                  </button>
                  <span>
                    <button title="Hide/show" onClick={() => engine?.toggleIndicator(ind.id)}>
                      👁
                    </button>
                    <button onClick={() => engine?.removeIndicator(ind.id)}>×</button>
                  </span>
                </li>
              ))}
              {snap?.drawings.map((d) => (
                <li key={d.id} className={snap.selectedId === d.id ? "on" : ""}>
                  <button className="link" onClick={() => engine?.selectDrawing(d.id)}>
                    {d.visible === false ? "○" : "●"} {d.kind}
                  </button>
                  <span>
                    <button title="Forward" onClick={() => engine?.reorderDrawing(d.id, "forward")}>↑</button>
                    <button title="Backward" onClick={() => engine?.reorderDrawing(d.id, "backward")}>↓</button>
                    <button
                      title="Hide/show"
                      onClick={() => engine?.updateDrawing(d.id, { visible: d.visible === false })}
                    >
                      👁
                    </button>
                    <button title="Settings" onClick={() => engine?.openDrawingProperties(d.id)}>
                      ⚙
                    </button>
                    <button onClick={() => engine?.removeDrawing(d.id)}>×</button>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          {active === "data" ? (
            bar ? (
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
            ) : (
              <ul className="objects">
                <li className="muted">Hover a bar for OHLC, or open Indicators from the toolbar.</li>
              </ul>
            )
          ) : null}
          {active === "alerts" ? (
            <div className="alerts-panel">
              <button type="button" className="alerts-create" onClick={onCreateAlert}>
                + Create alert
              </button>
              {alerts.length ? (
                <ul className="objects alert-list">
                  {alerts.map((a) => (
                    <li key={a.id} className={a.enabled ? "" : "muted"}>
                      <div className="alert-item-main">
                        <strong>{a.name}</strong>
                        <span>
                          {a.symbol} · {conditionLabel(a.condition)} {a.price}
                        </span>
                        <em>
                          {alertStatusText(a)}
                          {a.fireCount ? ` · fired ${a.fireCount}×` : ""}
                        </em>
                      </div>
                      <div className="alert-item-actions">
                        <button type="button" title={a.enabled ? "Pause" : "Resume"} onClick={() => onToggleAlert?.(a.id)}>
                          {a.enabled ? "Ⅱ" : "▶"}
                        </button>
                        <button type="button" title="Delete" onClick={() => onDeleteAlert?.(a.id)}>
                          ×
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <ul className="objects">
                  <li className="muted">No alerts yet. Use Alert on the toolbar or Alt+A.</li>
                </ul>
              )}
            </div>
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
              <li className="muted">Seasonality: {snap?.symbol.ticker ?? "symbol"} 5y same-week bias</li>
            </ul>
          ) : null}
          {active === "ideas" ? (
            <ul className="objects">
              <li>
                <strong>Break & retest</strong>
                <span className="muted"> — local idea on {snap?.symbol.ticker}</span>
              </li>
              <li>
                <strong>Range fade</strong>
                <span className="muted"> — wait for failed auction</span>
              </li>
              <li className="muted">Community publish is OUT — ideas stay on-device only.</li>
            </ul>
          ) : null}
          {active === "screener" ? (
            <ul className="objects">
              <li><strong>Gainers</strong><span className="muted"> — sample scan</span></li>
              <li>BTCUSD · +4.2%</li>
              <li>NVDA · +2.8%</li>
              <li>XAUUSD · +1.1%</li>
              <li className="muted">Live screener feeds are stubbed — criteria UI ready.</li>
            </ul>
          ) : null}
          {active === "options" ? (
            <ul className="objects">
              <li><strong>{snap?.symbol.ticker ?? "SYM"} chain</strong></li>
              <li>Call  · ATM · IV 28%</li>
              <li>Put   · ATM · IV 30%</li>
              <li className="muted">Options chain is a layout shell (no live OPRA feed).</li>
            </ul>
          ) : null}
          {active === "macro" ? (
            <ul className="objects">
              <li>USD liquidity pulse — stable</li>
              <li>Rates vol — elevated</li>
              <li>Credit spreads — quiet</li>
              <li className="muted">Macro maps shell — heatmap data later.</li>
            </ul>
          ) : null}
          {active === "fundamentals" ? (
            <ul className="objects">
              <li>Revenue TTM — sample</li>
              <li>EPS growth — sample</li>
              <li>Margins — sample</li>
              <li className="muted">Fundamental graphs shell.</li>
            </ul>
          ) : null}
          {active === "yields" ? (
            <ul className="objects">
              <li>2Y · 4.21%</li>
              <li>10Y · 4.05%</li>
              <li>30Y · 4.28%</li>
              <li className="muted">Yield curve shell — static demo points.</li>
            </ul>
          ) : null}
          {active === "help" ? (
            <ul className="objects">
              <li>Hotkeys: Alt+T/H/V/F drawings</li>
              <li>Double-click empty chart to reset</li>
              <li>Right-click chart / scale for menus</li>
              <li className="muted">Help Center shell — docs link later.</li>
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
