# NABZ Quantum v2 — Obsidian Gold

MetaTrader 5 Expert Advisor: trade panel, risk engine, prop live analysis, journal, sessions, news, chart tools.

## Install (one file)

Copy **only** this file:

```
mt5/NABZ_Quantum/NABZ_Quantum.mq5
```

into:

```
<MT5 Data Folder>/MQL5/Experts/NABZ_Quantum.mq5
```

Then in MetaEditor: open it → **Compile (F7)** → attach to a chart with **Algo Trading** on.

No `Include` folder. No extra `.mqh` files. One file is enough.

(Terminal → **File → Open Data Folder** to find `MQL5/Experts/`.)

## Optional modular sources

For development, headers also live under `Include/NABZ_Quantum/` and a copy under `Experts/`.  
**Traders should use the single-file `NABZ_Quantum.mq5` at the package root.**

## Features

| Area | Details |
|------|---------|
| Risk engine | `%` · `$` · `LOT` · `BAL` |
| Execution | BUY/SELL, pending, DRAG, SOS, CLOSE ALL, RISK FREE, … |
| Prop live | Total/Daily DD, Target, Floating risk |
| Journal | WEEK/MONTH stats + curve |
| Sessions / News / Settings / Coach / % | as in the panel |
| Chart | Candle timer, DRAG SL/TP/RR box |

## Notes

- Places and manages trades — test on demo first.
- Design preview: `preview/nabz-ui-preview.html`
