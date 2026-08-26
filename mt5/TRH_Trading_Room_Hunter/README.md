# TRH on MetaTrader 5 — detect first, trade later

Same classic **SWEEP** model as the TradingView Pine script and the Node alert engine.
Goal: prove MT5 finds the same ENTRY / SL / TP, then turn on autotrade.

```
mt5/TRH_Trading_Room_Hunter/
  TRH_Engine.mqh                 shared detector (Pine parity)
  TRH_Trading_Room_Hunter.mq5    indicator — draw + alert only
  TRH_AutoTrade.mq5              EA — AutoTrade OFF by default
  README.md
```

## Why MT5 (not TradingView)

TradingView does not allow real order automation on your broker.
MT5 can detect the setup on the bar it confirms and place the order immediately.

## Phase 1 — Install & validate (required)

1. Copy this folder into MT5:
   `File → Open Data Folder → MQL5 → Indicators →`  
   put `TRH_Trading_Room_Hunter.mq5` + `TRH_Engine.mqh` here  
   (or keep them in one subfolder and compile from there).
2. In MetaEditor: open `TRH_Trading_Room_Hunter.mq5` → **Compile** (F7). Fix path if `#include "TRH_Engine.mqh"` fails (engine must sit next to the `.mq5`).
3. Chart: same symbol/TF as TradingView, e.g. **FxPro XAUUSD M1**.
4. Attach indicator. Defaults match Pine (Pivot 5, base 8, RR 2.4, …).
5. Compare the last setup on MT5 vs TradingView:

| Field | Must match closely |
|-------|--------------------|
| Direction | LONG / SHORT |
| ENTRY | mid-room |
| SL | past distal (+ pad) |
| TP | ~2.4R or opposing liquidity |
| Bar time | same confirmation minute |

Broker price feed offsets (e.g. Yahoo vs FxPro ~tens of points) will shift absolute numbers; **geometry and bar time** should still align on the **same broker chart** as TV if TV is on that broker feed. Prefer TradingView symbol that matches your MT5 broker.

6. When a new setup prints, MT5 shows Comment + optional Alert with ENTRY/SL/TP. Log those and screenshot both platforms.

**Do not enable autotrade until several setups match.**

## Phase 2 — EA (still safe by default)

1. Copy `TRH_AutoTrade.mq5` + `TRH_Engine.mqh` to `MQL5/Experts/` (same folder together).
2. Compile `TRH_AutoTrade.mq5`.
3. Attach to the same chart. Leave **`Enable live trading = false`**.
4. On each new setup the EA alerts and prints what it *would* have traded.
5. After Phase 1 matches look good:
   - Enable **Algo Trading** in MT5 toolbar
   - Allow live trading in EA inputs: **`InpAutoTrade = true`**
   - Start with small **`InpRiskPercent`** (default 0.5%) or fixed micro lots

### How the EA enters

On the bar the room confirms (same moment as Pine):

- Price within `InpMarketTolAtr` of ENTRY → market order with SL/TP  
- Otherwise → pending limit/stop at ENTRY with SL/TP  
- Pending cancelled after `InpPendingExpiryBars` (default 40)

## Inputs (keep identical on Pine / indicator / EA)

| Input | Default |
|-------|---------|
| Pivot Period | 5 |
| Min Context ATR | 1.2 |
| Min Sweep ATR | 0.05 |
| Base Confirm Bars | 8 |
| Max Base Bars | 40 |
| Min / Max Room ATR | 0.8 / 3.5 |
| Cooldown | 50 |
| SL Pad ATR | 0.02 |
| Risk Reward | 2.4 |
| Prefer Liquidity TP | true |

## Troubleshooting

- **No setups**: need ≥ ~120 bars; use M1/M5 with enough history.
- **Levels differ from TV**: same broker symbol, same TF, same inputs; avoid mixing Yahoo/GC=F with FxPro.
- **Compile error on Trade.mqh**: EA needs a normal MT5 build with standard library.
- **Orders rejected**: check AutoTrading, symbol trade mode, stops level, and filling mode.

## Roadmap after validation

1. Keep AutoTrade off until 5+ matched setups.  
2. Enable on demo.  
3. Then live with tiny risk.  
4. Optional later: sync Android/ntfy alerts from the same MT5 detection instead of Yahoo.
