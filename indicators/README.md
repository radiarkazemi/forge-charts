# TRH | Trading Room Hunter — TradingView Indicator

Pine Script v5 indicator for **quality TRH rooms only** — exact **ENTRY / SL / TP**, less noise.

File: [`TRH_Trading_Room_Hunter.pine`](./TRH_Trading_Room_Hunter.pine)

## Install

1. TradingView → XAUUSD chart (start with **1m** or **5m**)
2. Pine Editor → paste full `.pine` file → **Save** → **Add to chart**
3. If you still have the old version, remove it from the chart first

## What changed (noise fix)

| Before | After |
|---|---|
| Almost every micro swing fired | Cooldown + min impulse / min risk filters |
| Tiny 2–3 pt rooms | **Min Risk ≥ 0.8 ATR** (rejects noise) |
| Same-bar spam labels | Markers hidden by default; levels on lines + table |
| Orange pivots everywhere | Off by default |
| Missed sample-style longs | **Sweep Hunt**: raid a major pivot after a real selloff/rally |

## Logic

1. **Sweep Hunt (04:19 style)** — after a large opposing move, price sweeps a stored major pivot, reclaim closes back inside → TRH room between sweep extreme (distal) and pivot (proximal).
2. **Impulse TRH** — a strong ATR-sized break creates a room; price must leave, then return for entry.
3. **ENTRY** = Mid Zone (default) or Proximal edge  
   **SL** = beyond distal + ATR pad  
   **TP** = ENTRY ± risk × R:R

## Suggested XAUUSD 1m defaults (already set)

- Pivot Period: `8`
- Min Impulse: `2.0` ATR
- Cooldown: `40` bars
- Min Prior Opposing Move: `1.5` ATR
- Min Risk: `0.8` ATR
- Max Zone Width: `2.5` ATR
- R:R: `2.0`
- Only Last Position: **ON**
- Hide entry/TP/SL text spam: **ON**

If still too quiet on 5m/15m, lower `Min Impulse` to `1.5` and `Cooldown` to `25`.

## Alerts

- TRH Long / Short Zone created  
- TRH Long / Short Entry fill  

## Disclaimer

Educational recreation of the TRH / Khosro zone model. Not financial advice.
