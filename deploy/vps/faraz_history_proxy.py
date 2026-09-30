#!/usr/bin/env python3
"""Tiny Faraz chart-history relay for Forge.

Germany can reach faraz.io; the Iran VPS is Cloudflare-blocked. Run this on
Germany (default :8091) and point MARKET_TICKS `FARAZ_HISTORY_PROXY` at it.

  GET /health
  GET /faraz/chart-history?symbol=abshodeNaghdi&resolution=1M
  GET /faraz/chart-history?symbolNames=["abshodeNaghdi"]&resolution=1D
"""

from __future__ import annotations

import json
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

FARAZ = "https://faraz.io"
HOST, PORT = "0.0.0.0", 8091


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args) -> None:  # noqa: A003
        return

    def do_GET(self) -> None:  # noqa: N802
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/health":
            body = b'{"status":"ok"}'
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if parsed.path != "/faraz/chart-history":
            self.send_response(404)
            self.end_headers()
            return

        qs = urllib.parse.parse_qs(parsed.query)
        symbol = (qs.get("symbol") or qs.get("symbolName") or ["abshodeNaghdi"])[0]
        resolution = (qs.get("resolution") or ["1D"])[0]
        cache = (qs.get("cache") or ["true"])[0]
        if "symbolNames" in qs:
            symbol_names = qs["symbolNames"][0]
        else:
            symbol_names = json.dumps([symbol], separators=(",", ":"))

        url = (
            f"{FARAZ}/api/public/trading-view/chart-history?"
            + urllib.parse.urlencode(
                {"symbolNames": symbol_names, "resolution": resolution, "cache": cache}
            )
        )
        req = urllib.request.Request(
            url,
            headers={
                "Accept": "application/json",
                "Origin": FARAZ,
                "Referer": f"{FARAZ}/markets/gold-currency/{symbol}",
                "User-Agent": "Mozilla/5.0 ForgeFarazProxy/1.0",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=25) as resp:
                data = resp.read()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        except Exception as exc:  # noqa: BLE001
            body = json.dumps({"detail": str(exc)}).encode()
            self.send_response(502)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)


if __name__ == "__main__":
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
