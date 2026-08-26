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
3. **HUNT (default):** on that same bar, arm ENTRY/SL/TP from an ATR-projected room and alert **PLACE LIMIT** — do not wait for a base that leaves you LATE
4. If price already chased past ENTRY by > `maxLateR` → **LATE / skip**
5. Legacy (Hunt OFF): wait for base bars + room width (can be late on V-reversals)

## Install

1. Remove any older TRH from the chart  
2. Paste [`TRH_Trading_Room_Hunter.pine`](./TRH_Trading_Room_Hunter.pine) → Add to chart  
3. XAUUSD **1m** · leave **Hunt On Sweep = ON**

**Raw link:** https://raw.githubusercontent.com/radiarkazemi/forge-charts/cursor/trh-pinescript-indicator-992e/indicators/TRH_Trading_Room_Hunter.pine

## Defaults

- **Hunt On Sweep ON** · Projected room `1.2 ATR`  
- Pivot `5` · Context `1.2 ATR` · R:R **`2.4`** · Max late `0.35R`  

## Alerts

- `TRH HUNT … PLACE LIMIT` — sweep just printed; levels ready  
- `TRH LATE` — too far past ENTRY; do not chase  
- Phone alerts use the same hunt engine → [`FREE-ALERTS.md`](./FREE-ALERTS.md)
