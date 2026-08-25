# TRH | Trading Room Hunter

Pine Script built from the **real XAUUSD sample**: Tue 25 Aug 2026 **04:19 UTC-4**.

## Real sample geometry (FxPro)

| Level | Price | Meaning |
|---|---|---|
| SL | **4620.23** | Just under sweep low (04:09 ≈ 4620.26) |
| ENTRY | **4627.84** | Mid of room (sweep low → base high ≈ 4634) |
| TP | **4645.99** | ~2.39R / liquidity high (04:24 ≈ 4645.96) |

## Model (not the old noisy impulse)

1. Large selloff/rally into a **major pivot**
2. **Sweep** that pivot + reclaim close
3. Build base for ≥ N bars → room = sweep extreme ↔ base extreme
4. **ENTRY = mid-room**, **SL = distal ± pad**, **TP = R:R (default 2.4)** or next opposing pivot
5. Set & Forget: if price already traded the mid during the base, count as filled

The fake “IMPULSE · SL HIT” at 4622 is removed — that was wrong post-spike logic.

## Install

1. Remove old TRH from the chart  
2. Paste `TRH_Trading_Room_Hunter.pine` → Add to chart  
3. XAUUSD **1m**, replay **04:00–04:30 UTC-4** on 25 Aug 2026  

## Defaults

- Pivot `5` · Context `1.2 ATR` · Base bars `8`  
- Room width `0.8–3.5 ATR` · R:R **`2.4`** · SL pad `0.02 ATR`  
- Only last setup ON  

## Alerts (desktop + mobile)

### Best — full ENTRY / SL / TP in the push

1. XAUUSD chart with TRH → click **Alarm clock**
2. **Condition:** `TRH | Trading Room Hunter` → **Any alert() function call**
3. **Notifications:** enable **Notify on app**, **Show popup**, **Play sound**
4. **Expiration:** Open-ended → **Create**

Example push:

```
XAUUSD 1 | TRH LONG SETUP
ENTRY 4627.84
SL 4620.23
TP 4645.99
```

### Or pick a condition

- **🔔 TRH New Setup (Any)** — new hunt (long or short)
- **🔔 TRH New LONG Setup** / **🔔 TRH New SHORT Setup**
- Entry fill · TP hit · SL hit

### Mobile

Install TradingView app, same login as desktop, allow notifications in phone settings. Alerts sync automatically.

Educational tool — not financial advice.
