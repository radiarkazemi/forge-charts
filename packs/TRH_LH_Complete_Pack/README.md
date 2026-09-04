# TRH + LH Complete Pack

One folder with the **latest** MetaTrader 5 bots and TradingView Pine scripts.

| Product | MT5 indicator | MT5 EA | Magic | What it trades |
|---------|---------------|--------|-------|----------------|
| **TRH · Trading Room Hunter** | **v2.36** / Eng **234** | **v3.52** | `260825` | Mode A sweep + Mode B FVG |
| **LH · Liquidity Hunter** | v1.21 / Eng **121** | **v1.21** | `270827` | RAID → CISD → MSS → FVG |
| **TRH · Expansion Hunter** | — | — | — | TradingView strategy only |

## Confirm you installed the right build

After compile + attach:

- TRH chart comment / panel → **EA v3.52** · indicator **v236 Eng234**
- LH panel → **v121** (not v120)

If you still see **v2.33 / v3.50 / v3.51**, delete the old `.ex5`, recompile, reattach.

### Mode B missing on MT5 (fixed in v236)
Old engines **dropped Mode B** when Mode A fired inside cooldown. TradingView kept both.  
v236 **keeps Mode B** so TV shorts like ENTRY 4473.60 / SL 4476.25 / TP 4467.25 can appear on MT5.

---

## MetaTrader 5 install

Keep **TRH** and **LH** in **separate folders**. Each needs its own `.mqh` next to the `.mq5`.

1. In MT5: **File → Open Data Folder → `MQL5`**
2. Copy folders:

```
MQL5/Indicators/TRH_Trading_Room_Hunter/   ← 3 TRH files (Engine + indicator + you can keep EA out)
MQL5/Experts/TRH_Trading_Room_Hunter/      ← TRH_Engine.mqh + TRH_AutoTrade.mq5
MQL5/Indicators/LH_Liquidity_Hunter/       ← LH_Engine.mqh + LH_Liquidity_Hunter.mq5
MQL5/Experts/LH_Liquidity_Hunter/          ← LH_Engine.mqh + LH_AutoTrade.mq5
```

Simplest: copy **each product folder as-is** into **both** `Indicators` and `Experts`, then compile the matching file.

3. In MetaEditor (F4): open each `.mq5` → **Compile (F7)**  
   Both the indicator and the EA must compile with **0 errors**.
4. Remove old TRH/LH from the chart first.
5. Attach **indicator** to GOLD M1 (or M5).
6. Attach **EA** on a **separate chart** of the same symbol (one EA per chart).  
   Enable **Algo Trading**.

### Running TRH + LH together

Yes — two charts, one EA each. Magics differ (`260825` vs `270827`).  
Watch opposite signals and stacked risk. Do not attach two EAs to the same chart.

### TRH EA v3.51 (important)

On pullback from TP2 the EA **only touches the same ticket**:

- moves **SL to the first TP line**, or
- `PositionClose` that ticket if price already came back through TP1

It does **not** open a new Buy/Sell to “close”. That v3.50 bug stacked positions.

### LH v1.21 (important)

Does **not** freeze GOLD M1. Scan last 2500 bars. Draw on new bar only.

---

## TradingView install

Pine Editor → paste the file → **Add to chart**.

| File | Type | Use |
|------|------|-----|
| `TradingView/TRH_Trading_Room_Hunter.pine` | indicator | Classic TRH sweep / FVG |
| `TradingView/LH_Liquidity_Hunter.pine` | indicator | Exact LH path |
| `TradingView/TRH_Expansion_Hunter.pine` | **strategy** | Expansion legs (8pt+ risk, 4–6R). **Reset inputs.** |

---

## Files in this pack

```
MT5/TRH_Trading_Room_Hunter/
  TRH_Engine.mqh
  TRH_Trading_Room_Hunter.mq5
  TRH_AutoTrade.mq5
MT5/LH_Liquidity_Hunter/
  LH_Engine.mqh
  LH_Liquidity_Hunter.mq5
  LH_AutoTrade.mq5
TradingView/
  TRH_Trading_Room_Hunter.pine
  LH_Liquidity_Hunter.pine
  TRH_Expansion_Hunter.pine
  TRH_Expansion_Hunter.md
```
