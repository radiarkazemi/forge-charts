# TRH | Trading Room Hunter

Classic **SWEEP** model from the real XAUUSD sample: Tue 25 Aug 2026 **04:19 UTC-4**.

## Sample geometry (FxPro)

| Level | Price | Meaning |
|---|---|---|
| SL | **4620.23** | Just under sweep low |
| ENTRY | **4627.84** | Mid of room (sweep low → base high) |
| TP | **4645.99** | ~2.39R / opposing liquidity |

## Model

1. Large selloff/rally into a **major pivot**
2. **Sweep** that pivot + reclaim close
3. Build base for ≥ N bars → room = sweep extreme ↔ base extreme
4. **ENTRY = mid-room**, **SL = distal ± pad**, **TP = R:R (default 2.4)** or next opposing pivot

## Install

1. Remove any older TRH from the chart  
2. Paste [`TRH_Trading_Room_Hunter.pine`](./TRH_Trading_Room_Hunter.pine) → Add to chart  
3. XAUUSD **1m**

**Raw link (classic SWEEP):** https://raw.githubusercontent.com/radiarkazemi/forge-charts/cursor/trh-pinescript-indicator-992e/indicators/TRH_Trading_Room_Hunter.pine

## Defaults

- Pivot `5` · Context `1.2 ATR` · Base bars `8`  
- Room width `0.8–3.5 ATR` · R:R **`2.4`** · SL pad `0.02 ATR`  
- Only last setup ON  

## Alerts

TradingView chart alerts need a paid plan.  
Free phone push → [`FREE-ALERTS.md`](./FREE-ALERTS.md)
