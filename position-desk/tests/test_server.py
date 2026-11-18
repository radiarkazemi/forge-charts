import json
import os
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

TMP = tempfile.mkdtemp()
os.environ["FORGE_SEAT_TOKEN"] = "test-token"
os.environ["FORGE_SEAT_STATE"] = os.path.join(TMP, "state.json")
os.environ["FORGE_SEAT_BOOTSTRAP"] = os.path.join(TMP, "bootstrap")
os.makedirs(os.environ["FORGE_SEAT_BOOTSTRAP"], exist_ok=True)

import server  # noqa: E402
from tests.test_engine import swing_book


class ServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.httpd = ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
        cls.port = cls.httpd.server_address[1]
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()

    def request(self, path, payload=None, token="test-token"):
        data = None if payload is None else json.dumps(payload).encode()
        headers = {}
        if token is not None:
            headers["Authorization"] = f"Bearer {token}"
        if data is not None:
            headers["Content-Type"] = "application/json"
        req = urllib.request.Request(f"http://127.0.0.1:{self.port}{path}", data=data, headers=headers)
        with urllib.request.urlopen(req, timeout=5) as response:
            return response.status, json.loads(response.read().decode())

    def test_ingest_then_score_and_reject_a_bad_token(self):
        bars = [
            {"time": bar.time, "open": bar.open, "high": bar.high, "low": bar.low, "close": bar.close, "volume": bar.volume}
            for bar in swing_book()
        ]
        price = bars[-1]["close"]
        status, desk = self.request(
            "/api/ingest",
            {
                "symbol": "XAUUSD",
                "digits": 2,
                "point": 0.01,
                "quote": {"time": bars[-1]["time"], "bid": price, "ask": price + 0.01},
                "bars": {"M5": bars},
            },
        )
        self.assertEqual(status, 200)
        self.assertEqual(desk["symbol"], "XAUUSD")
        self.assertEqual(desk["verdict"], "LOCATION_VALID")
        status, desk = self.request(
            "/api/position",
            {"symbol": "XAUUSD", "side": "long", "entry": price, "stop": price - 4.5, "target": price + 9},
        )
        self.assertEqual(desk["verdict"], "SEAT_OK")
        self.assertTrue(desk["connected"])
        page = urllib.request.urlopen(f"http://127.0.0.1:{self.port}/", timeout=5)
        self.assertIn(b"Forge Seat", page.read())
        with urllib.request.urlopen(f"http://127.0.0.1:{self.port}/Start-ForgeSeat.cmd", timeout=5) as response:
            launcher = response.read()
            self.assertIn("Start-ForgeSeat.cmd", response.headers.get("Content-Disposition", ""))
        self.assertIn(b"Market Watch", launcher)
        self.assertIn(b"numpy-2.5.5-cp312-cp312-win_amd64.whl", launcher)
        self.assertNotIn(b"find-links", launcher)
        self.assertNotIn(b"GcOy", launcher)
        try:
            urllib.request.urlopen(f"http://127.0.0.1:{self.port}/bootstrap/python-setup.exe", timeout=5)
        except urllib.error.HTTPError as exc:
            self.assertEqual(exc.code, 404)
        else:
            self.fail("missing installer was served")
        installer = os.path.join(os.environ["FORGE_SEAT_BOOTSTRAP"], "python-setup.exe")
        with open(installer, "wb") as handle:
            handle.write(b"MZ-test")
        with urllib.request.urlopen(f"http://127.0.0.1:{self.port}/bootstrap/python-setup.exe", timeout=5) as response:
            self.assertEqual(response.read(), b"MZ-test")
        try:
            self.request("/api/desk?symbol=XAUUSD", token="nope")
        except urllib.error.HTTPError as exc:
            self.assertEqual(exc.code, 401)
        else:
            self.fail("bad token was accepted")


if __name__ == "__main__":
    unittest.main()
