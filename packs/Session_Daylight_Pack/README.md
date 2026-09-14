# Session Daylight Box

Clear **trader session card** in one corner — no chart bands.

## Fixed in this version
- Text was clipping off the right edge on MT5 (`SESSI` / `LOND`) — anchor math corrected
- Opaque dark card so labels stay readable over candles
- Bigger session name + clock
- Solid progress bar (not tiny `#....` dots)
- Default corner: **top right** (away from time axis / volume)

## Panel shows
- LIVE / IDLE
- Active session (color accent)
- Clock
- Session window hours
- Progress %
- Day open → close

## Downloads
- Pack: https://raw.githubusercontent.com/radiarkazemi/forge-charts/cursor/session-daylight-992e/packs/Session_Daylight_Pack.zip
- Pine: https://raw.githubusercontent.com/radiarkazemi/forge-charts/cursor/session-daylight-992e/indicators/Session_Daylight.pine
- MT5: https://raw.githubusercontent.com/radiarkazemi/forge-charts/cursor/session-daylight-992e/mt5/Session_Daylight/Session_Daylight.mq5

**MT5:** delete the old indicator from the chart, recompile `Session_Daylight.mq5`, then attach again.
