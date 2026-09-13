# Session Daylight Map

Tiny **visual-only** session + day begin map for TradingView and MetaTrader 5.

Does **not** trade, signal, or move levels. Soft bands stay behind candles so your setups stay readable.

## What you see

| Layer | Default |
|------|---------|
| Asia band | on (very soft) |
| London band | on |
| New York band | on |
| London∩NY overlap | on |
| Day begin dotted line | on |
| Session labels | **off** |
| Corner status | on |

Default hours use **America/New_York** on TradingView. On MT5, hours follow server time — shift with `InpGmtOffset`.

| Session | Default window |
|---------|----------------|
| Asia | 19:00 → 00:00 |
| London | 03:00 → 12:00 |
| New York | 08:00 → 17:00 |
| Day begin | 00:00 |

## TradingView

1. Pine Editor → paste `indicators/Session_Daylight.pine`
2. Add to chart
3. Keep labels off unless you want them

Raw:  
https://raw.githubusercontent.com/radiarkazemi/forge-charts/cursor/session-daylight-992e/indicators/Session_Daylight.pine

## MetaTrader 5

1. Copy `mt5/Session_Daylight/Session_Daylight.mq5` → `MQL5/Indicators/Session_Daylight/`
2. Compile in MetaEditor
3. Attach to any chart / TF

Raw:  
https://raw.githubusercontent.com/radiarkazemi/forge-charts/cursor/session-daylight-992e/mt5/Session_Daylight/Session_Daylight.mq5

## Keep it out of the way

- Leave **labels off**
- History days 3–5
- Turn off unused sessions
- Do not stack with other heavy session tools
