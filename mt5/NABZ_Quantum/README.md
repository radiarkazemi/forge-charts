# NABZ Quantum v2.1 — Obsidian Gold

Roomier panel, minimize/expand, responsive width, candle countdown in the **header** (no floating chart timer glitch).

## Install (one file)

Copy:

```
mt5/NABZ_Quantum/NABZ_Quantum.mq5
```

→ `MQL5/Experts/NABZ_Quantum.mq5` → Compile (F7) → attach to chart.

Remove any old chart objects named `NABZ2_timer_*` if a leftover yellow timer remains (or re-attach the EA).

## UI tips

| Control | Action |
|---------|--------|
| **—** (header) | Minimize panel to a slim bar |
| **▢** (mini bar) | Expand panel again |
| Header **mm:ss** | Candle countdown (Settings → Header Timer) |
| Inputs → **Start minimized** | Attach collapsed |

Panel width scales with chart size (~28% width, 300–380px).

## Notes

- Demo first — places/manages trades.
- Modular sources: `Include/NABZ_Quantum/` (for development).
- Preview: `preview/nabz-ui-preview.html`
