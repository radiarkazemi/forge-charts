"""Forge Seat HTTP server.

The MetaTrader terminal pushes bars to /api/ingest. This process scores the
location and serves the desk page. Run it with the standard library only.

Environment:
  FORGE_SEAT_TOKEN   shared secret for the bridge and the browser
  FORGE_SEAT_PORT    default 8096
  FORGE_SEAT_STATE   JSON snapshot path, default ./data/state.json
"""

from __future__ import annotations

import json
import os
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

from engine import Bar, Position, Quote, analyze

TOKEN = os.environ.get("FORGE_SEAT_TOKEN", "").strip()
PORT = int(os.environ.get("FORGE_SEAT_PORT", "8096"))
STATE_PATH = os.environ.get("FORGE_SEAT_STATE", os.path.join(os.path.dirname(__file__), "data", "state.json"))
WEB_ROOT = os.path.join(os.path.dirname(__file__), "web")
BRIDGE_ROOT = os.path.join(os.path.dirname(__file__), "bridge")
BOOTSTRAP_ROOT = os.environ.get("FORGE_SEAT_BOOTSTRAP", "/var/lib/forge-seat/bootstrap")
MAX_BODY = 3_000_000

FILES = {
    "/": ("index.html", "text/html; charset=utf-8"),
    "/index.html": ("index.html", "text/html; charset=utf-8"),
    "/desk.js": ("desk.js", "text/javascript; charset=utf-8"),
    "/desk.css": ("desk.css", "text/css; charset=utf-8"),
}

_lock = threading.Lock()
_symbols: dict[str, dict] = {}


def _bar_from(raw: dict) -> Bar | None:
    try:
        return Bar(
            time=int(raw["time"]),
            open=float(raw["open"]),
            high=float(raw["high"]),
            low=float(raw["low"]),
            close=float(raw["close"]),
            volume=float(raw.get("volume") or raw.get("tick_volume") or 0),
        )
    except (KeyError, TypeError, ValueError):
        return None


def _merge(existing: list[dict], incoming: list[Bar]) -> list[dict]:
    by_time = {int(bar["time"]): bar for bar in existing}
    for bar in incoming:
        by_time[bar.time] = {
            "time": bar.time,
            "open": bar.open,
            "high": bar.high,
            "low": bar.low,
            "close": bar.close,
            "volume": bar.volume,
        }
    ordered = [by_time[key] for key in sorted(by_time)]
    return ordered[-800:]


def _load() -> None:
    if not os.path.exists(STATE_PATH):
        return
    try:
        with open(STATE_PATH, "r", encoding="utf-8") as handle:
            payload = json.load(handle)
    except (OSError, json.JSONDecodeError):
        return
    if isinstance(payload, dict):
        _symbols.update(payload)


def _save() -> None:
    directory = os.path.dirname(STATE_PATH)
    if directory:
        os.makedirs(directory, exist_ok=True)
    tmp = STATE_PATH + ".tmp"
    with open(tmp, "w", encoding="utf-8") as handle:
        json.dump(_symbols, handle)
    os.replace(tmp, STATE_PATH)


def _bars(raw_list: list[dict]) -> list[Bar]:
    parsed = []
    for item in raw_list:
        bar = _bar_from(item)
        if bar is not None:
            parsed.append(bar)
    return parsed


def _position(raw: dict | None) -> Position | None:
    if not raw or raw.get("side") in (None, "", "flat"):
        return Position("flat")
    side = raw.get("side")
    if side not in ("long", "short"):
        return Position("flat")

    def num(key: str) -> float | None:
        value = raw.get(key)
        if value is None or value == "":
            return None
        try:
            return float(value)
        except (TypeError, ValueError):
            return None

    return Position(side, num("entry"), num("stop"), num("target"))


def _desk(symbol: str) -> dict:
    state = _symbols.get(symbol)
    if state is None:
        return {
            "symbol": symbol,
            "connected": False,
            "verdict": "WARMING",
            "headline": "No feed yet",
            "summary": "Start the MT5 bridge on the computer where the terminal is open. This page updates as soon as bars arrive.",
            "score": 0,
            "side": "flat",
            "reasons": [],
            "metrics": {},
            "spark": [],
            "quote": None,
            "position": None,
            "digits": 5,
            "updated_at": None,
        }
    raw_bars = {tf: _bars(state.get("bars", {}).get(tf, [])) for tf in ("M1", "M5", "M15", "H1")}
    quote_raw = state.get("quote")
    quote = None
    if quote_raw:
        try:
            quote = Quote(int(quote_raw.get("time") or 0), float(quote_raw.get("bid") or 0), float(quote_raw.get("ask") or 0))
        except (TypeError, ValueError):
            quote = None
    age = time.time() - float(state.get("received_at") or 0)
    result = analyze(
        raw_bars,
        quote,
        _position(state.get("position")),
        digits=int(state.get("digits") or 5),
        median_spread=state.get("median_spread"),
        feed_age_sec=age,
    )
    if age > 20 and result["verdict"] not in ("WARMING",):
        result = {
            **result,
            "verdict": "WARMING",
            "headline": "Feed is stale",
            "summary": f"The last MT5 packet is {int(age)} seconds old. The previous verdict is hidden until the bridge catches up.",
        }
    return {
        "symbol": symbol,
        "connected": age <= 20,
        "digits": int(state.get("digits") or 5),
        "point": state.get("point"),
        "quote": quote_raw,
        "position": state.get("position"),
        "updated_at": state.get("received_at"),
        **result,
    }


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt: str, *args) -> None:
        return

    def _headers(self, status: int, content_type: str, length: int, *, download_name: str | None = None) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(length))
        if download_name:
            self.send_header("Content-Disposition", f'attachment; filename="{download_name}"')
            self.send_header("Cache-Control", "public, max-age=3600")
        else:
            self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()

    def _send(self, status: int, body: bytes, content_type: str) -> None:
        self._headers(status, content_type, len(body))
        self.wfile.write(body)

    def _send_path(self, path: str, content_type: str, download_name: str | None = None) -> None:
        try:
            size = os.path.getsize(path)
            handle = open(path, "rb")
        except OSError:
            self._json(404, {"error": "missing file"})
            return
        self._headers(200, content_type, size, download_name=download_name)
        with handle:
            while True:
                chunk = handle.read(64 * 1024)
                if not chunk:
                    break
                try:
                    self.wfile.write(chunk)
                except (BrokenPipeError, ConnectionResetError):
                    break

    def _json(self, status: int, payload: dict) -> None:
        self._send(status, json.dumps(payload).encode("utf-8"), "application/json; charset=utf-8")

    def _authorized(self) -> bool:
        if not TOKEN:
            self._json(503, {"error": "server token is not configured"})
            return False
        header = self.headers.get("Authorization", "")
        presented = header[7:].strip() if header.startswith("Bearer ") else ""
        if presented != TOKEN:
            self._json(401, {"error": "unauthorized"})
            return False
        return True

    def do_OPTIONS(self) -> None:  # noqa: N802
        self._send(204, b"", "text/plain")

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        if parsed.path == "/api/health":
            with _lock:
                names = sorted(_symbols)
            self._json(200, {"ok": True, "symbols": names})
            return
        if parsed.path in ("/api/desk", "/api/symbols"):
            if not self._authorized():
                return
            with _lock:
                if parsed.path == "/api/symbols":
                    self._json(200, {"symbols": sorted(_symbols)})
                    return
                symbol = (parse_qs(parsed.query).get("symbol") or [""])[0].strip()
                if not symbol:
                    symbol = sorted(_symbols)[0] if _symbols else ""
                self._json(200, _desk(symbol))
            return
        item = FILES.get(parsed.path)
        if item is not None:
            name, content_type = item
            self._send_path(os.path.join(WEB_ROOT, name), content_type)
            return
        downloads = {
            "/Start-ForgeSeat.cmd": (os.path.join(BRIDGE_ROOT, "Start-ForgeSeat.cmd"), "application/octet-stream", "Start-ForgeSeat.cmd"),
            "/bridge/mt5_bridge.py": (os.path.join(BRIDGE_ROOT, "mt5_bridge.py"), "text/plain; charset=utf-8", None),
            "/bootstrap/python-setup.exe": (os.path.join(BOOTSTRAP_ROOT, "python-setup.exe"), "application/octet-stream", "python-setup.exe"),
            "/bootstrap/numpy.whl": (os.path.join(BOOTSTRAP_ROOT, "numpy.whl"), "application/octet-stream", "numpy.whl"),
            "/bootstrap/MetaTrader5.whl": (os.path.join(BOOTSTRAP_ROOT, "MetaTrader5.whl"), "application/octet-stream", "MetaTrader5.whl"),
        }
        download = downloads.get(parsed.path)
        if download is None:
            self._json(404, {"error": "not found"})
            return
        path, content_type, download_name = download
        self._send_path(path, content_type, download_name)

    def do_POST(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        if parsed.path not in ("/api/ingest", "/api/position"):
            self._json(404, {"error": "not found"})
            return
        if not self._authorized():
            return
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > MAX_BODY:
            self._json(413, {"error": "body size rejected"})
            return
        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            self._json(400, {"error": "invalid json"})
            return
        symbol = str(payload.get("symbol") or "").strip()
        if not symbol:
            self._json(400, {"error": "symbol required"})
            return
        with _lock:
            state = _symbols.setdefault(symbol, {"bars": {}, "spreads": []})
            if parsed.path == "/api/position":
                side = payload.get("side") or "flat"
                if side not in ("long", "short", "flat"):
                    self._json(400, {"error": "side must be long, short, or flat"})
                    return
                state["position"] = {
                    "side": side,
                    "entry": payload.get("entry"),
                    "stop": payload.get("stop"),
                    "target": payload.get("target"),
                }
                state["digits"] = int(payload.get("digits") or state.get("digits") or 5)
            else:
                state["digits"] = int(payload.get("digits") or state.get("digits") or 5)
                state["point"] = payload.get("point")
                quote = payload.get("quote") or {}
                if quote:
                    state["quote"] = {
                        "time": quote.get("time"),
                        "bid": quote.get("bid"),
                        "ask": quote.get("ask"),
                    }
                    try:
                        spread = float(quote.get("ask") or 0) - float(quote.get("bid") or 0)
                    except (TypeError, ValueError):
                        spread = 0.0
                    if spread > 0:
                        spreads = list(state.get("spreads") or [])
                        spreads.append(spread)
                        state["spreads"] = spreads[-200:]
                        ordered = sorted(state["spreads"])
                        state["median_spread"] = ordered[len(ordered) // 2]
                incoming = payload.get("bars") or {}
                bars_state = state.setdefault("bars", {})
                for tf in ("M1", "M5", "M15", "H1"):
                    chunk = incoming.get(tf) or []
                    parsed_bars = [bar for bar in (_bar_from(item) for item in chunk) if bar is not None]
                    if parsed_bars:
                        bars_state[tf] = _merge(bars_state.get(tf) or [], parsed_bars)
                state["received_at"] = time.time()
            _save()
            desk = _desk(symbol)
        self._json(200, desk)


def main() -> None:
    _load()
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(f"forge-seat listening on {PORT}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
