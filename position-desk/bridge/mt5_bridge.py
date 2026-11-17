"""Push live MT5 bars to Forge Seat.

Run this on the Windows PC where the MetaTrader 5 terminal is open and logged
in. The official MetaTrader5 Python package only talks to a terminal on the
same machine, so the server cannot dial the terminal by itself.

    py -3 -m pip install MetaTrader5
    py -3 mt5_bridge.py --url http://YOUR_SERVER:8096 --token YOUR_TOKEN --symbols XAUUSD,EURUSD

Leave the terminal running. This process reads closed and forming bars and
posts them about once a second.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.request

TIMEFRAMES = ("M1", "M5", "M15", "H1")


def load_mt5():
    try:
        import MetaTrader5 as mt5
    except ImportError as exc:
        raise SystemExit(
            "MetaTrader5 is not installed. On the PC that runs the terminal: py -3 -m pip install MetaTrader5"
        ) from exc
    return mt5


def rates(mt5, symbol: str, timeframe: int, count: int) -> list[dict]:
    raw = mt5.copy_rates_from_pos(symbol, timeframe, 0, count)
    if raw is None:
        return []
    out = []
    for row in raw:
        out.append(
            {
                "time": int(row["time"]),
                "open": float(row["open"]),
                "high": float(row["high"]),
                "low": float(row["low"]),
                "close": float(row["close"]),
                "volume": float(row["tick_volume"]),
            }
        )
    return out


def post(url: str, token: str, payload: dict) -> dict:
    body = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        url.rstrip("/") + "/api/ingest",
        data=body,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=8) as response:
        return json.loads(response.read().decode("utf-8"))


def main() -> None:
    parser = argparse.ArgumentParser(description="Stream an open MT5 terminal into Forge Seat")
    parser.add_argument("--url", required=True, help="desk origin, for example http://2.28.37.51:8096")
    parser.add_argument("--token", required=True)
    parser.add_argument("--symbols", required=True, help="comma-separated, as they appear in MT5 Market Watch")
    parser.add_argument("--terminal", default="", help="optional path to terminal64.exe")
    parser.add_argument("--bars", type=int, default=400)
    parser.add_argument("--seconds", type=float, default=1.0)
    args = parser.parse_args()

    mt5 = load_mt5()
    kwargs = {"path": args.terminal} if args.terminal else {}
    if not mt5.initialize(**kwargs):
        raise SystemExit(f"mt5.initialize failed: {mt5.last_error()}")

    symbols = [part.strip() for part in args.symbols.split(",") if part.strip()]
    frames = {
        "M1": mt5.TIMEFRAME_M1,
        "M5": mt5.TIMEFRAME_M5,
        "M15": mt5.TIMEFRAME_M15,
        "H1": mt5.TIMEFRAME_H1,
    }
    print(f"connected. terminal build {mt5.version()}", flush=True)
    try:
        while True:
            for symbol in symbols:
                if not mt5.symbol_select(symbol, True):
                    print(f"{symbol}: not in Market Watch ({mt5.last_error()})", flush=True)
                    continue
                info = mt5.symbol_info(symbol)
                tick = mt5.symbol_info_tick(symbol)
                if info is None or tick is None:
                    print(f"{symbol}: no tick yet", flush=True)
                    continue
                payload = {
                    "symbol": symbol,
                    "digits": int(info.digits),
                    "point": float(info.point),
                    "quote": {"time": int(tick.time), "bid": float(tick.bid), "ask": float(tick.ask)},
                    "bars": {name: rates(mt5, symbol, frame, args.bars) for name, frame in frames.items()},
                }
                try:
                    desk = post(args.url, args.token, payload)
                except urllib.error.URLError as exc:
                    print(f"{symbol}: post failed ({exc})", flush=True)
                    continue
                print(
                    f"{symbol} {desk.get('verdict')} score={desk.get('score')} bid={tick.bid}",
                    flush=True,
                )
            time.sleep(max(0.3, args.seconds))
    finally:
        mt5.shutdown()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(0)
