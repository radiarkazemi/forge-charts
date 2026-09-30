#!/usr/bin/env python3
"""Faraz history relay for Forge (run on Germany :8091).

Germany can reach faraz.io; the Iran VPS is Cloudflare-blocked.

  GET /health
  GET /faraz/chart-history?symbol=geramTalaHejdah&resolution=1D
  GET /faraz/tv-history?symbolName=geramTalaHejdah&resolution=1D&from=…&to=…&countback=10000
      → /api/customer/trading-view/history (Cookie / UserId / token from env)
  GET /faraz/public-history?symbolName=geramTalaHejdah&resolution=1D&from=…&to=…&countback=300
      → /api/public/trading-view/history
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

FARAZ = os.environ.get("FARAZ_BASE_URL", "https://faraz.io").rstrip("/")
HOST = os.environ.get("FARAZ_PROXY_HOST", "0.0.0.0")
PORT = int(os.environ.get("FARAZ_PROXY_PORT", "8091"))
# Session cookie string, e.g. "connect.sid=…; …"
FARAZ_COOKIE = os.environ.get("FARAZ_COOKIE", "").strip()
FARAZ_USER_ID = os.environ.get("FARAZ_USER_ID", "").strip()
FARAZ_TOKEN = os.environ.get("FARAZ_TOKEN", "").strip()


def _ua_headers(symbol: str = "", *, auth: bool = False) -> dict[str, str]:
    headers = {
        "Accept": "application/json, text/plain, */*",
        "Origin": FARAZ,
        "Referer": (
            f"{FARAZ}/dashboard?s={symbol}" if symbol else f"{FARAZ}/markets/gold-currency"
        ),
        "User-Agent": "Mozilla/5.0 ForgeFarazProxy/2.0",
    }
    if auth:
        if FARAZ_COOKIE:
            headers["Cookie"] = FARAZ_COOKIE
        if FARAZ_USER_ID:
            headers["UserId"] = FARAZ_USER_ID
        if FARAZ_TOKEN:
            # Faraz SPA uses cookie sessions; some deployments also accept token headers.
            headers["Authorization"] = f"Bearer {FARAZ_TOKEN}"
            headers.setdefault("X-Auth-Token", FARAZ_TOKEN)
    return headers


def _fetch(url: str, headers: dict[str, str], timeout: float = 45.0) -> tuple[int, bytes]:
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return int(resp.status), resp.read()
    except urllib.error.HTTPError as exc:
        body = exc.read() if hasattr(exc, "read") else b""
        return int(exc.code), body or json.dumps({"detail": str(exc)}).encode()
    except Exception as exc:  # noqa: BLE001
        return 502, json.dumps({"detail": str(exc)}).encode()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args) -> None:  # noqa: A003
        return

    def _send(self, code: int, data: bytes, content_type: str = "application/json") -> None:
        self.send_response(code)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self) -> None:  # noqa: N802
        parsed = urllib.parse.urlparse(self.path)
        qs = urllib.parse.parse_qs(parsed.query)

        if parsed.path == "/health":
            body = json.dumps(
                {
                    "status": "ok",
                    "auth": bool(FARAZ_COOKIE or FARAZ_TOKEN),
                    "user_id": bool(FARAZ_USER_ID),
                }
            ).encode()
            self._send(200, body)
            return

        if parsed.path == "/faraz/chart-history":
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
            code, data = _fetch(url, _ua_headers(symbol))
            self._send(code, data)
            return

        if parsed.path == "/faraz/public-history":
            symbol = (qs.get("symbolName") or qs.get("symbol") or ["geramTalaHejdah"])[0]
            params = {
                "symbolName": symbol,
                "resolution": (qs.get("resolution") or ["1D"])[0],
                "from": (qs.get("from") or ["0"])[0],
                "to": (qs.get("to") or ["0"])[0],
                "countback": (qs.get("countback") or ["300"])[0],
                "firstDataRequest": (qs.get("firstDataRequest") or ["true"])[0],
                "latest": (qs.get("latest") or ["false"])[0],
                "adjustType": (qs.get("adjustType") or ["2"])[0],
                "json": "true",
            }
            url = f"{FARAZ}/api/public/trading-view/history?" + urllib.parse.urlencode(params)
            code, data = _fetch(url, _ua_headers(symbol))
            self._send(code, data)
            return

        if parsed.path == "/faraz/tv-history":
            symbol = (qs.get("symbolName") or qs.get("symbol") or ["geramTalaHejdah"])[0]
            params = {
                "symbolName": symbol,
                "resolution": (qs.get("resolution") or ["1D"])[0],
                "from": (qs.get("from") or ["0"])[0],
                "to": (qs.get("to") or ["0"])[0],
                "countback": (qs.get("countback") or ["10000"])[0],
                "firstDataRequest": (qs.get("firstDataRequest") or ["true"])[0],
                "latest": (qs.get("latest") or ["false"])[0],
                "adjustType": (qs.get("adjustType") or ["2"])[0],
                "json": "true",
            }
            url = f"{FARAZ}/api/customer/trading-view/history?" + urllib.parse.urlencode(params)
            code, data = _fetch(url, _ua_headers(symbol, auth=True), timeout=60.0)
            self._send(code, data)
            return

        self.send_response(404)
        self.end_headers()


if __name__ == "__main__":
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
