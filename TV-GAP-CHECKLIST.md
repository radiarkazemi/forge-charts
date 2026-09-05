# TradingView observation → Forge gap checklist

**Date:** 2026-09-05  
**Sources:** Live TradingView Supercharts (guest chart), TradingView public Supercharts / drawing-tools docs, Forge codebase + `SUPERCHART-PARITY.md`  
**Purpose:** Fresh backlog after the DI/V + remaining-chrome passes. Focus on what still needs work for a daily trader.

### How to read this

| Tag | Meaning |
| --- | --- |
| **ADD** | Not in Forge, or only a label with no real behavior |
| **MODIFY** | Marked MATCH / present, but too shallow vs TradingView — change behavior or depth |
| **PARTIAL** | Already PARTIAL (or still incomplete) — finish to Supercharts accuracy |
| **OUT** | TradingView product/cloud/social/broker — keep listed, implement only if you ask |

**Priority:** P0 = daily trader blockers · P1 = high leverage · P2 = polish / niche · P3 = product/OUT

Current parity snapshot when this was written: ~244 MATCH · 45 PARTIAL · 2 MISSING · 11 OUT. That MATCH count overstates product depth — many MATCH rows are chrome-complete but trader-shallow. This list is the corrective backlog.

---

## 1. What TradingView Supercharts actually is (observation)

Four rails + canvas:

1. **Top toolbar** — symbol, compare, interval, chart type, Indicators/metrics/strategies (+ templates), Alert, Bar Replay, undo/redo, layouts/save, quick search, settings, fullscreen, snapshot, Trade, Publish  
2. **Left drawing toolbar** — cursors, trend, Fib/Gann, patterns, forecast/measure, shapes, annotations, icons, measure, zoom, magnet, keep-drawing, lock, hide, sync, remove, favorites  
3. **Right toolbar** — watchlist+details+news, alerts, object tree, data window, screeners/hotlists, Pine, calendars, news flow, portfolio, fundamental graphs, yield curves, options, macro maps, community, notifications, help  
4. **Bottom panel** — Screener / Pine Editor / Strategy Tester / Trading Panel / Pine Logs; range presets; Go to date; timezone; ADJ  
5. **Canvas chrome** — legend hover actions, event markers (E/D), price-scale A/L/%/+/gear, context menus on chart/axes, multi-layout sync (symbol / interval / drawings)

Forge already mirrors most **chrome**. Gaps are mostly **depth, data, and runtime**.

---

## 2. P0 — daily trader blockers

| ID | Tag | TradingView | Forge today (2026-09-05 P0 pass) | Action |
| --- | --- | --- | --- | --- |
| GAP-01 | PARTIAL | Full Pine Script® runtime (compile → plot → alerts) | Subset runtime maps common `ta.*` / `strategy.*` onto Forge studies + tester | Deeper interpreter / WASM still open |
| GAP-02 | PARTIAL | Strategy Tester with equity, trades, ratios, properties | Local backtester: MA/RSI/MACD/Donchian with net profit, DD, win rate, trade list | Equity curve chart + denser strategy catalog |
| GAP-03 | PARTIAL | Indicators dialog: hundreds of runnable studies | ~25 runnable (MA family, Ichimoku, Supertrend, PSAR, ADX, Stoch RSI, CCI, WillR, OBV, CMF, Donchian, Keltner, pivots, …) | Keep expanding toward TV breadth |
| GAP-04 | PARTIAL | Server / push alerts (email, app, webhook, SMS) | Optional webhook URL on create; JSON POST on fire (client-side) | Persistent server-side eval still open |
| GAP-05 | PARTIAL | Alert on price, indicator, strategy, drawing | Drawing-level + indicator-value cross eval wired; webhook optional | Strategy alerts + richer drawing geometry |
| GAP-06 | PARTIAL | Volume footprint / cluster | Synthetic volume-at-price buy/sell splits in candle range | True tick/L2 clusters still open |
| GAP-07 | PARTIAL | TPO / Market Profile | Letter matrix + POC + value-area estimate | IB / session templates still open |
| GAP-08 | PARTIAL | Session volume profile chart | Session VP with POC + ~70% VA from volume-at-price | Fixed-range VP drawing parity still open |
| GAP-09 | PARTIAL | Multi-layout drawing sync (live) | Fingerprint sync (points/style/visibility/fib), not id-list only | Cross-layout remote sync still open |
| GAP-10 | PARTIAL | Object tree + Data window | Data window shows indicator values at hover; visibility buckets on indicators | Folders / multi-select / bulk ops still open |

---

## 3. Studies & Pine platform

| ID | Tag | Item | Action |
| --- | --- | --- | --- |
| GAP-11 | PARTIAL | IND tabs: Technicals / Financials / Community / Invite-only / Patterns | Financials + Patterns runnable; Community as importable scripts later |
| GAP-12 | PARTIAL | Indicator Inputs tab | Per-study typed inputs matching TV (source, length, smoothing, …) |
| GAP-13 | PARTIAL | Indicator Style tab | Every plot: color, width, style, precision, price line, track price |
| GAP-14 | PARTIAL | Indicator Visibility tab | Enforce per-timeframe visibility (not a hint) |
| GAP-15 | PARTIAL | Indicator source OHLC/HL2/HLC3/OHLC4 | Wire through all studies, not a subset |
| GAP-16 | PARTIAL | Pine Editor add-to-chart | Beyond 4-keyword mapping; show compile errors |
| GAP-17 | PARTIAL | Pine logs / profiler | Tie logs to real runtime; drop static stub lines |
| GAP-18 | ADD | Invite-only / Paid scripts store UX | Optional OUT-adjacent; at least “not available” honesty in UI |
| GAP-19 | ADD | On-chart indicator status line menu (⋯) full TV set | Settings / hide / visual order / move pane / pin scale / clone / copy / apply default — verify each |

---

## 4. Chart types (PARTIAL → accurate)

| ID | Tag | Type | Action |
| --- | --- | --- | --- |
| GAP-20 | PARTIAL | Volume candles | True volume→body mapping + style |
| GAP-21 | PARTIAL | Line with markers | Marker size/shape/color settings |
| GAP-22 | PARTIAL | HLC area | Proper H/L/C bands + fills |
| GAP-23 | PARTIAL | Columns | Baseline, up/down colors |
| GAP-24 | PARTIAL | High-low | Exact TV geometry |
| GAP-25 | PARTIAL | Renko | Brick size (ATR/traditional), wicks, assignments |
| GAP-26 | PARTIAL | Line Break | N-line setting |
| GAP-27 | PARTIAL | Kagi | Reversal amount |
| GAP-28 | PARTIAL | Point & Figure | Box size, reversal, ATR method, X/O style |
| GAP-29 | PARTIAL | Range bars | Range size + style |
| GAP-30 | PARTIAL | Per-type style dialog (CT-22) | Body/wick/border/source per type like TV Symbol tab |

---

## 5. Canvas, scales, settings

| ID | Tag | Item | Action |
| --- | --- | --- | --- |
| GAP-31 | ADD | Scale text size / colors (was S-11 MISSING) | Typography + axis colors in settings |
| GAP-32 | ADD | Alerts appearance (was S-16 MISSING) | Marker shape/color/label on chart |
| GAP-33 | PARTIAL | Data modification (session, dividends, futures back-adjust, precision) | Session filter, dividend adjust, continuous futures |
| GAP-34 | PARTIAL | Scales labels: bid/ask, pre/post | Add when feed supports; else hide cleanly |
| GAP-35 | PARTIAL | Settings templates gallery | Save/load named chart-settings templates |
| GAP-36 | MODIFY | Events on time scale | Replace seeded fake E/D/news with real calendar/corporate events |
| GAP-37 | MODIFY | ADJ toggle (TV bottom bar) | Explicit adjusted/unadjusted series switch |
| GAP-38 | MODIFY | Price-scale gear menu parity | Match TV scale context: auto, invert, lock, percentage, index, regular, move L/R, merge/no-overlap |
| GAP-39 | MODIFY | Legend hover actions | Always expose hide / settings / ⋯ / remove with TV order |
| GAP-40 | ADD | Soft magnet vs strong magnet UI copy + snap-to-indicators default clarity | Match TV magnet menu wording/behavior |

---

## 6. Drawings — depth (geometry mostly MATCH)

| ID | Tag | Item | Action |
| --- | --- | --- | --- |
| GAP-41 | MODIFY | Generic Style tab | Ends, extend, midpoints, stats, fills for trend/ray/channel — not only Fib/pattern |
| GAP-42 | MODIFY | Alert on drawing | True “price crosses line / channel break” semantics |
| GAP-43 | MODIFY | Image tool | Upload/URL image, not placeholder frame |
| GAP-44 | PARTIAL | Left toolbar IA | Favorites bar, last-used, flyout labels exact TV grouping |
| GAP-45 | MODIFY | Sync drawings across layouts | Full live sync + sync-symbol / sync-interval options (TV layout menu) |
| GAP-46 | ADD | Draw on indicator panes | Trend/horiz on RSI/MACD panes (TV supports this) |
| GAP-47 | ADD | Templates as defaults for each tool | “Template” apply as default for next drawings (TV) |

---

## 7. Right toolbar products

| ID | Tag | Panel | Action |
| --- | --- | --- | --- |
| GAP-48 | PARTIAL | Watchlist + details + news | Live quotes OK; deepen details + symbol news |
| GAP-49 | PARTIAL | Alerts manager | Edit/pause/log/history like TV; not only list+delete |
| GAP-50 | PARTIAL | Screeners | Real criteria + results (stocks/crypto/forex) |
| GAP-51 | PARTIAL | Calendars | Date-linked economic calendar |
| GAP-52 | PARTIAL | News Flow | Live feed, not 3 hard-coded lines |
| GAP-53 | PARTIAL | Fundamental Graphs | Real series, not sample Revenue/EPS |
| GAP-54 | PARTIAL | Yield Curves | Live curve points + country select |
| GAP-55 | PARTIAL | Options | Real chain (or clear “no OPRA” empty state + demo toggle) |
| GAP-56 | PARTIAL | Macro Maps | Heatmap with real macro series |
| GAP-57 | PARTIAL | Help Center | Link real docs; remove fake tips-only shell |
| GAP-58 | ADD | Hotlists / trending | TV right-rail flame list |
| GAP-59 | ADD | DOM / Order book panel | OUT-adjacent unless feed exists; else mark OUT |
| GAP-60 | OUT | Portfolio, Community feed, Notifications, Chats, Streams | Keep OUT unless product scope expands |

---

## 8. Bottom panel & replay

| ID | Tag | Item | Action |
| --- | --- | --- | --- |
| GAP-61 | PARTIAL | Pine Editor | Versioned tabs, save scripts, add-to-chart real |
| GAP-62 | PARTIAL | Strategy Tester tabs | Overview / Performance / Trades / Ratios / Properties with numbers |
| GAP-63 | PARTIAL | Replay Trading dock | Paper fills / trade list during replay (TV Replay Trading) |
| GAP-64 | MODIFY | Bar Replay chrome | Match TV Select bar / Random bar / Jump to realtime UX density |
| GAP-65 | ADD | Bottom Stock Screener tab | TV has Screener as bottom tab too |
| GAP-66 | OUT | Broker Trading Panel | Keep OUT unless broker API |

---

## 9. Layouts, chrome, social (MODIFY / OUT)

| ID | Tag | Item | Action |
| --- | --- | --- | --- |
| GAP-67 | MODIFY | Header Products/Community/Brokers menus | Today many “Coming soon” — either wire local tools or hide |
| GAP-68 | MODIFY | Layout save | Cloud sync optional OUT; improve local share/export (JSON) |
| GAP-69 | MODIFY | Snapshot → Tweet | Attach chart image, not text-only intent |
| GAP-70 | PARTIAL | Multi-chart grid | Sync symbol / interval / crosshair / time (TV layout sync matrix) |
| GAP-71 | OUT | Publish idea, Trade/Paper Trading, social drawings | Stay OUT |
| GAP-72 | OUT | Bid/ask trading lines, hide positions/orders | Stay OUT without broker |

---

## 10. Suggested execution waves

### Wave A — make studies trustworthy (P0)
GAP-03, GAP-11…15, GAP-19, GAP-12…14  

### Wave B — Pine + tester spine (P0)
GAP-01, GAP-02, GAP-16, GAP-17, GAP-61, GAP-62  

### Wave C — alerts that matter (P0)
GAP-04, GAP-05, GAP-32, GAP-42, GAP-49  

### Wave D — advanced chart types (P1)
GAP-06…08, GAP-20…30  

### Wave E — widgets with real data (P1)
GAP-48, GAP-50…57, GAP-36, GAP-65  

### Wave F — multi-layout + drawing depth (P1)
GAP-09, GAP-10, GAP-41, GAP-45, GAP-46, GAP-47, GAP-70  

### Wave G — settings polish (P2)
GAP-31…35, GAP-37…40, GAP-67…69  

---

## 11. Honest summary

| Area | TV | Forge | Verdict |
| --- | --- | --- | --- |
| Drawing geometry & interaction | Very deep | Strong | Mostly MATCH; Style/alert/sync depth left |
| Canvas chrome / scales / nav | Deep | Strong after last pass | Mostly MATCH; events/ADJ/settings polish left |
| Indicators library | Huge + Pine | ~10 engines + shells | Largest product gap |
| Strategy / replay trading | Real | Shells / local replay | Large gap |
| Right-rail products | Live data products | Mostly shells | Large gap |
| Alerts | Cloud multi-channel | Local toast | Large gap |
| Social / broker | Core TV business | OUT | Stay OUT unless requested |

**Bottom line:** Forge is already a credible **Supercharts-shaped drawing terminal**. The next checklist is not “more buttons” — it is **runnable studies, real Pine/tester, real alerts, real widget data, and accurate advanced chart types**.

---

## 12. Tracking

- Old detailed matrix: `SUPERCHART-PARITY.md` (keep as encyclopedia)  
- This file: actionable **ADD / MODIFY / PARTIAL** backlog from the 2026-09-05 observation  
- Work items as `GAP-xx` in PRs; when done, flip tag → DONE and note PR  
