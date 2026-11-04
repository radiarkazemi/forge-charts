# NABZ Quantum v2 — Obsidian Gold

MetaTrader 5 Expert Advisor: one-click trade panel, risk engine, prop-firm live analysis, trading journal, session boxes, economic news, and chart tools.

UI direction vs the reference panels: **Obsidian Gold** — deep charcoal glass, molten-gold accents, teal / crimson execution, cyan prop telemetry, gold rail + soft glow frames.

## Install

1. Copy the whole folder `NABZ_Quantum/` into `MQL5/Experts/NABZ_Quantum/`
2. Open `NABZ_Quantum.mq5` in MetaEditor → **Compile** (F7)
3. Attach to a chart · enable **Algo Trading**
4. Allow WebRequest / calendar if the terminal prompts for economic news

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
| **Settings** | RISK · Account · NEWS · MANAGE · ALERT (auto BE, auto R:R, partials, M1 block, 15m pause, timer, RR live) |
| **Coach / %** | Discipline tips · equity % calculator |
| **Chart** | Candle timer · DRAG SL/TP/RR box with live labels |

## Hot workflow

1. Set risk mode + value  
2. Optional: **DRAG** → move Entry / SL / TP lines → **BUY** or **SELL**  
3. **RISK FREE** once price pays you  
4. **JOU** for the week journal · **SESS** to toggle session boxes · **Sett** for automation  

## Files

```
mt5/NABZ_Quantum/
├─ NABZ_Quantum.mq5   # Expert entry
├─ NabzTheme.mqh      # Obsidian Gold tokens + layout
├─ NabzUI.mqh         # Panel / journal / settings drawing + hits
├─ NabzRisk.mqh       # Lot sizing
├─ NabzTrade.mqh      # CTrade helpers
├─ NabzProp.mqh       # Drawdown / target telemetry
├─ NabzJournal.mqh    # History analytics
├─ NabzSessions.mqh   # Session rectangles
├─ NabzNews.mqh       # Calendar feed
└─ README.md
```

## Notes

- Does place and manage trades — use on demo first.  
- Prop metrics are **display / soft alerts**, not a hard lockout (except optional 15-min pause after loss).  
- Calendar events depend on the broker / MetaQuotes calendar availability.  
- Brand: NABZ · built for Forge Charts.
