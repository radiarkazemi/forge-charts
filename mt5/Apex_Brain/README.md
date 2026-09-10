# Apex Brain

Unique MetaTrader 5 + web dashboard platform.

## Thesis

`RAID → SHIFT → POCKET → CONFIRM → STRIKE`

- Recognizes liquidity raids and structure shifts
- Maps origin supply/demand pockets
- Scores and confirms quality
- Enters only when armed + price touches ENTRY
- Fixed **1:3 R:R**, risk-% sizing, daily loss lock, BE at +1R

## Quick start

```bash
# Web cockpit
npm run apex:watch
# → http://127.0.0.1:8787/apex.html
```

MT5: compile `mt5/Apex_Brain/Apex_AutoTrade.mq5` + `Apex_Chart.mq5`, allow WebRequest to `http://127.0.0.1:8787`.

Full install notes: `packs/Apex_Complete_Pack/README.md`
