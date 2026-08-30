# CRT OrderFlow (standalone)

Exact STRATEGY Instagram Jul 29 model:

1. **CRT Bias** — HH/HL (bull) or LH/LL (bear)
2. **Structure** — swing broken (blue dashed BOS)
3. **CRT Model** — green HL/LH after BOS, stacked ≥2 for bias
4. **FVG AOI** — higher-TF FVG (rule 2)
5. **Entry** — new CRT inside FVG AOI (rule 3)

> **RunRox** on the source images = visualization / finder only  
> (MTF FVG via Advanced SMC, Entry Model M1 dots).  
> This package is **not** a RunRox product. ICT Liquidity Expansion is parked.

## MT5

```
mt5/CRT_OrderFlow/
  CRT_Engine.mqh
  CRT_OrderFlow.mq5      # indicator
  CRT_AutoTrade.mq5      # EA
```

Install Engine beside each `.mq5`, Compile, attach to chart.  
Pine default CRT detection = **Diagram HL/LH after BOS** (matches source green levels).  
MT5 engine currently uses classic candle CRT for model marks + HTF FVG AOI + bias ≥2 + CRT-in-FVG (same 3 rules).  
AOI mitigated on **close only** so 1m wicks do not wipe HTF boxes.  
MT5 default HTF FVG = **M15** (set to M5 when trading M1).

Zip: https://goldanil.ir/crt-mt5/CRT_OrderFlow_MT5.zip

## TradingView Pine

`indicators/CRT_OrderFlow.pine` — paste into Pine Editor → Add to chart.

Raw: `https://raw.githubusercontent.com/radiarkazemi/forge-charts/cursor/crt-exact-model-992e/indicators/CRT_OrderFlow.pine`

## Defaults

| Rule | Default |
|------|---------|
| Min CRT bias | 2 |
| FVG AOI | MTF 15m+30m+1H (Pine) / M15 (MT5) |
| CRT must touch FVG | yes |
| BOS before FVG (Pine) | yes |
| RR | 2.5 |
| Closed-bar only | yes |
