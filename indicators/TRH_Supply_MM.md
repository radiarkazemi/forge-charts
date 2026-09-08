# TRH Supply MM — Proximal Entry · Distal Stop · R Ladder

Pine indicator that recreates the **Money Management Tool** geometry from your chart:

| Label | Meaning |
|-------|---------|
| **E** | Entry at the **proximal** edge of the supply/demand zone |
| **S** | Stop at the **distal** edge (price may wick near it without tagging it) |
| **1 · 2 · 3 · 5** | Take-profit ladder at `n × R`, where `R = \|distal − proximal\|` |

## What this setup is

After a **displacement** (strong impulse), the last opposing candle (or the FVG left by the move) becomes a **supply / demand zone**. Price leaves the zone, then **returns to the proximal edge** → arm short (supply) or long (demand).

This is **not** TRH Mode B (which enters at FVG mid / CE). Mode B keeps CE parity with the MT5 engine. Supply MM is a separate proximal-edge model.

## Zone modes

| Mode | Zone |
|------|------|
| **Order Block** (default) | Last bullish candle before a bearish displacement = supply · last bearish before bullish disp = demand |
| **FVG** | 3-candle imbalance; entry still at **proximal** edge (bottom of bearish FVG / top of bullish FVG) |
| **OB + FVG** | Both |

## How to use (TradingView)

1. Pine Editor → paste `TRH_Supply_MM.pine` → Add to chart  
2. Prefer Gold M1–M15 after a clear impulse (your screenshots)  
3. Wait for **ARMED** in the panel when price revisits **E**  
4. SL stays at **S** (distal) — do not pull Live SL inside the zone  

## Relation to your other tools

| Tool | Entry | SL | TP |
|------|-------|----|----|
| **Supply MM (this)** | Proximal edge | Distal edge | 1 / 2 / 3 / 5 R |
| TRH Mode B | FVG mid (CE) | Beyond raid + FVG outer | Single ~2.4R |
| LH | CE / CISD-in-FVG | Beyond raid | Single ~2.5R |
| Expansion Hunter | Expansion base | Beyond raid (min 8pt) | Opposing liq / 4R |

## Alerts

- `Supply MM Short Arm`
- `Demand MM Long Arm`
