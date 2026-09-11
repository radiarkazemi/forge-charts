/**
 * Forex Factory economic calendar.
 * Source: the JSON/CSV FF publishes from https://www.forexfactory.com/calendar
 *         (hosted at nfs.faireconomy.media — the calendar page's JSON/CSV/XML links).
 */
import { classifyEvent, eventStatus, parseReading, surpriseMeta } from "./categorize.mjs";

const JSON_URL = "https://nfs.faireconomy.media/ff_calendar_thisweek.json";
const CSV_URL = "https://nfs.faireconomy.media/ff_calendar_thisweek.csv";
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "*/*",
  Referer: "https://www.forexfactory.com/calendar",
};

async function getText(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`Forex Factory ${res.status} ${url}`);
  return res.text();
}

function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const headers = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cols = splitCsvLine(line);
    const row = {};
    headers.forEach((h, i) => {
      row[h] = cols[i] ?? "";
    });
    return row;
  });
}

function splitCsvLine(line) {
  const out = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (q && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else q = !q;
    } else if (ch === "," && !q) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

function eventId(url, fallback) {
  const m = String(url || "").match(/\/calendar\/([^/?#]+)/);
  if (m) return `ff:${m[1]}`;
  return `ff:${fallback}`;
}

function isAllDay(iso, csvTime) {
  const t = String(csvTime || "").toLowerCase();
  if (t.includes("all day") || t.includes("tentative")) return true;
  return false;
}

export async function fetchForexFactoryCalendar() {
  const [jsonText, csvText] = await Promise.all([getText(JSON_URL), getText(CSV_URL)]);
  const jsonItems = JSON.parse(jsonText);
  if (!Array.isArray(jsonItems)) throw new Error("FF JSON was not a list");
  const csvRows = parseCsv(csvText);
  const unused = [...csvRows];

  return jsonItems.map((raw, index) => {
    const title = String(raw.title || "").trim();
    const currency = String(raw.country || "").trim();
    const iso = String(raw.date || "");
    const timeUnix = Math.floor(new Date(iso).getTime() / 1000);
    const csvIdx = unused.findIndex(
      (row) => String(row.Title || "").trim() === title && String(row.Country || "").trim() === currency,
    );
    const csv = csvIdx >= 0 ? unused.splice(csvIdx, 1)[0] : null;
    const url = csv?.URL || `https://www.forexfactory.com/calendar`;
    const classified = classifyEvent({ title, currency, impact: raw.impact || csv?.Impact });
    const actual = raw.actual ?? csv?.Actual ?? null;
    const forecast = raw.forecast || csv?.Forecast || null;
    const previous = raw.previous || csv?.Previous || null;
    const actualR = parseReading(actual);
    const forecastR = parseReading(forecast);
    const previousR = parseReading(previous);
    const surprise = surpriseMeta(actual, forecast, classified.hawkishIfUp);
    const allDay = isAllDay(iso, csv?.Time);
    const fallback = `${classified.countryCode}-${classified.eventFamily}-${timeUnix}-${index}`;
    return {
      id: eventId(url, fallback),
      source: "forexfactory",
      title: classified.title,
      titleNormalized: classified.titleNormalized,
      currency: classified.currency,
      countryCode: classified.countryCode,
      countryName: classified.countryName,
      datetime: iso,
      timeUnix: Number.isFinite(timeUnix) ? timeUnix : 0,
      timeLabel: csv?.Time || null,
      dateLabel: csv?.Date || (iso ? iso.slice(0, 10) : null),
      timezone: offsetFromIso(iso),
      impact: classified.impact,
      impactRank: classified.impactRank,
      category: classified.category,
      eventFamily: classified.eventFamily,
      actual: actualR.text,
      forecast: forecastR.text,
      previous: previousR.text,
      actualNum: actualR.value,
      forecastNum: forecastR.value,
      previousNum: previousR.value,
      unit: actualR.unit || forecastR.unit || previousR.unit,
      surprise: surprise.surprise,
      surpriseDirection: surprise.surpriseDirection,
      surpriseValue: surprise.surpriseValue,
      url,
      relatedTickers: classified.relatedTickers,
      allDay,
      status: eventStatus(timeUnix),
    };
  }).filter((item) => item.id && item.timeUnix);
}

function offsetFromIso(iso) {
  const m = String(iso).match(/([+-]\d{2}:\d{2}|Z)$/);
  return m ? m[1] : null;
}
