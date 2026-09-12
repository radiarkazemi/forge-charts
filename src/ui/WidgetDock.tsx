import { useEffect, useMemo, useRef, useState } from "react";
import { conditionLabel, loadAlertFireLog, type AlertFire, type PriceAlert } from "../data/alerts";
import { UNIVERSE } from "../data/feed";
import type { ChartEngine } from "../engine/ChartEngine";
import { formatPrice, formatVolume } from "../engine/math";
import type { SymbolInfo } from "../engine/types";
import { alertStatusText } from "./AlertModal";
import {
  CalendarPanel,
  DomPanel,
  FundamentalsPanel,
  HelpPanel,
  HotlistPanel,
  MacroPanel,
  NewsPanel,
  OptionsPanel,
  ScreenerPanel,
  YieldsPanel,
} from "./MarketPanels";
import { useEngine } from "./useEngine";

export type WidgetId =
  | "watchlist"
  | "alerts"
  | "object"
  | "data"
  | "news"
  | "calendar"
  | "ideas"
  | "screener"
  | "options"
  | "macro"
  | "fundamentals"
  | "yields"
  | "hotlist"
  | "dom"
  | "help";

const ICONS: { id: WidgetId; label: string; glyph: string }[] = [
  { id: "watchlist", label: "Watchlist", glyph: "☰" },
  { id: "alerts", label: "Alerts", glyph: "⏰" },
  { id: "object", label: "Object tree", glyph: "▣" },
  { id: "data", label: "Data Window", glyph: "▤" },
  { id: "news", label: "News", glyph: "◉" },
  { id: "calendar", label: "Calendar", glyph: "▦" },
  { id: "ideas", label: "Ideas", glyph: "✎" },
  { id: "screener", label: "Screener", glyph: "⌕" },
  { id: "hotlist", label: "Hotlists", glyph: "🔥" },
  { id: "options", label: "Options", glyph: "⌥" },
  { id: "macro", label: "Macro Maps", glyph: "◎" },
  { id: "fundamentals", label: "Fundamentals", glyph: "Σ" },
  { id: "yields", label: "Yield Curves", glyph: "∿" },
  { id: "dom", label: "DOM / Order book", glyph: "☰" },
  { id: "help", label: "Help Center", glyph: "?" },
];

type WatchTab = "list" | "details" | "news";

function stubNews(ticker: string): string[] {
  return [
    `${ticker}: traders watch key levels into the session`,
    `Analyst note — ${ticker} liquidity and flow update`,
    `Macro brief: rates and FX backdrop for ${ticker}`,
    `${ticker} options skew steadies after overnight move`,
    `Desk chatter: positioning around ${ticker} stays mixed`,
  ].slice(0, 5);
}

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
  onEditAlert?: (alert: PriceAlert) => void;
  fireLogRevision?: number;
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
  onEditAlert,
  fireLogRevision = 0,
}: Props) {
  const snap = useEngine(engine);
  const objTreeRef = useRef<HTMLUListElement | null>(null);
  const [watchTab, setWatchTab] = useState<WatchTab>("list");
  const fireLog = useMemo(() => loadAlertFireLog(), [alerts, fireLogRevision]);

  useEffect(() => {
    if (active !== "object") return;
    const el = objTreeRef.current?.querySelector("li.on");
    el?.scrollIntoView({ block: "nearest" });
  }, [active, snap?.selectedId, snap?.selectedIndicatorId]);

  const bar = snap?.hover ?? snap?.last;
  const current = snap?.symbol;
  const currentQuote = current ? quotes[current.ticker] : undefined;
  const detailSymbol =
    current ??
    UNIVERSE.find((s) => s.ticker === snap?.symbol.ticker) ??
    UNIVERSE[0];

  return (
    <div className="widget-dock">
      {active ? (
        <div className="widget-panel">
          <header>
            <b>{ICONS.find((i) => i.id === active)?.label}</b>
            <button onClick={() => onActive(null)}>×</button>
          </header>
          {active === "watchlist" ? (
            <div className="watch-panel">
              <div className="watch-tabs" role="tablist">
                {(
                  [
                    { id: "list" as const, label: "List" },
                    { id: "details" as const, label: "Details" },
                    { id: "news" as const, label: "News" },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    className={watchTab === tab.id ? "on" : ""}
                    aria-selected={watchTab === tab.id}
                    onClick={() => setWatchTab(tab.id)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              {watchTab === "list" ? (
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
              {watchTab === "details" && detailSymbol ? (
                <dl className="watch-details data-win">
                  <div>
                    <dt>Ticker</dt>
                    <dd>{detailSymbol.ticker}</dd>
                  </div>
                  <div>
                    <dt>Exchange</dt>
                    <dd>{detailSymbol.exchange}</dd>
                  </div>
                  <div>
                    <dt>Type</dt>
                    <dd>{detailSymbol.type}</dd>
                  </div>
                  <div>
                    <dt>Last</dt>
                    <dd>
                      {currentQuote
                        ? formatPrice(currentQuote.price, detailSymbol.pricePrecision)
                        : bar
                          ? formatPrice(bar.close, detailSymbol.pricePrecision)
                          : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt>Change</dt>
                    <dd className={(currentQuote?.change ?? 0) >= 0 ? "up" : "down"}>
                      {currentQuote
                        ? `${currentQuote.change >= 0 ? "+" : ""}${currentQuote.change.toFixed(2)}%`
                        : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt>Precision</dt>
                    <dd>{detailSymbol.pricePrecision}</dd>
                  </div>
                  {detailSymbol.name ? (
                    <div>
                      <dt>Name</dt>
                      <dd>{detailSymbol.name}</dd>
                    </div>
                  ) : null}
                </dl>
              ) : null}
              {watchTab === "news" ? (
                <ul className="objects watch-news">
                  {stubNews(detailSymbol?.ticker ?? snap?.symbol.ticker ?? "SYM").map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              ) : null}
            </div>
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
                    <button title="Settings" onClick={() => engine?.selectIndicator(ind.id)}>
                      ⚙
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
              {(engine
                ? engine.indicatorValuesAt(
                    Math.max(
                      0,
                      (() => {
                        const bars = engine.getBars();
                        const hit = bars.findIndex((b) => b.time === bar.time);
                        return hit >= 0 ? hit : bars.length - 1;
                      })(),
                    ),
                  )
                : []
              ).flatMap((row) =>
                row.values.map((v, vi) => (
                  <div key={`${row.id}-${vi}`}>
                    <dt>
                      {row.label}
                      {row.values.length > 1 ? ` ${vi + 1}` : ""}
                    </dt>
                    <dd>{v == null ? "—" : formatPrice(v, snap?.symbol.pricePrecision ?? 2)}</dd>
                  </div>
                )),
              )}
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
                        <button type="button" title="Edit" onClick={() => onEditAlert?.(a)}>
                          ✎
                        </button>
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
              <div className="alert-history">
                <div className="fly-title">History</div>
                {fireLog.length ? (
                  <ul className="objects alert-fire-log">
                    {fireLog.slice(0, 40).map((fire: AlertFire) => (
                      <li key={`${fire.alertId}-${fire.at}`}>
                        <strong>{fire.name}</strong>
                        <span>
                          {fire.symbol} @ {fire.price}
                        </span>
                        <em>{new Date(fire.at).toLocaleString()}</em>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted hint">No fired alerts yet.</p>
                )}
              </div>
            </div>
          ) : null}
          {active === "news" ? <NewsPanel ticker={snap?.symbol.ticker ?? "SYM"} /> : null}
          {active === "calendar" ? <CalendarPanel /> : null}
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
            <ScreenerPanel
              quotes={quotes}
              onPick={(ticker, exchange) => {
                const hit = UNIVERSE.find((s) => s.ticker === ticker && s.exchange === exchange) ?? UNIVERSE.find((s) => s.ticker === ticker);
                if (hit) onPick(hit);
              }}
            />
          ) : null}
          {active === "hotlist" ? (
            <HotlistPanel
              quotes={quotes}
              onPick={(ticker, exchange) => {
                const hit = UNIVERSE.find((s) => s.ticker === ticker && s.exchange === exchange) ?? UNIVERSE.find((s) => s.ticker === ticker);
                if (hit) onPick(hit);
              }}
            />
          ) : null}
          {active === "options" ? (
            <OptionsPanel
              ticker={snap?.symbol.ticker ?? "SYM"}
              last={currentQuote?.price ?? bar?.close ?? 100}
            />
          ) : null}
          {active === "macro" ? <MacroPanel /> : null}
          {active === "fundamentals" ? <FundamentalsPanel ticker={snap?.symbol.ticker ?? "SYM"} /> : null}
          {active === "yields" ? <YieldsPanel /> : null}
          {active === "dom" ? (
            <DomPanel last={currentQuote?.price ?? bar?.close ?? 100} precision={snap?.symbol.pricePrecision ?? 2} />
          ) : null}
          {active === "help" ? <HelpPanel /> : null}
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
