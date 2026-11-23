/**
 * Fractal & Time Alignment clock (America/New_York).
 * Spec: fractal-time-agent-reference — Continuous 17:00 NY grid.
 * Intervals are half-open [start, end).
 */

const NY = "America/New_York";
export const FX_ROLLOVER_HOUR = 17;

export type WeekdayName = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";
export type H4Block = "C1" | "C2" | "C3" | "C4" | "C5" | "C6";
export type Quarter = "Q1" | "Q2" | "Q3" | "Q4";
export type MonthWeek = "W1" | "W2" | "W3" | "W4" | "W5";
export type YearQuarter = "YQ1" | "YQ2" | "YQ3" | "YQ4";
export type SessionName = "Asia" | "London" | "NY AM" | "NY PM";

/** Futures / QT trading day open (NDOG ends, books reopen). */
export const QT_DAY_HOUR = 18;

export type NyClock = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number; // 0 Sun … 6 Sat
};

const WEEKDAY_NAME: WeekdayName[] = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function nyClock(timeSec: number): NyClock {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: NY,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  });
  const parts = fmt.formatToParts(new Date(timeSec * 1000));
  const pick = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  let hour = Number(pick("hour"));
  if (hour === 24) hour = 0;
  const wdMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: Number(pick("year")),
    month: Number(pick("month")),
    day: Number(pick("day")),
    hour,
    minute: Number(pick("minute")),
    second: Number(pick("second")),
    weekday: wdMap[pick("weekday")] ?? 0,
  };
}

export function utcAtNewYork(year: number, month: number, day: number, hour: number, minute = 0): number {
  const desired = Date.UTC(year, month - 1, day, hour, minute, 0);
  const guess = Math.floor(desired / 1000);
  const got = nyClock(guess);
  const gotAsUtc = Date.UTC(got.year, got.month - 1, got.day, got.hour, got.minute, 0);
  return Math.floor((desired - (gotAsUtc - desired)) / 1000);
}

function addCalendarDays(year: number, month: number, day: number, delta: number): { year: number; month: number; day: number } {
  const d = new Date(Date.UTC(year, month - 1, day));
  d.setUTCDate(d.getUTCDate() + delta);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/** Trading date: at/after 17:00 NY, roll to the next calendar day. Sunday 17:00 → Monday. */
export function tradingDate(timeSec: number): { year: number; month: number; day: number; weekday: number; name: WeekdayName } {
  const ny = nyClock(timeSec);
  let year = ny.year;
  let month = ny.month;
  let day = ny.day;
  let weekday = ny.weekday;
  if (ny.hour >= FX_ROLLOVER_HOUR) {
    const next = addCalendarDays(year, month, day, 1);
    year = next.year;
    month = next.month;
    day = next.day;
    weekday = (weekday + 1) % 7;
  }
  return { year, month, day, weekday, name: WEEKDAY_NAME[weekday]! };
}

/** Session open 17:00 NY of the calendar day that started this FX day. */
export function sessionOpenSec(timeSec: number): number {
  const ny = nyClock(timeSec);
  if (ny.hour >= FX_ROLLOVER_HOUR) {
    return utcAtNewYork(ny.year, ny.month, ny.day, FX_ROLLOVER_HOUR, 0);
  }
  const prev = addCalendarDays(ny.year, ny.month, ny.day, -1);
  return utcAtNewYork(prev.year, prev.month, prev.day, FX_ROLLOVER_HOUR, 0);
}

export function h4Block(timeSec: number): { block: H4Block; quarter: Quarter; label: string; blockStart: number; quarterStart: number } {
  const open = sessionOpenSec(timeSec);
  const elapsed = Math.max(0, timeSec - open);
  const blockIndex = Math.min(5, Math.floor(elapsed / 14_400));
  const inBlock = elapsed - blockIndex * 14_400;
  const qIndex = Math.min(3, Math.floor(inBlock / 3_600));
  const block = `C${blockIndex + 1}` as H4Block;
  const quarter = `Q${qIndex + 1}` as Quarter;
  return {
    block,
    quarter,
    label: `${block}·${quarter}`,
    blockStart: open + blockIndex * 14_400,
    quarterStart: open + blockIndex * 14_400 + qIndex * 3_600,
  };
}

function isWeekdayTrading(weekday: number): boolean {
  return weekday >= 1 && weekday <= 5;
}

function firstTradingDateOfMonth(year: number, month: number): { year: number; month: number; day: number; weekday: number } {
  for (let day = 1; day <= 31; day += 1) {
    const probe = utcAtNewYork(year, month, day, 12, 0);
    const td = tradingDate(probe);
    if (td.year === year && td.month === month && isWeekdayTrading(td.weekday)) {
      return { year: td.year, month: td.month, day: td.day, weekday: td.weekday };
    }
  }
  return { year, month, day: 1, weekday: 1 };
}

/**
 * ICT monthly quarters: W1 is the first Monday of the calendar month.
 * Days before that Monday are a distortion week (folded into W1 when foldW5).
 */
export function monthWeek(timeSec: number, foldW5 = true): MonthWeek {
  const td = tradingDate(timeSec);
  let firstMon = 0;
  for (let day = 1; day <= 7; day += 1) {
    const probe = utcAtNewYork(td.year, td.month, day, 12, 0);
    if (nyClock(probe).weekday === 1) {
      firstMon = day;
      break;
    }
  }
  if (!firstMon) firstMon = firstTradingDateOfMonth(td.year, td.month).day;
  if (td.day < firstMon) return foldW5 ? "W1" : "W5";
  const week = Math.floor((td.day - firstMon) / 7) + 1;
  if (week >= 5) return foldW5 ? "W4" : "W5";
  return `W${week}` as MonthWeek;
}

export function yearQuarter(timeSec: number): YearQuarter {
  const td = tradingDate(timeSec);
  if (td.month <= 3) return "YQ1";
  if (td.month <= 6) return "YQ2";
  if (td.month <= 9) return "YQ3";
  return "YQ4";
}

export type MacroName =
  | "London1"
  | "London2"
  | "NY1"
  | "NY2"
  | "NY3"
  | "Lunch"
  | "NYPM1"
  | "NYPM2"
  | null;

export const MACROS: { name: Exclude<MacroName, null>; startMin: number; endMin: number }[] = [
  { name: "London1", startMin: 2 * 60 + 33, endMin: 3 * 60 },
  { name: "London2", startMin: 4 * 60 + 3, endMin: 4 * 60 + 30 },
  { name: "NY1", startMin: 8 * 60 + 50, endMin: 9 * 60 + 10 },
  { name: "NY2", startMin: 9 * 60 + 50, endMin: 10 * 60 + 10 },
  { name: "NY3", startMin: 10 * 60 + 50, endMin: 11 * 60 + 10 },
  { name: "Lunch", startMin: 11 * 60 + 50, endMin: 12 * 60 + 10 },
  { name: "NYPM1", startMin: 13 * 60 + 10, endMin: 13 * 60 + 40 },
  { name: "NYPM2", startMin: 15 * 60 + 15, endMin: 15 * 60 + 45 },
];

export function activeMacro(timeSec: number): MacroName {
  const ny = nyClock(timeSec);
  const mins = ny.hour * 60 + ny.minute;
  for (const m of MACROS) {
    if (mins >= m.startMin && mins < m.endMin) return m.name;
  }
  return null;
}

export function weekPhase(name: WeekdayName): string {
  if (name === "Mon") return "accumulation · Q1";
  if (name === "Tue") return "manipulation · Q2 · TWO";
  if (name === "Wed") return "distribution · Q3";
  if (name === "Thu") return "continuation / reversal · Q4";
  if (name === "Fri") return "outside cycle (Friday)";
  return "weekend";
}

export function weekMappedQ(name: WeekdayName): Quarter | null {
  if (name === "Mon") return "Q1";
  if (name === "Tue") return "Q2";
  if (name === "Wed") return "Q3";
  if (name === "Thu") return "Q4";
  return null;
}

export function qtDayOpenSec(timeSec: number): number {
  const ny = nyClock(timeSec);
  if (ny.hour >= QT_DAY_HOUR) {
    return utcAtNewYork(ny.year, ny.month, ny.day, QT_DAY_HOUR, 0);
  }
  const prev = addCalendarDays(ny.year, ny.month, ny.day, -1);
  return utcAtNewYork(prev.year, prev.month, prev.day, QT_DAY_HOUR, 0);
}

export function session90(timeSec: number): {
  session: SessionName;
  quarter: Quarter;
  label: string;
  sessionStart: number;
  quarterStart: number;
  trueOpen: number;
} {
  const open = qtDayOpenSec(timeSec);
  const elapsed = Math.max(0, timeSec - open);
  const six = Math.min(3, Math.floor(elapsed / 21_600));
  const names: SessionName[] = ["Asia", "London", "NY AM", "NY PM"];
  const inSess = elapsed - six * 21_600;
  const qIndex = Math.min(3, Math.floor(inSess / 5_400));
  const sessionStart = open + six * 21_600;
  const session = names[six]!;
  const quarter = `Q${qIndex + 1}` as Quarter;
  return {
    session,
    quarter,
    label: `${session} ${quarter}`,
    sessionStart,
    quarterStart: sessionStart + qIndex * 5_400,
    trueOpen: sessionStart + 5_400,
  };
}

/** Monday 18:00 NY — open of Tuesday's daily bar (ICT True Week Open). */
export function trueWeekOpenSec(timeSec: number): number {
  let t = qtDayOpenSec(timeSec);
  for (let i = 0; i < 10; i += 1) {
    if (nyClock(t).weekday === 1) return t;
    t -= 86_400;
  }
  return t;
}

/** Sunday 18:00 NY that opens the second full week (ICT True Month Open). */
export function trueMonthOpenSec(timeSec: number): number {
  const td = tradingDate(timeSec);
  let firstMon = 1;
  for (let day = 1; day <= 7; day += 1) {
    if (nyClock(utcAtNewYork(td.year, td.month, day, 12, 0)).weekday === 1) {
      firstMon = day;
      break;
    }
  }
  const sun = addCalendarDays(td.year, td.month, firstMon + 7, -1);
  return utcAtNewYork(sun.year, sun.month, sun.day, QT_DAY_HOUR, 0);
}

/** First Monday of April 18:00 NY (ICT True Year Open / YQ2). */
export function trueYearOpenSec(timeSec: number): number {
  const td = tradingDate(timeSec);
  const year = td.month >= 4 ? td.year : td.year - 1;
  let firstMon = 1;
  for (let day = 1; day <= 7; day += 1) {
    if (nyClock(utcAtNewYork(year, 4, day, 12, 0)).weekday === 1) {
      firstMon = day;
      break;
    }
  }
  return utcAtNewYork(year, 4, firstMon, QT_DAY_HOUR, 0);
}

export const KILLZONES: { name: string; startMin: number; endMin: number }[] = [
  { name: "Asia KZ", startMin: 19 * 60, endMin: 22 * 60 },
  { name: "London KZ", startMin: 2 * 60, endMin: 5 * 60 },
  { name: "NY AM KZ", startMin: 7 * 60, endMin: 10 * 60 },
  { name: "London Close", startMin: 10 * 60, endMin: 12 * 60 },
  { name: "NY PM KZ", startMin: 13 * 60 + 30, endMin: 16 * 60 },
];

export function yearPhase(q: YearQuarter): string {
  if (q === "YQ1") return "accumulation";
  if (q === "YQ2") return "manipulation · TYO";
  if (q === "YQ3") return "distribution";
  return "continuation / reversal";
}

export type FractalSnapshot = {
  timeSec: number;
  ny: NyClock;
  trading: ReturnType<typeof tradingDate>;
  h4: ReturnType<typeof h4Block>;
  session: ReturnType<typeof session90>;
  monthW: MonthWeek;
  yearQ: YearQuarter;
  macro: MacroName;
  sessionOpen: number;
  qtDayOpen: number;
  asiaTrueOpen: number;
  trueDayOpen: number;
  trueWeekOpen: number;
  trueMonthOpen: number;
  trueYearOpen: number;
};

export function snapshotAt(timeSec: number, foldW5 = true): FractalSnapshot {
  const sessionOpen = sessionOpenSec(timeSec);
  const ny = nyClock(sessionOpen);
  const asiaTrueOpen = utcAtNewYork(ny.year, ny.month, ny.day, 19, 30);
  const nextCal = addCalendarDays(ny.year, ny.month, ny.day, 1);
  const trueDayOpen = utcAtNewYork(nextCal.year, nextCal.month, nextCal.day, 0, 0);
  return {
    timeSec,
    ny: nyClock(timeSec),
    trading: tradingDate(timeSec),
    h4: h4Block(timeSec),
    session: session90(timeSec),
    monthW: monthWeek(timeSec, foldW5),
    yearQ: yearQuarter(timeSec),
    macro: activeMacro(timeSec),
    sessionOpen,
    qtDayOpen: qtDayOpenSec(timeSec),
    asiaTrueOpen,
    trueDayOpen,
    trueWeekOpen: trueWeekOpenSec(timeSec),
    trueMonthOpen: trueMonthOpenSec(timeSec),
    trueYearOpen: trueYearOpenSec(timeSec),
  };
}

export type AlignmentMode = "phase" | "sameQ";

export type AlignmentInputs = {
  mode: AlignmentMode;
  enableYear: boolean;
  enableMonth: boolean;
  enableWeek: boolean;
  enableH4: boolean;
  enableMacro: boolean;
  monthAllow: readonly string[];
  weekAllow: readonly string[];
  h4Allow: readonly string[];
  macroAllow: readonly string[];
  yearAllow: readonly string[];
  foldW5: boolean;
};

/** Course example preset (XAUUSD demo, no directional claim). */
export const DEFAULT_ALIGNMENT: AlignmentInputs = {
  mode: "phase",
  enableYear: false,
  enableMonth: true,
  enableWeek: true,
  enableH4: true,
  enableMacro: true,
  monthAllow: ["W3", "W4"],
  weekAllow: ["Wed", "Thu"],
  h4Allow: ["Q2"],
  macroAllow: ["NY2"],
  yearAllow: ["YQ1", "YQ2", "YQ3", "YQ4"],
  foldW5: true,
};

export type LayerRow = {
  layer: string;
  current: string;
  opensNy: string;
  nextNy: string;
  match: "yes" | "no" | "off" | "n/a";
  eligible: boolean;
};

function fmtNy(sec: number): string {
  const c = nyClock(sec);
  return `${c.year}-${pad(c.month)}-${pad(c.day)} ${pad(c.hour)}:${pad(c.minute)}`;
}

export type AlignmentResult = {
  snap: FractalSnapshot;
  rows: LayerRow[];
  enabled: number;
  matched: number;
  aligned: boolean;
  reason: string;
};

export function evaluateAlignment(timeSec: number, inputs: AlignmentInputs): AlignmentResult {
  const snap = snapshotAt(timeSec, inputs.foldW5);
  const rows: LayerRow[] = [];

  const yearOk = inputs.yearAllow.includes(snap.yearQ);
  rows.push({
    layer: "Year",
    current: `${snap.yearQ.slice(1)} · ${yearPhase(snap.yearQ)}`,
    opensNy: "Apr True Year Open",
    nextNy: snap.yearQ === "YQ4" ? "next Jan" : "next quarter",
    match: !inputs.enableYear ? "off" : yearOk ? "yes" : "no",
    eligible: inputs.enableYear,
  });

  const monthOk = inputs.monthAllow.includes(snap.monthW);
  rows.push({
    layer: "Month",
    current: snap.monthW,
    opensNy: "W2 Open / first print",
    nextNy: snap.monthW === "W4" ? "next month W1" : "next Monday",
    match: !inputs.enableMonth ? "off" : monthOk ? "yes" : "no",
    eligible: inputs.enableMonth,
  });

  const weekOk = inputs.weekAllow.includes(snap.trading.name);
  rows.push({
    layer: "Week",
    current: `${snap.trading.name} · ${weekPhase(snap.trading.name)}`,
    opensNy: "TWO = Mon 18:00 NY",
    nextNy: "next trading date",
    match: !inputs.enableWeek ? "off" : weekOk ? "yes" : "no",
    eligible: inputs.enableWeek,
  });

  rows.push({
    layer: "Session",
    current: `${snap.session.label} · TSO ${fmtNy(snap.session.trueOpen).slice(11)}`,
    opensNy: "18:00 NY day · 90m Q2 true open",
    nextNy: fmtNy(snap.session.quarterStart + 5_400),
    match: "n/a",
    eligible: false,
  });

  const h4Ok = inputs.h4Allow.includes(snap.h4.quarter);
  rows.push({
    layer: "H4",
    current: snap.h4.label,
    opensNy: fmtNy(snap.h4.quarterStart),
    nextNy: fmtNy(snap.h4.quarterStart + 3_600),
    match: !inputs.enableH4 ? "off" : h4Ok ? "yes" : "no",
    eligible: inputs.enableH4,
  });

  const macroLabel = snap.macro ?? "—";
  const macroOk = snap.macro != null && inputs.macroAllow.includes(snap.macro);
  rows.push({
    layer: "Macro",
    current: macroLabel,
    opensNy: "NY windows 08:50 / 09:50",
    nextNy: "window end exclusive",
    match: !inputs.enableMacro ? "off" : snap.macro == null ? "n/a" : macroOk ? "yes" : "no",
    eligible: inputs.enableMacro,
  });

  const enabledRows = rows.filter((r) => r.eligible);
  const enabled = enabledRows.length;
  if (inputs.mode === "sameQ") {
    const qLayers: (Quarter | null)[] = [];
    if (inputs.enableYear) qLayers.push(snap.yearQ.replace("Y", "") as Quarter);
    if (inputs.enableMonth) qLayers.push(snap.monthW.replace("W", "Q") as Quarter);
    if (inputs.enableWeek) qLayers.push(weekMappedQ(snap.trading.name));
    if (inputs.enableH4) qLayers.push(snap.h4.quarter);
    const usable = qLayers.filter((q): q is Quarter => q != null);
    const blocked = qLayers.some((q) => q == null) || enabled < 2 || usable.length < 2;
    const q0 = usable[0];
    const same = !blocked && usable.every((q) => q === q0);
    return {
      snap,
      rows,
      enabled,
      matched: same ? enabled : 0,
      aligned: same,
      reason: blocked ? "Same Q blocked (unavailable layer)" : same ? `Same ${q0}` : "Q mismatch",
    };
  }

  const matched = enabledRows.filter((r) => r.match === "yes").length;
  const anyNa = enabledRows.some((r) => r.match === "n/a");
  const aligned = enabled >= 2 && !anyNa && matched === enabled;
  return {
    snap,
    rows,
    enabled,
    matched,
    aligned,
    reason: aligned ? "Phase Match" : anyNa ? "unavailable layer" : `${matched}/${enabled} layers`,
  };
}

export function formatTehran(timeSec: number): string {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  return fmt.format(new Date(timeSec * 1000));
}
