# NABZ Quantum v2 — Obsidian Gold

MetaTrader 5 Expert Advisor: one-click trade panel, risk engine, prop-firm live analysis, trading journal, session boxes, economic news, and chart tools.

UI direction: **Obsidian Gold** — deep charcoal glass, molten-gold accents, teal / crimson execution, cyan prop telemetry.

## Install (important)

MetaEditor resolves `#include <…>` from `MQL5/Include/`. Copy **both** trees:

```
mt5/NABZ_Quantum/Experts/NABZ_Quantum.mq5
        →  <Data Folder>/MQL5/Experts/NABZ_Quantum.mq5

mt5/NABZ_Quantum/Include/NABZ_Quantum/*.mqh
        →  <Data Folder>/MQL5/Include/NABZ_Quantum/
```

Steps:

1. In MT5: **File → Open Data Folder**
2. Copy `NABZ_Quantum.mq5` into `MQL5/Experts/`
3. Copy the whole `NABZ_Quantum` folder (with all `.mqh` files) into `MQL5/Include/`
4. MetaEditor → open `Experts/NABZ_Quantum.mq5` → **Compile** (F7)
5. Attach to a chart · enable **Algo Trading**

You should end up with:

```
MQL5/
├─ Experts/
│  └─ NABZ_Quantum.mq5
└─ Include/
   └─ NABZ_Quantum/
      ├─ NabzUI.mqh
      ├─ NabzTheme.mqh
      ├─ NabzRisk.mqh
      ├─ NabzTrade.mqh
      ├─ NabzProp.mqh
      ├─ NabzJournal.mqh
      ├─ NabzSessions.mqh
      └─ NabzNews.mqh
```

If you only copy the `.mq5` into Experts, compile fails with `NabzUI.mqh not found`.

## Modules

| Area | What you get |
|------|----------------|
| **Risk engine** | `%` · `$` · `LOT` · `BAL` sizing from SL distance |
| **Execution** | BUY / SELL · Pending · DRAG plan lines · CancelP · ACTIVE · SOS · CLOSE ALL · Save Pos · RISK FREE |
| **Positions** | Live list with risk % · P/L % · per-ticket R / ✕ |
| **Prop live** | Total DD · Daily DD · Target progress · Floating risk |
| **News** | Today’s economic calendar strip (MT5 Calendar API) |
| **Journal** | WEEK / MONTH · day chips · WR · PF · streaks · best session · balance curve |
| **Sessions** | ASIA / LON / NY range boxes on chart |
| **Settings** | RISK · Account · NEWS · MANAGE · ALERT |
| **Chart** | Candle timer · DRAG SL/TP/RR box with live labels |

## Notes

- Does place and manage trades — use on demo first.
- Prop metrics are display / soft alerts (optional 15-min pause after loss).
- Calendar events depend on broker / MetaQuotes calendar availability.
- Design preview: `preview/nabz-ui-preview.html`
