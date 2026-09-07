# TRH for MetaTrader 5 — Modes A + B

| File | Role |
|------|------|
| `TRH_Trading_Room_Hunter.mq5` | **Indicator** v2.36 (build **236**) |
| `TRH_AutoTrade.mq5` | **EA** **v3.53** |
| `TRH_Engine.mqh` | Shared Engine **v234** |

## Why it closed mid-way on pullback (your GOLD short)

Entry **4398.98** · SL **4402.29** · TP **4391.01**. Price went toward TP then pulled back to ~**4394.51**.

**v3.52 Trailing TP** was ON and did a **market close** once price came back through the first-TP level — that exits at the **current mid price**, not at the first TP line. SL was never hit; the EA dumped the trade early.

## v3.53 fix

| Change | Effect |
|--------|--------|
| Trailing TP **OFF by default** | Setup runs to broker SL / TP unless you opt in |
| When ON: **only** `SL → TP1` | Locks profit at the first target; keeps TP2 |
| **No mid-way market close** | Pullbacks no longer dump at a random price |

## Fresh install

1. Remove EA from chart · delete old `TRH_AutoTrade.ex5`
2. Copy `TRH_Engine.mqh` + `TRH_AutoTrade.mq5` (+ indicator) into the same folder
3. Compile · reattach · comment must say **v3.53**
4. Leave **Trailing TP = false** unless you want SL locks at TP1

Panel indicator: **`TRH v236 · Eng234`**.
