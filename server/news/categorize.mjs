/**
 * Professional classification of Forex Factory calendar rows.
 * Rules are ordered most-specific first (Core CPI before CPI, NFP before employment).
 */

const CURRENCY_COUNTRY = {
  USD: { countryCode: "US", countryName: "United States" },
  EUR: { countryCode: "EU", countryName: "Euro Area" },
  GBP: { countryCode: "GB", countryName: "United Kingdom" },
  JPY: { countryCode: "JP", countryName: "Japan" },
  AUD: { countryCode: "AU", countryName: "Australia" },
  NZD: { countryCode: "NZ", countryName: "New Zealand" },
  CAD: { countryCode: "CA", countryName: "Canada" },
  CHF: { countryCode: "CH", countryName: "Switzerland" },
  CNY: { countryCode: "CN", countryName: "China" },
  All: { countryCode: "WW", countryName: "Worldwide" },
};

const CURRENCY_TICKERS = {
  USD: ["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCHF", "XAUUSD", "USOIL", "SPX", "DJI", "NDX", "US10Y", "US02Y"],
  EUR: ["EURUSD", "DAX"],
  GBP: ["GBPUSD"],
  JPY: ["USDJPY"],
  AUD: ["AUDUSD"],
  CHF: ["USDCHF"],
  CAD: ["USOIL", "XAUUSD"],
  NZD: ["AUDUSD"],
  CNY: ["USDJPY"],
};

/** @type {{ family: string, category: string, hawkishIfUp: boolean | null, re: RegExp }[]} */
const RULES = [
  { family: "nfp", category: "labor", hawkishIfUp: true, re: /\bnon[-\s]?farm|nfp\b/i },
  { family: "adp_employment", category: "labor", hawkishIfUp: true, re: /\badp\b/i },
  { family: "jobless_claims", category: "labor", hawkishIfUp: false, re: /unemployment claims|jobless claims|initial claims/i },
  { family: "unemployment", category: "labor", hawkishIfUp: false, re: /unemployment rate|jobless rate/i },
  { family: "average_earnings", category: "labor", hawkishIfUp: true, re: /average (hourly|cash) earnings|average earnings/i },
  { family: "employment_change", category: "labor", hawkishIfUp: true, re: /employment change|nonfarm payrolls|payrolls/i },
  { family: "jobs", category: "labor", hawkishIfUp: true, re: /job advertisements|jolt|job openings/i },

  { family: "core_cpi", category: "inflation", hawkishIfUp: true, re: /core cpi/i },
  { family: "cpi", category: "inflation", hawkishIfUp: true, re: /\bcpi\b|consumer price|hicp/i },
  { family: "core_ppi", category: "inflation", hawkishIfUp: true, re: /core ppi/i },
  { family: "ppi", category: "inflation", hawkishIfUp: true, re: /\bppi\b|producer price/i },
  { family: "pce", category: "inflation", hawkishIfUp: true, re: /\bpce\b/i },
  { family: "inflation_expectations", category: "inflation", hawkishIfUp: true, re: /inflation expectation/i },
  { family: "inflation", category: "inflation", hawkishIfUp: true, re: /\binflation\b/i },

  { family: "gdp", category: "growth", hawkishIfUp: true, re: /\bgdp\b|gross domestic/i },
  { family: "industrial_production", category: "growth", hawkishIfUp: true, re: /industrial production|manufacturing production|manufacturing sales|construction output/i },
  { family: "services", category: "growth", hawkishIfUp: true, re: /index of services/i },

  { family: "interest_rate", category: "central_bank", hawkishIfUp: true, re: /refinancing rate|cash rate|interest rate|rate decision|official bank rate|federal funds|bank rate/i },
  { family: "policy_statement", category: "central_bank", hawkishIfUp: null, re: /monetary policy (statement|report)|rate statement|fomc statement/i },
  { family: "press_conference", category: "central_bank", hawkishIfUp: null, re: /press conference/i },
  { family: "cb_speech", category: "central_bank", hawkishIfUp: null, re: /\bspeaks\b|testimony|hearings|chairman|president .*speaks|gov .*speaks/i },

  { family: "retail_sales", category: "consumer", hawkishIfUp: true, re: /retail sales/i },
  { family: "consumer_credit", category: "consumer", hawkishIfUp: true, re: /consumer credit/i },
  { family: "consumer_sentiment", category: "sentiment", hawkishIfUp: true, re: /consumer (sentiment|confidence|climate)|uom consumer|michigan/i },
  { family: "business_confidence", category: "sentiment", hawkishIfUp: true, re: /business confidence|nfib|nab business|bsi |sentix|seco consumer|economy watchers/i },

  { family: "pmi", category: "business", hawkishIfUp: true, re: /\bpmi\b|ism |flash manufacturing|flash services|businessnz manufacturing/i },
  { family: "housing", category: "housing", hawkishIfUp: true, re: /hpi|house price|home sales|housing starts|building permits|rics house/i },

  { family: "trade_balance", category: "trade", hawkishIfUp: true, re: /trade balance|current account|exports|imports/i },
  { family: "oil_inventories", category: "commodities", hawkishIfUp: null, re: /crude oil inventories|api weekly|natural gas storage|eia/i },

  { family: "bond_auction", category: "fiscal", hawkishIfUp: null, re: /bond auction|treasury|federal budget/i },
  { family: "money_supply", category: "liquidity", hawkishIfUp: null, re: /m2 money|money stock|currency reserves/i },
  { family: "leading_indicators", category: "growth", hawkishIfUp: true, re: /leading indicators|machine tool/i },
  { family: "holiday", category: "holiday", hawkishIfUp: null, re: /bank holiday|holiday|summit/i },
];

const IMPACT_RANK = { high: 3, medium: 2, low: 1, holiday: 0 };

export function classifyEvent({ title, currency, impact }) {
  const name = String(title || "").trim();
  const impactNorm = normalizeImpact(impact, name);
  const geo = CURRENCY_COUNTRY[currency] || { countryCode: currency || "XX", countryName: currency || "Unknown" };
  const rule = RULES.find((item) => item.re.test(name));
  const family = rule?.family || slugFamily(name);
  const category = impactNorm === "holiday" ? "holiday" : rule?.category || "other";
  return {
    title: name,
    titleNormalized: name.replace(/\s+/g, " "),
    currency: currency || null,
    countryCode: geo.countryCode,
    countryName: geo.countryName,
    impact: impactNorm,
    impactRank: IMPACT_RANK[impactNorm] ?? 1,
    category,
    eventFamily: family,
    hawkishIfUp: rule ? rule.hawkishIfUp : true,
    relatedTickers: CURRENCY_TICKERS[currency] || [],
  };
}

export function normalizeImpact(impact, title = "") {
  const raw = String(impact || "").trim().toLowerCase();
  if (raw === "holiday" || /holiday/i.test(title)) return "holiday";
  if (raw === "high") return "high";
  if (raw === "medium" || raw === "med") return "medium";
  if (raw === "low") return "low";
  return "low";
}

export function parseReading(raw) {
  if (raw == null) return { text: null, value: null, unit: null };
  const text = String(raw).trim();
  if (!text) return { text: null, value: null, unit: null };
  const m = text.replace(/,/g, "").match(/^([+-]?\d+(?:\.\d+)?)([KMBT%])?$/i);
  if (!m) return { text, value: null, unit: null };
  let value = Number(m[1]);
  const suffix = (m[2] || "").toUpperCase();
  if (suffix === "K") value *= 1e3;
  else if (suffix === "M") value *= 1e6;
  else if (suffix === "B") value *= 1e9;
  else if (suffix === "T") value *= 1e12;
  return { text, value: Number.isFinite(value) ? value : null, unit: suffix || null };
}

export function eventStatus(timeUnix, now = Date.now() / 1000) {
  const delta = timeUnix - now;
  if (delta > 15 * 60) return "upcoming";
  if (delta >= -15 * 60) return "live";
  return "released";
}

export function surpriseMeta(actual, forecast, hawkishIfUp) {
  const a = parseReading(actual);
  const f = parseReading(forecast);
  if (a.value == null || f.value == null) {
    return { surprise: "n/a", surpriseDirection: "n/a", surpriseValue: null };
  }
  const diff = a.value - f.value;
  if (Math.abs(diff) < 1e-12) return { surprise: "inline", surpriseDirection: "neutral", surpriseValue: 0 };
  const beat = diff > 0;
  let surpriseDirection = "n/a";
  if (hawkishIfUp == null) surpriseDirection = "neutral";
  else if (hawkishIfUp) surpriseDirection = beat ? "hawkish" : "dovish";
  else surpriseDirection = beat ? "dovish" : "hawkish";
  return { surprise: beat ? "beat" : "miss", surpriseDirection, surpriseValue: diff };
}

function slugFamily(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40) || "other";
}
