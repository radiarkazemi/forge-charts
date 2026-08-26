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
2. **Sweep** that pivot + reclaim close → early **WATCH** alert
3. Build base for ≥ N bars → room = sweep extreme ↔ base extreme
4. **ARM mid-room ENTRY as soon as room width is valid** (default — do not wait for top micro-break)
5. If price already chased past ENTRY by > `maxLateR` (default 0.35R) → mark **LATE / skip** (no fake fill)

## Install

1. Remove any older TRH from the chart  
2. Paste [`TRH_Trading_Room_Hunter.pine`](./TRH_Trading_Room_Hunter.pine) → Add to chart  
3. XAUUSD **1m**

**Raw link:** https://raw.githubusercontent.com/radiarkazemi/forge-charts/master/indicators/TRH_Trading_Room_Hunter.pine

## Defaults

- Pivot `5` · Context `1.2 ATR` · Base bars `8`  
- Room width `0.8–3.5 ATR` · R:R **`2.4`** · SL pad `0.02 ATR`  
- **Wait for impulse = OFF** (earlier arm) · **Max late = 0.35R**  
- Only last setup ON  

## Alerts

- `TRH WATCH` — sweep just happened, room building (place limit soon)  
- `TRH room ARMED` — mid-room ENTRY/SL/TP ready  
- `TRH LATE` — primary already gone; do not chase  
- TradingView chart alerts need a paid plan. Free phone push → [`FREE-ALERTS.md`](./FREE-ALERTS.md)  
  Phone alerts also skip LATE setups.
