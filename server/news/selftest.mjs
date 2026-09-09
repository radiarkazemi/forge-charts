/**
 * Live ingest smoke test against TradingView News Flow + local SQLite.
 * Usage: node --experimental-sqlite server/news/selftest.mjs
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createNewsService } from "./index.mjs";
import { fetchHeadlines, fetchNewsFlow, fetchStory } from "./tv.mjs";

const tvSymbol = process.env.NEWS_TEST_SYMBOL || "OANDA:XAUUSD";

const flow = await fetchNewsFlow(tvSymbol);
if (!flow.items.length) throw new Error("news-flow returned no items");
const headlines = await fetchHeadlines(tvSymbol);
if (!headlines.items.length) throw new Error("headlines returned no items");
if (flow.items[0].id !== headlines.items[0].id) {
  console.warn("top ids differ", flow.items[0].id, headlines.items[0].id);
}

const story = await fetchStory(flow.items[0].id);
if (!story.title) throw new Error("story missing title");

const dir = mkdtempSync(join(tmpdir(), "forge-news-"));
const svc = createNewsService({ dbPath: join(dir, "news.sqlite"), pollMs: 60_000, sweepMs: 3_600_000 });
try {
  const result = await svc.ingestTicker("XAUUSD");
  const listed = svc.listNews("XAUUSD", 50);
  if (!listed.length) throw new Error("db list empty after ingest");
  if (!result.added.length && listed.length < 10) throw new Error("expected first ingest to insert rows");
  const one = svc.getNews(listed[0].id);
  if (!one?.title) throw new Error("getNews failed");
  console.log(
    JSON.stringify(
      {
        ok: true,
        tvSymbol,
        flow: flow.items.length,
        headlines: headlines.items.length,
        ingested: listed.length,
        added: result.added.length,
        sample: {
          id: listed[0].id,
          title: listed[0].title,
          published: listed[0].published,
          provider: listed[0].providerName,
          storyUrl: listed[0].storyUrl,
          hasDescription: Boolean(listed[0].shortDescription || one.shortDescription),
        },
      },
      null,
      2,
    ),
  );
} finally {
  svc.stop();
  rmSync(dir, { recursive: true, force: true });
}
