import { UNIVERSE } from "../data/feed";
import type { ChartEngine } from "../engine/ChartEngine";
import type { ChartNewsItem, SymbolInfo } from "../engine/types";
import { formatPrice, formatVolume } from "../engine/math";
import { useEngine } from "./useEngine";

export type WidgetId = "watchlist" | "alerts" | "object" | "data" | "news" | "calendar";

const ICONS: { id: WidgetId; label: string; glyph: string }[] = [
  { id: "watchlist", label: "Watchlist", glyph: "☰" },
  { id: "alerts", label: "Alerts", glyph: "⏰" },
  { id: "object", label: "Object tree", glyph: "▣" },
  { id: "data", label: "Data Window", glyph: "▤" },
  { id: "news", label: "News", glyph: "⚡" },
  { id: "calendar", label: "Calendar", glyph: "▦" },
];

type Props = {
  engine: ChartEngine | null;
  active: WidgetId | null;
  onActive: (id: WidgetId | null) => void;
  quotes: Record<string, { price: number; change: number }>;
  onPick: (s: SymbolInfo) => void;
  alerts: string[];
  news: ChartNewsItem[];
  selectedNewsId: string | null;
  onSelectNews: (item: ChartNewsItem) => void;
};

export function WidgetDock({ engine, active, onActive, quotes, onPick, alerts, news, selectedNewsId, onSelectNews }: Props) {
  const snap = useEngine(engine);
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
            <ul className="objects">
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
                    {d.kind}
                  </button>
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
            <ul className="news-list">
              {news.length ? (
                news.map((item) => (
                  <li
                    key={item.id}
                    className={selectedNewsId === item.id ? "on" : ""}
                    onClick={() => onSelectNews(item)}
                  >
                    <span className="bolt" aria-hidden>
                      ⚡
                    </span>
                    <div>
                      <strong>{item.title}</strong>
                      <span>
                        {item.providerName || "News"} · {formatNewsTime(item.published)}
                        {item.storyUrl || item.link ? (
                          <>
                            {" · "}
                            <a
                              href={item.storyUrl || item.link || "#"}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                            >
                              story
                            </a>
                          </>
                        ) : null}
                      </span>
                    </div>
                  </li>
                ))
              ) : (
                <li className="muted">Waiting for TradingView headlines…</li>
              )}
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

function formatNewsTime(unix: number): string {
  const ms = unix * 1000;
  const delta = Date.now() - ms;
  if (delta < 60_000) return "just now";
  if (delta < 3_600_000) return `${Math.max(1, Math.floor(delta / 60_000))}m ago`;
  if (delta < 86_400_000) return `${Math.max(1, Math.floor(delta / 3_600_000))}h ago`;
  return new Date(ms).toISOString().replace("T", " ").slice(0, 16);
}
