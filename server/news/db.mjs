import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

export function openNewsDb(filePath) {
  mkdirSync(dirname(filePath), { recursive: true });
  const db = new DatabaseSync(filePath);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA synchronous = NORMAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS news (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      published INTEGER NOT NULL,
      urgency INTEGER NOT NULL DEFAULT 0,
      permission TEXT,
      paywall INTEGER NOT NULL DEFAULT 0,
      provider_id TEXT,
      provider_name TEXT,
      story_path TEXT,
      link TEXT,
      short_description TEXT,
      related_symbols TEXT NOT NULL DEFAULT '[]',
      ingested_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS news_published_idx ON news (published DESC);
    CREATE TABLE IF NOT EXISTS news_tickers (
      news_id TEXT NOT NULL,
      ticker TEXT NOT NULL,
      tv_symbol TEXT,
      PRIMARY KEY (news_id, ticker),
      FOREIGN KEY (news_id) REFERENCES news(id)
    );
    CREATE INDEX IF NOT EXISTS news_tickers_ticker_idx ON news_tickers (ticker, news_id);
    CREATE TABLE IF NOT EXISTS ingest_state (
      tv_symbol TEXT PRIMARY KEY,
      last_poll INTEGER NOT NULL,
      last_count INTEGER NOT NULL DEFAULT 0,
      last_error TEXT
    );
  `);

  const upsertNews = db.prepare(`
    INSERT INTO news (
      id, title, published, urgency, permission, paywall, provider_id, provider_name,
      story_path, link, short_description, related_symbols, ingested_at
    ) VALUES (
      $id, $title, $published, $urgency, $permission, $paywall, $providerId, $providerName,
      $storyPath, $link, $shortDescription, $relatedSymbols, $ingestedAt
    )
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      published = excluded.published,
      urgency = excluded.urgency,
      permission = excluded.permission,
      paywall = excluded.paywall,
      provider_id = excluded.provider_id,
      provider_name = excluded.provider_name,
      story_path = COALESCE(excluded.story_path, news.story_path),
      link = COALESCE(excluded.link, news.link),
      short_description = COALESCE(excluded.short_description, news.short_description),
      related_symbols = excluded.related_symbols
  `);

  const upsertTicker = db.prepare(`
    INSERT INTO news_tickers (news_id, ticker, tv_symbol)
    VALUES ($newsId, $ticker, $tvSymbol)
    ON CONFLICT(news_id, ticker) DO UPDATE SET tv_symbol = excluded.tv_symbol
  `);

  const updateDescription = db.prepare(`
    UPDATE news SET short_description = $shortDescription WHERE id = $id AND (short_description IS NULL OR short_description = '')
  `);

  const touchIngest = db.prepare(`
    INSERT INTO ingest_state (tv_symbol, last_poll, last_count, last_error)
    VALUES ($tvSymbol, $lastPoll, $lastCount, $lastError)
    ON CONFLICT(tv_symbol) DO UPDATE SET
      last_poll = excluded.last_poll,
      last_count = excluded.last_count,
      last_error = excluded.last_error
  `);

  const selectByTicker = db.prepare(`
    SELECT n.*, GROUP_CONCAT(t.ticker) AS tickers
    FROM news n
    JOIN news_tickers t ON t.news_id = n.id
    WHERE t.ticker = $ticker
    GROUP BY n.id
    ORDER BY n.published DESC
    LIMIT $limit
  `);

  const selectById = db.prepare(`
    SELECT n.*, GROUP_CONCAT(t.ticker) AS tickers
    FROM news n
    LEFT JOIN news_tickers t ON t.news_id = n.id
    WHERE n.id = $id
    GROUP BY n.id
  `);

  const existsStmt = db.prepare(`SELECT 1 AS ok FROM news WHERE id = $id`);
  const countStmt = db.prepare(`SELECT COUNT(*) AS n FROM news`);
  const countTickerStmt = db.prepare(`SELECT COUNT(*) AS n FROM news_tickers WHERE ticker = $ticker`);
  const lastPollStmt = db.prepare(`SELECT last_poll FROM ingest_state WHERE tv_symbol = $tvSymbol`);

  function rowToItem(row) {
    if (!row) return null;
    return {
      id: row.id,
      title: row.title,
      published: row.published,
      urgency: row.urgency,
      permission: row.permission,
      paywall: Boolean(row.paywall),
      providerId: row.provider_id,
      providerName: row.provider_name,
      storyPath: row.story_path,
      storyUrl: row.story_path ? `https://www.tradingview.com${row.story_path}` : null,
      link: row.link,
      shortDescription: row.short_description,
      relatedSymbols: safeJson(row.related_symbols),
      tickers: row.tickers ? String(row.tickers).split(",") : [],
      ingestedAt: row.ingested_at,
    };
  }

  return {
    db,
    upsert(item, tickers) {
      const existed = Boolean(existsStmt.get({ $id: item.id }));
      upsertNews.run({
        $id: item.id,
        $title: item.title,
        $published: item.published,
        $urgency: item.urgency,
        $permission: item.permission ?? null,
        $paywall: item.paywall ? 1 : 0,
        $providerId: item.providerId ?? null,
        $providerName: item.providerName ?? null,
        $storyPath: item.storyPath ?? null,
        $link: item.link ?? null,
        $shortDescription: item.shortDescription ?? null,
        $relatedSymbols: JSON.stringify(item.relatedSymbols || []),
        $ingestedAt: Math.floor(Date.now() / 1000),
      });
      for (const t of tickers) {
        upsertTicker.run({ $newsId: item.id, $ticker: t.ticker, $tvSymbol: t.tvSymbol });
      }
      return !existed;
    },
    setDescription(id, shortDescription) {
      if (!shortDescription) return;
      updateDescription.run({ $id: id, $shortDescription: shortDescription });
    },
    list(ticker, limit = 200) {
      return selectByTicker.all({ $ticker: ticker.toUpperCase(), $limit: limit }).map(rowToItem);
    },
    get(id) {
      return rowToItem(selectById.get({ $id: id }));
    },
    exists(id) {
      return Boolean(existsStmt.get({ $id: id }));
    },
    stats() {
      return { news: countStmt.get().n };
    },
    tickerCount(ticker) {
      return countTickerStmt.get({ $ticker: ticker.toUpperCase() }).n;
    },
    lastPoll(tvSymbol) {
      return lastPollStmt.get({ $tvSymbol: tvSymbol })?.last_poll ?? 0;
    },
    markPoll(tvSymbol, count, error = null) {
      touchIngest.run({
        $tvSymbol: tvSymbol,
        $lastPoll: Math.floor(Date.now() / 1000),
        $lastCount: count,
        $lastError: error ?? null,
      });
    },
    close() {
      db.close();
    },
  };
}

function safeJson(raw) {
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
