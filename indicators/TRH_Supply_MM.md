# TRH LQ Fractal — Liquidity Under Construction

Pine indicator for the **Naeem / نقدینگی در حال ساخت** model.

## Idea

We trade **liquidity being built**. That liquidity later becomes the pool that sweeps everyone into the correct zone. Same pattern repeats nested across fractals (کون‌پشته‌کون).

## Bias

From **4H + Daily** (fast stack) or **Daily + Monthly** (slow stack) → buyer or seller. Setups only fire with bias (optional toggle).

## Fractal stacks

| Stack | Entry chart | Structure | Bias | Macro |
|-------|-------------|-----------|------|-------|
| **1 — 15 — 4H — W** | attach on **1m** | 15m context | 4H | Weekly |
| **5 — 1H — D — MN** | attach on **5m** | 1H context | Daily | Monthly |

## Paths

| Path | Sequence |
|------|----------|
| **A Fresh Zone** | MSS → New Fresh Zone (OB) → leave → LQ equal hi/lo build → sweep into proximal → **E / S** |
| **B BB + FVG** | Break + FVG zone → LQ build → sweep into zone |
| **C fs** | In-bias continuation: sweep prior swing (`fs`) → reclaim → continue |

**E** = proximal edge · **S** = distal (+ pad) · **TP** prefers yesterday high/low (ERL) else RR.

## Install

1. Open [raw Pine](https://raw.githubusercontent.com/radiarkazemi/forge-charts/cursor/trh-supply-mm-992e/indicators/TRH_Supply_MM.pine)
2. TradingView → Pine Editor → paste → Add to chart on **1m** (or **5m** for slow stack)
3. Pick Active Stack in settings

## Alerts

- `LQ Short` / `LQ Long`
- `MSS Short` / `MSS Long`
