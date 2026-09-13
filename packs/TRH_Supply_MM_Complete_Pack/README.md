# TRH Supply MM — Complete Pack (TradingView + MT5)

The **entire** Supply MM model: Setups 1–5, Clean Score (A/B/C/D), and **smart MT5 autotrade**.

## What’s inside

| Piece | Path |
|-------|------|
| Pine indicator | `TradingView/TRH_Supply_MM.pine` (also `indicators/TRH_Supply_MM.pine`) |
| MT5 Engine | `mt5/TRH_Supply_MM/SMM_Engine.mqh` |
| MT5 Chart indicator | `mt5/TRH_Supply_MM/TRH_Supply_MM.mq5` |
| MT5 AutoTrade EA | `mt5/TRH_Supply_MM/TRH_Supply_MM_AutoTrade.mq5` |

## Setups (same as Pine)

| Setup | Logic | Arm |
|-------|--------|-----|
| **1 MM** | Displacement → OB/FVG | Leave → return to proximal |
| **2 MSS** | Structure break → fresh zone | Leave → return |
| **3 HTF+LQ** | MSS + LQ equal highs/lows | Leave → LQ sweep (or fallback) |
| **4 BB+FVG** | Sweep → MSS → Breaker∩FVG | Leave → return |
| **5 fs** | Fractal sweep | Arms on sweep (off by default in EA) |

Shared: **ENTRY = proximal · SL = distal · TP = chart structure** (else 2.5R).

## Clean Score (smart gate)

| Grade | Score | AutoTrade |
|-------|-------|-----------|
| **A** | ≥ 80 | Preferred ★ |
| **B** | ≥ 70 | Allowed (default arm) |
| **C/D** | &lt; 70 | Rejected |

EA defaults: trade only **armed B+**, prefer **A**, max 1 open trade, Setup 5 **OFF** (noisy on M1).

## Smart autotrade behavior

1. Scan all enabled setups → score → arm  
2. Adopt **best armed** zone (prefer A)  
3. **Fill:** far from ENTRY → market now · near → Limit/Stop @ ENTRY · touch → market  
4. **LIVE SL clamp:** keep structural distal; broker stops may only **widen** (never pull SL inside the setup)  
5. Dynamic lots from risk % · spread / daily loss caps · pending expiry  

Magic number: `290825` (does not clash with classic TRH `260825`).

## Install (MT5)

1. Copy folder `mt5/TRH_Supply_MM/` → `MQL5/Experts/TRH_Supply_MM/`  
   (or `MQL5/Indicators/TRH_Supply_MM/` for the chart indicator — keep `SMM_Engine.mqh` beside both `.mq5` files)  
2. Compile `TRH_Supply_MM_AutoTrade.mq5` and `TRH_Supply_MM.mq5` in MetaEditor  
3. Attach EA to **XAUUSD M1** (or your TF) · allow Algo Trading  
4. Optional: attach the indicator on the same chart for ENTRY/SL lines  

## Recommended EA inputs

- Setups **1–4 ON**, **5 OFF**  
- `Min Score Arm = 70`, `Prefer Grade A = 80`  
- `Far Open Market = true`, `Fix Live Stops = true`  
- `Risk % = 0.5–1.0` on gold until proven  
- Break-even / trail: leave unused (not in this EA — SL stays structural)

## Pine raw URL

https://raw.githubusercontent.com/radiarkazemi/forge-charts/cursor/trh-supply-mm-992e/indicators/TRH_Supply_MM.pine

## Note

This pack is **separate** from classic `TRH_Trading_Room_Hunter` / LH engines — do not mix `.mqh` files across products.
