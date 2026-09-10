/**
 * Live ingest smoke test against TradingView News Flow + local SQLite.
 * Usage: node --experimental-sqlite server/news/selftest.mjs
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createNewsService } from "./index.mjs";
import { classifyEvent } from "./categorize.mjs";
import { fetchHeadlines, fetchNewsFlow, fetchStory } from "./tv.mjs";

const nfp = classifyEvent({ title: "Non-Farm Employment Change", currency: "USD", impact: "High" });
if (nfp.eventFamily !== "nfp" || nfp.category !== "labor" || nfp.impact !== "high") throw new Error("NFP classify");
const cpi = classifyEvent({ title: "CPI m/m", currency: "USD", impact: "High" });
if (cpi.eventFamily !== "cpi" || cpi.category !== "inflation") throw new Error("CPI classify");
const core = classifyEvent({ title: "Core CPI y/y", currency: "USD", impact: "High" });
if (core.eventFamily !== "core_cpi") throw new Error("Core CPI classify");
const rate = classifyEvent({ title: "Main Refinancing Rate", currency: "EUR", impact: "High" });
if (rate.eventFamily !== "interest_rate" || rate.category !== "central_bank") throw new Error("rate classify");

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
  const cal = await svc.ingestCalendar();
  const calItems = svc.listCalendar({ ticker: "XAUUSD" });
  if (!calItems.length) throw new Error("calendar list empty after ingest");
  const cpiRow = calItems.find((item) => item.eventFamily === "cpi" || item.eventFamily === "core_cpi");
  if (!cpiRow) throw new Error("expected CPI family in calendar");
  const highs = calItems.filter((item) => item.impact === "high");
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
        calendar: {
          fetched: cal.items.length,
          forXau: calItems.length,
          highImpact: highs.length,
          sample: {
            id: cpiRow.id,
            title: cpiRow.title,
            family: cpiRow.eventFamily,
            category: cpiRow.category,
            impact: cpiRow.impact,
            datetime: cpiRow.datetime,
            forecast: cpiRow.forecast,
            previous: cpiRow.previous,
            tickers: cpiRow.relatedTickers,
          },
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
