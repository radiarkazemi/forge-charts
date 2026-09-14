# Order Blocks MTF

Bullish / bearish **Order Blocks** on chart TF + optional higher TFs.

Each block uses **N candles**; the rectangle is drawn from those candles’ **Highest High → Lowest Low**.

## MT5 (recommended if TradingView is limited)

1. Download `Order_Blocks_MTF.mq5`
2. MetaEditor → open file → **Compile**
3. Navigator → Indicators → `Order_Blocks_MTF` → attach to chart
4. Defaults: BlockLen `2`, Chart TF on, TF1 `H1`

### Important inputs
| Input | Meaning |
|------|---------|
| Candles in block | How many candles form the OB (HH→LL) |
| Require opposing candles | ICT-style filter |
| BOS / Displacement | Confirmation rules |
| TF 1 / 2 / 3 | Extra timeframes (H1 / H4 / D1) |
| Keep mitigated as breakers | Flip style instead of deleting |

## TradingView Pine (optional)
Same logic if you still want TV.

## Downloads
- **MT5:** https://raw.githubusercontent.com/radiarkazemi/forge-charts/cursor/order-blocks-mtf-992e/mt5/Order_Blocks_MTF/Order_Blocks_MTF.mq5
- **Pack:** https://raw.githubusercontent.com/radiarkazemi/forge-charts/cursor/order-blocks-mtf-992e/packs/Order_Blocks_MTF_Pack.zip
- Pine: https://raw.githubusercontent.com/radiarkazemi/forge-charts/cursor/order-blocks-mtf-992e/indicators/Order_Blocks_MTF.pine

## Notes
- Does not trade.
- Start with BlockLen `1` or `2`.
- Enable more TFs only if you want more zones.
