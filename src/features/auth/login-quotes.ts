/** Live prices for the login tape. Same books the chart uses. */

export interface TapeQuote {
  readonly id: string;
  readonly price: string;
  readonly change: string;
  readonly up: boolean;
}

const ORDER = ["BTC", "XAU", "ETH", "WTI", "SOL", "XAG", "EUR", "SPX"] as const;

const DIGITS: Record<(typeof ORDER)[number], number> = {
  BTC: 2,
  XAU: 2,
  ETH: 2,
  WTI: 2,
  SOL: 2,
  XAG: 3,
  EUR: 4,
  SPX: 2,
};

/** Yahoo symbols for the names the Germany book does not quote. Crypto is a fallback. */
const YAHOO: Record<string, (typeof ORDER)[number]> = {
  "BTC-USD": "BTC",
  "ETH-USD": "ETH",
  "SOL-USD": "SOL",
  "CL=F": "WTI",
  "SI=F": "XAG",
  "EURUSD=X": "EUR",
  "^GSPC": "SPX",
};

const CRYPTO: Record<string, (typeof ORDER)[number]> = {
  btcusdt: "BTC",
  ethusdt: "ETH",
  solusdt: "SOL",
};

export const placeholderTape: TapeQuote[] = ORDER.map((id) => ({
  id,
  price: "—",
  change: "—",
  up: true,
}));

function money(value: number, digits: number): string {
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

function percent(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function row(id: (typeof ORDER)[number], price: number, change: number): TapeQuote | null {
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(change)) return null;
  return { id, price: money(price, DIGITS[id]), change: percent(change), up: change >= 0 };
}

async function readJson(url: string): Promise<unknown> {
  const res = await fetch(url, { signal: AbortSignal.timeout(8_000), cache: "no-store" });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

async function yahooQuotes(): Promise<TapeQuote[]> {
  const symbols = Object.keys(YAHOO).join(",");
  const url = `/api/yahoo/v8/finance/spark?symbols=${encodeURIComponent(symbols)}&range=5d&interval=1d`;
  const json = (await readJson(url)) as Record<string, { fulldayPrice?: number; fulldayChangePercent?: number }>;
  const out: TapeQuote[] = [];
  for (const [symbol, id] of Object.entries(YAHOO)) {
    const entry = json[symbol];
    const built = entry ? row(id, Number(entry.fulldayPrice), Number(entry.fulldayChangePercent)) : null;
    if (built) out.push(built);
  }
  return out;
}

async function cryptoQuote(apiSymbol: string): Promise<TapeQuote | null> {
  const id = CRYPTO[apiSymbol];
  if (!id) return null;
  const json = (await readJson(`/market-api/crypto/prices/${apiSymbol}/?timeframe=1d`)) as {
    price?: number;
    open?: number;
  };
  const price = Number(json.price);
  const open = Number(json.open);
  if (!(open > 0)) return null;
  return row(id, price, ((price - open) / open) * 100);
}

async function goldQuote(): Promise<TapeQuote | null> {
  const json = (await readJson("/market-api/forex/xauusd/")) as {
    price?: number;
    open?: number;
    change_pct?: number;
  };
  const price = Number(json.price);
  const open = Number(json.open);
  const change = Number.isFinite(Number(json.change_pct))
    ? Number(json.change_pct)
    : open > 0
      ? ((price - open) / open) * 100
      : Number.NaN;
  return row("XAU", price, change);
}

/** One pass of live prices. Missing names are left out so the caller keeps the previous figure. */
export async function fetchTapeQuotes(): Promise<TapeQuote[]> {
  const [yahoo, gold, ...crypto] = await Promise.all([
    yahooQuotes().catch(() => [] as TapeQuote[]),
    goldQuote().catch(() => null),
    ...Object.keys(CRYPTO).map((symbol) => cryptoQuote(symbol).catch(() => null)),
  ]);
  const byId = new Map<string, TapeQuote>();
  for (const quote of yahoo) byId.set(quote.id, quote);
  for (const quote of crypto) {
    if (quote) byId.set(quote.id, quote);
  }
  if (gold) byId.set(gold.id, gold);
  return ORDER.flatMap((id) => {
    const quote = byId.get(id);
    return quote ? [quote] : [];
  });
}
