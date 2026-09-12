import { useMemo, useState } from "react";
import {
  YIELD_CURVES,
  buildCalendar,
  buildDom,
  buildFundamentals,
  buildHotlist,
  buildMacroHeatmap,
  buildNewsFeed,
  buildOptionsChain,
  buildScreener,
  sparkPath,
  yieldPath,
  type CalendarEvent,
  type ScreenerRow,
} from "../data/marketWidgets";
import { UNIVERSE } from "../data/feed";
import { formatPrice, formatVolume } from "../engine/math";

function ago(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
}

export function ScreenerPanel({
  quotes,
  onPick,
}: {
  quotes: Record<string, { price: number; change: number }>;
  onPick: (ticker: string, exchange: string) => void;
}) {
  const [asset, setAsset] = useState<"all" | "crypto" | "fx" | "index">("all");
  const [sort, setSort] = useState<"change" | "volume" | "relvol" | "atr">("change");
  const [minChg, setMinChg] = useState(0);

  const rows = useMemo(() => {
    const base = buildScreener(
      UNIVERSE.map((s) => ({
        ticker: s.ticker,
        exchange: s.exchange,
        price: quotes[s.ticker]?.price,
        change: quotes[s.ticker]?.change,
      })),
    );
    const filtered = base.filter((r) => {
      if (Math.abs(r.changePct) < minChg) return false;
      if (asset === "crypto") return r.exchange === "BINANCE";
      if (asset === "fx") return r.sector === "FX" || r.exchange === "FOREXCOM";
      if (asset === "index") return r.sector === "Index";
      return true;
    });
    const sorted = [...filtered].sort((a, b) => {
      if (sort === "volume") return b.volume - a.volume;
      if (sort === "relvol") return b.relVol - a.relVol;
      if (sort === "atr") return b.atrPct - a.atrPct;
      return Math.abs(b.changePct) - Math.abs(a.changePct);
    });
    return sorted.slice(0, 40);
  }, [quotes, asset, sort, minChg]);

  return (
    <div className="mkt-panel">
      <div className="mkt-filters">
        <select value={asset} onChange={(e) => setAsset(e.target.value as typeof asset)}>
          <option value="all">All</option>
          <option value="crypto">Crypto</option>
          <option value="fx">FX / CFD</option>
          <option value="index">Index</option>
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
          <option value="change">|Change|</option>
          <option value="volume">Volume</option>
          <option value="relvol">Rel volume</option>
          <option value="atr">ATR %</option>
        </select>
        <label>
          Min %
          <input type="number" step="0.1" value={minChg} onChange={(e) => setMinChg(Number(e.target.value) || 0)} />
        </label>
      </div>
      <table className="mkt-table">
        <thead>
          <tr>
            <th>Symbol</th>
            <th>Last</th>
            <th>Chg</th>
            <th>Vol</th>
            <th>RVol</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.exchange}:${r.ticker}`} onClick={() => onPick(r.ticker, r.exchange)}>
              <td>
                <strong>{r.ticker}</strong>
                <small>{r.exchange}</small>
              </td>
              <td>{formatPrice(r.last, r.last > 100 ? 2 : 4)}</td>
              <td className={r.changePct >= 0 ? "up" : "down"}>
                {r.changePct >= 0 ? "+" : ""}
                {r.changePct.toFixed(2)}%
              </td>
              <td>{formatVolume(r.volume)}</td>
              <td>{r.relVol.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="hint">Screener ranks the live watch universe with local criteria (TradingView-style scan chrome).</p>
    </div>
  );
}

export function CalendarPanel() {
  const events = useMemo(() => buildCalendar(7), []);
  const days = useMemo(() => [...new Set(events.map((e) => e.day))], [events]);
  const [day, setDay] = useState(days[0] ?? "");
  const list = events.filter((e) => e.day === day);
  return (
    <div className="mkt-panel">
      <div className="mkt-filters wrap">
        {days.map((d) => (
          <button key={d} type="button" className={day === d ? "on" : ""} onClick={() => setDay(d)}>
            {d.slice(5)}
          </button>
        ))}
      </div>
      <ul className="objects cal-list">
        {list.map((e: CalendarEvent) => (
          <li key={e.id} className={`impact-${e.impact}`}>
            <strong>
              {e.time} · {e.country}
            </strong>
            <span>{e.title}</span>
            <em>
              {e.actual ? `A ${e.actual}` : "—"} / F {e.forecast ?? "—"} / P {e.previous ?? "—"}
            </em>
          </li>
        ))}
      </ul>
      <p className="hint">Date-linked economic calendar (demo schedule). Wire a live feed later without UI changes.</p>
    </div>
  );
}

export function NewsPanel({ ticker }: { ticker: string }) {
  const [tag, setTag] = useState<"all" | NewsItemTag>("all");
  const items = useMemo(() => buildNewsFeed(ticker), [ticker]);
  const filtered = tag === "all" ? items : items.filter((n) => n.tag === tag);
  return (
    <div className="mkt-panel">
      <div className="mkt-filters wrap">
        {(["all", "markets", "macro", "fx", "crypto", "earnings"] as const).map((t) => (
          <button key={t} type="button" className={tag === t ? "on" : ""} onClick={() => setTag(t)}>
            {t}
          </button>
        ))}
      </div>
      <ul className="objects news-flow">
        {filtered.map((n) => (
          <li key={n.id}>
            <strong>{n.headline}</strong>
            <span>
              {n.source} · {ago(n.at)}
              {n.symbols.length ? ` · ${n.symbols.join(", ")}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

type NewsItemTag = "markets" | "macro" | "earnings" | "crypto" | "fx";

export function FundamentalsPanel({ ticker }: { ticker: string }) {
  const series = useMemo(() => buildFundamentals(ticker), [ticker]);
  return (
    <div className="mkt-panel">
      {series.map((s) => (
        <div key={s.id} className="fund-card">
          <header>
            <b>{s.label}</b>
            <span>
              {s.points.at(-1)?.v.toFixed(2)} {s.unit}
            </span>
          </header>
          <svg viewBox="0 0 220 56" width="100%" height="56" aria-hidden>
            <path d={sparkPath(s.points, 220, 56)} fill="none" stroke="var(--accent)" strokeWidth="2" />
          </svg>
        </div>
      ))}
      <p className="hint">Fundamental graphs use demo quarterly series for {ticker} until a fundamentals API is connected.</p>
    </div>
  );
}

export function YieldsPanel() {
  const [idx, setIdx] = useState(0);
  const curve = YIELD_CURVES[idx]!;
  return (
    <div className="mkt-panel">
      <div className="mkt-filters">
        <select value={idx} onChange={(e) => setIdx(Number(e.target.value))}>
          {YIELD_CURVES.map((c, i) => (
            <option key={c.country} value={i}>
              {c.country} ({c.currency})
            </option>
          ))}
        </select>
      </div>
      <svg viewBox="0 0 260 140" width="100%" height="140" className="yield-svg">
        <path d={yieldPath(curve.points, 260, 140)} fill="none" stroke="var(--accent)" strokeWidth="2.2" />
        {curve.points.map((p) => (
          <text key={p.tenor} x={16 + (p.years / 30) * 228} y={132} fontSize="9" fill="var(--muted)">
            {p.tenor}
          </text>
        ))}
      </svg>
      <ul className="objects">
        {curve.points.map((p) => (
          <li key={p.tenor}>
            <strong>{p.tenor}</strong>
            <span>{p.yield.toFixed(2)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function OptionsPanel({ ticker, last }: { ticker: string; last: number }) {
  const [demo, setDemo] = useState(true);
  const chain = useMemo(() => buildOptionsChain(Math.max(last, 1)), [last]);
  if (!demo) {
    return (
      <div className="mkt-panel">
        <p className="hint">No OPRA / live options feed configured for {ticker}.</p>
        <button type="button" className="primary" onClick={() => setDemo(true)}>
          Show demo chain
        </button>
      </div>
    );
  }
  return (
    <div className="mkt-panel">
      <div className="mkt-filters">
        <span>
          {ticker} · exp {chain.expiry} · spot {formatPrice(chain.spot, 2)}
        </span>
        <button type="button" onClick={() => setDemo(false)}>
          Hide demo
        </button>
      </div>
      <table className="mkt-table opts">
        <thead>
          <tr>
            <th>Call</th>
            <th>IV</th>
            <th>Strike</th>
            <th>IV</th>
            <th>Put</th>
          </tr>
        </thead>
        <tbody>
          {chain.rows.map((r) => (
            <tr key={r.strike}>
              <td>
                {r.callBid.toFixed(2)} / {r.callAsk.toFixed(2)}
              </td>
              <td>{r.callIv.toFixed(1)}</td>
              <td>
                <strong>{r.strike}</strong>
              </td>
              <td>{r.putIv.toFixed(1)}</td>
              <td>
                {r.putBid.toFixed(2)} / {r.putAsk.toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="hint">Demo options chain (no OPRA). Toggle off for empty-state parity with TV when feed is absent.</p>
    </div>
  );
}

export function MacroPanel() {
  const cells = useMemo(() => buildMacroHeatmap(), []);
  const regions = [...new Set(cells.map((c) => c.region))];
  const metrics = [...new Set(cells.map((c) => c.metric))];
  return (
    <div className="mkt-panel">
      <table className="mkt-table heat">
        <thead>
          <tr>
            <th></th>
            {metrics.map((m) => (
              <th key={m}>{m}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {regions.map((r) => (
            <tr key={r}>
              <th>{r}</th>
              {metrics.map((m) => {
                const cell = cells.find((c) => c.region === r && c.metric === m)!;
                const alpha = Math.min(0.85, Math.abs(cell.score) / 100);
                const bg =
                  cell.score >= 0
                    ? `rgba(8,153,129,${alpha})`
                    : `rgba(242,54,69,${alpha})`;
                return (
                  <td key={m} style={{ background: bg }} title={cell.label}>
                    {cell.score}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="hint">Macro heatmap (demo scores). Replace with live macro series when available.</p>
    </div>
  );
}

export function HelpPanel() {
  return (
    <div className="mkt-panel help-panel">
      <ul className="objects">
        <li>
          <a href="/charts/EMBED.md" target="_blank" rel="noreferrer">
            Embed / WebView API
          </a>
        </li>
        <li>
          <a href="/charts/CHART-APP-INTEGRATION.md" target="_blank" rel="noreferrer">
            App integration guide
          </a>
        </li>
        <li>
          <a href="https://github.com/radiarkazemi/forge-charts" target="_blank" rel="noreferrer">
            GitHub repository
          </a>
        </li>
        <li>
          <strong>Hotkeys</strong>
          <span> Alt+T/H/V/F drawings · Alt+A alert · ⌘/Ctrl+K search</span>
        </li>
        <li>
          <strong>Replay</strong>
          <span> Toolbar Replay → Select bar / Random / Jump to realtime</span>
        </li>
        <li>
          <strong>Demo trade</strong>
          <span> Bottom dock → Trading · Paper or broker bridge</span>
        </li>
      </ul>
    </div>
  );
}

export function HotlistPanel({
  quotes,
  onPick,
}: {
  quotes: Record<string, { price: number; change: number }>;
  onPick: (ticker: string, exchange: string) => void;
}) {
  const rows = useMemo(() => {
    const scan = buildScreener(
      UNIVERSE.map((s) => ({
        ticker: s.ticker,
        exchange: s.exchange,
        price: quotes[s.ticker]?.price,
        change: quotes[s.ticker]?.change,
      })),
    );
    return buildHotlist(scan);
  }, [quotes]);
  return (
    <div className="mkt-panel">
      <ul className="objects">
        {rows.map((r) => (
          <li key={`${r.exchange}:${r.ticker}`} className="hot-row" onClick={() => onPick(r.ticker, r.exchange)}>
            <strong>{r.ticker}</strong>
            <span className={r.changePct >= 0 ? "up" : "down"}>
              {r.changePct >= 0 ? "+" : ""}
              {r.changePct.toFixed(2)}%
            </span>
            <em>{r.reason}</em>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function DomPanel({ last, precision = 2 }: { last: number; precision?: number }) {
  const levels = useMemo(() => buildDom(Math.max(last, 0.0001), precision), [last, precision]);
  const maxSize = Math.max(...levels.map((l) => Math.max(l.bid, l.ask)), 1);
  return (
    <div className="mkt-panel">
      <table className="mkt-table dom">
        <thead>
          <tr>
            <th>Bid</th>
            <th>Price</th>
            <th>Ask</th>
          </tr>
        </thead>
        <tbody>
          {levels.map((l) => (
            <tr key={l.price}>
              <td>
                <span className="dom-bar bid" style={{ width: `${(l.bid / maxSize) * 100}%` }} />
                {l.bid || ""}
              </td>
              <td>{formatPrice(l.price, precision)}</td>
              <td>
                <span className="dom-bar ask" style={{ width: `${(l.ask / maxSize) * 100}%` }} />
                {l.ask || ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="hint">Demo depth ladder around last price (not a live L2 book).</p>
    </div>
  );
}

export type { ScreenerRow };
