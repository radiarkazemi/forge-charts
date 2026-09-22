# Forge Charts ↔ TradingView — Full & Complete Parity Checklist

**Date:** 2026-09-22  
**Live product audited:** https://forgechart.ir/charts/  
**Stack on live:** TradingView **Advanced Charts / Charting Library (CL) v29.3.0** (internal build `600f67b8…`, dated **2025-05-08**) + Forge React/MUI shell + Germany Market Price API datafeed  
**Latest CL (TradingView docs):** **v32.1.0** (2026-08-17)  
**Reference products:** TradingView.com Supercharts · Advanced Charts (free embed) · Trading Platform (broker embed)

---

## How to read this document

| Status | Meaning |
| --- | --- |
| **HAVE** | Present on live Forge (library UI and/or Forge shell) at usable depth |
| **PARTIAL** | Present but thinner than TradingView.com / latest CL |
| **MISSING** | Not available on live Forge |
| **LIB-GAP** | Available in newer Charting Library / Trading Platform, but not in our **v29.3.0** binary (or not wired) |
| **OUT** | TradingView SaaS / social / broker-network product — cannot be “copied” without their backends or a Trading Platform + broker integration. Listed so the inventory is complete |

**Priority**

| P | Meaning |
| --- | --- |
| **P0** | Blocks “feels like TradingView” for daily traders on our site |
| **P1** | High leverage for parity / conversion |
| **P2** | Polish, power-user, niche |
| **P3** | Product / OUT / license-tier decisions |

### Honest ceiling (read this first)

“Exactly like TradingView, not 1% behind” has **three different ceilings**:

1. **Advanced Charts parity (embed library)** — reachable by upgrading CL **29.3 → 32.1**, enabling featuresets, completing datafeed, and wrapping chrome. This is the correct target for Forge Charts as shipped today.
2. **Trading Platform parity** — requires TradingView **Trading Platform** license (not only Advanced Charts), Broker API, Order Ticket, DOM, Account Manager, multi-watchlist widget, up to 8 synced layouts, etc.
3. **tradingview.com Supercharts parity** — also needs TradingView’s **cloud account, Ideas/social, Screeners, calendars, fundamentals, yield curves, options chain, Heatmaps, community scripts store, mobile apps, push infra**. Those are **OUT** unless we rebuild equivalent backends.

This checklist lists **everything**. Items marked **OUT** stay on the list so nothing is forgotten; they are not implementable by UI alone.

---

## 0. Executive scorecard (live vs TradingView)

| Layer | Live Forge | Gap vs latest TV |
| --- | --- | --- |
| Chart engine | CL **v29.3.0** (May 2025) | **~15 months / 3 majors behind** latest **v32.1.0** (Aug 2026) |
| Drawing tools | Library built-in (~100+) | Mostly **HAVE** via library; names/tools evolve in newer CL |
| Chart types | Library built-in (HLC bars added in 29.3) | **PARTIAL** vs TradingView.com “20+” / Trading Platform “17” marketing; Japanese styles need datafeed support |
| Indicators | Library built-in (100+) | **HAVE** built-ins; **MISSING** community/invite-only Pine store |
| Pine Script | Not hosted / no Pine Editor in Forge shell | **MISSING** vs Supercharts (Pine Editor, Strategies, community scripts) |
| Market data | Germany API: **BINANCE** crypto + **FOREXCOM** XAU; Yahoo fallback; FX pairs thin | **PARTIAL** — not TV’s full universe; **FXPRO** tag wired but same gold feed; many FX/indices offline |
| Alerts | Local price alerts + browser toast | **PARTIAL** — no server push / email / SMS / webhook farm / drawing&indicator alerts at TV depth |
| Watchlist / right rail | Custom MUI: Watchlist, Alerts, Data Window only | **PARTIAL** vs TV right toolbar (object tree, screener, calendar, news, …) |
| Multi-layout | Not exposed in Forge shell | **MISSING** in shell (library can do multi-chart; Trading Platform markets up to 8) |
| Trading / brokerage | None | **MISSING** / **OUT** without Trading Platform + Broker API |
| Social / Ideas / Publish | None | **OUT** |
| Cloud sync / account | `localStorage` save/load adapter only | **PARTIAL** vs TV cloud layouts |
| Mobile | Library touch + thin shell | **PARTIAL** |
| Brand / chrome | Forge header + TV widget chrome | **PARTIAL** vs full Supercharts product header |

**Estimated “feel like TV chart” if we finish all P0+P1 Advanced Charts items + upgrade to CL 32.1:** high (core charting).  
**Estimated “identical to tradingview.com”:** impossible without OUT backends — treat those as product decisions, not coding omissions.

---

## 1. Library version gap (CL 29.3.0 → 32.1.0) — must upgrade

Current binary: `public/charting_library/package.json` → **CL v29.3.0 @ 2025-05-08**.  
Latest documented: **v32.1.0 @ 2026-08-17**.

| ID | P | Status | What TradingView shipped after our build | What we must do |
| --- | --- | --- | --- | --- |
| CL-UP-01 | P0 | LIB-GAP | **Upgrade path 29.4 → 32.1** (all releases below) | Obtain latest licensed Advanced Charts / Trading Platform package; drop into `public/charting_library/` (gitignored); rebuild; regression-test widget API |
| CL-UP-02 | P0 | LIB-GAP | **29.4** — snapshot_url-only snapshots; `use_symbol_name_for_header_toolbar`; `searchSource` on search; inactivity gaps featureset; VWAP warnings; scroll request throttling | Upgrade + re-implement snapshot server; enable gaps featureset |
| CL-UP-03 | P1 | LIB-GAP | **29.5–29.6** — mobile crosshair tracking; study label on add events | Upgrade |
| CL-UP-04 | P0 | LIB-GAP | **30.0** — day-of-week scale labels; **long-press floating OHLCV tooltip**; inactivity_gaps replaces intraday-only; remove locked drawings option; watermark API split; legend in-place edit featuresets; breaking: scroll undo, showLabel on lines, iOS 16+ only | Upgrade + migrate overrides / featuresets |
| CL-UP-05 | P1 | LIB-GAP | **30.1** — always-show study symbol inputs in legend; improved drag-to-export; `getVisibleBarsRange`; Bollinger MA method dropdown | Upgrade + optional drag-export wiring |
| CL-UP-06 | P1 | LIB-GAP | **30.2** — **paginated Symbol Search** (`searchSymbolsPaginated`); Overlay realtime improvements; VWAP smart history load | Implement paginated search in datafeed |
| CL-UP-07 | P1 | LIB-GAP | **30.3** — legend bar-change colors featureset; per-chart `applyOverrides` | Enable featureset |
| CL-UP-08 | P0 | LIB-GAP | **31.0** — **Table view** (chart/indicator data as table); empty-state redesign | Upgrade (UI appears after version bump) |
| CL-UP-09 | P1 | LIB-GAP | **31.1** — CSP `nonce`; **global drawing sync** (“New drawings sync globally”) + save/load context | Upgrade + extend save/load adapter context |
| CL-UP-10 | P1 | LIB-GAP | **31.2** — custom indicator input `group` headers | Upgrade (for custom studies) |
| CL-UP-11 | P0 | LIB-GAP | **32.0** — **worker-based chart processing**; Promise widget APIs; DWM countdown; drawing rename / Anchored Text removal; breaking Promise migrations | Upgrade + migrate `onChartReady` / `dataReady` / save APIs to Promises |
| CL-UP-12 | P1 | LIB-GAP | **32.1** — pin bar-mark tooltips; custom mark tooltips (TP); watchlist sections (TP); buy/sell on unsupported resolution (TP) | Upgrade; TP items need Trading Platform |

---

## 2. Product tier — Advanced Charts vs Trading Platform vs tradingview.com

| ID | P | Status | Capability | Live Forge | To reach parity |
| --- | --- | --- | --- | --- | --- |
| TIER-01 | P0 | PARTIAL | Advanced Charts (drawings, types, indicators, replay in-library) | HAVE via CL 29.3 | Upgrade CL + datafeed depth |
| TIER-02 | P0 | MISSING | **Trading Platform** license package | Advanced Charts only | Purchase/install Trading Platform build |
| TIER-03 | P0 | MISSING | Broker API / Order Ticket / chart trading | None | Implement Broker API + broker backend |
| TIER-04 | P1 | MISSING | Depth of Market (DOM) widget | None | Trading Platform + DOM data |
| TIER-05 | P1 | MISSING | Account Manager (balances, orders, history) | None | Trading Platform + broker |
| TIER-06 | P1 | MISSING | Built-in Trading Platform Watchlist widget (sections, sync) | Custom MUI list only | Trading Platform watchlist API |
| TIER-07 | P1 | MISSING | Up to **8 charts / layout** sync (symbol/interval/crosshair/drawings) | Single chart widget | Enable multi-chart layout in widget + UI |
| TIER-08 | P3 | OUT | tradingview.com account, cloud sync, Ideas, social feed | None | Do not clone; optional own backend |
| TIER-09 | P3 | OUT | TradingView Screener / Heatmap / Yield Curve / Options / Calendar products | None | Own data products or partner APIs |
| TIER-10 | P3 | OUT | TradingView mobile apps / push notification network | Web only | Own PWA + push |

---

## 3. Chart canvas & types

| ID | P | Status | TradingView item | Live Forge | Implement |
| --- | --- | --- | --- | --- | --- |
| CT-01 | P0 | HAVE | Candles | Library | Keep |
| CT-02 | P0 | HAVE | Hollow candles | Library | Keep |
| CT-03 | P0 | HAVE | Bars | Library | Keep |
| CT-04 | P0 | HAVE | HLC bars (added CL 29.3) | Library | Keep; verify after upgrade |
| CT-05 | P0 | HAVE | Line / Line with markers | Library | Keep |
| CT-06 | P0 | HAVE | Area / HLC area | Library | Keep |
| CT-07 | P0 | HAVE | Baseline | Library | Keep |
| CT-08 | P0 | HAVE | Columns | Library | Keep |
| CT-09 | P0 | HAVE | High-low | Library | Keep |
| CT-10 | P0 | HAVE | Heikin Ashi | Library | Keep |
| CT-11 | P1 | PARTIAL | Renko | Library UI; needs consistent history + session rules | Ensure datafeed `has_intraday` + enough history; test ATR/traditional |
| CT-12 | P1 | PARTIAL | Line Break | Library | Same as Renko — validate with Germany OHLC |
| CT-13 | P1 | PARTIAL | Kagi | Library | Validate |
| CT-14 | P1 | PARTIAL | Point & Figure | Library | Validate box/reversal; may need tick/ denser data |
| CT-15 | P1 | PARTIAL | Range bars | Library | Validate |
| CT-16 | P1 | PARTIAL | Time Price Opportunity / Volume candles / Volume footprint style products on TV.com | Not as TV.com product modules | Custom studies or accept library subset |
| CT-17 | P0 | PARTIAL | Per-type style (body/wick/border) in Symbol settings | Library settings | Enable full property pages; theme overrides already partial |
| CT-18 | P1 | LIB-GAP | Table view of series/indicators (CL 31+) | Missing on 29.3 | Upgrade to ≥31.0 |

---

## 4. Intervals, sessions, timescale

| ID | P | Status | Item | Live | Implement |
| --- | --- | --- | --- | --- | --- |
| IV-01 | P0 | PARTIAL | Resolutions 1m…1M | Datafeed: `1,5,15,30,60,240,1D,1W,1M` | Add **seconds** (`1S`…) if feed supports; map Germany OHLC for 30/240 properly |
| IV-02 | P0 | PARTIAL | Favorite intervals on toolbar | Library favorites configured | Align favorites with real feed support |
| IV-03 | P1 | MISSING | Tick charts (`1T`) | Not supported in datafeed | Tick stream from Germany/broker or leave OUT |
| IV-04 | P1 | MISSING | Range / custom interval builder UX at TV depth | Library partial | Enable custom_resolutions + UI |
| IV-05 | P0 | PARTIAL | Trading sessions / holidays | Static `session` on symbols | Real exchange calendars + `session_holidays` / `corrections` in symbol info |
| IV-06 | P1 | PARTIAL | Pre/post market | Featureset enabled; feed mostly 24x7 crypto/FX | Equity session + extended hours when stocks added |
| IV-07 | P1 | LIB-GAP | Inactivity gaps (intra + DWM) | Old featureset naming on 29.3 | Upgrade; enable `inactivity_gaps` |
| IV-08 | P0 | PARTIAL | Timezone / exchange clock | Library timezone menu; Forge forces `Etc/UTC` default | Default to exchange TZ; show live clock |
| IV-09 | P1 | PARTIAL | Go to date / range presets | Library timeframes toolbar configured | Verify all presets; add custom range |
| IV-10 | P1 | LIB-GAP | Countdown on DWM bars (CL 32) | Missing | Upgrade |
| IV-11 | P1 | LIB-GAP | Long-press floating OHLCV tooltip (CL 30) | Missing | Upgrade |
| IV-12 | P2 | LIB-GAP | Day-of-week scale labels (CL 30) | Missing | Upgrade |

---

## 5. Drawings & left toolbar

| ID | P | Status | Item | Live | Implement |
| --- | --- | --- | --- | --- | --- |
| DR-01 | P0 | HAVE | Trend / ray / info line / extended family | Library | Keep; re-test after 32.0 rename |
| DR-02 | P0 | HAVE | Fib retracement / extension / channel / speed fan / arcs / circles / wedge / spiral / timezone | Library | Keep |
| DR-03 | P0 | HAVE | Gann box / fan / square / fix | Library | Keep |
| DR-04 | P0 | HAVE | Patterns (XABCD, Head & Shoulders, Elliott, Triangle, …) | Library | Keep |
| DR-05 | P0 | HAVE | Forecast / projection / long-short position / risk-reward | Library | Keep |
| DR-06 | P0 | HAVE | Shapes, brushes, highlighter, arrows, text, notes, callouts, price labels | Library | Keep |
| DR-07 | P0 | HAVE | Measure, zoom, magnet, lock, hide, remove, stay in drawing mode | Library | Keep |
| DR-08 | P0 | HAVE | Favorites / recent drawings | `items_favoriting` enabled | Keep |
| DR-09 | P1 | PARTIAL | Icons / emojis stickers | Library; emoji option bugs fixed in 32.1 | Upgrade |
| DR-10 | P1 | PARTIAL | Anchored VWAP drawing accuracy | Older CL had off-by-one bar bug | Upgrade to ≥32.1 |
| DR-11 | P1 | LIB-GAP | Global drawings sync across layouts (CL 31.1) | Missing | Upgrade + save adapter context |
| DR-12 | P1 | LIB-GAP | Anchored Text replaces removed tool (CL 32) | N/A until upgrade | Upgrade; migrate saved drawings |
| DR-13 | P1 | PARTIAL | Drawing templates save/load | Local adapter present | Cloud sync optional; verify all template APIs |
| DR-14 | P2 | PARTIAL | Object tree | Library feature; Forge right rail does not surface dedicated Object Tree panel | Enable `show_object_tree` UX / side panel link |
| DR-15 | P1 | PARTIAL | Separate drawings storage | Adapter stubs line tools | Complete `saveLineToolsAndGroups` / load with sharing modes |

---

## 6. Indicators, studies, Pine, strategies

| ID | P | Status | Item | Live | Implement |
| --- | --- | --- | --- | --- | --- |
| IND-01 | P0 | HAVE | 100+ built-in indicators (MA, MACD, RSI, Ichimoku, VWAP, …) | Library | Keep; upgrade for BB method / Hull / TSI fixes |
| IND-02 | P0 | HAVE | Indicator templates | `study_templates` + `chart_template_storage` enabled | Keep |
| IND-03 | P0 | HAVE | Volume study by default options | Available via featuresets | Tune `create_volume_indicator_by_default` |
| IND-04 | P1 | PARTIAL | Custom indicators (JS metainfo) | Not shipped in Forge | Add custom studies package for Forge exclusives |
| IND-05 | P0 | MISSING | **Pine Editor** (write/compile/add to chart) | None in shell | Trading Platform + Pine runtime **or** embed custom Pine subset (hard) |
| IND-06 | P0 | MISSING | Community / invite-only / paid scripts | None | OUT store **or** host own script catalog |
| IND-07 | P0 | MISSING | Strategy Tester (equity, trades, metrics) | None | Backtest engine + UI (or TP) |
| IND-08 | P1 | MISSING | Pine Logs / profiler | None | With Pine |
| IND-09 | P1 | PARTIAL | Financials indicators | Library limited without fundamental datafeed | Fundamentals API |
| IND-10 | P1 | PARTIAL | Spread / ratio compare studies | Library; needs multi-symbol history | Ensure compare series from Germany/Yahoo |
| IND-11 | P1 | LIB-GAP | Legend always show study symbol inputs (CL 30.1) | Missing | Upgrade + featureset |
| IND-12 | P2 | LIB-GAP | Custom indicator input groups (CL 31.2) | Missing | Upgrade |
| IND-13 | P1 | PARTIAL | Volume Profile / Fixed Range / Session VP / Footprint depth | Library studies where licensed; not TV.com footprint product | Confirm license includes VP; wire session rules |

---

## 7. Symbol search, compare, legend, scales

| ID | P | Status | Item | Live | Implement |
| --- | --- | --- | --- | --- | --- |
| SY-01 | P0 | PARTIAL | Symbol search (types, exchanges) | Library search + static ~40 symbols | **Dynamic catalog** from Germany `/crypto/prices` + forex list; logos |
| SY-02 | P0 | PARTIAL | Exchange filters BINANCE / FOREXCOM / FXPRO | Partial seeds | Full universe per exchange from API |
| SY-03 | P1 | LIB-GAP | Paginated symbol search (CL 30.2) | Missing | Implement `searchSymbolsPaginated` |
| SY-04 | P0 | HAVE | Compare / overlay | Library header_compare | Keep; feed overlay bars |
| SY-05 | P1 | PARTIAL | Spread operators in search/compare | Featuresets exist; not tuned | Enable spread featuresets + data |
| SY-06 | P0 | PARTIAL | Legend (OHLC, study values, inline edit) | Library | Enable logos; upgrade for mobile close legend prop |
| SY-07 | P1 | PARTIAL | Symbol info dialog | Partially disabled (`symbol_info_price_source` off) | Rich description, sector, leverage, logo URLs in resolveSymbol |
| SY-08 | P0 | PARTIAL | Price scale: auto/log/%/indexed/invert | Library | Verify; bid/ask labels when quote feed exists |
| SY-09 | P1 | PARTIAL | Currency / unit on scale | Featuresets available | Set `currency_code` / unit in symbol info |
| SY-10 | P1 | MISSING | Symbol logos (exchange + instrument) | Not provided | `logo_urls` / `exchange_logo` in symbol info + featuresets |
| SY-11 | P2 | PARTIAL | Market status open/closed | Relies on sessions + server time | Accurate sessions + `getServerTime` (already stubbed) |

---

## 8. Market data & datafeed (Forge-owned — critical)

| ID | P | Status | Item | Live | Implement |
| --- | --- | --- | --- | --- | --- |
| MD-01 | P0 | PARTIAL | BINANCE OHLCV via Germany `/market-api/ohlc` | HAVE for major USDT pairs | Expand to full Binance catalog; history depth; 1s if needed |
| MD-02 | P0 | PARTIAL | FOREXCOM gold (XAUUSD) via iran-forexcom | HAVE | Stable history length; more metals (XAG, etc.) when API ready |
| MD-03 | P0 | PARTIAL | FXPRO | Tag accepted; **same gold series**, not distinct book | Germany API must expose FXPRO series **or** document as alias |
| MD-04 | P0 | MISSING | FOREXCOM / FXPRO **FX majors** (EURUSD, GBPUSD, …) | Germany OHLC returns offline → Binance fail | Add FX OHLC endpoints on Germany; wire provider |
| MD-05 | P0 | PARTIAL | Live streaming | Polling ~3s OHLC | WebSocket ticks from Germany for true realtime |
| MD-06 | P1 | PARTIAL | Quotes for watchlist | Crypto list + forex/xauusd | Batch quotes all exchanges; bid/ask |
| MD-07 | P1 | MISSING | Marks / timescale marks (earnings, dividends, news) | `supports_marks: false` | Implement getMarks / getTimescaleMarks |
| MD-08 | P1 | MISSING | News API integration | None | Own news feed or partner |
| MD-09 | P0 | PARTIAL | History pagination / `noData` correctness | Basic getBars | Full UDF semantics; monthly edge cases (fixed in newer CL) |
| MD-10 | P1 | PARTIAL | Yahoo / synthetic fallback | Still in chain | Keep as last resort; never show as “live TV quality” |
| MD-11 | P0 | PARTIAL | Direct Binance from VPS | Geo-blocked (502) | Rely on Germany; remove broken proxy or tunnel |
| MD-12 | P1 | MISSING | Level 2 / DOM book | None | Broker or market-data L2 |
| MD-13 | P1 | MISSING | Tick / trade tape | None | Trade stream API |
| MD-14 | P2 | PARTIAL | Corporate actions / back-adjust | Not in feed | Adjust flags in symbol info + backend |
| MD-15 | P0 | PARTIAL | Symbol resolve metadata | Minimal | Full LibrarySymbolInfo (session, timezone, pricescale, minmov, volume_precision, data_status) |
| MD-16 | P1 | MISSING | Multiplexing compare symbols efficiently | One-by-one | Cache + parallel history |

---

## 9. Alerts & notifications

| ID | P | Status | Item | Live | Implement |
| --- | --- | --- | --- | --- | --- |
| AL-01 | P0 | PARTIAL | Price crossing / up / down alerts | Local AlertService | Keep; harden |
| AL-02 | P0 | PARTIAL | Alert lines on chart | Hook present | Ensure visible + editable on canvas |
| AL-03 | P0 | MISSING | Indicator / strategy / drawing alerts | None | Library alert API + server evaluator |
| AL-04 | P0 | MISSING | Server-side alert persistence & multi-device | `localStorage` only | Alert service backend |
| AL-05 | P0 | MISSING | Email / push / SMS / webhook delivery | Browser Notification only | Notification gateway |
| AL-06 | P1 | PARTIAL | Alerts manager panel | Basic list | Edit, pause, log, filters like TV |
| AL-07 | P1 | MISSING | Alert message templates / webhooks payload designer | None | UI + docs |
| AL-08 | P2 | MISSING | Autorestart / expiration / economy plans UX | None | Product rules |

---

## 10. Layouts, save/load, templates, snapshots

| ID | P | Status | Item | Live | Implement |
| --- | --- | --- | --- | --- | --- |
| LY-01 | P0 | PARTIAL | Save chart layout | LocalSaveLoadAdapter | Keep; add cloud user accounts |
| LY-02 | P0 | PARTIAL | Load / rename / delete layouts | Local | Layout manager UI matching TV |
| LY-03 | P0 | MISSING | Multi-chart layouts (2–8) + sync | Single chart | `widget` load multiple charts / Trading Platform |
| LY-04 | P1 | PARTIAL | Chart templates / themes | Featuresets on; limited UX | Template gallery UI |
| LY-05 | P1 | PARTIAL | Study templates | Enabled | Verify save/apply from header |
| LY-06 | P1 | PARTIAL | Auto-save | `auto_save_delay: 5` | Confirm reliability; conflict UX |
| LY-07 | P1 | PARTIAL | Snapshots (download/copy/tweet) | Library; TV server snapshots deprecated for custom `snapshot_url` since 29.4 | **Own snapshot server** (mandatory after upgrade) |
| LY-08 | P2 | LIB-GAP | Drag-to-export chart data | Missing on 29.3 / not wired | Upgrade + `chart_drag_export` |
| LY-09 | P1 | MISSING | Share layout link | None | Backend share tokens |
| LY-10 | P2 | PARTIAL | Undo/redo | Library | Keep |

---

## 11. Replay, trading UI, paper trading

| ID | P | Status | Item | Live | Implement |
| --- | --- | --- | --- | --- | --- |
| RP-01 | P0 | PARTIAL | Bar Replay | Library feature (when enabled in build) | Verify in UI; wire enough history |
| RP-02 | P1 | PARTIAL | Replay speed / jump / select bar | Library | QA all controls |
| TR-01 | P0 | MISSING | Buy/Sell buttons on chart | None | Trading Platform + broker |
| TR-02 | P0 | MISSING | Order Ticket (market/limit/stop/brackets) | None | Broker API |
| TR-03 | P0 | MISSING | Positions / orders on chart | None | Broker streaming |
| TR-04 | P1 | MISSING | Paper trading | None | Simulated broker |
| TR-05 | P1 | MISSING | Bracket / multiple exit levels (CL 31+ TP) | None | Trading Platform |
| TR-06 | P2 | MISSING | Reverse position / close dialogs | None | Broker UI |
| TR-07 | P3 | OUT | Real broker network (TV partners) | None | Commercial integrations |

---

## 12. Right toolbar & “Products” (TradingView.com chrome)

| ID | P | Status | TradingView item | Live Forge | Implement |
| --- | --- | --- | --- | --- | --- |
| RT-01 | P0 | PARTIAL | Watchlist | Custom list | Sections, import/export, sorting, flags, sparkline, news/details tabs |
| RT-02 | P0 | PARTIAL | Alerts panel | Basic | See §9 |
| RT-03 | P0 | PARTIAL | Data Window | Basic panel | Full study field list at crosshair |
| RT-04 | P0 | MISSING | Object Tree panel (dedicated) | Not in SideRail | Add panel + library object tree |
| RT-05 | P1 | MISSING | Screener / Hotlists | None | Own screener API |
| RT-06 | P1 | MISSING | Calendar (econ / earnings) | None | Calendar data + marks |
| RT-07 | P1 | MISSING | News stream | None | News API |
| RT-08 | P1 | MISSING | Notifications center | None | Product |
| RT-09 | P2 | MISSING | Pine / Strategy / Trading panels in bottom dock | None | Bottom dock product |
| RT-10 | P2 | MISSING | Portfolio / Paper portfolio | None | Account product |
| RT-11 | P3 | OUT | Ideas / Community / Chat | None | OUT |
| RT-12 | P3 | OUT | Options chain / Yield curve / Heatmap / Macro maps | None | OUT or partners |
| RT-13 | P1 | PARTIAL | Help / shortcuts / what’s new | Minimal | Shortcuts modal; version badge |

---

## 13. Top chrome / app shell (Forge vs Supercharts header)

| ID | P | Status | Item | Live | Implement |
| --- | --- | --- | --- | --- | --- |
| UI-01 | P0 | PARTIAL | Product header | Forge title + symbol chip + quote + theme + alert | Full Supercharts-like header or lean into library header only |
| UI-02 | P1 | MISSING | Global quick search (⌘K) across products | None outside library | Command palette |
| UI-03 | P1 | MISSING | Products / Community / Markets / Brokers menus | None | IA decision |
| UI-04 | P1 | PARTIAL | Theme | Light/dark toggle | Chart+shell sync perfected; user CSS themes (CL featureset) |
| UI-05 | P1 | PARTIAL | Fullscreen | Library button | Shell immersion |
| UI-06 | P2 | PARTIAL | i18n (30+ locales in library) | `locale: "en"` fixed | Locale switcher + Farsi |
| UI-07 | P0 | PARTIAL | Remove “demo/synthetic” paths for production symbols | Germany first | Fail closed with error state, not fake candles |
| UI-08 | P2 | PARTIAL | Accessibility | Base library; ARIA featuresets not all enabled | Enable `accessible_keyboard_shortcuts`, aria descriptions (CL 30+ docs) |

---

## 14. Mobile & performance

| ID | P | Status | Item | Live | Implement |
| --- | --- | --- | --- | --- | --- |
| MO-01 | P0 | PARTIAL | Touch pan/zoom | Library | QA; enable touch button featuresets |
| MO-02 | P1 | PARTIAL | Mobile legend / toolbars | Adaptive header mode | Compact shell; bottom sheets |
| MO-03 | P1 | LIB-GAP | Workers for indicator calc (CL 32) | Missing | Upgrade + `workers.enabled` |
| MO-04 | P1 | PARTIAL | Bundle / load performance | OK | Code-split; cache charting_library aggressively |
| MO-05 | P2 | PARTIAL | PWA install | Manifest on older Supercharts deploy; TV master shell thin | Re-add icons/manifest for /charts |
| MO-06 | P1 | LIB-GAP | iOS 16+ only from CL 30 | Currently 29.3 | Communicate support matrix on upgrade |

---

## 15. Auth, cloud, collaboration

| ID | P | Status | Item | Live | Implement |
| --- | --- | --- | --- | --- | --- |
| AC-01 | P0 | MISSING | User accounts | None | Auth (email/OAuth) |
| AC-02 | P0 | MISSING | Cloud layout sync | localStorage | User layout API |
| AC-03 | P1 | MISSING | Devices sync / conflict resolution | None | Backend |
| AC-04 | P2 | MISSING | Shared drawings / multiplayer | None | Realtime collab (hard) |
| AC-05 | P3 | OUT | TradingView login / social graph | None | OUT |

---

## 16. Compliance, branding, licensing

| ID | P | Status | Item | Live | Implement |
| --- | --- | --- | --- | --- | --- |
| LC-01 | P0 | PARTIAL | Keep TV attribution / logo rules | Library logo on chart | Follow license; `adaptive_logo` / move_logo featuresets |
| LC-02 | P0 | HAVE | Do not commit `charting_library/` to git | gitignored | Keep; ship via VPS/dist only |
| LC-03 | P0 | PARTIAL | License tier (Advanced vs Platform) | Advanced Charts in use | Confirm commercial terms; upgrade package if Platform needed |
| LC-04 | P1 | PARTIAL | Market data redistribution rights | Germany API | Legal for BINANCE/FOREXCOM/FXPRO display |
| LC-05 | P2 | PARTIAL | CSP / security | Basic | `nonce` (CL 31.1) + strict CSP |

---

## 17. QA matrix (must pass for “not behind”)

| ID | P | Check |
| --- | --- | --- |
| QA-01 | P0 | XAUUSD FOREXCOM realtime ≈ Germany `/forex/xauusd` (no Demo badge) |
| QA-02 | P0 | BTCUSDT/ETHUSDT BINANCE history+live from `/market-api/ohlc` |
| QA-03 | P0 | Hard refresh loads `charting_library.standalone.js` 200 + widget |
| QA-04 | P0 | Indicators add/remove/template save survive reload |
| QA-05 | P0 | Drawings survive reload (save adapter) |
| QA-06 | P0 | Alerts fire on live quote cross |
| QA-07 | P1 | Compare symbol overlays update live |
| QA-08 | P1 | Japanese chart types render without console errors |
| QA-09 | P1 | Mobile: draw + scroll + crosshair usable |
| QA-10 | P1 | After CL upgrade: Promise APIs, table view, workers smoke tests |
| QA-11 | P0 | No synthetic provider for symbols Germany supports |
| QA-12 | P1 | Snapshot download works with own `snapshot_url` |

---

## 18. Recommended implementation order (to maximize TV sameness)

### Phase A — Stop the version bleed (P0)
1. **CL-UP-01…12** — Upgrade Charting Library **29.3.0 → 32.1.0** on VPS (never commit binaries).  
2. Migrate widget code to Promise APIs; fix snapshot via **own snapshot server**.  
3. Enable new featuresets (gaps, legend colors, table view, workers, global drawings sync).

### Phase B — Data = TradingView feel (P0)
1. **MD-01…05, MD-15** — Complete Germany coverage: all BINANCE pairs, FOREXCOM (+ real **FXPRO** books), FX majors, WebSocket ticks.  
2. Dynamic symbol catalog + logos (**SY-01, SY-02, SY-10**).  
3. Kill demo paths for covered symbols (**UI-07, QA-11**).

### Phase C — Shell parity (P0–P1)
1. Multi-layout + sync (**LY-03, TIER-07**).  
2. Right toolbar completeness (**RT-01…04, RT-13**).  
3. Alerts backend (**AL-03…05**).  
4. Object tree + richer Data Window.

### Phase D — Platform tier decision (P0 product)
1. If goal is Buy/Sell/DOM/Account: **buy Trading Platform** + Broker API (**TIER-02…06, TR-***).  
2. If chart-only analytics: stay on Advanced Charts; mark trading **OUT**.

### Phase E — Pine / community (P1–P3)
1. Pine Editor + tester **or** accept built-in indicators only.  
2. Screeners/news/calendar as **own** products (not TV clones).

### Phase F — OUT acceptance
Document permanently: Ideas, social, TV Screener network, TV broker network, TV mobile push — **will not be 1:1** without becoming TradingView.

---

## 19. Count summary (inventory size)

| Section | Items |
| --- | --- |
| 1 Library upgrade | 12 |
| 2 Product tier | 10 |
| 3 Chart types | 18 |
| 4 Intervals/sessions | 12 |
| 5 Drawings | 15 |
| 6 Indicators/Pine | 13 |
| 7 Symbol/legend/scales | 11 |
| 8 Market data | 16 |
| 9 Alerts | 8 |
| 10 Layouts/save | 10 |
| 11 Replay/trading | 9 |
| 12 Right toolbar | 13 |
| 13 App shell | 8 |
| 14 Mobile/perf | 6 |
| 15 Auth/cloud | 5 |
| 16 Licensing | 5 |
| 17 QA | 12 |
| **Total tracked line items** | **~183** |

Plus all built-in drawings/indicators already delivered by CL (not double-counted as MISSING).

---

## 20. Relation to older Forge docs

| Doc | Scope | Still useful? |
| --- | --- | --- |
| `SUPERCHART-PARITY.md` | Custom-canvas Supercharts clone (pre-CL master rewrite) | Historical for canvas engine; **not** the live CL app |
| `TV-GAP-CHECKLIST.md` | Gaps vs that canvas clone | Superseded for live site by **this** file |
| **`TV-FULL-PARITY-CHECKLIST.md` (this file)** | Live CL v29.3 Forge on forgechart.ir vs latest TV | **Source of truth going forward** |

---

## 21. Bottom line

- **Charting UI:** We are mostly on TradingView’s own engine, but **stuck on CL v29.3.0 while latest is v32.1.0** — that alone is a multi-release gap (table view, workers, global drawing sync, gaps, tooltips, Promise APIs, many fixes).  
- **Data:** Real **BINANCE + FOREXCOM gold** via Germany; **not** full FX/FXPRO depth; streaming is poll-based.  
- **Product chrome:** Thin Forge shell (watchlist/alerts/data) vs Supercharts’ full right/bottom product suite.  
- **Trading / Pine / social:** Largely **MISSING** or **OUT**.  

To be “not 1% behind” **as a charting product**: finish **Phase A–C**.  
To be “not 1% behind” **tradingview.com**: also **Phase D–E** and accept **Phase F** limits — or license Trading Platform and rebuild the SaaS surface.
)
