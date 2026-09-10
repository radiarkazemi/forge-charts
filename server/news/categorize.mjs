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

const TITLE_COUNTRY = [
  { re: /^german\b|\bbuba\b|\bbundesbank\b/i, countryCode: "DE", countryName: "Germany" },
  { re: /^french\b|\bfrance\b/i, countryCode: "FR", countryName: "France" },
  { re: /^italian\b|\bitaly\b/i, countryCode: "IT", countryName: "Italy" },
  { re: /^spanish\b|\bspain\b/i, countryCode: "ES", countryName: "Spain" },
  { re: /^irish\b|\bireland\b/i, countryCode: "IE", countryName: "Ireland" },
];

const FX_TICKERS = {
  USD: ["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCHF"],
  EUR: ["EURUSD", "DAX", "DE10Y"],
  GBP: ["GBPUSD"],
  JPY: ["USDJPY"],
  AUD: ["AUDUSD"],
  NZD: ["AUDUSD"],
  CHF: ["USDCHF"],
  CAD: ["USOIL"],
  CNY: ["USDJPY"],
};

const GOLD_TICKERS = ["XAUUSD", "GLD", "GC1!"];
const US_EQUITY_TICKERS = ["SPX", "NDX", "DJI", "SPY", "QQQ", "ES1!", "NQ1!"];
const US_RATE_TICKERS = ["US10Y", "US02Y", "USINTR"];
const OIL_TICKERS = ["USOIL", "CL1!"];
const CRYPTO_TICKERS = ["BTCUSD", "ETHUSD"];
const MACRO_CATEGORIES = new Set(["labor", "inflation", "central_bank", "growth"]);
const GOLD_MACRO_CCY = new Set(["EUR", "GBP", "JPY", "CHF", "CNY", "AUD", "CAD", "NZD"]);

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
  { family: "core_pce", category: "inflation", hawkishIfUp: true, re: /core pce/i },
  { family: "core_ppi", category: "inflation", hawkishIfUp: true, re: /core ppi/i },
  { family: "cpi", category: "inflation", hawkishIfUp: true, re: /\bcpi\b|consumer price|hicp/i },
  { family: "ppi", category: "inflation", hawkishIfUp: true, re: /\bppi\b|producer price/i },
  { family: "pce", category: "inflation", hawkishIfUp: true, re: /\bpce\b/i },
  { family: "gdp_deflator", category: "inflation", hawkishIfUp: true, re: /gdp price index|gdp deflator/i },
  { family: "inflation_expectations", category: "inflation", hawkishIfUp: true, re: /inflation expectation/i },
  { family: "inflation", category: "inflation", hawkishIfUp: true, re: /\binflation\b/i },

  { family: "gdp", category: "growth", hawkishIfUp: true, re: /\bgdp\b|gross domestic/i },
  { family: "industrial_production", category: "growth", hawkishIfUp: true, re: /industrial production|manufacturing production|manufacturing sales|construction output/i },
  { family: "inventories", category: "growth", hawkishIfUp: false, re: /wholesale inventories|business inventories/i },
  { family: "services", category: "growth", hawkishIfUp: true, re: /index of services/i },

  { family: "interest_rate", category: "central_bank", hawkishIfUp: true, re: /refinancing rate|cash rate|interest rate|rate decision|official bank rate|federal funds|bank rate/i },
  { family: "policy_statement", category: "central_bank", hawkishIfUp: null, re: /monetary policy (statement|report)|rate statement|fomc statement/i },
  { family: "press_conference", category: "central_bank", hawkishIfUp: null, re: /press conference/i },
  {
    family: "cb_speech",
    category: "central_bank",
    hawkishIfUp: null,
    re: /\b(?:rba|rbnz|boe|boj|boc|ecb|fed|fomc|snb|pboc|buba|bundesbank|imf)\b.*\bspeaks\b|\b(?:assist|deputy)\s+gov(?:ernor)?\b|\b(?:chairman|governor)\s+\w+\s+speaks\b|\b(?:lagarde|powell|bailey|ueda|nagel|schlegel)\b.*\bspeaks\b|\btestimony\b/i,
  },
  { family: "political_speech", category: "politics", hawkishIfUp: null, re: /\bpresident\b.*\bspeaks\b|white house/i },

  { family: "retail_sales", category: "consumer", hawkishIfUp: true, re: /retail sales/i },
  { family: "consumer_credit", category: "consumer", hawkishIfUp: true, re: /consumer credit/i },
  { family: "consumer_sentiment", category: "sentiment", hawkishIfUp: true, re: /consumer (sentiment|confidence|climate)|uom consumer|michigan|westpac consumer|seco consumer/i },
  { family: "business_confidence", category: "sentiment", hawkishIfUp: true, re: /business confidence|nfib|nab business|bsi |sentix|economy watchers/i },

  { family: "pmi", category: "business", hawkishIfUp: true, re: /\bpmi\b|ism |flash manufacturing|flash services|businessnz manufacturing/i },
  { family: "housing", category: "housing", hawkishIfUp: true, re: /hpi|house price|home sales|housing starts|building permits|rics house|existing home/i },

  { family: "trade_balance", category: "trade", hawkishIfUp: true, re: /trade balance|current account|exports|imports/i },
  { family: "oil_inventories", category: "commodities", hawkishIfUp: null, re: /crude oil inventories|api weekly|natural gas storage|\beia\b/i },
  { family: "bank_lending", category: "credit", hawkishIfUp: null, re: /bank lending|loan growth|credit growth/i },

  { family: "bond_auction", category: "fiscal", hawkishIfUp: null, re: /bond auction|treasury|federal budget/i },
  { family: "money_supply", category: "liquidity", hawkishIfUp: null, re: /m2 money|money stock|currency reserves/i },
  { family: "leading_indicators", category: "growth", hawkishIfUp: true, re: /leading indicators|machine tool/i },
  { family: "geopolitics", category: "geopolitics", hawkishIfUp: null, re: /\bsummit\b|\belection\b|\bvote\b/i },
  { family: "holiday", category: "holiday", hawkishIfUp: null, re: /bank holiday|\bholiday\b/i },
];

const IMPACT_RANK = { high: 3, medium: 2, low: 1, holiday: 0 };

export function classifyEvent({ title, currency, impact }) {
  const name = String(title || "").trim();
  const impactNorm = normalizeImpact(impact, name);
  const geo = countryFor(name, currency);
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
    relatedTickers: tickersForEvent({ currency, impact: impactNorm, category, eventFamily: family }),
  };
}

const GOLD_FAMILIES = new Set([
  "nfp",
  "adp_employment",
  "jobless_claims",
  "unemployment",
  "core_cpi",
  "cpi",
  "core_pce",
  "pce",
  "core_ppi",
  "ppi",
  "interest_rate",
  "policy_statement",
  "press_conference",
  "gdp",
]);

export function tickersForEvent({ currency, impact, category, eventFamily }) {
  const out = new Set(FX_TICKERS[currency] || []);
  const medHigh = impact === "high" || impact === "medium";
  const macro = MACRO_CATEGORIES.has(category);

  if (shouldAttachGold(currency, impact, category, eventFamily)) {
    addAll(out, GOLD_TICKERS);
  }

  if (currency === "USD") {
    if (impact === "holiday" || (medHigh && macro)) {
      addAll(out, US_EQUITY_TICKERS);
      addAll(out, US_RATE_TICKERS);
    }
    if (eventFamily === "interest_rate" || eventFamily === "policy_statement" || eventFamily === "press_conference") {
      out.add("USINTR");
      addAll(out, CRYPTO_TICKERS);
    }
    if (eventFamily === "cpi" || eventFamily === "core_cpi" || eventFamily === "pce" || eventFamily === "core_pce") {
      out.add("USCPI");
    }
    if (eventFamily === "nfp" || eventFamily === "unemployment" || eventFamily === "jobless_claims") {
      out.add("USUNEMP");
    }
  }

  if (eventFamily === "oil_inventories" || (currency === "CAD" && medHigh)) {
    addAll(out, OIL_TICKERS);
  }

  return [...out];
}

function shouldAttachGold(currency, impact, category, eventFamily) {
  if (currency === "USD" && (impact === "holiday" || GOLD_FAMILIES.has(eventFamily))) return true;
  if (currency === "USD" && (impact === "high" || impact === "medium")) return true;
  return GOLD_MACRO_CCY.has(currency) && (impact === "high" || impact === "medium") && MACRO_CATEGORIES.has(category);
}

export function normalizeImpact(impact, title = "") {
  const raw = String(impact || "").trim().toLowerCase();
  if (raw === "holiday" || /bank holiday|\bholiday\b/i.test(title)) return "holiday";
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

function countryFor(title, currency) {
  const fromTitle = TITLE_COUNTRY.find((item) => item.re.test(title));
  if (fromTitle) return { countryCode: fromTitle.countryCode, countryName: fromTitle.countryName };
  return CURRENCY_COUNTRY[currency] || { countryCode: currency || "XX", countryName: currency || "Unknown" };
}

function addAll(set, items) {
  for (const item of items) set.add(item);
}

function slugFamily(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40) || "other";
}
