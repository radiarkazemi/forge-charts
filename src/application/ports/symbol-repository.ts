import type { SymbolInfo, SymbolType } from "@/domain";

export interface SymbolRepository {
  all(): readonly SymbolInfo[];
  /** When `exchange` is set, prefer that listing (e.g. FXPRO vs FOREXCOM XAUUSD). */
  findByTicker(ticker: string, exchange?: string): SymbolInfo | undefined;
  search(query: string, type?: SymbolType | ""): SymbolInfo[];
}
