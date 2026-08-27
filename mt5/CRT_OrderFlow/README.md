# CRT OrderFlow (standalone)

Candle Range Theory entry model extracted from the strategy breakdown:

1. **≥ 2 CRT models** in the same direction → **bias**
2. **HTF FVG** forms → **Area of Interest**
3. **New CRT** confirms **inside** that FVG → **entry**

> RunRox indicators were only tools that visualize parts of this model.  
> This package is **not** a RunRox product and is separate from TRH / ICT Liquidity Expansion.

## MT5

```
mt5/CRT_OrderFlow/
  CRT_Engine.mqh
  CRT_OrderFlow.mq5      # indicator
  CRT_AutoTrade.mq5      # EA
```

Install Engine beside each `.mq5`, Compile, attach to chart.  
Pine Auto HTF: **M1→M5**, M5→M15, M15→H1. AOI mitigated on **close only** so 1m wicks do not wipe the blue HTF box.
MT5 default HTF FVG = **M15** (set to M5 when trading M1).

Zip: https://goldanil.ir/crt-mt5/CRT_OrderFlow_MT5.zip

## TradingView Pine

`indicators/CRT_OrderFlow.pine` — paste into Pine Editor → Add to chart.

## Defaults

| Rule | Default |
|------|---------|
| Min CRT bias | 2 |
| HTF FVG | M15 |
| CRT must touch HTF FVG | yes |
| RR | 2.5 |
| Closed-bar only | yes |
