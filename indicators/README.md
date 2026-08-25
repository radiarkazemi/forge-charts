# TRH | Trading Room Hunter — TradingView Indicator

Pine Script v5 indicator that detects **TRH (Trading Room Hunter)** Smart Money zones on gold (XAUUSD) and other symbols, and prints **exact ENTRY / SL / TP** levels.

File: [`TRH_Trading_Room_Hunter.pine`](./TRH_Trading_Room_Hunter.pine)

## Install on TradingView

1. Open [TradingView](https://www.tradingview.com/) → chart (recommended: **XAUUSD**, timeframe **1m / 5m / 15m**).
2. Pine Editor → **Open** → **New blank indicator**.
3. Delete the template, paste the full contents of `TRH_Trading_Room_Hunter.pine`.
4. Click **Save**, then **Add to chart**.

## What it draws

| Visual | Meaning |
|---|---|
| Green / red / orange circles | Major lows, major highs, intermediate pivots |
| Blue / red shaded box | **TRH Zone** (between Origin Pivot and Break Candle) |
| Black **ENTRY** line + label | Exact limit entry (mid-zone) |
| Red dashed **SL** line + label | Stop beyond distal pivot (+ ATR threshold) |
| Green dashed **TP** line + label | Take profit at configured R:R |
| Top-right table | Live ENTRY / SL / TP / risk / reward numbers |
| ▶ ENTRY / ✓ TP / ✗ SL tags | Exact fill and exit markers |

## How the logic works

1. Detect an impulsive **spike** (min consecutive candles + ATR power filter).
2. Confirm **Break of Structure** (close beyond recent swing high/low).
3. **Distal (Origin Pivot)** = last major swing low (long) or high (short).
4. **Proximal (Break Candle)** = low/high of the break candle.
5. **TRH Zone** = band between distal and proximal.
6. When price **revisits** the zone → ENTRY signal.
7. **SL** = distal ± ATR threshold · **TP** = entry ± risk × R:R.

## Suggested settings (Gold)

| Input | Scalp (1m/5m) | Intraday (15m) |
|---|---|---|
| Minimum Spike Bars | 3 | 3–4 |
| Movement Power Level | 1.5 | 1.8 |
| Pivot Period | 5 | 8 |
| Stop-Loss Threshold (ATR×) | 0.3–0.5 | 0.5–0.8 |
| Risk-Reward Ratio | 2.0 | 2.0–3.0 |
| Max Zone Width (ATR×) | 3.0 | 4.0 |

Match the Aug 25 04:19-style hunt: use **1m**, R:R **2.0–2.5**, tight SL threshold.

## Alerts

Create alerts from the chart clock icon, or use built-in conditions:

- TRH Bullish / Bearish Zone Created
- TRH Long / Short Entry (price revisited the room)
- Runtime alerts also fire on zone create, entry fill, SL, and TP

## Disclaimer

Educational recreation of the public TRH / Khosro zone model. Not financial advice. Always validate on replay before live size.
