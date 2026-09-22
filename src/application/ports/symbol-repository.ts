import type { SymbolInfo, SymbolType } from "@/domain";

export interface SymbolRepository {
  all(): readonly SymbolInfo[];
  findByTicker(ticker: string): SymbolInfo | undefined;
  search(query: string, type?: SymbolType | ""): SymbolInfo[];
}
