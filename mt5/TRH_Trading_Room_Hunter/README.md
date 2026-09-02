# TRH for MetaTrader 5 — Modes A + B (BTB removed)

| File | Role |
|------|------|
| `TRH_Trading_Room_Hunter.mq5` | **Indicator** v2.33 (build 233) |
| `TRH_AutoTrade.mq5` | **EA** v3.38 |
| `TRH_Engine.mqh` | Shared Engine v231 |

| Mode | Chart name | Live? |
|------|------------|--------|
| **A** | `A · SWEEP` | **Yes** — classic room |
| **B** | `B · FVG` | **Yes** — quality FVG (no micro gaps) |
| **C** | `C · BTB` | **Removed** |

**Default = A + B (Both).** Priority when both fire: **A > B**.

## Why TV hit TP and MT5 hit SL (fixed in v231)

Same gold move, different Mode B quality on the broker feed:

| | TradingView (TP HIT) | Old MT5 (SL HIT) |
|--|---------------------|------------------|
| FVG | ~2pt · mid **4328.01** | micro **0.81pt** · mid 4327.01 |
| SL | **4331.99** (cleared ~4330.5 wick) | **4330.08** (wick stopped out) |
| TP | 4318.44 | 4319.65 |

### Mode B quality defaults now
- ENTRY still **FVG mid** `(gapTop+gapBot)/2`
- `minFvgAtr = 0.28` — skip micro gaps; keep scanning for a real FVG
- `fvgSlExtraAtr = 0.35` + SL beyond FVG outer edge
- `fvgMinRiskAtr = 1.15` — SL floor so MT5 stop-hunt wicks do not kill the trade
- `maxFvgBars = 14` — more room to find a quality gap

Reload the repo Pine too (same defaults).

## Fresh install (required)

1. **Remove** old TRH indicator + EA from the chart
2. Delete old `.ex5` files
3. Unzip [TRH_Trading_Room_Hunter_MT5.zip](https://github.com/radiarkazemi/forge-charts/raw/cursor/trh-mt5-abc-992e/mt5/TRH_Trading_Room_Hunter_MT5.zip)
4. Copy Engine+Indicator → `MQL5/Indicators/TRH_Trading_Room_Hunter/`
5. Copy Engine+EA → `MQL5/Experts/TRH_Trading_Room_Hunter/`
6. Compile both in MetaEditor · re-attach
7. Panel must say **`TRH v233 · Eng231 · Q-FVG`**
8. EA Comment must say **`TRH EA v3.38 Eng231`**

If inputs still show Min FVG = 0.12, click **Reset** on inputs (MT5 remembers old defaults).

## Smart EA fill (v3.38)

- Far from ENTRY → market now · Near → pending @ ENTRY
- Session filter OFF · Adopt age 20 · BE OFF by default
- Chart Comment shows block reason when not trading
