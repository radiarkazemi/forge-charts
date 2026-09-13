# Session Daylight Map

Tiny **visual-only** session + day begin/end map for TradingView and MetaTrader 5.

Does **not** trade, signal, or move levels. Soft bands stay behind candles so setups stay readable.

## What you see

| Layer | Default |
|------|---------|
| Asia band | on (very soft) |
| London band | on |
| New York band | on |
| London∩NY overlap | on |
| Day begin dotted line | on |
| Session labels | **off** (enable if you want) |
| Corner clock / status | on |

Default hours are in **America/New_York** on TradingView. On MT5, hours are relative to chart/server time; use `InpGmtOffset` to shift.

| Session | Default window |
|---------|----------------|
| Asia | 19:00 → 00:00 |
| London | 03:00 → 12:00 |
| New York | 08:00 → 17:00 |
| Day begin | 00:00 |

## TradingView

1. Open Pine Editor → paste `indicators/Session_Daylight.pine`
2. Add to chart
3. Keep labels off unless you need them

Raw:
https://raw.githubusercontent.com/radiarkazemi/forge-charts/cursor/session-daylight-992e/indicators/Session_Daylight.pine

## MetaTrader 5

1. Copy `mt5/Session_Daylight/Session_Daylight.mq5` into `MQL5/Indicators/Session_Daylight/`
2. Compile in MetaEditor
3. Attach to chart (any TF)

Raw:
https://raw.githubusercontent.com/radiarkazemi/forge-charts/cursor/session-daylight-992e/mt5/Session_Daylight/Session_Daylight.mq5

## Tips so it never fights your trading

- Leave **labels off**
- Lower history days (3–5)
- If bands feel strong, turn off one session or use your chart theme’s quieter colors
- Do **not** stack this with other heavy session tools
