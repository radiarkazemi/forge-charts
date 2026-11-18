#!/usr/bin/env python3
"""Insert chart rate limits into live nginx snippets. Safe to run more than once."""

from __future__ import annotations

from pathlib import Path

ZONES = Path("/etc/nginx/conf.d/forge-chart-limit-zones.conf")
PROFILE = Path("/etc/nginx/snippets/forge-profile-sync.conf")
API = Path("/etc/nginx/snippets/cp-fetcher-api.conf")

ZONE_TEXT = """# Chart traffic caps. Include from http { } (nginx conf.d).
limit_req_zone $binary_remote_addr zone=forge_profile:10m rate=4r/s;
limit_req_zone $binary_remote_addr zone=forge_tvhist:10m rate=2r/s;
limit_req_zone $binary_remote_addr zone=forge_chart:10m rate=8r/s;
limit_conn_zone $binary_remote_addr zone=forge_ws:10m;
"""


def ensure_line_after(text: str, needle: str, insert: str) -> str:
    if insert.strip() in text:
        return text
    idx = text.find(needle)
    if idx < 0:
        return text
    end = text.find("\n", idx)
    return text[: end + 1] + insert + text[end + 1 :]


def main() -> None:
    ZONES.write_text(ZONE_TEXT)
    if PROFILE.exists():
        body = PROFILE.read_text()
        body = ensure_line_after(body, "location ^~ /api/forge-profile/ {", "    limit_req zone=forge_profile burst=20 nodelay;\n")
        PROFILE.write_text(body)
    if API.exists():
        body = API.read_text()
        body = ensure_line_after(body, "location /tv-history {", "    limit_req zone=forge_tvhist burst=20 nodelay;\n")
        body = ensure_line_after(body, "location /crypto-chart/ {", "    limit_req zone=forge_chart burst=40 nodelay;\n")
        body = ensure_line_after(body, "location /iran-gold/ {", "    limit_req zone=forge_chart burst=40 nodelay;\n")
        body = ensure_line_after(body, "location /market-ticks {", "    limit_conn forge_ws 8;\n")
        API.write_text(body)
    print("patched")


if __name__ == "__main__":
    main()
