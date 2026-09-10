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
    CREATE TABLE IF NOT EXISTS calendar (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL DEFAULT 'forexfactory',
      title TEXT NOT NULL,
      title_normalized TEXT,
      currency TEXT,
      country_code TEXT,
      country_name TEXT,
      datetime TEXT NOT NULL,
      time_unix INTEGER NOT NULL,
      time_label TEXT,
      date_label TEXT,
      timezone TEXT,
      impact TEXT NOT NULL,
      impact_rank INTEGER NOT NULL DEFAULT 1,
      category TEXT NOT NULL,
      event_family TEXT NOT NULL,
      actual TEXT,
      forecast TEXT,
      previous TEXT,
      actual_num REAL,
      forecast_num REAL,
      previous_num REAL,
      unit TEXT,
      surprise TEXT,
      surprise_direction TEXT,
      surprise_value REAL,
      url TEXT,
      related_tickers TEXT NOT NULL DEFAULT '[]',
      all_day INTEGER NOT NULL DEFAULT 0,
      status TEXT,
      ingested_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS calendar_time_idx ON calendar (time_unix);
    CREATE INDEX IF NOT EXISTS calendar_impact_idx ON calendar (impact_rank DESC, time_unix);
    CREATE INDEX IF NOT EXISTS calendar_family_idx ON calendar (event_family, time_unix);
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

  const upsertCalendar = db.prepare(`
    INSERT INTO calendar (
      id, source, title, title_normalized, currency, country_code, country_name,
      datetime, time_unix, time_label, date_label, timezone, impact, impact_rank,
      category, event_family, actual, forecast, previous, actual_num, forecast_num,
      previous_num, unit, surprise, surprise_direction, surprise_value, url,
      related_tickers, all_day, status, ingested_at
    ) VALUES (
      $id, $source, $title, $titleNormalized, $currency, $countryCode, $countryName,
      $datetime, $timeUnix, $timeLabel, $dateLabel, $timezone, $impact, $impactRank,
      $category, $eventFamily, $actual, $forecast, $previous, $actualNum, $forecastNum,
      $previousNum, $unit, $surprise, $surpriseDirection, $surpriseValue, $url,
      $relatedTickers, $allDay, $status, $ingestedAt
    )
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      title_normalized = excluded.title_normalized,
      currency = excluded.currency,
      country_code = excluded.country_code,
      country_name = excluded.country_name,
      datetime = excluded.datetime,
      time_unix = excluded.time_unix,
      time_label = excluded.time_label,
      date_label = excluded.date_label,
      timezone = excluded.timezone,
      impact = excluded.impact,
      impact_rank = excluded.impact_rank,
      category = excluded.category,
      event_family = excluded.event_family,
      actual = COALESCE(excluded.actual, calendar.actual),
      forecast = excluded.forecast,
      previous = excluded.previous,
      actual_num = COALESCE(excluded.actual_num, calendar.actual_num),
      forecast_num = excluded.forecast_num,
      previous_num = excluded.previous_num,
      unit = COALESCE(excluded.unit, calendar.unit),
      surprise = excluded.surprise,
      surprise_direction = excluded.surprise_direction,
      surprise_value = excluded.surprise_value,
      url = COALESCE(excluded.url, calendar.url),
      related_tickers = excluded.related_tickers,
      all_day = excluded.all_day,
      status = excluded.status,
      ingested_at = excluded.ingested_at
  `);

  const calendarExists = db.prepare(`SELECT 1 AS ok FROM calendar WHERE id = $id`);
  const calendarById = db.prepare(`SELECT * FROM calendar WHERE id = $id`);
  const calendarCount = db.prepare(`SELECT COUNT(*) AS n FROM calendar`);
  const calendarList = db.prepare(`
    SELECT * FROM calendar
    WHERE time_unix >= $fromUnix AND time_unix <= $toUnix
      AND impact_rank >= $minImpact
      AND ($hasTicker = 0 OR related_tickers LIKE $tickerLike)
      AND ($family = '' OR event_family = $familyMatch)
      AND ($category = '' OR category = $categoryMatch)
    ORDER BY time_unix ASC, impact_rank DESC
    LIMIT $limit
  `);

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
      return { news: countStmt.get().n, calendar: calendarCount.get().n };
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
    upsertCalendar(item) {
      const existed = Boolean(calendarExists.get({ $id: item.id }));
      upsertCalendar.run({
        $id: item.id,
        $source: item.source || "forexfactory",
        $title: item.title,
        $titleNormalized: item.titleNormalized ?? item.title,
        $currency: item.currency ?? null,
        $countryCode: item.countryCode ?? null,
        $countryName: item.countryName ?? null,
        $datetime: item.datetime,
        $timeUnix: item.timeUnix,
        $timeLabel: item.timeLabel ?? null,
        $dateLabel: item.dateLabel ?? null,
        $timezone: item.timezone ?? null,
        $impact: item.impact,
        $impactRank: item.impactRank,
        $category: item.category,
        $eventFamily: item.eventFamily,
        $actual: item.actual ?? null,
        $forecast: item.forecast ?? null,
        $previous: item.previous ?? null,
        $actualNum: item.actualNum ?? null,
        $forecastNum: item.forecastNum ?? null,
        $previousNum: item.previousNum ?? null,
        $unit: item.unit ?? null,
        $surprise: item.surprise ?? null,
        $surpriseDirection: item.surpriseDirection ?? null,
        $surpriseValue: item.surpriseValue ?? null,
        $url: item.url ?? null,
        $relatedTickers: JSON.stringify(item.relatedTickers || []),
        $allDay: item.allDay ? 1 : 0,
        $status: item.status ?? null,
        $ingestedAt: Math.floor(Date.now() / 1000),
      });
      return !existed;
    },
    getCalendar(id) {
      return calendarRow(calendarById.get({ $id: id }));
    },
    listCalendar(opts = {}) {
      const now = Math.floor(Date.now() / 1000);
      const fromUnix = opts.fromUnix ?? now - 7 * 86400;
      const toUnix = opts.toUnix ?? now + 14 * 86400;
      const minImpact = opts.minImpact ?? 0;
      const ticker = (opts.ticker || "").toUpperCase();
      const family = opts.family || "";
      const category = opts.category || "";
      const limit = opts.limit ?? 500;
      return calendarList
        .all({
          $fromUnix: fromUnix,
          $toUnix: toUnix,
          $minImpact: minImpact,
          $hasTicker: ticker ? 1 : 0,
          $tickerLike: ticker ? `%"${ticker}"%` : "%",
          $family: family,
          $familyMatch: family,
          $category: category,
          $categoryMatch: category,
          $limit: limit,
        })
        .map(calendarRow);
    },
    close() {
      db.close();
    },
  };
}

function calendarRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    source: row.source,
    title: row.title,
    titleNormalized: row.title_normalized,
    currency: row.currency,
    countryCode: row.country_code,
    countryName: row.country_name,
    datetime: row.datetime,
    timeUnix: row.time_unix,
    timeLabel: row.time_label,
    dateLabel: row.date_label,
    timezone: row.timezone,
    impact: row.impact,
    impactRank: row.impact_rank,
    category: row.category,
    eventFamily: row.event_family,
    actual: row.actual,
    forecast: row.forecast,
    previous: row.previous,
    actualNum: row.actual_num,
    forecastNum: row.forecast_num,
    previousNum: row.previous_num,
    unit: row.unit,
    surprise: row.surprise,
    surpriseDirection: row.surprise_direction,
    surpriseValue: row.surprise_value,
    url: row.url,
    relatedTickers: safeJson(row.related_tickers),
    allDay: Boolean(row.all_day),
    status: row.status,
    ingestedAt: row.ingested_at,
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
