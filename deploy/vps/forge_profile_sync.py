#!/usr/bin/env python3
"""Cross-device Forge profile sync (layouts, favorites, candle styles).

HTTP (port FORGE_PROFILE_PORT, default 8010):
  GET  /health
  GET  /v1/profile          Authorization: Bearer <syncKey>
  PUT  /v1/profile          Authorization: Bearer <syncKey>
       body: { "accountKey": "<sha256 hex>", "updatedAt": <ms>, "payload": { ... } }

accountKey = SHA-256(lowercase username)
syncKey    = SHA-256(username + "\\n" + password)   # derived client-side at login

Stored in Mongo db `forge` collection `profiles`.
"""

from __future__ import annotations

import logging
import os
import time

from aiohttp import web
from pymongo import MongoClient, ReturnDocument

LOG = logging.getLogger("forge.profile_sync")

MONGO_URI = os.environ.get("MONGO_URI", "mongodb://127.0.0.1:27017/")
MONGO_DB = os.environ.get("FORGE_PROFILE_DB", "forge")
MONGO_COLL = os.environ.get("FORGE_PROFILE_COLL", "profiles")
HOST = os.environ.get("FORGE_PROFILE_HOST", "127.0.0.1")
PORT = int(os.environ.get("FORGE_PROFILE_PORT", "8010"))
MAX_PAYLOAD_BYTES = int(os.environ.get("FORGE_PROFILE_MAX_BYTES", str(8 * 1024 * 1024)))

_client: MongoClient | None = None


def coll():
    global _client
    if _client is None:
        _client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=4_000)
    return _client[MONGO_DB][MONGO_COLL]


def bearer(request: web.Request) -> str | None:
    raw = request.headers.get("Authorization") or ""
    if raw.lower().startswith("bearer "):
        tok = raw[7:].strip()
        return tok or None
    return (request.headers.get("X-Forge-Sync-Key") or "").strip() or None


def valid_hex(value: str, size: int = 64) -> bool:
    if len(value) != size:
        return False
    try:
        int(value, 16)
        return True
    except ValueError:
        return False


async def health(_: web.Request) -> web.Response:
    try:
        coll().database.client.admin.command("ping")
        return web.json_response({"status": "ok", "mongo": True})
    except Exception as exc:  # noqa: BLE001
        return web.json_response({"status": "degraded", "mongo": False, "error": str(exc)}, status=503)


async def get_profile(request: web.Request) -> web.Response:
    sync_key = bearer(request)
    account_key = (request.rel_url.query.get("accountKey") or "").strip().lower()
    if not sync_key or not valid_hex(sync_key) or not valid_hex(account_key):
        return web.json_response({"error": "unauthorized"}, status=401)
    doc = coll().find_one({"_id": account_key})
    if not doc:
        return web.json_response({"updatedAt": 0, "payload": None})
    # Wrong password / other user's key — never return payload (no account enumeration).
    if doc.get("syncKey") != sync_key:
        return web.json_response({"error": "forbidden"}, status=403)
    # Only the matching accountKey document is returned — never another profile.
    if str(doc.get("_id") or "").lower() != account_key:
        return web.json_response({"error": "forbidden"}, status=403)
    return web.json_response(
        {
            "updatedAt": int(doc.get("updatedAt") or 0),
            "payload": doc.get("payload"),
            "accountKey": account_key,
        }
    )


async def put_profile(request: web.Request) -> web.Response:
    sync_key = bearer(request)
    if not sync_key or not valid_hex(sync_key):
        return web.json_response({"error": "unauthorized"}, status=401)
    import json as _json

    try:
        raw = await request.read()
        if len(raw) > MAX_PAYLOAD_BYTES + 64_000:
            return web.json_response({"error": "payload_too_large"}, status=413)
        body = _json.loads(raw.decode("utf-8"))
    except Exception:  # noqa: BLE001
        return web.json_response({"error": "invalid_json"}, status=400)
    if not isinstance(body, dict):
        return web.json_response({"error": "invalid_body"}, status=400)

    account_key = str(body.get("accountKey") or "").strip().lower()
    if not valid_hex(account_key):
        return web.json_response({"error": "bad_account"}, status=400)

    payload = body.get("payload")
    if payload is None or not isinstance(payload, dict):
        return web.json_response({"error": "bad_payload"}, status=400)

    encoded = _json.dumps(payload, separators=(",", ":")).encode("utf-8")
    if len(encoded) > MAX_PAYLOAD_BYTES:
        return web.json_response({"error": "payload_too_large"}, status=413)

    client_updated = int(body.get("updatedAt") or 0)
    now = int(time.time() * 1000)
    if client_updated <= 0:
        client_updated = now

    existing = coll().find_one({"_id": account_key})
    if existing and existing.get("syncKey") and existing.get("syncKey") != sync_key:
        return web.json_response({"error": "forbidden"}, status=403)

    # Last-write-wins: reject stale puts so an old PC cannot clobber a newer one.
    remote_updated = int((existing or {}).get("updatedAt") or 0)
    if existing and remote_updated > client_updated:
        return web.json_response(
            {
                "error": "stale",
                "updatedAt": remote_updated,
                "payload": existing.get("payload"),
            },
            status=409,
        )

    doc = coll().find_one_and_update(
        {"_id": account_key},
        {
            "$set": {
                "syncKey": sync_key,
                "updatedAt": max(client_updated, now),
                "payload": payload,
                "bytes": len(encoded),
            }
        },
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    return web.json_response({"ok": True, "updatedAt": int(doc.get("updatedAt") or now)})


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    app = web.Application(client_max_size=MAX_PAYLOAD_BYTES + 64_000)
    app.router.add_get("/health", health)
    app.router.add_get("/v1/profile", get_profile)
    app.router.add_put("/v1/profile", put_profile)
    LOG.info("Forge profile sync on %s:%s", HOST, PORT)
    web.run_app(app, host=HOST, port=PORT, print=None)


if __name__ == "__main__":
    main()
