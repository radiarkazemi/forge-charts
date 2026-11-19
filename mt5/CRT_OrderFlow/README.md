# CRT OrderFlow (standalone)

Exact source model (STRATEGY / Instagram Jul 29):

1. **Structure** (swing high/low)
2. **BOS** (break of structure)
3. **FVG** = Area of Interest after the break
4. **CRT Bias** = ≥N CRT models same direction into that FVG
5. **Entry** on CRT confirm inside FVG → delivery

> **RunRox** on the source images = visualization only (MTF FVG via Advanced SMC, Entry Model dots/zones).  
> This package is **not** a RunRox product. ICT Liquidity Expansion is parked.

## MT5

```
mt5/CRT_OrderFlow/
  CRT_Engine.mqh
  CRT_OrderFlow.mq5      # indicator
  CRT_AutoTrade.mq5      # EA
```

Install Engine beside each `.mq5`, Compile, attach to chart.  
Pine matches exact sequence with MTF FVG (15/30/60). AOI mitigated on **close only** so 1m wicks do not wipe HTF boxes.
MT5 default HTF FVG = **M15** (set to M5 when trading M1).

Zip: https://goldanil.ir/crt-mt5/CRT_OrderFlow_MT5.zip

## TradingView Pine

`indicators/CRT_OrderFlow.pine` — paste into Pine Editor → Add to chart.

Raw (after push): see PR / `indicators/README.md`.

## Defaults

| Rule | Default |
|------|---------|
| Min CRT bias | 2 |
| FVG AOI | MTF 15m+30m+1H (Pine) / M15 (MT5) |
| CRT must touch FVG | yes |
| BOS before FVG (Pine) | yes |
| RR | 2.5 |
| Closed-bar only | yes |
