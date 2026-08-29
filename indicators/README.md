# TradingView Pine — models

| # | Model | Status | File | Raw |
|---|-------|--------|------|-----|
| 1 | **TRH** (Modes A/B/C) | active | `TRH_Trading_Room_Hunter.pine` | below |
| 2 | **ICT** Liquidity Expansion | **parked** | `ICT_Liquidity_Expansion.pine` | — |
| 3 | **CRT** OrderFlow | active · exact source model | `CRT_OrderFlow.pine` | below |

Paste into Pine Editor → Add to chart.

## #3 CRT OrderFlow — exact source sequence

From the STRATEGY / Instagram Jul 29 graphics:

1. **Structure** (swing high / low)
2. **BOS** (break of structure)
3. **FVG** = Area of Interest after the break (MTF: 15m / 30m / 1H)
4. **CRT Bias** = ≥N CRT models same direction into that FVG (numbered dots)
5. **Entry** on CRT confirm inside FVG → delivery (SL beyond sweep, TP structure / R:R)

## RunRox on the source images (viz tools only)

The Jul 29 charts used **RunRox** invite-only overlays to *draw* structure pieces. They are **not** the strategy and this repo does **not** ship RunRox code.

| Overlay seen on images | What it is | Role vs CRT OrderFlow |
|------------------------|------------|------------------------|
| **MTF FVG / Advanced SMC HTF FVG** | RunRox [Advanced SMC](https://runrox.com/advanced_smc) multi-TF FVG boxes (e.g. 15m/30m/1H on LTF) | Our Pine rebuilds the same *idea*: MTF FVG AOI after BOS |
| **RunRox Entry Model** | [Entry Model](https://www.tradingview.com/script/fGLb404v-RunRox-Entry-Model/) — M1/M2/M3 reverse zones, HTF candles, entry areas | Separate product; dots/zones on images are *their* entry models, not CRT Bias |

Vendor: [runrox.com](https://runrox.com/) · invite-only via TradingView.  
**CRT OrderFlow** here = Structure → BOS → FVG AOI → CRT Bias → entry (strategy logic only).

## Defaults

**Only Last Setup**, fill markers on, panel on. CRT: min bias ≥2, MTF FVG AOI on, close-only FVG mitigate.
