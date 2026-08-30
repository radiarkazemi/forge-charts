# TradingView Pine — models

| # | Model | Status | File | Raw |
|---|-------|--------|------|-----|
| 1 | **TRH** (Modes A/B/C) | active | `TRH_Trading_Room_Hunter.pine` | below |
| 2 | **ICT** Liquidity Expansion | **parked** | `ICT_Liquidity_Expansion.pine` | — |
| 3 | **CRT** OrderFlow | active · exact STRATEGY source | `CRT_OrderFlow.pine` | below |

Paste into Pine Editor → Add to chart.

## #3 CRT OrderFlow — exact STRATEGY Jul 29 model

From the Instagram STRATEGY graphics:

1. **CRT Bias** — HH/HL (bull) or LH/LL (bear)
2. **Structure** — swing high/low broken (blue dashed BOS)
3. **CRT Model** — green HL/LH after each BOS, numbered **1 / 2 / 3** (bias stack)
4. **FVG AOI** — higher-TF fair value gap (15m / 30m / 1H on LTF)
5. **Entry** — new CRT Model forms **inside** FVG → delivery (SL beyond sweep, TP structure / R:R)

### 3 Rules (source slide)

1. At least two CRT models in the same direction  
2. FVG must form on a higher timeframe  
3. New CRT model forms inside the area of interest (FVG)

Default CRT detection = **Diagram HL/LH after BOS** (matches green levels on the graphics). Classic candle CRT is optional.

## RunRox on the source images (finder tools only)

The Jul 29 charts used **RunRox** invite-only overlays to *find/draw* CRT and FVG pieces. They **do not** define this strategy and this repo does **not** ship RunRox code.

| Overlay on images | What it is | Role vs CRT OrderFlow |
|-------------------|------------|------------------------|
| **MTF FVG [RunRox]** / Advanced SMC HTF FVG | [Advanced SMC](https://runrox.com/advanced_smc) multi-TF FVG boxes (15m/30m/1H) | We rebuild the same *job*: MTF FVG AOI after BOS |
| **RunRox Entry Model** | [Entry Model](https://www.tradingview.com/script/fGLb404v-RunRox-Entry-Model/) — M1/M2/M3 reverse zones | Separate product; M1 dots on images are *their* marks, not our CRT Bias numbers |

Vendor: [runrox.com](https://runrox.com/) · invite-only via TradingView.  
**CRT OrderFlow** here = Bias → Structure BOS → CRT Model → HTF FVG → entry.

## Defaults

**Only Last Setup**, fill markers on, panel on. Min bias ≥2, MTF FVG 15/30/1H, CRT must touch FVG, close-only FVG mitigate.

## Raw links

After push, use GitHub raw for the branch file, e.g.:

- CRT: `https://raw.githubusercontent.com/radiarkazemi/forge-charts/cursor/crt-exact-model-992e/indicators/CRT_OrderFlow.pine`
- TRH: `https://raw.githubusercontent.com/radiarkazemi/forge-charts/master/indicators/TRH_Trading_Room_Hunter.pine`
