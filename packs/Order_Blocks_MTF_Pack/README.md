# Order Blocks MTF

TradingView Pine indicator that finds **bullish / bearish Order Blocks** on the chart TF and optional higher TFs.

## How the box is drawn
1. Detect an impulse (displacement and/or BOS).
2. Take the previous **N candles** (`Candles in block`).
3. Draw a rectangle from those candles’ **Highest High → Lowest Low**.

## Block kinds
| Kind | Meaning |
|------|---------|
| **Bullish OB** | Last opposing (mostly bearish) candles before a bullish impulse / BOS |
| **Bearish OB** | Last opposing (mostly bullish) candles before a bearish impulse / BOS |
| **Breaker** | Mitigated OB kept on chart (optional) |

## Inputs (important)
- **Candles in block** — how many candles form the zone (HH→LL)
- **Require opposing candles** — ICT-style filter
- **BOS / Displacement** — confirmation rules
- **TF 1 / 2 / 3** — extra timeframes (e.g. 60 / 240 / D)
- **Keep mitigated as breakers** — flip style instead of deleting

## Install
1. TradingView → Pine Editor → paste `Order_Blocks_MTF.pine`
2. Add to chart
3. Set `Candles in block` (try `1` or `2` first)
4. Enable the TFs you want

## Downloads
- Pine: https://raw.githubusercontent.com/radiarkazemi/forge-charts/cursor/order-blocks-mtf-992e/indicators/Order_Blocks_MTF.pine
- Pack: https://raw.githubusercontent.com/radiarkazemi/forge-charts/cursor/order-blocks-mtf-992e/packs/Order_Blocks_MTF_Pack.zip

## Notes
- Does **not** auto-trade.
- More TFs + lower `Candles in block` = more zones.
- Tighten with higher displacement multiplier or longer structure lookback.
