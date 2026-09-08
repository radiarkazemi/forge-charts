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

**Mid-trade lock:** TP snapshots when HUNT starts (leave). First return to ENTRY freezes ENTRY/SL/TP (even C-grade). Theme rails and structure TP cannot rewrite a live/active setup. MT5 EA keeps adopted levels locked.

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
