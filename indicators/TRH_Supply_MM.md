# TRH Supply MM Pack + Clean Score + MT5 AutoTrade

Five setups on TradingView **and** a full MT5 Expert Advisor with smart autotrade.

## TradingView

| Setup | Trigger |
|-------|---------|
| 1 MM | Disp → OB/FVG |
| 2 MSS | Fresh zone retest |
| 3 HTF+LQ | Fresh + LQ sweep |
| 4 BB+FVG | Sweep → MSS → BB∩FVG |
| 5 fs | Fractal sweep |

Clean score A/B/C/D · Forge UI · auto-expire.

**S1 tight MM:** last opposing candle before displacement → ENTRY=proximal · SL=distal of that pocket (e.g. 4396.69 / 4398.46). Min zone height default 1.0.

**Teaching setups on the theme TF:** S1 MM rail · **S2/S3 LQ→MSS→Fresh Supply/Demand retest** (shared across 1m/5m/15m).

**Cross-TF (Auto/Fixed):** 1m/5m/15m share **one** theme rail (default 5m). With **One Setup Across Aligned TFs** ON, local S1–S5 births are suppressed — every aligned chart shows the same ENTRY/SL/TP.

**Mid-trade lock:** theme rail freezes ENTRY/SL/TP at birth (shared theme-TF TP). Levels do not rewrite while the rail is live.

**Raw:** https://raw.githubusercontent.com/radiarkazemi/forge-charts/cursor/trh-supply-mm-992e/indicators/TRH_Supply_MM.pine

## MT5 (entire pack)

```
mt5/TRH_Supply_MM/
  SMM_Engine.mqh                 # S1–S5 + score + arm
  TRH_Supply_MM.mq5              # chart indicator
  TRH_Supply_MM_AutoTrade.mq5    # smart EA
  README.md
```

Also mirrored under `packs/TRH_Supply_MM_Complete_Pack/`.

**Smart EA:** armed B+ only · prefer A · far=market / near=pending · LIVE SL = structural distal (widen-only) · magic `290825`.

See `mt5/TRH_Supply_MM/README.md` for install.
