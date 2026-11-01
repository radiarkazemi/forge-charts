#!/usr/bin/env python3
"""Refresh Faraz customer session via phone + password and write env files.

Reads FARAZ_PHONE / FARAZ_PASSWORD (or --phone/--password). Writes systemd
EnvironmentFile(s) with FARAZ_COOKIE / FARAZ_TOKEN / FARAZ_USER_ID.

Usage:
  FARAZ_PHONE=09… FARAZ_PASSWORD='…' python3 faraz_session_refresh.py \\
      --write /etc/default/faraz-history-proxy
  # then: systemctl restart faraz-history-proxy.service
"""

from __future__ import annotations

import argparse
import base64
import http.cookiejar
import json
import os
import ssl
import sys
import time
import urllib.error
import urllib.request

BASE = os.environ.get("FARAZ_BASE_URL", "https://faraz.io").rstrip("/")


def _q(value: str) -> str:
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'


def _decode_jwt(token: str) -> dict:
    payload = token.split(".")[1]
    pad = "=" * (-len(payload) % 4)
    return json.loads(base64.urlsafe_b64decode(payload + pad))


def login(phone: str, password: str) -> tuple[str, str, str, int]:
    """Return (cookie_header, token, user_id, exp)."""
    ctx = ssl.create_default_context()
    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(
        urllib.request.HTTPSHandler(context=ctx),
        urllib.request.HTTPCookieProcessor(jar),
    )

    def post(path: str, body: dict) -> dict:
        data = json.dumps(body).encode()
        req = urllib.request.Request(
            f"{BASE}{path}",
            data=data,
            method="POST",
            headers={
                "Content-Type": "application/json",
                "Accept": "application/json",
                "Origin": BASE,
                "Referer": f"{BASE}/account/login",
                "User-Agent": "Mozilla/5.0 ForgeFarazAuth/1.1",
            },
        )
        try:
            with opener.open(req, timeout=45) as resp:
                return json.loads(resp.read())
        except urllib.error.HTTPError as exc:
            raw = exc.read() if hasattr(exc, "read") else b""
            try:
                parsed = json.loads(raw)
            except Exception:
                parsed = {"raw": raw[:500].decode("utf-8", "ignore")}
            parsed["_http"] = int(exc.code)
            return parsed

    identify = post("/api/v1/auth/identify", {"phone": phone})
    state = identify.get("state")
    actions = identify.get("availableActions") or []
    if identify.get("_http") and identify.get("_http") >= 400 and state is None:
        raise RuntimeError(f"identify failed: {identify}")

    if "password/verify" not in actions and state not in ("signin-password", "password"):
        raise RuntimeError(
            f"password login unavailable (state={state} actions={actions}); OTP required"
        )

    verified = post("/api/v1/auth/password/verify", {"password": password})
    if verified.get("state") != "authenticated" and verified.get("_http", 200) >= 400:
        raise RuntimeError(f"password/verify failed: {verified}")

    # JWT (x-access-token) is issued on /api/public/authentication/me after login,
    # not on password/verify itself.
    try:
        me_req = urllib.request.Request(
            f"{BASE}/api/public/authentication/me",
            headers={
                "Accept": "application/json",
                "Origin": BASE,
                "Referer": f"{BASE}/dashboard",
                "User-Agent": "Mozilla/5.0 ForgeFarazAuth/1.1",
            },
        )
        with opener.open(me_req, timeout=45) as resp:
            _ = resp.read()
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"authentication/me failed after login: {exc.code} {exc.read()[:200]!r}") from exc

    cookies = {c.name: c.value for c in jar}
    token = cookies.get("x-access-token") or ""
    if not token:
        token = (
            verified.get("token")
            or verified.get("accessToken")
            or (verified.get("user") or {}).get("token")
            or ""
        )
    if not token:
        raise RuntimeError(
            f"login ok but no x-access-token after /me: cookies={list(cookies)} body_keys={list(verified)[:20]}"
        )

    session = cookies.get("farazSession", "")
    parts = []
    if session:
        parts.append(f"farazSession={session}")
    parts.append(f"x-access-token={token}")
    # Keep analytics cookies if present (harmless; matches browser shape).
    for name in ("_ga", "_gcl_au", "_ga_KN4Q26LJC0", "faraz-client-ip"):
        if name in cookies:
            parts.append(f"{name}={cookies[name]}")
    cookie_header = "; ".join(parts)

    payload = _decode_jwt(token)
    user_id = str(payload.get("_id") or "")
    exp = int(payload.get("exp") or 0)
    if not user_id or exp <= 0:
        raise RuntimeError(f"bad jwt payload: {payload}")
    return cookie_header, token, user_id, exp


def write_env(path: str, cookie: str, token: str, user_id: str) -> None:
    body = (
        f"FARAZ_COOKIE={_q(cookie)}\n"
        f"FARAZ_USER_ID={_q(user_id)}\n"
        f"FARAZ_TOKEN={_q(token)}\n"
    )
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(body)
    try:
        os.chmod(path, 0o600)
    except OSError:
        pass


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--phone", default=os.environ.get("FARAZ_PHONE", "").strip())
    ap.add_argument("--password", default=os.environ.get("FARAZ_PASSWORD", "").strip())
    ap.add_argument(
        "--write",
        action="append",
        default=[],
        help="EnvironmentFile path to write (repeatable)",
    )
    ap.add_argument("--print-exp", action="store_true", help="Print JWT expiry only")
    args = ap.parse_args()
    if not args.phone or not args.password:
        print("FARAZ_PHONE and FARAZ_PASSWORD (or --phone/--password) required", file=sys.stderr)
        return 2
    cookie, token, user_id, exp = login(args.phone, args.password)
    for path in args.write:
        write_env(path, cookie, token, user_id)
        print(f"wrote {path} uid={user_id} exp={exp} in_h={round((exp - time.time()) / 3600, 2)}")
    if args.print_exp or not args.write:
        print(f"uid={user_id} exp={exp} in_h={round((exp - time.time()) / 3600, 2)} cookie_len={len(cookie)}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:  # noqa: BLE001
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1)
