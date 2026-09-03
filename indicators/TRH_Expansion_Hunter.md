# TRH | Expansion Hunter

Trades the **expansion legs** you drew — not micro 0.5–1pt boxes.

## Why old positions looked wrong

Entry sat on the raid low → risk ~0.4–0.8 → a “6R” TP was only ~5pts.  
Those scalps are **not** the goal setups.

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
  → ENTRY at expansion BASE (only if risk ≥ min)
  → SL beyond raid extreme
  → TP at opposing liquidity (min 2R, allows 4–6R)
```

## Defaults (anti-micro)

- Min risk **8.0 price** and **0.80 ATR** — reject thinner structure
- Max risk **18 price** / **1.80 ATR**
- Limit entry at base (boxes match fill)
- Fallback RR **4.0** · opposing liquidity TP ON

## Install

Paste into Pine Editor → Add to chart as **strategy** · XAUUSD M1/M5 · **reset inputs**.
