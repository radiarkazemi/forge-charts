export interface Quote {
  readonly ticker: string;
  readonly price: number;
  /** Percentage change versus the previous session close. */
  readonly changePercent: number;
  /** UNIX timestamp in seconds when the quote was observed. */
  readonly updatedAt: number;
  /** `true` when the value was fabricated by the demo provider. */
  readonly synthetic: boolean;
}

export type QuoteBook = Readonly<Record<string, Quote>>;

export function quoteDirection(quote: Quote | undefined): "up" | "down" | "flat" {
  if (!quote || quote.changePercent === 0) return "flat";
  return quote.changePercent > 0 ? "up" : "down";
}
