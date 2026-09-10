/**
 * TradingView public news endpoints used by Supercharts lightning bolts
 * (Chart Settings → Events → Latest news) and News Flow.
 *
 * Confirmed live:
 *   https://news-mediator.tradingview.com/public/news-flow/v2/news
 *   https://news-headlines.tradingview.com/v2/headlines
 *   https://news-headlines.tradingview.com/v2/story
 */

const NEWS_FLOW = "https://news-mediator.tradingview.com/public/news-flow/v2/news";
const HEADLINES = "https://news-headlines.tradingview.com/v2/headlines";
const STORY = "https://news-headlines.tradingview.com/v2/story";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Origin: "https://www.tradingview.com",
  Referer: "https://www.tradingview.com/",
  Accept: "application/json",
};

async function getJson(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`TV ${res.status} ${url} ${body.slice(0, 120)}`);
  }
  return res.json();
}

function normalizeItem(raw) {
  const provider = raw.provider;
  const providerId = typeof provider === "string" ? provider : provider?.id || raw.sourceLogoId || "";
  const providerName =
    typeof provider === "object" && provider?.name ? provider.name : raw.source || providerId;
  const related = Array.isArray(raw.relatedSymbols)
    ? raw.relatedSymbols.map((s) => (typeof s === "string" ? s : s?.symbol)).filter(Boolean)
    : [];
  return {
    id: String(raw.id),
    title: String(raw.title || ""),
    published: Number(raw.published) || 0,
    urgency: Number(raw.urgency) || 0,
    permission: raw.permission ?? null,
    paywall: Boolean(raw.paywall),
    providerId,
    providerName,
    storyPath: raw.storyPath || null,
    link: raw.link || null,
    shortDescription: raw.shortDescription || null,
    relatedSymbols: related,
  };
}

export async function fetchNewsFlow(tvSymbol, lang = "en") {
  const params = new URLSearchParams();
  params.append("filter", `lang:${lang}`);
  params.append("filter", `symbol:${tvSymbol}`);
  params.set("client", "web");
  params.set("user_prostatus", "non_pro");
  const data = await getJson(`${NEWS_FLOW}?${params}`);
  const items = Array.isArray(data.items) ? data.items.map(normalizeItem) : [];
  return { items, cursor: data.pagination?.cursor ?? null, source: "news-flow" };
}

export async function fetchHeadlines(tvSymbol, lang = "en") {
  const params = new URLSearchParams({
    client: "web",
    lang,
    symbol: tvSymbol,
  });
  const data = await getJson(`${HEADLINES}?${params}`);
  const items = Array.isArray(data.items) ? data.items.map(normalizeItem) : [];
  return { items, source: "headlines" };
}

export async function fetchStory(id, lang = "en") {
  const params = new URLSearchParams({ id, lang });
  const data = await getJson(`${STORY}?${params}`);
  return {
    id: data.id || id,
    title: data.title || "",
    shortDescription: data.shortDescription || "",
    language: data.language || lang,
    copyright: data.copyright || null,
  };
}

export async function fetchSymbolNews(tvSymbol, lang = "en") {
  const errors = [];
  let flow = { items: [] };
  let headlines = { items: [] };
  try {
    flow = await fetchNewsFlow(tvSymbol, lang);
  } catch (err) {
    errors.push(err);
  }
  try {
    headlines = await fetchHeadlines(tvSymbol, lang);
  } catch (err) {
    errors.push(err);
  }
  const byId = new Map();
  for (const item of [...flow.items, ...headlines.items]) {
    const prev = byId.get(item.id);
    byId.set(item.id, prev ? { ...prev, ...item, relatedSymbols: unique([...prev.relatedSymbols, ...item.relatedSymbols]) } : item);
  }
  if (!byId.size && errors.length) throw errors[0];
  return [...byId.values()].sort((a, b) => b.published - a.published);
}

function unique(arr) {
  return [...new Set(arr)];
}
