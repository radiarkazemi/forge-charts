/**
 * Live ingest smoke test against TradingView News Flow + local SQLite.
 * Usage: node --experimental-sqlite server/news/selftest.mjs
 */
import { createServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createNewsService } from "./index.mjs";
import { classifyEvent } from "./categorize.mjs";
import { fetchHeadlines, fetchNewsFlow, fetchStory } from "./tv.mjs";

const nfp = classifyEvent({ title: "Non-Farm Employment Change", currency: "USD", impact: "High" });
if (nfp.eventFamily !== "nfp" || nfp.category !== "labor" || nfp.impact !== "high") throw new Error("NFP classify");
if (!nfp.relatedTickers.includes("XAUUSD") || !nfp.relatedTickers.includes("USUNEMP")) throw new Error("NFP tickers");
const cpi = classifyEvent({ title: "CPI m/m", currency: "USD", impact: "High" });
if (cpi.eventFamily !== "cpi" || cpi.category !== "inflation") throw new Error("CPI classify");
if (!cpi.relatedTickers.includes("USCPI") || !cpi.relatedTickers.includes("XAUUSD")) throw new Error("CPI tickers");
const core = classifyEvent({ title: "Core CPI y/y", currency: "USD", impact: "High" });
if (core.eventFamily !== "core_cpi") throw new Error("Core CPI classify");
const rate = classifyEvent({ title: "Main Refinancing Rate", currency: "EUR", impact: "High" });
if (rate.eventFamily !== "interest_rate" || rate.category !== "central_bank") throw new Error("rate classify");
if (!rate.relatedTickers.includes("XAUUSD") || !rate.relatedTickers.includes("EURUSD")) throw new Error("ECB rate should map to gold");
const germanCpi = classifyEvent({ title: "German Final CPI m/m", currency: "EUR", impact: "Low" });
if (germanCpi.eventFamily !== "cpi" || germanCpi.countryCode !== "DE") throw new Error("German CPI country");
if (germanCpi.relatedTickers.includes("XAUUSD")) throw new Error("low-impact German CPI should not attach to gold");
const trump = classifyEvent({ title: "President Trump Speaks", currency: "USD", impact: "Medium" });
if (trump.eventFamily !== "political_speech" || trump.category !== "politics") throw new Error("political speech");
const lagarde = classifyEvent({ title: "ECB President Lagarde Speaks", currency: "EUR", impact: "Medium" });
if (lagarde.eventFamily !== "cb_speech") throw new Error("Lagarde should be central-bank speech");
if (!lagarde.relatedTickers.includes("XAUUSD")) throw new Error("ECB speech should map to gold");
const claims = classifyEvent({ title: "Unemployment Claims", currency: "USD", impact: "Medium" });
if (claims.eventFamily !== "jobless_claims") throw new Error("claims family");

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
  const calItems = svc.listCalendar({ ticker: "XAUUSD", limit: 1000 });
  if (!calItems.length) throw new Error("calendar list empty after ingest");
  const cpiRow = calItems.find((item) => item.eventFamily === "cpi" || item.eventFamily === "core_cpi");
  if (!cpiRow) throw new Error("expected CPI family in calendar");
  const highs = calItems.filter((item) => item.impact === "high");
  if (!highs.some((item) => item.currency === "EUR" && item.eventFamily === "interest_rate")) {
    throw new Error("XAUUSD calendar should include ECB rate decision");
  }
  const allCal = svc.listCalendar({ limit: 1000 });
  const highListed = svc.listCalendar({ minImpact: 3, limit: 1000 });
  const highCount = allCal.filter((item) => item.impact === "high").length;
  if (highListed.length !== highCount) throw new Error(`minImpact high mismatch ${highListed.length} vs ${highCount}`);
  if (highCount < 2) throw new Error("expected multiple high-impact FF events this week");

  const http = createServer((req, res) => {
    void svc.handleRequest(req, res);
  });
  await new Promise((resolve) => http.listen(0, "127.0.0.1", resolve));
  const { port } = http.address();
  try {
    const unfiltered = await (await fetch(`http://127.0.0.1:${port}/calendar?limit=1000`)).json();
    const highNoLimit = await (await fetch(`http://127.0.0.1:${port}/calendar?impact=high`)).json();
    const expectedHigh = (unfiltered.items || []).filter((item) => item.impact === "high").length;
    if (highNoLimit.count !== expectedHigh) {
      throw new Error(`/calendar?impact=high returned ${highNoLimit.count}, expected ${expectedHigh}`);
    }
    const xauHigh = await (await fetch(`http://127.0.0.1:${port}/calendar?symbol=XAUUSD&impact=high`)).json();
    if (xauHigh.count < 2) throw new Error("XAUUSD high-impact calendar too small");
  } finally {
    await new Promise((resolve) => http.close(resolve));
  }
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
