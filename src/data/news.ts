import type { ChartCalendarEvent, ChartNewsItem } from "../engine/types";

export type { ChartCalendarEvent, ChartNewsItem };

const BASE = "/news-api";

type NewsListResponse = {
  symbol: string;
  count: number;
  items: ChartNewsItem[];
};

async function newsFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`news-api ${res.status}: ${body.slice(0, 120)}`);
  }
  return (await res.json()) as T;
}

export async function fetchSymbolNews(ticker: string, limit = 200): Promise<ChartNewsItem[]> {
  const data = await newsFetch<NewsListResponse>(`/news?symbol=${encodeURIComponent(ticker)}&limit=${limit}`);
  return data.items ?? [];
}

export async function ingestSymbolNews(ticker: string): Promise<ChartNewsItem[]> {
  const data = await newsFetch<{ items?: ChartNewsItem[] }>(`/ingest?symbol=${encodeURIComponent(ticker)}`);
  return data.items ?? [];
}

export function subscribeSymbolNews(
  ticker: string,
  onItems: (items: ChartNewsItem[], added: ChartNewsItem[]) => void,
): () => void {
  let stopped = false;
  const pull = async () => {
    try {
      const items = await fetchSymbolNews(ticker);
      if (!stopped) onItems(items, []);
    } catch {
      /* collector may still be ingesting */
    }
  };
  void pull();
  const poll = window.setInterval(() => void pull(), 15_000);
  const es = new EventSource(`${BASE}/news/stream?symbol=${encodeURIComponent(ticker)}`);
  es.addEventListener("hello", (ev) => {
    const data = parse(ev);
    if (!stopped) onItems(data.items ?? [], []);
  });
  es.addEventListener("news", (ev) => {
    const data = parse(ev);
    if (!stopped) onItems(data.items ?? [], data.added ?? []);
  });
  return () => {
    stopped = true;
    window.clearInterval(poll);
    es.close();
  };
}

export async function fetchCalendar(opts: { symbol?: string; impact?: string; limit?: number } = {}): Promise<ChartCalendarEvent[]> {
  const qs = new URLSearchParams();
  if (opts.symbol) qs.set("symbol", opts.symbol);
  if (opts.impact) qs.set("impact", opts.impact);
  qs.set("limit", String(opts.limit ?? 500));
  const data = await newsFetch<{ items?: CalendarApiItem[] }>(`/calendar?${qs}`);
  return (data.items ?? []).map(toChartCalendar);
}

export function subscribeCalendar(
  ticker: string,
  onItems: (items: ChartCalendarEvent[]) => void,
): () => void {
  let stopped = false;
  const pull = async () => {
    try {
      const items = await fetchCalendar({ symbol: ticker });
      if (!stopped) onItems(items);
    } catch {
      /* collector may still be ingesting */
    }
  };
  void pull();
  const poll = window.setInterval(() => void pull(), 60_000);
  const qs = ticker ? `?symbol=${encodeURIComponent(ticker)}` : "";
  const es = new EventSource(`${BASE}/calendar/stream${qs}`);
  es.addEventListener("hello", (ev) => {
    const data = parseCal(ev);
    if (!stopped) onItems((data.items ?? []).map(toChartCalendar));
  });
  es.addEventListener("calendar", (ev) => {
    const data = parseCal(ev);
    if (!stopped) onItems((data.items ?? []).map(toChartCalendar));
  });
  return () => {
    stopped = true;
    window.clearInterval(poll);
    es.close();
  };
}

type CalendarApiItem = ChartCalendarEvent & { timeUnix?: number };

function toChartCalendar(item: CalendarApiItem): ChartCalendarEvent {
  return {
    id: item.id,
    title: item.title,
    timeUnix: item.timeUnix,
    currency: item.currency,
    impact: item.impact,
    category: item.category,
    eventFamily: item.eventFamily,
    forecast: item.forecast,
    previous: item.previous,
    actual: item.actual,
    status: item.status,
    url: item.url,
  };
}

function parseCal(ev: Event): { items?: CalendarApiItem[] } {
  const raw = (ev as MessageEvent).data;
  try {
    return JSON.parse(String(raw || "{}")) as { items?: CalendarApiItem[] };
  } catch {
    return {};
  }
}

function parse(ev: Event): { items?: ChartNewsItem[]; added?: ChartNewsItem[] } {
  const raw = (ev as MessageEvent).data;
  try {
    return JSON.parse(String(raw || "{}")) as { items?: ChartNewsItem[]; added?: ChartNewsItem[] };
  } catch {
    return {};
  }
}
