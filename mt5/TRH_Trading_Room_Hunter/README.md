# TRH for MetaTrader 5 — Modes A + B

| File | Role |
|------|------|
| `TRH_Trading_Room_Hunter.mq5` | **Indicator** v2.35 (build 235) |
| `TRH_AutoTrade.mq5` | **EA** v3.40 |
| `TRH_Engine.mqh` | Shared Engine v233 |

## Why your chart still showed the bad setup

Your screenshot panel says **`TRH v233 · Eng231`** — that is the **old** build. It accepted the **0.81pt micro FVG** (ENTRY 4327.01 / SL 4330.43 → SL HIT).

TradingView used the quality gap (ENTRY **4328.01** / SL **4331.99** → TP HIT).

MT5 also **keeps old input values** after recompile. Even with newer source, a chart that once had `OnlyLast=true` or a weak Min FVG will keep those values unless you remove/re-add the indicator — or the engine force-clamps them (v235).

## v235 / Eng233 fixes

| Fix | Effect |
|-----|--------|
| **Force-clamp** Min FVG ≥ **1.50pt** | Stale inputs cannot recreate the 0.81pt trap |
| Clamp minRisk ≥ **1.55 ATR**, SL pad ≥ **0.45 ATR** | Survive the ~4330.5–4331 wick |
| **History always drawn** | Ignores stale `OnlyLast=true` |
| Upgrade FVG while waiting retest | Prefer larger quality gap |
| Panel must read | **`TRH v235 · Eng233 · Q-FVG`** |

## Fresh install (required)

1. **Remove** TRH indicator + EA from the chart
2. Delete old `TRH_Trading_Room_Hunter.ex5` / `TRH_AutoTrade.ex5` in `MQL5/Indicators` and `MQL5/Experts`
3. Copy these three files from the zip into the same folder:
   - `TRH_Engine.mqh`
   - `TRH_Trading_Room_Hunter.mq5`
   - `TRH_AutoTrade.mq5`
4. Compile **both** mq5 files in MetaEditor (F7)
5. Re-attach indicator — panel **must** say **`TRH v235 · Eng233 · Q-FVG`**
6. If panel still says v233 / Eng231 → wrong folder / old `.ex5` still loaded

That `FVG 4326.61→4327.42` setup must **not** appear anymore.
