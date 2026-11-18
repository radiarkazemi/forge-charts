#!/usr/bin/env python3
"""20 concurrent chart users against a live Forge host.

Each user loads the chart shell, one gold history page, one Mongo history
page, a quote, and a few follow-up polls — the same shape as sitting on
the chart, not a flood of extra profile downloads.
"""

from __future__ import annotations

import argparse
import json
import statistics
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field


DEFAULT_HOST = "https://forgechart.ir"


@dataclass
class Sample:
    name: str
    status: int
    ms: float
    bytes: int
    error: str = ""


@dataclass
class UserReport:
    user: int
    samples: list[Sample] = field(default_factory=list)


def fetch(url: str, timeout: float = 25.0) -> Sample:
    name = url.split("?")[0].split(DEFAULT_HOST)[-1] if DEFAULT_HOST in url else url
    started = time.perf_counter()
    try:
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "ForgeLoadTest/20", "Accept": "application/json,text/html,*/*"},
        )
        with urllib.request.urlopen(req, timeout=timeout) as res:
            body = res.read()
            return Sample(name=name, status=res.status, ms=(time.perf_counter() - started) * 1000, bytes=len(body))
    except urllib.error.HTTPError as exc:
        body = exc.read() if exc.fp else b""
        return Sample(
            name=name,
            status=exc.code,
            ms=(time.perf_counter() - started) * 1000,
            bytes=len(body),
            error=str(exc.code),
        )
    except Exception as exc:
        return Sample(
            name=name,
            status=0,
            ms=(time.perf_counter() - started) * 1000,
            bytes=0,
            error=str(exc)[:180],
        )


def run_user(host: str, user: int) -> UserReport:
    report = UserReport(user=user)
    paths = [
        f"{host}/charts/",
        f"{host}/tv-history?symbol=FOREXCOM:XAUUSD&resolution=5&count=80",
        f"{host}/crypto-chart/history?symbol=xauusd&interval=15&timeframe=1m&group=15&limit=200",
        f"{host}/iran-gold/quote",
    ]
    for path in paths:
        report.samples.append(fetch(path))
    for _ in range(4):
        time.sleep(1.4)
        report.samples.append(fetch(f"{host}/iran-gold/quote", timeout=12))
        report.samples.append(fetch(f"{host}/crypto-chart/history?symbol=xauusd&interval=5&limit=40", timeout=12))
    return report


def pct(values: list[float], p: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    idx = min(len(ordered) - 1, max(0, int(round((p / 100) * (len(ordered) - 1)))))
    return ordered[idx]


def summarize(reports: list[UserReport]) -> dict:
    samples = [sample for report in reports for sample in report.samples]
    ok = [s for s in samples if 200 <= s.status < 400]
    fail = [s for s in samples if s not in ok]
    by_status: dict[str, int] = {}
    for sample in samples:
        key = str(sample.status)
        by_status[key] = by_status.get(key, 0) + 1
    lat = [s.ms for s in ok]
    return {
        "users": len(reports),
        "requests": len(samples),
        "ok": len(ok),
        "failed": len(fail),
        "ok_pct": round(100.0 * len(ok) / max(1, len(samples)), 1),
        "bytes": sum(s.bytes for s in samples),
        "status": by_status,
        "latency_ms": {
            "p50": round(statistics.median(lat), 1) if lat else None,
            "p95": round(pct(lat, 95), 1) if lat else None,
            "max": round(max(lat), 1) if lat else None,
        },
        "errors": [s.error for s in fail[:12] if s.error],
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default=DEFAULT_HOST)
    parser.add_argument("--users", type=int, default=20)
    args = parser.parse_args()
    started = time.perf_counter()
    reports: list[UserReport] = []
    with ThreadPoolExecutor(max_workers=args.users) as pool:
        futures = [pool.submit(run_user, args.host.rstrip("/"), i + 1) for i in range(args.users)]
        for future in as_completed(futures):
            reports.append(future.result())
    out = summarize(reports)
    out["wall_sec"] = round(time.perf_counter() - started, 1)
    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
