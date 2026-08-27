# Supercharts parity checklist

Source of truth for making Forge Charts match **TradingView Supercharts** structure and behavior.

Inventory taken from TradingView’s public Supercharts docs (Getting started, drawing tools, chart types, Supercharts settings, right toolbar, built-in indicators folder) plus the Charting Library **Drawings List**. A logged-in live Supercharts session is a JS app and cannot be fully pixel-scraped here; every named control below is from those official Supercharts surfaces, not from proprietary charting-library source.

Status:

- **MATCH** — present and close enough to Supercharts
- **PARTIAL** — present, not Supercharts-accurate
- **MISSING** — not in Forge
- **OUT** — Supercharts product (broker / social / cloud). Listed so nothing is omitted; implement only if you ask

Work **one ID at a time**, top to bottom. Do not skip PARTIAL items.

---

## 0. Chart chrome

| ID | Supercharts item | Forge | Notes |
| --- | --- | --- | --- |
| C-01 | App header (product, search, alerts, profile) | MATCH | Brand + Products/Community/Markets/Brokers/More menus, search (⌘K), alerts badge, local profile menu. Cloud account/sync remains OUT |
| C-02 | Top chart toolbar | PARTIAL | T-02/T-03/T-04 advanced; remaining T-* still open |
| C-03 | Left drawing toolbar | PARTIAL | See section 2 |
| C-04 | Chart canvas + legend + overlays | PARTIAL | See section 4 |
| C-05 | Right widget bar | PARTIAL | See section 8 |
| C-06 | Bottom panel (Pine / tester / replay / trade) | PARTIAL | See section 9 |
| C-07 | Time scale + range presets + timezone | PARTIAL | See section 6 |
| C-08 | Price scale + scale menu | PARTIAL | See section 4 |
| C-09 | Favorites drawing toolbar (floating) | MISSING | Star any tool → floating bar |
| C-10 | Multi-chart layout grid | MISSING | 1–8 charts, sync symbol/interval/crosshair/time |

---

## 1. Top toolbar (left → right)

| ID | Supercharts control | Forge |
| --- | --- | --- |
| T-01 | Symbol search (type-to-open, categories: Stocks / Funds / Futures / Forex / Crypto / Indices / Bonds / Economy / Options, exchange, description) | MATCH |
| T-02 | Symbol button shows ticker + live flag | MATCH | Ticker + exchange + LIVE/DELAYED pill with pulse |
| T-03 | Data switcher beside symbol: Technicals / Seasonals / News / Ideas | MATCH | Switches right-dock panels (data / calendar / news / ideas) |
| T-04 | Compare / overlay symbol | MATCH | Compare control + removable overlay chip |
| T-05 | Interval dropdown (seconds → months, Range, custom, favorites) | MATCH |
| T-06 | Quick interval favorites on the bar | MATCH |
| T-07 | Chart type menu (20+ types, favorites) | MATCH |
| T-08 | Indicators, metrics, strategies dialog (Technicals / Financials / Community / Invite-only / Patterns, search, favorites, recently used) | PARTIAL |
| T-09 | Indicator templates (save, remember symbol + interval) | MISSING |
| T-10 | Create Alert | PARTIAL |
| T-11 | Bar Replay | PARTIAL |
| T-12 | Undo | PARTIAL |
| T-13 | Redo | PARTIAL |
| T-14 | Layouts (count, arrangement, save, rename, copy, share, export, open) | MISSING |
| T-15 | Quick search (Ctrl/Cmd+K: tools, drawings, settings) | PARTIAL |
| T-16 | Chart settings (full dialog, section 10) | PARTIAL |
| T-17 | Fullscreen | PARTIAL |
| T-18 | Snapshot (download / copy / tweet) | PARTIAL |
| T-19 | Trade / Paper Trading | OUT |
| T-20 | Publish idea | OUT |

---

## 2. Left drawing toolbar — every tool

### 2.1 Cursors

| ID | Tool | Forge |
| --- | --- | --- |
| D-CUR-01 | Cross | MATCH |
| D-CUR-02 | Dot | MATCH |
| D-CUR-03 | Arrow | MATCH |
| D-CUR-04 | Demonstration | MISSING |
| D-CUR-05 | Magic | MISSING |
| D-CUR-06 | Eraser | MATCH |

### 2.2 Trend tools

| ID | Tool | Forge |
| --- | --- | --- |
| D-TR-01 | Trend Line | PARTIAL |
| D-TR-02 | Arrow | PARTIAL |
| D-TR-03 | Ray | PARTIAL |
| D-TR-04 | Info Line | PARTIAL |
| D-TR-05 | Extended Line | PARTIAL |
| D-TR-06 | Trend Angle | PARTIAL |
| D-TR-07 | Horizontal Line | PARTIAL |
| D-TR-08 | Horizontal Ray | PARTIAL |
| D-TR-09 | Vertical Line | PARTIAL |
| D-TR-10 | Cross Line | PARTIAL |
| D-TR-11 | Parallel Channel | PARTIAL |
| D-TR-12 | Regression Trend | PARTIAL |
| D-TR-13 | Flat Top/Bottom | PARTIAL |
| D-TR-14 | Disjoint Channel | PARTIAL |
| D-TR-15 | Anchored VWAP | PARTIAL |

### 2.3 Gann and Fibonacci

| ID | Tool | Forge |
| --- | --- | --- |
| D-FI-01 | Fib Retracement | PARTIAL |
| D-FI-02 | Trend-Based Fib Extension | PARTIAL |
| D-FI-03 | Fib Channel | PARTIAL |
| D-FI-04 | Fib Time Zone | PARTIAL |
| D-FI-05 | Fib Speed Resistance Fan | PARTIAL |
| D-FI-06 | Trend-Based Fib Time | PARTIAL |
| D-FI-07 | Fib Circles | PARTIAL |
| D-FI-08 | Fib Spiral | PARTIAL |
| D-FI-09 | Fib Speed Resistance Arcs | PARTIAL |
| D-FI-10 | Fib Wedge | PARTIAL |
| D-FI-11 | Pitchfan | PARTIAL |
| D-FI-12 | Pitchfork | PARTIAL |
| D-FI-13 | Schiff Pitchfork | PARTIAL |
| D-FI-14 | Modified Schiff Pitchfork | PARTIAL |
| D-FI-15 | Inside Pitchfork | PARTIAL |
| D-FI-16 | Gann Box | PARTIAL |
| D-FI-17 | Gann Square | PARTIAL |
| D-FI-18 | Gann Fan | PARTIAL |
| D-FI-19 | Gann Square Fixed | PARTIAL |

### 2.4 Patterns

| ID | Tool | Forge |
| --- | --- | --- |
| D-PA-01 | XABCD Pattern | PARTIAL |
| D-PA-02 | Cypher Pattern | PARTIAL |
| D-PA-03 | Head and Shoulders | PARTIAL |
| D-PA-04 | ABCD Pattern | PARTIAL |
| D-PA-05 | Triangle Pattern | PARTIAL |
| D-PA-06 | Three Drives Pattern | PARTIAL |
| D-PA-07 | Elliott Impulse Wave (12345) | PARTIAL |
| D-PA-08 | Elliott Correction Wave (ABC) | PARTIAL |
| D-PA-09 | Elliott Triangle Wave (ABCDE) | PARTIAL |
| D-PA-10 | Elliott Double Combo (WXY) | PARTIAL |
| D-PA-11 | Elliott Triple Combo (WXYXZ) | PARTIAL |
| D-PA-12 | Cyclic Lines | PARTIAL |
| D-PA-13 | Time Cycles | PARTIAL |
| D-PA-14 | Sine Line | PARTIAL |

### 2.5 Prediction and measurement

| ID | Tool | Forge |
| --- | --- | --- |
| D-PR-01 | Long Position | PARTIAL |
| D-PR-02 | Short Position | PARTIAL |
| D-PR-03 | Forecast | PARTIAL |
| D-PR-04 | Date Range | PARTIAL |
| D-PR-05 | Price Range | PARTIAL |
| D-PR-06 | Date and Price Range | PARTIAL |
| D-PR-07 | Bars Pattern | PARTIAL |
| D-PR-08 | Ghost Feed | PARTIAL |
| D-PR-09 | Projection | PARTIAL |
| D-PR-10 | Sector | MISSING |
| D-PR-11 | Fixed Range Volume Profile | PARTIAL |
| D-PR-12 | Anchored Volume Profile | PARTIAL |

### 2.6 Geometric shapes

| ID | Tool | Forge |
| --- | --- | --- |
| D-SH-01 | Brush | PARTIAL |
| D-SH-02 | Highlighter | PARTIAL |
| D-SH-03 | Rectangle | PARTIAL |
| D-SH-04 | Rotated Rectangle | PARTIAL |
| D-SH-05 | Path | PARTIAL |
| D-SH-06 | Circle | PARTIAL |
| D-SH-07 | Ellipse | PARTIAL |
| D-SH-08 | Polyline | PARTIAL |
| D-SH-09 | Triangle | PARTIAL |
| D-SH-10 | Arc | PARTIAL |
| D-SH-11 | Curve | PARTIAL |
| D-SH-12 | Double Curve | PARTIAL |

### 2.7 Annotation

| ID | Tool | Forge |
| --- | --- | --- |
| D-AN-01 | Text | PARTIAL |
| D-AN-02 | Anchored Text | PARTIAL |
| D-AN-03 | Note | PARTIAL |
| D-AN-04 | Anchored Note | MISSING |
| D-AN-05 | Signpost | PARTIAL |
| D-AN-06 | Callout | PARTIAL |
| D-AN-07 | Comment | PARTIAL |
| D-AN-08 | Price Label | PARTIAL |
| D-AN-09 | Price Note | PARTIAL |
| D-AN-10 | Arrow Marker | PARTIAL |
| D-AN-11 | Arrow Mark Left | MISSING |
| D-AN-12 | Arrow Mark Right | MISSING |
| D-AN-13 | Arrow Mark Up | PARTIAL |
| D-AN-14 | Arrow Mark Down | PARTIAL |
| D-AN-15 | Flag Mark | PARTIAL |
| D-AN-16 | Table | MISSING |
| D-AN-17 | Image | MISSING |
| D-AN-18 | X posts / ideas on chart | OUT |

### 2.8 Icons

| ID | Tool | Forge |
| --- | --- | --- |
| D-IC-01 | Emoji picker (Twemoji set) | PARTIAL |
| D-IC-02 | Stickers | MISSING |
| D-IC-03 | Icons library | PARTIAL |

### 2.9 Drawing actions (below groups)

| ID | Tool | Forge |
| --- | --- | --- |
| D-AX-01 | Measure | PARTIAL |
| D-AX-02 | Zoom In | PARTIAL |
| D-AX-03 | Weak magnet | MATCH |
| D-AX-04 | Strong magnet | MATCH |
| D-AX-05 | Snap to indicators | MISSING |
| D-AX-06 | Stay in drawing mode | MATCH |
| D-AX-07 | Lock all drawings | MATCH |
| D-AX-08 | Hide drawings | MATCH |
| D-AX-09 | Hide indicators | MISSING |
| D-AX-10 | Hide positions and orders | OUT |
| D-AX-11 | Hide all | MISSING |
| D-AX-12 | Sync drawings to other layouts | MISSING |
| D-AX-13 | Remove drawings | MATCH |
| D-AX-14 | Remove indicators | PARTIAL |
| D-AX-15 | Remove drawings and indicators | MISSING |
| D-AX-16 | Favorite a tool (star) | MISSING |

---

## 3. Drawing interaction (applies to every drawing)

| ID | Supercharts behavior | Forge |
| --- | --- | --- |
| DI-01 | Click to select; handles on anchors | PARTIAL |
| DI-02 | Drag body to move | PARTIAL |
| DI-03 | Drag handle to reshape | PARTIAL |
| DI-04 | Floating toolbar: color, thickness, style, alert, settings, lock, hide, clone, delete | PARTIAL |
| DI-05 | Double-click → properties dialog | MISSING |
| DI-06 | Properties → Style (tool-specific) | MISSING |
| DI-07 | Properties → Text | MISSING |
| DI-08 | Properties → Coordinates (time / price / bar) | MISSING |
| DI-09 | Properties → Visibility (seconds / minutes / hours / daily / weekly / monthly) | MISSING |
| DI-10 | Save / apply drawing template | MISSING |
| DI-11 | Right-click menu (settings, visual order, clone, lock, hide, remove, alert) | MISSING |
| DI-12 | Alert on drawing | MISSING |
| DI-13 | Magnet while placing and editing | PARTIAL |
| DI-14 | Snap 45° / hold Shift | MISSING |
| DI-15 | Undo / redo drawing edits | PARTIAL |
| DI-16 | Object tree sync with selection | PARTIAL |
| DI-17 | Line ends: normal / arrow / circle | MISSING |
| DI-18 | Extend left / right | PARTIAL |
| DI-19 | Stats on line (price, bars, %, angle, distance) | PARTIAL |
| DI-20 | Fib levels: each ratio on/off, color, width, style, extend, reverse, fill | PARTIAL |

Next drawing-parameter pass is **per tool** after DI-* is MATCH. Fib retracement (D-FI-01 + DI-20) is the first geometry to finish to Supercharts defaults (0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.618, 2.618, 3.618, 4.236, trend line, fills, labels `0.618 (price)`).

---

## 4. Chart canvas, legend, scales

| ID | Supercharts item | Forge |
| --- | --- | --- |
| V-01 | Crosshair (vertical + horizontal) | PARTIAL |
| V-02 | Crosshair OHLC tracker box | PARTIAL |
| V-03 | Crosshair styles (solid/dashed/dotted, width, color) | MISSING |
| V-04 | Current price line + last-value label | PARTIAL |
| V-05 | Countdown to bar close | PARTIAL |
| V-06 | High/low of visible range labels | MISSING |
| V-07 | Previous day close line | MISSING |
| V-08 | Bid/ask lines | OUT |
| V-09 | Watermark (symbol + interval) | PARTIAL |
| V-10 | Grid (vert / horiz / both / none) | PARTIAL |
| V-11 | Symbol legend (name, OHLC, change %, volume) | PARTIAL |
| V-12 | Indicator legend: hide, settings, more (visual order, pin, move pane, clone, hide, remove) | PARTIAL |
| V-13 | Pane drag-resize | MISSING |
| V-14 | Pane maximize / collapse / close | MISSING |
| V-15 | Volume as overlay on main pane | PARTIAL |
| V-16 | Session breaks | MISSING |
| V-17 | Events on time scale (earnings, dividends, splits, ideas, news) | MISSING |
| V-18 | Price scale: Regular | MATCH |
| V-19 | Price scale: Percent | MATCH |
| V-20 | Price scale: Indexed to 100 | MISSING |
| V-21 | Price scale: Logarithmic | MATCH |
| V-22 | Invert scale | MISSING |
| V-23 | Lock price-to-bar ratio | MISSING |
| V-24 | Scale price chart only | MISSING |
| V-25 | Auto scale | MATCH |
| V-26 | Left and/or right price scale | MISSING |
| V-27 | Plus button on scale (alert at price) | MISSING |
| V-28 | Drag price axis to zoom | MATCH |
| V-29 | Drag time axis to zoom | MATCH |
| V-30 | Wheel zoom, Shift+wheel vertical | MATCH |
| V-31 | Pan chart | MATCH |
| V-32 | Navigation buttons (zoom, scroll, reset) | PARTIAL |
| V-33 | Go to date | MISSING |
| V-34 | Pin chart left when changing interval | MISSING |
| V-35 | Context menu on empty chart | MISSING |
| V-36 | Context menu on scale | MISSING |

---

## 5. Chart types (all Supercharts types)

| ID | Type | Forge |
| --- | --- | --- |
| CT-01 | Bars | MATCH |
| CT-02 | Candles | MATCH |
| CT-03 | Hollow candles | MATCH |
| CT-04 | Volume candles | PARTIAL |
| CT-05 | Line | MATCH |
| CT-06 | Line with markers | PARTIAL |
| CT-07 | Step line | MATCH |
| CT-08 | Area | MATCH |
| CT-09 | HLC area | PARTIAL |
| CT-10 | Baseline | MATCH |
| CT-11 | Columns | PARTIAL |
| CT-12 | High-low | PARTIAL |
| CT-13 | Heikin Ashi | MATCH |
| CT-14 | Renko | PARTIAL |
| CT-15 | Line Break | PARTIAL |
| CT-16 | Kagi | PARTIAL |
| CT-17 | Point and Figure | PARTIAL |
| CT-18 | Range | PARTIAL |
| CT-19 | Volume footprint | PARTIAL |
| CT-20 | Time Price Opportunity (TPO) | PARTIAL |
| CT-21 | Session volume profile chart | PARTIAL |
| CT-22 | Per-type style settings (body, wick, border, up/down colors, source) | PARTIAL |

---

## 6. Intervals and time scale

| ID | Supercharts item | Forge |
| --- | --- | --- |
| I-01 | Seconds: 1S, 5S, 10S, 15S, 30S | MATCH |
| I-02 | Minutes: 1, 2, 3, 5, 10, 15, 30, 45 | MATCH |
| I-03 | Hours: 1, 2, 3, 4 | MATCH |
| I-04 | Days: 1D, 2D, 3D | MATCH |
| I-05 | Weeks: 1W | MATCH |
| I-06 | Months: 1M, 3M, 6M, 12M | MATCH |
| I-07 | Range bars (1R … custom) | MATCH |
| I-08 | Custom interval | MATCH |
| I-09 | Favorite intervals | MATCH |
| I-10 | Bottom range: 5D, 1M, 3M, 6M, YTD, 1Y, 5Y, ALL | PARTIAL |
| I-11 | Timezone: Exchange + IANA zones | PARTIAL |
| I-12 | Date / time format on scale | PARTIAL |

---

## 7. Indicators platform

| ID | Supercharts item | Forge |
| --- | --- | --- |
| IND-01 | Indicators dialog search | MATCH |
| IND-02 | Tabs: Technicals, Financials, Community, Invite-only, Patterns | PARTIAL |
| IND-03 | Favorites / recently used | MATCH |
| IND-04 | Add to chart | MATCH |
| IND-05 | Inputs tab | PARTIAL |
| IND-06 | Style tab (every plot: color, width, style, precision, price line) | PARTIAL |
| IND-07 | Visibility tab (per timeframe) | PARTIAL |
| IND-08 | Levels (RSI 30/70, etc.) | MISSING |
| IND-09 | Move to new pane / existing pane | MISSING |
| IND-10 | Visual order | MISSING |
| IND-11 | Pin to scale | MISSING |
| IND-12 | Source (open/high/low/close/hl2/hlc3/ohlc4) | PARTIAL |
| IND-13 | Pine Editor add-to-chart | PARTIAL |
| IND-14 | Strategy on chart + tester | PARTIAL |

Built-in **Technicals** catalog (each is its own later ID `IND-B-*`). Forge currently has SMA, EMA, WMA, BB, VWAP, Volume, RSI, MACD, Stoch, ATR only.

SMA, EMA, WMA, SMMA, VWMA, DEMA, TEMA, HMA, ALMA, LSMA, KAMA, McGinley Dynamic, Median, Moving Average Ribbon, MA Cross, MovingAvg2Line Cross, Ichimoku Cloud, Parabolic SAR, Supertrend, ADX, DMI, Aroon, Aroon Oscillator, Linear Regression, Zig Zag, Williams Alligator, Williams Fractal, Vortex, Trend Strength, Envelopes, Donchian, Keltner, Bollinger Bands, Bollinger %b, Bollinger Bandwidth, Bollinger Bars, BBTrend, RSI, RSI Divergence, Stochastic, Stochastic RSI, SMI, SMI Ergodic, SMI Ergodic Oscillator, MACD, PPO, CCI, Woodies CCI, Williams %R, Awesome Oscillator, Momentum, ROC, CMO, TSI, Ultimate Oscillator, RVI, DPO, Connors RSI, Coppock, KST, Fisher Transform, PMO, Pring Special K, Rank Correlation Index, RCI Ribbon, True Strength Index, Ulcer Index, Relative Volatility Index, Balance of Power, Bull Bear Power, ATR, ADR, Historical Volatility, Mass Index, Choppiness, Chop Zone, Chande Kroll Stop, Chandelier Exit, Volatility Stop, Volume, Volume Delta, CVD, Up/Down Volume, Net Volume, OBV, ADL, CMF, Chaikin Oscillator, Klinger, EOM, PVT, PVO, NVI, PVI, VWAP, VWAP Auto Anchored, TWAP, Visible Average Price, Pivot Points Standard, Pivot Points High Low, Auto Fib Retracement, Auto Fib Extension, Auto Pitchfork, Auto Trendlines, Auto Key Levels, Technical Ratings, Trading Sessions, Seasonality, Moon Phases, Multi-Time Period Charts, Performance, Correlation Coefficient, plus crypto/on-chain built-ins listed in TradingView’s Built-in Indicators folder.

---

## 8. Right widget bar

| ID | Supercharts widget | Forge |
| --- | --- | --- |
| R-01 | Watchlist + details + news | PARTIAL |
| R-02 | Alerts manager | PARTIAL |
| R-03 | Object tree | PARTIAL |
| R-04 | Data window | PARTIAL |
| R-05 | Screeners | MISSING |
| R-06 | Pine Editor (right dock) | PARTIAL |
| R-07 | Calendars | PARTIAL |
| R-08 | News Flow | PARTIAL |
| R-09 | Portfolio | OUT |
| R-10 | Fundamental Graphs | MISSING |
| R-11 | Yield Curves | MISSING |
| R-12 | Options | MISSING |
| R-13 | Macro Maps | MISSING |
| R-14 | Community feed | OUT |
| R-15 | Notifications | OUT |
| R-16 | Help Center | MISSING |
| R-17 | Products overlay | OUT |

---

## 9. Bottom panel

| ID | Supercharts item | Forge |
| --- | --- | --- |
| B-01 | Pine Editor | PARTIAL |
| B-02 | Strategy Tester (Overview, Performance, Trades, Ratios, Properties) | PARTIAL |
| B-03 | Replay Trading | MISSING |
| B-04 | Trading Panel | OUT |
| B-05 | Pine logs / profiler | MISSING |

---

## 10. Chart settings dialog

| ID | Tab / control | Forge |
| --- | --- | --- |
| S-01 | Symbol (per chart type: colors, wick, border, body) | MISSING |
| S-02 | Data modification (session, dividends, futures back-adjust, precision, timezone) | MISSING |
| S-03 | Status line (logo, title, OHLC, bar change, volume, last day change) | PARTIAL |
| S-04 | Scales and lines — price scale | PARTIAL |
| S-05 | Scales and lines — labels and lines (countdown, high/low, bid/ask, pre/post) | PARTIAL |
| S-06 | Time scale (weekdays, date format, pin left) | MISSING |
| S-07 | Canvas background (solid / gradient) | PARTIAL |
| S-08 | Grid | PARTIAL |
| S-09 | Crosshair | PARTIAL |
| S-10 | Watermark | PARTIAL |
| S-11 | Scale text size / colors | MISSING |
| S-12 | Navigation buttons visibility | MISSING |
| S-13 | Pane buttons visibility | MISSING |
| S-14 | Margins (top / bottom / right) | MISSING |
| S-15 | Trading appearance | OUT |
| S-16 | Alerts appearance | MISSING |
| S-17 | Events (ideas, dividends, splits, earnings, news) | MISSING |
| S-18 | Settings templates | MISSING |

---

## 11. Hotkeys (Supercharts defaults)

| ID | Action | Forge |
| --- | --- | --- |
| K-01 | Alt+T Trend Line | MISSING |
| K-02 | Alt+H Horizontal Line | MISSING |
| K-03 | Alt+V Vertical Line | MISSING |
| K-04 | Alt+F Fib Retracement | MISSING |
| K-05 | Alt+I Indicators | MISSING |
| K-06 | Alt+A Alert | MISSING |
| K-07 | Shift+Alt+R Bar Replay | MISSING |
| K-08 | Delete / Backspace remove selected | MATCH |
| K-09 | Esc cancel / deselect | PARTIAL |
| K-10 | Ctrl/Cmd+Z undo, Shift redo | MATCH |
| K-11 | Type ticker to search | MATCH |
| K-12 | Comma interval menu | MATCH |
| K-13 | Ctrl/Cmd+K quick search | MATCH | Wired from product header |

---

## Execution order

1. **T-01** Symbol search Supercharts behavior  
2. **T-05 / I-*** Interval set  
3. **T-07 / CT-*** Chart types  
4. **T-08 / IND-*** Indicator dialog + settings  
5. **DI-*** Drawing select / properties  
6. **D-FI-01** Fib Retracement exact Supercharts geometry  
7. Remaining drawings one ID at a time  
8. **V-*** canvas / scales  
9. **S-*** settings dialog  
10. **R-*** / **B-*** / **C-10** layouts  

OUT items stay listed and are not implemented unless requested.
