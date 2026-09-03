# TRH | Expansion Hunter

Trades the **expansion legs** you drew — not tiny late FVG chops.

## Goal setup (your screenshots)

| | Example 1 | Example 2 |
|--|--|--|
| Entry | ~4337 (base of expansion) | ~4397 (base of next leg) |
| SL | ~4327 under raid (~10pts) | ~4387 under raid (~10pts) |
| TP | ~4397 opposing high (~6R) | ~4440 opposing high (~4R) |

## Model

```
1 RAID (SSL/BSL sweep)
  → 2 CISD (delivery flip)
  → 3 MSS / strong displacement
  → ENTRY at expansion BASE (CISD inside FVG, else FVG base)
  → SL beyond raid extreme
  → TP at opposing liquidity (min 2R, allows 4–6R)
```

## Defaults

- Strong displacement body `0.70 ATR`
- SL pad beyond raid `0.15 ATR`
- Max risk `1.60 ATR` (rejects huge hunted stops)
- Min RR `2.0` · Fallback RR `4.0` if no liquidity pivot
- Opposing liquidity TP **ON**

## Install

Paste into Pine Editor → Add to chart as **strategy** · XAUUSD M1/M5.
