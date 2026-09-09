import type { ChartNewsItem } from "../engine/types";

export type { ChartNewsItem };

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

function parse(ev: Event): { items?: ChartNewsItem[]; added?: ChartNewsItem[] } {
  const raw = (ev as MessageEvent).data;
  try {
    return JSON.parse(String(raw || "{}")) as { items?: ChartNewsItem[]; added?: ChartNewsItem[] };
  } catch {
    return {};
  }
}
