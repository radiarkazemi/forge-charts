#!/usr/bin/env python3
"""Patch Germany market-api gold providers to use native Faraz symbols.

geramTalaHejdah = گرم طلای ۱۸ عیار
tala24Estjt     = طلای ۲۴ عیار اتحادیه
abshodeNaghdi   = آبشده نقدی 1
"""

from __future__ import annotations

from pathlib import Path

TARGET = Path("/opt/market-api/apps/gold/providers.py")

NEW = '''"""External gold providers used by Anil / Danora."""

from __future__ import annotations

import json
import logging
from typing import Any

from django.conf import settings

from apps.core.http import http_get_json

logger = logging.getLogger(__name__)

# Faraz public symbols — native where available (do not derive G18 from mesghal).
SYMBOL_MESGHAL = "abshodeNaghdi"
SYMBOL_G18 = "geramTalaHejdah"
SYMBOL_G24 = "tala24Estjt"
SYMBOL_EMAMI = "sekkeNewEstjt"
SYMBOL_HALF = "nimSekkeEstjt"
SYMBOL_QUARTER = "robSekkeEstjt"
SYMBOL_OUNCE = "FOREXCOM_XAUUSD"

ALT_SYMBOLS = {
    SYMBOL_MESGHAL: ("abshodeNaghdi", "abshodehNaghdi"),
    SYMBOL_G18: ("geramTalaHejdah", "tala18Estjt"),
    SYMBOL_G24: ("tala24Estjt",),
    SYMBOL_EMAMI: ("sekkeNewEstjt", "sekkeEmami", "sekkeJadid"),
    SYMBOL_HALF: ("nimSekkeEstjt", "nimSekke"),
    SYMBOL_QUARTER: ("robSekkeEstjt", "robSekke"),
    SYMBOL_OUNCE: ("FOREXCOM_XAUUSD", "OANDA_XAUUSD", "XAUUSD"),
}

MESGHAL_GRAMS = 4.608
PURITY_750 = 750
PURITY_705 = 705
PURITY_999 = 999


def mesghal17_to_gram18(mesghal17: float | int) -> int:
    return int(round((float(mesghal17) * PURITY_750 / PURITY_705) / MESGHAL_GRAMS))


def gram18_to_gram24(gram18: float | int) -> int:
    return int(round(float(gram18) * PURITY_999 / PURITY_750))


def _extract_price(entry: Any) -> float:
    if entry is None:
        return 0.0
    if isinstance(entry, (int, float)):
        return float(entry)
    if isinstance(entry, dict):
        for key in ("price", "close", "last", "value", "p"):
            if entry.get(key) is not None:
                try:
                    return float(entry[key])
                except (TypeError, ValueError):
                    continue
    return 0.0


def _pick_symbol(raw: dict[str, Any], canonical: str) -> float:
    for name in ALT_SYMBOLS.get(canonical, (canonical,)):
        price = _extract_price(raw.get(name))
        if price > 0:
            return price
    return _extract_price(raw.get(canonical))


def fetch_faraz() -> tuple[dict[str, Any] | None, str]:
    base = getattr(settings, "FARAZ_BASE_URL", "https://faraz.io").rstrip("/")
    symbols = [
        SYMBOL_MESGHAL,
        SYMBOL_G18,
        SYMBOL_G24,
        SYMBOL_EMAMI,
        SYMBOL_HALF,
        SYMBOL_QUARTER,
        SYMBOL_OUNCE,
        "USDTIRT",
    ]
    paths = [
        "/api/public/market/get-data",
        "/api/public/market/getData",
        "/api/v1/public/market/data",
    ]
    raw = None
    for path in paths:
        try:
            raw = http_get_json(
                f"{base}{path}",
                params={
                    "symbolNames": json.dumps(symbols, separators=(",", ":")),
                    "cache": "false",
                },
                headers={
                    "Origin": base,
                    "Referer": f"{base}/markets/gold-currency",
                },
                timeout=10,
                provider="faraz",
            )
            if isinstance(raw, dict) and raw:
                break
        except Exception:
            raw = None
            continue
    if not isinstance(raw, dict):
        return None, ""

    mesghal = _pick_symbol(raw, SYMBOL_MESGHAL)
    g18 = _pick_symbol(raw, SYMBOL_G18)
    g24 = _pick_symbol(raw, SYMBOL_G24)
    if g18 <= 0 and mesghal > 0:
        g18 = float(mesghal17_to_gram18(mesghal))
    if g24 <= 0 and g18 > 0:
        g24 = float(gram18_to_gram24(g18))
    if g18 <= 0 and mesghal <= 0:
        return None, ""
    ounce = _pick_symbol(raw, SYMBOL_OUNCE)
    usdt = _extract_price(raw.get("USDTIRT"))
    payload = {
        "price_18k_per_gram": int(round(g18)),
        "price_24k_per_gram": int(round(g24)),
        "mesghal_17": int(round(mesghal)) if mesghal else 0,
        "coin_emami": int(round(_pick_symbol(raw, SYMBOL_EMAMI))),
        "coin_half": int(round(_pick_symbol(raw, SYMBOL_HALF))),
        "coin_quarter": int(round(_pick_symbol(raw, SYMBOL_QUARTER))),
        "usd_toman": int(round(usdt)) if usdt else 0,
        "ounce_usd": float(ounce) if ounce else 0.0,
        "raw": raw,
    }
    return payload, "faraz"


def fetch_goldbridge() -> tuple[dict[str, Any] | None, str]:
    base = getattr(settings, "GOLD_BRIDGE_URL", "").rstrip("/")
    if not base:
        return None, ""
    headers = {}
    key = getattr(settings, "GOLD_BRIDGE_API_KEY", "")
    if key:
        headers["Authorization"] = f"Bearer {key}"
    try:
        data = http_get_json(
            f"{base}/prices",
            headers=headers,
            timeout=12,
            provider="goldbridge",
        )
    except Exception:
        return None, ""
    entries = data.get("prices") if isinstance(data, dict) else None
    if not entries:
        return None, ""
    g18 = 0
    mesghal = 0
    coins = {"emami": 0, "half": 0, "quarter": 0}
    for e in entries:
        if not isinstance(e, dict):
            continue
        name = str(e.get("name") or "")
        price = e.get("buy") or e.get("price") or 0
        try:
            price = float(price)
        except (TypeError, ValueError):
            continue
        if "مثقال" in name or e.get("ayar") in (17, 750, "17", "750"):
            mesghal = int(round(price / 10 if price > 100_000_000 else price))
            g18 = mesghal17_to_gram18(mesghal)
        elif "امامی" in name or "تمام" in name:
            coins["emami"] = int(round(price / 10 if price > 1_000_000_000 else price))
        elif "نیم" in name:
            coins["half"] = int(round(price / 10 if price > 500_000_000 else price))
        elif "ربع" in name:
            coins["quarter"] = int(round(price / 10 if price > 200_000_000 else price))
    if g18 <= 0:
        return None, ""
    return {
        "price_18k_per_gram": g18,
        "price_24k_per_gram": gram18_to_gram24(g18),
        "mesghal_17": mesghal,
        "coin_emami": coins["emami"],
        "coin_half": coins["half"],
        "coin_quarter": coins["quarter"],
        "usd_toman": 0,
        "ounce_usd": 0.0,
        "raw": {"items": len(entries)},
    }, "goldbridge"


def fetch_sekefarshad() -> tuple[dict[str, Any] | None, str]:
    url = getattr(settings, "GOLD_SOURCE_LIST_URL", "")
    if not url:
        return None, ""
    try:
        data = http_get_json(url, timeout=15, provider="sekefarshad")
    except Exception:
        return None, ""
    entries = []
    if isinstance(data, dict):
        entries = data.get("prices") or data.get("data") or []
    elif isinstance(data, list):
        entries = data
    if not entries:
        return None, ""
    payload, _ = _map_list(entries)
    return payload, "sekefarshad" if payload else ""


def _map_list(entries: list) -> tuple[dict[str, Any] | None, str]:
    g18 = mesghal = 0
    coins = {"emami": 0, "half": 0, "quarter": 0}
    for e in entries:
        if not isinstance(e, dict):
            continue
        name = str(e.get("name") or e.get("title") or "")
        price = e.get("buy") or e.get("price") or e.get("value") or 0
        try:
            price = float(str(price).replace(",", ""))
        except (TypeError, ValueError):
            continue
        if price > 50_000_000:
            price = price / 10.0
        if "مثقال" in name:
            mesghal = int(round(price))
            g18 = mesghal17_to_gram18(mesghal)
        elif "امامی" in name or "تمام" in name:
            coins["emami"] = int(round(price))
        elif "نیم" in name:
            coins["half"] = int(round(price))
        elif "ربع" in name:
            coins["quarter"] = int(round(price))
        elif ("۱۸" in name or "18" in name) and "گرم" in name and g18 <= 0:
            g18 = int(round(price))
    if g18 <= 0:
        return None, ""
    return {
        "price_18k_per_gram": g18,
        "price_24k_per_gram": gram18_to_gram24(g18),
        "mesghal_17": mesghal,
        "coin_emami": coins["emami"],
        "coin_half": coins["half"],
        "coin_quarter": coins["quarter"],
        "usd_toman": 0,
        "ounce_usd": 0.0,
        "raw": {"items": len(entries)},
    }, "sekefarshad"


def fetch_live_market() -> tuple[dict[str, Any] | None, str]:
    for fetcher in (fetch_faraz, fetch_goldbridge, fetch_sekefarshad):
        try:
            payload, source = fetcher()
        except Exception as exc:
            logger.warning("provider %s failed: %s", fetcher.__name__, exc)
            continue
        if payload and payload.get("price_18k_per_gram"):
            return payload, source
    return None, ""
'''


def main() -> None:
    TARGET.write_text(NEW)
    print(f"patched {TARGET}")


if __name__ == "__main__":
    main()
