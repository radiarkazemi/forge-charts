# TRH for MetaTrader 5 — Modes A + B

| File | Role |
|------|------|
| `TRH_Trading_Room_Hunter.mq5` | **Indicator** v2.36 (build **236**) |
| `TRH_AutoTrade.mq5` | **EA** **v3.55** |
| `TRH_Engine.mqh` | Shared Engine **v234** |

## v3.55 — stop TP1 / ENTRY tick spam

Bug: when price revisited first TP / ENTRY, gold ticks re-fired **dozens of market orders** in 1–2 seconds (`RetryEveryTicks=1` + `PositionsTotal` lag after OrderSend).

| Change | Effect |
|--------|--------|
| `MarkOrderSent` + `FillLock` | Hard lock after ANY successful send (default **8s** + 2.5s tick floor) |
| One-trade-per-setup | Market fill marks `barTime` done — never re-fire same setup |
| `RetryEveryTicks` default **5** | Was 1 (every tick) |
| Clear work on market send | Do not wait for `PositionsTotal` (that lag caused the spam) |

## Why LIVE SL was under Real SL (your SHORT)

Setup SL **4407.59** (distal) · better LIVE ENTRY **4403.47**.

Older EA rebuilt SL as `fill ± same risk`. Better short fill → LIVE SL **4405.93** — **inside** the distal. Price can wick near Real SL without tagging it; the tighter LIVE SL stopped you out early.

## v3.54 fix

| Change | Effect |
|--------|--------|
| Market fills keep **structural setup SL** | LIVE SL never sits inside Real SL |
| Broker pad only **widens** SL | Never tightens toward price |
| TP recalculated from live entry → distal | RR stays correct with real risk |

## v3.53 (still in place)

Trailing TP **OFF by default**; when ON → only `SL → TP1` lock, no mid-way market close.

## Fresh install

1. Remove EA from chart · delete old `TRH_AutoTrade.ex5`
2. Copy `TRH_Engine.mqh` + `TRH_AutoTrade.mq5` (+ indicator) into the same folder
3. Compile · reattach · comment must say **v3.55**
4. Leave **Trailing TP = false** unless you want SL locks at TP1
5. Keep **One Trade Per Setup = true** and **Order Cooldown ≥ 5s**

Panel indicator: **`TRH v236 · Eng234`**.
