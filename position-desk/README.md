# Forge Seat

A live location check for a trade you are already willing to take from your own chart read.

Forge Seat does not replace order blocks, fair value gaps, or fractals. It watches the quantities that move too fast to keep in your head while you are marking those levels:

- where the session's volume actually traded (point of control and value area)
- a close-location delta, so up-volume and down-volume are not just the color of the candle
- Kaufman efficiency, which separates a trend that is travelling from a market that is rotating
- where today's realized volatility sits inside its own recent history
- how far completed swings usually run against the trade before they make +1 ATR, and whether your stop is outside that heat

The page returns one verdict. **Seat is clean** means the live feed agrees with your side, the price is in the better half of the latest swing or inside an unfilled imbalance, and the stop clears that heat. Anything else is a reason to wait, widen the stop, or stand down. It is a filter on location, not a forecast.

## How the data gets there

MetaTrader's API only talks to a terminal on the same computer. The desk cannot dial your MT5 from the server. A small bridge on the Windows PC where the terminal is open reads the bars and posts them.

```text
MT5 terminal  →  mt5_bridge.py on that PC  →  Forge Seat server  →  browser
```

There is also `bridge/ForgeSeatExport.mq5` if you would rather attach an EA. Add the desk URL under Tools → Options → Expert Advisors → Allow WebRequest.

## Run the bridge

On the Windows PC where MT5 is logged in, double-click `bridge/Start-ForgeSeat.cmd`.
The first run downloads a private Python and the MetaTrader connector from the desk,
asks for the desk token once, then asks for the Market Watch symbols once
(`XAUUSD,EURUSD`). Leave MetaTrader open and leave the command window open.
The desk marks the feed stale after 20 seconds of silence.

The same file is served at `/Start-ForgeSeat.cmd` on the desk host. The Windows
files it downloads live in `FORGE_SEAT_BOOTSTRAP` (default `/var/lib/forge-seat/bootstrap`):
`python-setup.exe`, `numpy-2.5.5-cp312-cp312-win_amd64.whl`, and
`metatrader5-5.0.6231-cp312-cp312-win_amd64.whl`. Pip ignores a wheel whose
filename was shortened, so those full names have to stay intact.

A manual run, if Python is already installed:

```bash
py -3 -m pip install MetaTrader5
py -3 mt5_bridge.py --url http://SERVER:8096 --token YOUR_TOKEN --symbols XAUUSD,EURUSD
```

## Read the page

Open the desk, paste the token once, and pick the symbol. Enter the position you want judged:

- **Long / Short / Flat**
- entry, stop, and an optional target

Flat still scores the tape. A valid location means "if your own read is this side, the numbers currently agree." It is not an order to click.

| Verdict | What to do with it |
| --- | --- |
| Seat is clean | Structure, value, and stop heat agree with the ticket |
| A location is available | You are flat, and one side currently passes the same checks |
| Stop sits inside normal heat | The idea may be fine; this stop is tighter than usual counter-moves |
| Location is extended | Price is far from session VWAP in the trade's direction |
| The level that held this idea is gone | Price is through the stop or through the swing that defined the side |
| Position is on, location is thin | The ticket does not have enough agreement to lean on |
| No clean location | Stay flat |
| Spread is too wide | The quote itself is not trustworthy right now |

## Server

The server is the Python standard library only.

```bash
FORGE_SEAT_TOKEN=choose-a-long-secret FORGE_SEAT_PORT=8096 python3 server.py
```

`/api/health` is public. Bar ingest, the position ticket, and the live numbers require `Authorization: Bearer <token>`.

State is stored in `FORGE_SEAT_STATE` (default `data/state.json`) so a restart keeps the last bars.

## Tests

```bash
cd position-desk
python3 -m unittest discover -s tests -v
```
