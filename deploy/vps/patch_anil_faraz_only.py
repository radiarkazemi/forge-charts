#!/usr/bin/env python3
"""Patch Anil gold services to Faraz-only (Germany market-api proxy when direct blocked)."""
from pathlib import Path

faraz = Path("/var/www/anil/backend/apps/store/services/faraz.py")
text = faraz.read_text()
needle = '''def fetch_from_faraz() -> tuple[dict[str, Any] | None, str]:
    raw = fetch_faraz_market(cache=False)
    if not raw:
        return None, ""
    payload = map_faraz_to_payload(raw)
    if not payload:
        return None, ""
    return payload, "faraz"
'''
replacement = '''def fetch_from_faraz_via_market_api() -> tuple[dict[str, Any] | None, str]:
    """Germany market-api `/gold/live/` proxies Faraz (VPS is CF-blocked from faraz.io)."""
    base = os.environ.get("MARKET_API_BASE", "http://2.28.37.51:8088/api/v1").rstrip("/")
    key = os.environ.get("MARKET_API_KEY", "").strip()
    headers = {
        "Accept": "application/json",
        "User-Agent": "anil-gold-faraz-proxy/1.0",
    }
    if key:
        headers["X-API-Key"] = key
    try:
        resp = requests.get(f"{base}/gold/live/", headers=headers, timeout=8)
        resp.raise_for_status()
        data = resp.json()
        if not isinstance(data, dict):
            return None, ""
        src = str(data.get("source") or "")
        if "faraz" not in src.lower():
            logger.warning("market-api gold/live source not faraz: %s", src)
            return None, ""
        g18 = int(data.get("price_18k_per_gram") or 0)
        if g18 <= 0:
            return None, ""
        payload = {
            "price_18k_per_gram": g18,
            "price_24k_per_gram": int(data.get("price_24k_per_gram") or 0),
            "mesghal_17": int(data.get("mesghal_17") or data.get("mesghal") or 0),
            "coin_emami": int(data.get("coin_emami") or 0),
            "coin_half": int(data.get("coin_half") or 0),
            "coin_quarter": int(data.get("coin_quarter") or 0),
            "usd_toman": 0,
            "ounce_usd": float(data.get("ounce_usd") or 0),
        }
        return payload, "faraz"
    except Exception as exc:
        logger.warning("faraz via market-api failed: %s", exc)
        return None, ""


def fetch_from_faraz() -> tuple[dict[str, Any] | None, str]:
    raw = fetch_faraz_market(cache=False)
    if raw:
        payload = map_faraz_to_payload(raw)
        if payload:
            return payload, "faraz"
    # VPS cannot reach faraz.io (Arvan/CF 403) — use Germany Faraz proxy.
    return fetch_from_faraz_via_market_api()
'''
if needle not in text:
    raise SystemExit("faraz.py needle not found")
if "fetch_from_faraz_via_market_api" not in text:
    faraz.write_text(text.replace(needle, replacement))
    print("faraz.py patched")
else:
    print("faraz.py already patched")

prov = Path("/var/www/anil/backend/apps/store/services/providers.py")
pt = prov.read_text()
old = '''def fetch_live_market() -> tuple[dict[str, Any] | None, str]:
    """Try providers in order. Returns (payload, source_name)."""
    for fetcher in (
        fetch_from_faraz,
        fetch_from_goldbridge,
        fetch_from_sekefarshad,
        fetch_from_tgju,
        fetch_from_generic_provider,
    ):
        payload, source = fetcher()
        if payload and payload.get("price_18k_per_gram"):
            payload = {k: v for k, v in payload.items() if k not in ("meta", "raw")}
            return payload, source
    return None, ""
'''
new = '''def fetch_live_market() -> tuple[dict[str, Any] | None, str]:
    """Faraz only (direct or Germany market-api proxy). No TGJU."""
    for fetcher in (fetch_from_faraz,):
        payload, source = fetcher()
        if payload and payload.get("price_18k_per_gram"):
            payload = {k: v for k, v in payload.items() if k not in ("meta", "raw")}
            return payload, source
    return None, ""
'''
if "No TGJU" in pt:
    print("providers.py already Faraz-only")
elif old not in pt:
    raise SystemExit("providers.py needle not found")
else:
    prov.write_text(pt.replace(old, new))
    print("providers.py patched Faraz-only")
