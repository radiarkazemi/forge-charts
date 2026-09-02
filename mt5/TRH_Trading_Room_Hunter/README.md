# TRH for MetaTrader 5 — Modes A + B

| File | Role |
|------|------|
| `TRH_Trading_Room_Hunter.mq5` | **Indicator** v2.34 (build 234) |
| `TRH_AutoTrade.mq5` | **EA** v3.39 |
| `TRH_Engine.mqh` | Shared Engine v232 |

## Why TV hit TP and MT5 kept hitting SL

MT5 was locking a **0.81pt micro FVG** (mid 4327.01, SL ~4330.4). That setup:
1. Got stop-hunted on the wick
2. Started cooldown → **blocked the real TV-quality setup** (mid 4328.01, SL 4331.99)
3. With OnlyLast=true, history disappeared so you only saw the bad one

### v234 / Eng232 fixes
| Setting | Value | Effect |
|---------|-------|--------|
| `minFvgPoints` | **1.50** | Hard-rejects the 0.81pt micro gap |
| `minFvgAtr` | **0.45** | ATR gate |
| `fvgMinRiskAtr` | **1.55** | SL floor clears ~4330.5–4331 wick |
| `fvgSlExtraAtr` | **0.45** | Wider pad beyond FVG outer |
| Upgrade FVG | while waiting retest | Prefer larger quality gap |
| OnlyLast | **false** | Show setup history again |
| ENTRY | still FVG mid | Same as TV |

## Fresh install

1. Remove TRH from chart · delete `.ex5`
2. [Download zip](https://github.com/radiarkazemi/forge-charts/raw/cursor/trh-mt5-abc-992e/mt5/TRH_Trading_Room_Hunter_MT5.zip)
3. Replace Engine + Indicator + EA · compile both
4. Panel must say **`TRH v234 · Eng232 · Q-FVG`**
5. **Reset inputs** if Min FVG Points is missing / still 0.12
6. Reload Pine from repo (same filters)

That `FVG 4326.61→4327.42` setup must **not** appear anymore.
