# NABZ Quantum v2.5 — Obsidian Gold

## Download

https://raw.githubusercontent.com/radiarkazemi/forge-charts/cursor/nabz-quantum-ea-390d/mt5/NABZ_Quantum/NABZ_Quantum.mq5

Copy → `MQL5/Experts/NABZ_Quantum.mq5` → Compile (F7) → **remove old EA from chart** → attach again. Header must show **v2.5.0**.

## What’s new in 2.5

| Fix | Detail |
|-----|--------|
| Sticky **MOVE** | Click **MOVE** → move mouse → click **DROP** or empty chart to lock |
| Chart pan no longer glitches | UI is not wiped on scroll/pan; chart scroll locked while moving panel |
| Fits above terminal bars | Input `Bottom reserve` (default 160px) |

## Features

| Feature | How |
|---------|-----|
| Minimize | **—** in header / **▢** on mini bar |
| Save Profit | Per-position **$** or **Save Pos** → popup `0.25` / `0.50` / `0.75` / `CLOSE` |
| Risk Free | Per-position **R** or global **RISK FREE** |
| Close one | Per-position **✕** |
| R:R on panel | `−` value `+` + Auto R:R |
| Auto Risk Free | Settings → MANAGE → cycles **OFF / R1 / R2 / R3** |
| Sessions | Settings → **SESS**: hours, border/fill, on/off |
| Journal | **JOU** week/month stats + curve |

## Tips

- Short charts auto-hide the news strip so the panel stays above the toolbox.
- Demo first — this EA places and manages trades.
