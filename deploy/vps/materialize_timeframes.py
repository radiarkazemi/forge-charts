#!/usr/bin/env python3
"""One-shot / cron: materialize derived TF historical candles from base 1m/1h/1d.

Creates (or refreshes) collections like btcusdt_5m, btcusdt_15m, btcusdt_4h
by aggregating existing parent candles in `historical_data`.

Usage (on VPS):
  /opt/cp_fetcher/.venv/bin/python /opt/cp_fetcher/ws/materialize_timeframes.py
  /opt/cp_fetcher/.venv/bin/python /opt/cp_fetcher/ws/materialize_timeframes.py --symbol btcusdt --tf 5m

Note: chart_ws already aggregates on read for history + live; this script is
optional for tools that want native derived collections.
"""

from __future__ import annotations

import argparse
import os
from datetime import datetime, timezone
from typing import Any

from pymongo import MongoClient, UpdateOne

MONGO_URI = os.environ.get("MONGO_URI", "mongodb://127.0.0.1:27017/")
DB = os.environ.get("MONGO_DB_HISTORICAL", "historical_data")

# derived_key → (parent_suffix, group, id_format, seconds)
DERIVED: dict[str, tuple[str, int, str, int]] = {
    "5m": ("_1m", 5, "%Y-%m-%d %H:%M:%S", 300),
    "15m": ("_1m", 15, "%Y-%m-%d %H:%M:%S", 900),
    "30m": ("_1m", 30, "%Y-%m-%d %H:%M:%S", 1800),
    "4h": ("_1h", 4, "%Y-%m-%d %H:%M:%S", 14400),
    "1w": ("", 7, "%Y-%m-%d", 604800),
}


def to_unix(value: Any) -> int | None:
    if value is None:
        return None
    if hasattr(value, "timestamp"):
        try:
            return int(value.timestamp())
        except Exception:
            return None
    if isinstance(value, str) and value:
        try:
            text = value.strip().replace("Z", "+00:00")
            if "T" not in text and " " in text:
                dt = datetime.strptime(text, "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
            else:
                dt = datetime.fromisoformat(text)
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
            return int(dt.timestamp())
        except Exception:
            return None
    return None


def aggregate(rows: list[list[float]], bucket: int) -> list[list[float]]:
    out: list[list[float]] = []
    cur: list[float] | None = None
    start = -1
    for t, o, h, l, c, v in rows:
        b = int(t // bucket) * bucket
        if cur is None or b != start:
            if cur is not None:
                out.append(cur)
            start = b
            cur = [float(b), o, h, l, c, v]
        else:
            cur[2] = max(cur[2], h)
            cur[3] = min(cur[3], l)
            cur[4] = c
            cur[5] += v
    if cur is not None:
        out.append(cur)
    return out


def parent_symbols(db, parent_suffix: str) -> list[str]:
    names = db.list_collection_names()
    out: list[str] = []
    for name in names:
        if parent_suffix == "":
            # daily collections are bare ticker ids (no underscore suffix)
            if "_" not in name and name.isalpha():
                out.append(name)
        elif name.endswith(parent_suffix):
            out.append(name[: -len(parent_suffix)])
    return sorted(set(out))


def materialize(symbol: str, tf_key: str, db) -> int:
    parent_suffix, group, id_fmt, bucket = DERIVED[tf_key]
    parent_coll = f"{symbol}{parent_suffix}"
    dest_coll = f"{symbol}_{tf_key}" if tf_key != "1w" else f"{symbol}_1w"
    if parent_coll not in db.list_collection_names():
        print(f"skip {symbol} {tf_key}: missing {parent_coll}")
        return 0
    rows: list[list[float]] = []
    for doc in db[parent_coll].find({}, projection={"data": 1}).sort("_id", 1):
        data = doc.get("data") or {}
        t = to_unix(data.get("time") or doc.get("_id"))
        if t is None:
            continue
        try:
            rows.append(
                [
                    float(t),
                    float(data["open"]),
                    float(data["high"]),
                    float(data["low"]),
                    float(data["close"]),
                    float(data.get("volume") or 0),
                ]
            )
        except (KeyError, TypeError, ValueError):
            continue
    if group > 1:
        rows = aggregate(rows, bucket)
    ops: list[UpdateOne] = []
    for t, o, h, l, c, v in rows:
        ts = datetime.fromtimestamp(int(t), tz=timezone.utc)
        _id = ts.strftime(id_fmt)
        ops.append(
            UpdateOne(
                {"_id": _id},
                {
                    "$set": {
                        "_id": _id,
                        "data": {
                            "time": ts,
                            "open": o,
                            "high": h,
                            "low": l,
                            "close": c,
                            "volume": v,
                        },
                        "derived_from": parent_coll,
                        "group": group,
                    }
                },
                upsert=True,
            )
        )
    if not ops:
        return 0
    # bulk in chunks
    n = 0
    coll = db[dest_coll]
    for i in range(0, len(ops), 2000):
        res = coll.bulk_write(ops[i : i + 2000], ordered=False)
        n += res.upserted_count + res.modified_count
    print(f"{dest_coll}: wrote/updated ~{n} (from {len(rows)} bars)")
    return n


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--symbol", default="", help="e.g. btcusdt (default: all with 1m)")
    ap.add_argument("--tf", default="", help="e.g. 5m (default: all derived)")
    args = ap.parse_args()
    client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
    db = client[DB]
    tfs = [args.tf] if args.tf else list(DERIVED.keys())
    for tf in tfs:
        if tf not in DERIVED:
            raise SystemExit(f"unknown tf {tf}; choose from {list(DERIVED)}")
        parent_suffix = DERIVED[tf][0]
        symbols = [args.symbol.lower()] if args.symbol else parent_symbols(db, parent_suffix)
        for sym in symbols:
            if not sym:
                continue
            materialize(sym, tf, db)


if __name__ == "__main__":
    main()
