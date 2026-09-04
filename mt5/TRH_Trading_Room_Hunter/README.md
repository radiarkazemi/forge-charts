# TRH for MetaTrader 5 — Modes A + B

| File | Role |
|------|------|
| `TRH_Trading_Room_Hunter.mq5` | **Indicator** v2.36 (build **236**) |
| `TRH_AutoTrade.mq5` | **EA** **v3.52** |
| `TRH_Engine.mqh` | Shared Engine **v234** |

## Why Mode B showed on TradingView but not MT5

Your MT5 panel still said **`TRH V2.33`** while EA was v3.51 — old indicator binary.

Worse: Engine **dropped Mode B** when Mode A confirmed inside the 50-bar cooldown (or killed an in-progress B path). TradingView **keeps both**. Result: TV SHORT **B · FVG** (e.g. 4473.60 / 4476.25 / 4467.25) while MT5 only showed an old **A · SWEEP**.

## v236 / Eng234 / EA 3.52

| Fix | Effect |
|-----|--------|
| **Keep Mode B with Mode A** | Confirmed B·FVG is never replaced/dropped by A |
| Don’t kill in-progress Mode B when A fires | Pine parity |
| Lookback **2500** bars | GOLD M1 stays fast |
| Trailing TP (from 3.51) | Same-ticket close/lock only — no hedge opens |
| Panel must read | **`TRH v236 · Eng234 · Q-FVG`** |

## Fresh install (required)

1. **Remove** TRH indicator + EA from the chart  
2. Delete old `.ex5` files  
3. Copy `TRH_Engine.mqh` + both `.mq5` into the **same** folder  
4. Compile both (F7)  
5. Re-attach — panel **must** say **`TRH v236 · Eng234`**  
6. Detection Mode = **A + B (Both)**  
7. EA comment must say **v3.52**

If panel still says v233 / v235 → wrong folder / old `.ex5`.
