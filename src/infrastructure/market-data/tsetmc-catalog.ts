import { SESSION_TSE, type SymbolInfo, type SymbolType } from "@/domain";
import type { StaticSymbolRepository } from "@/infrastructure/symbols/static-symbol-repository";

/** One cleaned Tehran instrument. Last trade and official close are separate. */
export interface TsetmcBoardRow {
  readonly symbol: string;
  readonly name: string;
  readonly insCode: string;
  readonly kind: TsetmcKind;
  readonly market: string;
  readonly flow: number;
  readonly last: number;
  readonly close: number;
  readonly volume: number;
}

export type TsetmcKind = "stock" | "right" | "fund" | "bond" | "futures" | "option";

export interface TsetmcBoard {
  readonly updatedAt: number;
  readonly source: string;
  readonly errors: readonly string[];
  readonly rows: readonly TsetmcBoardRow[];
  readonly dropped: {
    readonly empty: number;
    readonly not_persian: number;
    readonly removed: number;
    readonly duplicate: number;
  };
  readonly counts: Readonly<Record<string, number>>;
  readonly total: number;
}

const KINDS: readonly TsetmcKind[] = ["stock", "right", "fund", "bond", "futures", "option"];

let cached: TsetmcBoard | null = null;
let inflight: Promise<TsetmcBoard | null> | null = null;

function kindOf(value: unknown): TsetmcKind {
  const text = String(value ?? "");
  return (KINDS as readonly string[]).includes(text) ? (text as TsetmcKind) : "stock";
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalize(data: unknown): TsetmcBoard | null {
  if (!data || typeof data !== "object") return null;
  const raw = data as Record<string, unknown>;
  const rowsIn = Array.isArray(raw.rows) ? raw.rows : [];
  const rows: TsetmcBoardRow[] = [];
  for (const item of rowsIn) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const symbol = String(row.symbol ?? "").trim();
    const name = String(row.name ?? "").trim();
    if (!symbol || !name) continue;
    rows.push({
      symbol,
      name,
      insCode: String(row.insCode ?? "").trim(),
      kind: kindOf(row.kind),
      market: String(row.market ?? "").trim(),
      flow: num(row.flow),
      last: num(row.last),
      close: num(row.close),
      volume: num(row.volume),
    });
  }
  const droppedRaw = (raw.dropped ?? {}) as Record<string, unknown>;
  const countsRaw = (raw.counts ?? {}) as Record<string, unknown>;
  const counts: Record<string, number> = {};
  for (const [key, value] of Object.entries(countsRaw)) counts[key] = num(value);
  return {
    updatedAt: num(raw.updatedAt),
    source: String(raw.source ?? ""),
    errors: Array.isArray(raw.errors) ? raw.errors.map((item) => String(item)) : [],
    rows,
    dropped: {
      empty: num(droppedRaw.empty),
      not_persian: num(droppedRaw.not_persian),
      removed: num(droppedRaw.removed),
      duplicate: num(droppedRaw.duplicate),
    },
    counts,
    total: rows.length,
  };
}

/** One cached read of the cleaned board. The browser never calls TSETMC. */
export function loadTsetmcBoard(): Promise<TsetmcBoard | null> {
  if (cached && cached.total > 0) return Promise.resolve(cached);
  if (!inflight) {
    inflight = fetch("/iran-gold/tsetmc/catalog")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        const board = normalize(data);
        if (board && board.total > 0) cached = board;
        return board;
      })
      .catch(() => null)
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

export function tsetmcSymbol(row: TsetmcBoardRow): SymbolInfo {
  const type: SymbolType =
    row.kind === "fund"
      ? "fund"
      : row.kind === "option"
        ? "option"
        : row.kind === "bond"
          ? "bond"
          : row.kind === "futures"
            ? "futures"
            : "stock";
  return {
    ticker: row.symbol,
    name: row.name,
    exchange: "TSE",
    type,
    pricePrecision: 0,
    session: SESSION_TSE,
    timezone: "Asia/Tehran",
  };
}

/** Put the cleaned board on the symbol book so a chart can resolve any Tehran name. */
export function hydrateTsetmcBoard(repo: StaticSymbolRepository): void {
  void loadTsetmcBoard().then((board) => {
    if (!board) return;
    for (const row of board.rows) repo.registerDynamic(tsetmcSymbol(row));
  });
}
