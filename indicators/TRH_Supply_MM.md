# TRH Supply MM — Proximal Entry · Distal Stop · R Ladder

Pine indicator that recreates the **Money Management Tool** geometry:

| Label | Meaning |
|-------|---------|
| **E** | Entry at the **proximal** edge of the supply/demand zone |
| **S** | Stop at the **distal** edge |
| **1 · 2 · 3 · 5** | Take-profit ladder at `n × R`, where `R = \|distal − proximal\|` |

## Model

After a **displacement**, the last opposing candle (or FVG) becomes a supply/demand zone. Price leaves, then returns to proximal → arm.

Zone modes: **Order Block** (default) · **FVG** · **OB + FVG**

## Raw

https://raw.githubusercontent.com/radiarkazemi/forge-charts/cursor/trh-supply-mm-992e/indicators/TRH_Supply_MM.pine

TradingView → Pine Editor → paste → Add to chart.
