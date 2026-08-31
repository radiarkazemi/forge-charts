# TRH for MetaTrader 5 — Modes A / B / C (named setups)

| File | Role |
|------|------|
| `TRH_Trading_Room_Hunter.mq5` | **Indicator** v2.25 |
| `TRH_AutoTrade.mq5` | **EA** v3.27 |
| `TRH_Engine.mqh` | Shared Engine v225 |

| Mode | Chart name | Logic |
|------|------------|--------|
| **A** | `A · SWEEP` | Classic room mid ENTRY — **main model** |
| **B** | `B · FVG` | Sweep → disp → FVG → retest |
| **C** | `C · BTB` | Breakout → BE retest — quality tightened |
| **All** | default | A + B + C with priority **A > B > C** |

## Priority (v225) — why Pine showed A but MT5 took BTB

BTB confirms faster than Mode A (A needs base bars). Old merge kept the earlier C and **dropped** the later A inside cooldown — and on the same bar preferred C > A.

**Fixed:**
- Same bar → keep **A over B over C**
- Inside cooldown → a later **higher-priority** mode **replaces** a weaker one (A replaces C)
- Chart / EA always use the **latest preferred** setup in the merged list

## Smart EA fill (v3.27)

Indicator **SL/TP drawings ≠ broker orders**. v3.27 keeps an **active setup** until filled:

- Adopts latest preferred setup (A>B>C) up to 8 bars age
- Retries **every tick** (spread/session no longer permanently lock)
- Before ENTRY → **BuyStop / SellStop**
- Past ENTRY → **BuyLimit / SellLimit** pullback
- Bar touches ENTRY → **market fill** (deletes pending if needed)
- Aborts only if SL hit first, too deep to TP (≥0.9R), or work age expires
- Chart comment shows `WORKING…` / `pending parked` / fail reason

## Pullback LIMIT (EA v3.26)

Indicator **IN TRADE** is visual only — not a broker order. Old EA skipped when price was already past ENTRY (`SkipExpiredEntry`) and never parked a limit, so pullbacks were missed (your BTB long @ 4447.77).

**Now:**
- At / near ENTRY → market
- Past ENTRY but &lt; 0.85R toward TP → **BuyLimit / SellLimit** (wait pullback)
- Still before ENTRY → limit wait
- Cancel pending only if price runs ≥ ExpireAtR toward TP (not on small chase)

## Mode C BTB quality (v224)

Filters the weak M1 shorts (tiny SL / fake confirm):

- Stronger breakout body (0.45 ATR)
- Min confirm body (0.28 ATR)
- Wick must tag BE + close reject
- Min risk 0.50 ATR (no 1.85-pt gold SL noise)
- Skip if already past BE toward TP
- Wait ≥2 bars after breakout before entry

Mode **A** and **B** detection geometry unchanged — only merge priority changed.

## Graphics

Each setup tag shows its own mode name + accent color:

- A SWEEP → teal / crimson  
- B FVG → blue / purple  
- C BTB → orange / red  

## Install

1. Unzip `TRH_Trading_Room_Hunter_MT5.zip`
2. `Indicators/TRH_Trading_Room_Hunter/` ← Engine + Indicator  
3. `Experts/TRH_Trading_Room_Hunter/` ← Engine + EA  
4. Compile both `.mq5` · re-attach · Mode = **All**

## Links

- Zip: https://github.com/radiarkazemi/forge-charts/raw/cursor/trh-mt5-abc-992e/mt5/TRH_Trading_Room_Hunter_MT5.zip
- Pine: https://raw.githubusercontent.com/radiarkazemi/forge-charts/cursor/trh-mt5-abc-992e/indicators/TRH_Trading_Room_Hunter.pine
- EA: https://raw.githubusercontent.com/radiarkazemi/forge-charts/cursor/trh-mt5-abc-992e/mt5/TRH_Trading_Room_Hunter/TRH_AutoTrade.mq5
- Indicator: https://raw.githubusercontent.com/radiarkazemi/forge-charts/cursor/trh-mt5-abc-992e/mt5/TRH_Trading_Room_Hunter/TRH_Trading_Room_Hunter.mq5
- Engine: https://raw.githubusercontent.com/radiarkazemi/forge-charts/cursor/trh-mt5-abc-992e/mt5/TRH_Trading_Room_Hunter/TRH_Engine.mqh
