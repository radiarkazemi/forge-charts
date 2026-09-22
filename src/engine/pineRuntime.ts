import type { Bar, IndicatorKind } from "./types";
import { ema, rsi, sma } from "./indicators";

export type PineRunResult = {
  ok: boolean;
  message: string;
  logs: string[];
  addKinds: IndicatorKind[];
  strategyId?: "ma_cross" | "rsi_revert" | "macd_trend" | "donchian_break";
};

/** Minimal Pine-like subset: maps common ta.* / strategy patterns onto Forge studies. */
export function runPineSubset(code: string): PineRunResult {
  const logs: string[] = [];
  const addKinds: IndicatorKind[] = [];
  const text = code.replace(/\/\/.*$/gm, "");

  const push = (kind: IndicatorKind, label: string) => {
    if (!addKinds.includes(kind)) {
      addKinds.push(kind);
      logs.push(`[plot] mapped ${label} → ${kind}`);
    }
  };

  if (/\bta\.sma\b|\bsma\s*\(/i.test(text)) push("sma", "ta.sma");
  if (/\bta\.ema\b|\bema\s*\(/i.test(text)) push("ema", "ta.ema");
  if (/\bta\.wma\b|\bwma\s*\(/i.test(text)) push("wma", "ta.wma");
  if (/\bta\.rma\b|\bsmma\b|\bsmoothed/i.test(text)) push("smma", "ta.rma/smma");
  if (/\bta\.vwma\b|\bvwma\b/i.test(text)) push("vwma", "ta.vwma");
  if (/\bhull\b|\bta\.hma\b|\bhma\b/i.test(text)) push("hma", "hma");
  if (/\bta\.bb\b|\bbollinger\b|\bbbands\b/i.test(text)) push("bb", "ta.bb");
  if (/\bta\.vwap\b|\bvwap\b/i.test(text)) push("vwap", "ta.vwap");
  if (/\bta\.rsi\b|\brsi\s*\(/i.test(text)) push("rsi", "ta.rsi");
  if (/\bta\.macd\b|\bmacd\s*\(/i.test(text)) push("macd", "ta.macd");
  if (/\bta\.stoch\b|\bstochastic\b/i.test(text)) push("stoch", "ta.stoch");
  if (/\bta\.atr\b|\batr\s*\(/i.test(text)) push("atr", "ta.atr");
  if (/\bichimoku\b|\btenkan\b|\bkijun\b/i.test(text)) push("ichimoku", "ichimoku");
  if (/\bta\.sar\b|\bpsar\b|\bparabolic\b/i.test(text)) push("psar", "ta.sar");
  if (/\bsupertrend\b/i.test(text)) push("supertrend", "supertrend");
  if (/\bta\.adx\b|\badx\b/i.test(text)) push("adx", "ta.adx");
  if (/\bstochrsi\b|\bstochastic\s*rsi\b/i.test(text)) push("stochrsi", "stochrsi");
  if (/\bta\.cci\b|\bcci\s*\(/i.test(text)) push("cci", "ta.cci");
  if (/\bta\.wpr\b|\bwillr\b|\bwilliams\b/i.test(text)) push("willr", "ta.wpr");
  if (/\bta\.obv\b|\bobv\b/i.test(text)) push("obv", "ta.obv");
  if (/\bcmf\b|\bchaikin\b/i.test(text)) push("cmf", "cmf");
  if (/\bdonchian\b/i.test(text)) push("donchian", "donchian");
  if (/\bkeltner\b/i.test(text)) push("keltner", "keltner");
  if (/\bpivot\b/i.test(text)) push("pivot", "pivot");

  let strategyId: PineRunResult["strategyId"];
  if (/\bstrategy\s*\(/i.test(text) || /\bstrategy\.entry\b/i.test(text)) {
    if (/rsi/i.test(text)) strategyId = "rsi_revert";
    else if (/macd/i.test(text)) strategyId = "macd_trend";
    else if (/donchian|highest|breakout/i.test(text)) strategyId = "donchian_break";
    else strategyId = "ma_cross";
    logs.push(`[strategy] detected → ${strategyId}`);
  }

  // Syntax / structure checks (GAP-16) — fail closed instead of silent SMA.
  const errors: string[] = [];
  const openParen = (text.match(/\(/g) ?? []).length;
  const closeParen = (text.match(/\)/g) ?? []).length;
  if (openParen !== closeParen) {
    errors.push(`Mismatched parentheses (${openParen} open / ${closeParen} close)`);
  }
  const openBrace = (text.match(/\{/g) ?? []).length;
  const closeBrace = (text.match(/\}/g) ?? []).length;
  if (openBrace !== closeBrace) {
    errors.push(`Mismatched braces (${openBrace} open / ${closeBrace} close)`);
  }
  if (/\bplot\s*\([^)]*$/m.test(code) || /\bstrategy\.entry\s*\([^)]*$/m.test(code)) {
    errors.push("Unterminated plot/strategy.entry call");
  }
  // Unknown ta.* calls that we do not map
  for (const m of text.matchAll(/\bta\.([a-zA-Z_][a-zA-Z0-9_]*)/g)) {
    const fn = m[1]!.toLowerCase();
    const known = new Set([
      "sma","ema","wma","rma","vwma","hma","bb","vwap","rsi","macd","stoch","atr","sar","adx","cci","wpr","obv",
    ]);
    if (!known.has(fn) && !/^(highest|lowest|change|crossover|crossunder|valuewhen)$/.test(fn)) {
      errors.push(`Unsupported ta.${m[1]} in subset runtime`);
    }
  }
  if (errors.length) {
    for (const err of errors) logs.push(`[error] ${err}`);
    return {
      ok: false,
      message: `Compile failed · ${errors.length} error(s)`,
      logs,
      addKinds: [],
      strategyId: undefined,
    };
  }

  if (!addKinds.length && !strategyId) {
    logs.push("[error] no recognized ta.* / strategy call — refusing silent default");
    return {
      ok: false,
      message: "Compile failed · no mappable plots or strategy",
      logs,
      addKinds: [],
    };
  }

  logs.push(`[ok] subset compile · ${addKinds.length} plot(s)${strategyId ? ` · strategy ${strategyId}` : ""}`);
  return {
    ok: true,
    message: strategyId
      ? `Compiled subset · ${addKinds.length} plot(s) · strategy ${strategyId}`
      : `Compiled subset · ${addKinds.length} plot(s)`,
    logs,
    addKinds,
    strategyId,
  };
}

export type StrategyTrade = {
  entryTime: number;
  exitTime: number;
  side: "long" | "short";
  entry: number;
  exit: number;
  pnl: number;
  pnlPct: number;
};

export type StrategyReport = {
  id: string;
  name: string;
  netProfit: number;
  netProfitPct: number;
  maxDrawdownPct: number;
  totalTrades: number;
  winRate: number;
  profitFactor: number;
  avgTradePct: number;
  trades: StrategyTrade[];
  equity: number[];
  /** GAP-62 ratio extras */
  payoffRatio: number;
  expectancyPct: number;
  avgWinPct: number;
  avgLossPct: number;
  longTrades: number;
  shortTrades: number;
};

function finalize(id: string, name: string, trades: StrategyTrade[], equity: number[]): StrategyReport {
  const wins = trades.filter((t) => t.pnl > 0);
  const losses = trades.filter((t) => t.pnl <= 0);
  const grossWin = wins.reduce((a, t) => a + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((a, t) => a + t.pnl, 0));
  let peak = equity[0] ?? 1;
  let maxDd = 0;
  for (const e of equity) {
    peak = Math.max(peak, e);
    maxDd = Math.max(maxDd, peak > 0 ? ((peak - e) / peak) * 100 : 0);
  }
  const net = trades.reduce((a, t) => a + t.pnl, 0);
  const start = equity[0] ?? 10_000;
  const avgWinPct = wins.length ? wins.reduce((a, t) => a + t.pnlPct, 0) / wins.length : 0;
  const avgLossPct = losses.length ? losses.reduce((a, t) => a + t.pnlPct, 0) / losses.length : 0;
  const payoffRatio = avgLossPct !== 0 ? Math.abs(avgWinPct / avgLossPct) : avgWinPct > 0 ? Infinity : 0;
  const winRate = trades.length ? wins.length / trades.length : 0;
  return {
    id,
    name,
    netProfit: net,
    netProfitPct: start ? (net / start) * 100 : 0,
    maxDrawdownPct: maxDd,
    totalTrades: trades.length,
    winRate: winRate * 100,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0,
    avgTradePct: trades.length ? trades.reduce((a, t) => a + t.pnlPct, 0) / trades.length : 0,
    trades,
    equity,
    payoffRatio,
    expectancyPct: winRate * avgWinPct + (1 - winRate) * avgLossPct,
    avgWinPct,
    avgLossPct,
    longTrades: trades.filter((t) => t.side === "long").length,
    shortTrades: trades.filter((t) => t.side === "short").length,
  };
}

function runLongOnly(
  bars: Bar[],
  entries: boolean[],
  exits: boolean[],
  id: string,
  name: string,
): StrategyReport {
  const cash0 = 10_000;
  let cash = cash0;
  let qty = 0;
  let entryPrice = 0;
  let entryTime = 0;
  const trades: StrategyTrade[] = [];
  const equity: number[] = [];
  for (let i = 0; i < bars.length; i++) {
    const px = bars[i].close;
    if (qty > 0 && exits[i]) {
      const pnl = (px - entryPrice) * qty;
      trades.push({
        entryTime,
        exitTime: bars[i].time,
        side: "long",
        entry: entryPrice,
        exit: px,
        pnl,
        pnlPct: ((px - entryPrice) / entryPrice) * 100,
      });
      cash += qty * px;
      qty = 0;
    }
    if (qty === 0 && entries[i]) {
      qty = cash / px;
      entryPrice = px;
      entryTime = bars[i].time;
      cash = 0;
    }
    equity.push(cash + qty * px);
  }
  if (qty > 0 && bars.length) {
    const last = bars[bars.length - 1]!;
    const pnl = (last.close - entryPrice) * qty;
    trades.push({
      entryTime,
      exitTime: last.time,
      side: "long",
      entry: entryPrice,
      exit: last.close,
      pnl,
      pnlPct: ((last.close - entryPrice) / entryPrice) * 100,
    });
  }
  return finalize(id, name, trades, equity);
}

export function runStrategy(
  bars: Bar[],
  id: "ma_cross" | "rsi_revert" | "macd_trend" | "donchian_break" = "ma_cross",
): StrategyReport {
  if (bars.length < 40) {
    return finalize(id, id, [], bars.map(() => 10_000));
  }
  const closes = bars.map((b) => b.close);
  if (id === "rsi_revert") {
    const r = rsi(closes, 14);
    const entries = r.map((v) => v != null && v < 30);
    const exits = r.map((v) => v != null && v > 70);
    return runLongOnly(bars, entries, exits, id, "RSI Reversion");
  }
  if (id === "macd_trend") {
    const fast = ema(closes, 12);
    const slow = ema(closes, 26);
    const line = closes.map((_, i) =>
      fast[i] != null && slow[i] != null ? (fast[i] as number) - (slow[i] as number) : null,
    );
    const compact = line.map((v) => v ?? 0);
    const signal = ema(compact, 9).map((v, i) => (line[i] == null ? null : v));
    const entries = line.map((v, i) => {
      if (i < 1 || v == null || signal[i] == null || line[i - 1] == null || signal[i - 1] == null) return false;
      return (line[i - 1] as number) <= (signal[i - 1] as number) && v > (signal[i] as number);
    });
    const exits = line.map((v, i) => {
      if (i < 1 || v == null || signal[i] == null || line[i - 1] == null || signal[i - 1] == null) return false;
      return (line[i - 1] as number) >= (signal[i - 1] as number) && v < (signal[i] as number);
    });
    return runLongOnly(bars, entries, exits, id, "MACD Trend");
  }
  if (id === "donchian_break") {
    const period = 20;
    const entries = bars.map((_, i) => {
      if (i < period) return false;
      let hi = -Infinity;
      for (let j = 1; j <= period; j++) hi = Math.max(hi, bars[i - j].high);
      return bars[i].close > hi;
    });
    const exits = bars.map((_, i) => {
      if (i < period) return false;
      let lo = Infinity;
      for (let j = 1; j <= period; j++) lo = Math.min(lo, bars[i - j].low);
      return bars[i].close < lo;
    });
    return runLongOnly(bars, entries, exits, id, "Donchian Breakout");
  }
  const fast = sma(closes, 9);
  const slow = sma(closes, 21);
  const entries = fast.map((v, i) => {
    if (i < 1 || v == null || slow[i] == null || fast[i - 1] == null || slow[i - 1] == null) return false;
    return (fast[i - 1] as number) <= (slow[i - 1] as number) && v > (slow[i] as number);
  });
  const exits = fast.map((v, i) => {
    if (i < 1 || v == null || slow[i] == null || fast[i - 1] == null || slow[i - 1] == null) return false;
    return (fast[i - 1] as number) >= (slow[i - 1] as number) && v < (slow[i] as number);
  });
  return runLongOnly(bars, entries, exits, id, "MA Cross");
}
