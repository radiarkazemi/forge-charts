#!/usr/bin/env bash
# Deploy Forge Charts (latest build) to the cp_fetcher / goldanil VPS.
# Usage:
#   VPS_HOST=[REDACTED].116 VPS_USER=root ./scripts/deploy-vps.sh
# Password auth: SSHPASS='...' ./scripts/deploy-vps.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOST="${VPS_HOST:-[REDACTED].116}"
USER="${VPS_USER:-root}"
REMOTE_APP="${REMOTE_APP:-/var/www/forge-charts}"
REMOTE_ANIL_CHARTS="${REMOTE_ANIL_CHARTS:-/var/www/anil/frontend/dist/charts}"
REMOTE_ANIL_ASSETS="${REMOTE_ANIL_ASSETS:-/var/www/anil/frontend/dist/assets/forge}"
REMOTE_FORGE_WEB="${REMOTE_FORGE_WEB:-/var/www/forge-web}"

SSH=(ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=30 -o ServerAliveInterval=10)
SCP=(scp -o StrictHostKeyChecking=accept-new -o ConnectTimeout=30)
if [[ -n "${SSHPASS:-}" ]]; then
  SSH=(sshpass -e ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=30 -o ServerAliveInterval=10)
  SCP=(sshpass -e scp -o StrictHostKeyChecking=accept-new -o ConnectTimeout=30)
fi

cd "$ROOT"
pnpm run build

echo "Ensuring remote dirs on ${USER}@${HOST}"
"${SSH[@]}" "${USER}@${HOST}" "mkdir -p '${REMOTE_ANIL_ASSETS}' '${REMOTE_ANIL_CHARTS}' '${REMOTE_APP}/assets'"

# Merge hashed bundles — never wipe the directory. Stale HTML / CF edges may
# still request the previous index-*.js for a short window; deleting it 404s the app.
echo "Uploading /assets/forge hashed bundles (keep prior hashes)"
"${SSH[@]}" "${USER}@${HOST}" "mkdir -p '${REMOTE_ANIL_ASSETS}'"
tar -C dist/assets -cf - . | "${SSH[@]}" "${USER}@${HOST}" \
  "tar -C '${REMOTE_ANIL_ASSETS}' -xf - && chown -R www-data:www-data '${REMOTE_ANIL_ASSETS}'"

echo "Uploading /charts/ static docs (index.html after assets)"
if [[ -f dist/charts/tv-header.css ]]; then
  "${SCP[@]}" dist/charts/tv-header.css "${USER}@${HOST}:${REMOTE_ANIL_CHARTS}/tv-header.css"
fi
if [[ -f dist/charts/tv-header-secondary.css ]]; then
  "${SCP[@]}" dist/charts/tv-header-secondary.css "${USER}@${HOST}:${REMOTE_ANIL_CHARTS}/tv-header-secondary.css"
fi
if [[ -f dist/charts/tv-header-mobile.css ]]; then
  "${SCP[@]}" dist/charts/tv-header-mobile.css "${USER}@${HOST}:${REMOTE_ANIL_CHARTS}/tv-header-mobile.css"
fi
if [[ -d dist/brand ]]; then
  tar -C dist -cf - brand | "${SSH[@]}" "${USER}@${HOST}" \
    "rm -rf '${REMOTE_ANIL_CHARTS}/brand' && tar -C '${REMOTE_ANIL_CHARTS}' -xf -"
fi
if [[ -f dist/site.webmanifest ]]; then
  "${SCP[@]}" dist/site.webmanifest "${USER}@${HOST}:${REMOTE_ANIL_CHARTS}/site.webmanifest"
fi
if [[ -f dist/sample-ohlc.json ]]; then
  "${SCP[@]}" dist/sample-ohlc.json "${USER}@${HOST}:${REMOTE_ANIL_CHARTS}/sample-ohlc.json" || true
fi
if [[ -f CHECKLIST.md ]]; then
  "${SCP[@]}" CHECKLIST.md "${USER}@${HOST}:${REMOTE_ANIL_CHARTS}/CHECKLIST.md" || true
fi
if [[ -f CHART-APP-INTEGRATION.md ]]; then
  "${SCP[@]}" CHART-APP-INTEGRATION.md "${USER}@${HOST}:${REMOTE_ANIL_CHARTS}/CHART-APP-INTEGRATION.md" || true
fi
if [[ -f EMBED.md ]]; then
  "${SCP[@]}" EMBED.md "${USER}@${HOST}:${REMOTE_ANIL_CHARTS}/EMBED.md" || true
fi
if [[ -f SUPERCHART-PARITY.md ]]; then
  "${SCP[@]}" SUPERCHART-PARITY.md "${USER}@${HOST}:${REMOTE_ANIL_CHARTS}/SUPERCHART-PARITY.md" || true
fi
"${SSH[@]}" "${USER}@${HOST}" "chown -R www-data:www-data '${REMOTE_ANIL_CHARTS}'"

# Critical: forgechart.ir nginx serves /assets/forge/ + /charts/ from forge-web.
# Assets first (keep old hashes), then HTML — never publish HTML before its bundles.
echo "Syncing Forge web root → ${REMOTE_FORGE_WEB} (critical path)"
"${SCP[@]}" dist/index.html "${USER}@${HOST}:${REMOTE_ANIL_CHARTS}/index.html"
"${SSH[@]}" "${USER}@${HOST}" bash -s <<REMOTE
set -euo pipefail
ANIL_DIST='/var/www/anil/frontend/dist'
REMOTE_FORGE_WEB='${REMOTE_FORGE_WEB}'
mkdir -p "\${REMOTE_FORGE_WEB}/charts" "\${REMOTE_FORGE_WEB}/assets/forge"
if [[ -d "\${ANIL_DIST}/charts" && -d "\${ANIL_DIST}/assets/forge" ]]; then
  # Keep prior hashed files so mid-flight clients / CF edges do not 404.
  rsync -a "\${ANIL_DIST}/assets/forge/" "\${REMOTE_FORGE_WEB}/assets/forge/"
  rsync -a --exclude charting_library --exclude index.html "\${ANIL_DIST}/charts/" "\${REMOTE_FORGE_WEB}/charts/"
  if [[ -d "\${ANIL_DIST}/charts/brand" ]]; then
    rsync -a "\${ANIL_DIST}/charts/brand/" "\${REMOTE_FORGE_WEB}/charts/brand/"
  fi
  # HTML last — prefer stable forge-app.js entry when present.
  cp -f "\${ANIL_DIST}/charts/index.html" "\${REMOTE_FORGE_WEB}/charts/index.html"
  chown -R www-data:www-data "\${REMOTE_FORGE_WEB}/charts" "\${REMOTE_FORGE_WEB}/assets/forge"
  ENTRY=\$(grep -oE '/assets/forge/[^\"]+\\.js' "\${REMOTE_FORGE_WEB}/charts/index.html" | head -1 || true)
  ENTRY_BASE=\$(basename "\${ENTRY:-}")
  if [[ -n "\${ENTRY_BASE}" && ! -f "\${REMOTE_FORGE_WEB}/assets/forge/\${ENTRY_BASE}" ]]; then
    echo "ERROR: forge-web missing \${ENTRY_BASE} after sync" >&2
    exit 1
  fi
  if [[ ! -f "\${REMOTE_FORGE_WEB}/assets/forge/forge-main.js" ]]; then
    echo "ERROR: forge-web missing stable forge-main.js" >&2
    exit 1
  fi
  echo "Synced forge-web from Anil dist (\${ENTRY_BASE:-ok})"
else
  echo "ERROR: Anil dist missing charts/assets" >&2
  exit 1
fi
REMOTE

echo "Mirroring slim dist → ${REMOTE_APP} (excludes charting_library)"
tar -C dist --exclude=charting_library --exclude=charts -cf - . | "${SSH[@]}" "${USER}@${HOST}" \
  "tar -C '${REMOTE_APP}' -xf - && chown -R www-data:www-data '${REMOTE_APP}'"

echo "Restoring charting_library under forge-web"
"${SSH[@]}" "${USER}@${HOST}" bash -s <<REMOTE
set -euo pipefail
REMOTE_FORGE_WEB='${REMOTE_FORGE_WEB}'
REMOTE_APP='${REMOTE_APP}'
CLIB_SRC=""
for candidate in \
  "\${REMOTE_APP}/charting_library" \
  /var/www/forge-charts/charting_library \
  /var/www/forge-charts-src/public/charting_library
do
  if [[ -f "\${candidate}/charting_library.js" ]]; then
    CLIB_SRC="\${candidate}"
    break
  fi
done
if [[ -n "\${CLIB_SRC}" ]]; then
  mkdir -p "\${REMOTE_FORGE_WEB}/charts"
  rsync -a --delete "\${CLIB_SRC}/" "\${REMOTE_FORGE_WEB}/charts/charting_library/"
  chown -R www-data:www-data "\${REMOTE_FORGE_WEB}/charts/charting_library"
  chmod -R a+rX "\${REMOTE_FORGE_WEB}/charts/charting_library"
  echo "Ensured charting_library → \${REMOTE_FORGE_WEB}/charts/charting_library (from \${CLIB_SRC})"
else
  echo "ERROR: charting_library.js not found on server — charts will fail to load" >&2
fi
REMOTE

echo "Ensuring nginx serves charting_library + stable forge-app entry (no CF 404 cache)"
# HOST is expanded into the remote script so index.html can advertise the CF bypass URL.
"${SSH[@]}" "${USER}@${HOST}" bash -s <<REMOTE
set -euo pipefail
ORIGIN_HOST='${HOST}'
SNIP=/etc/nginx/snippets/forge-charting-library.conf
cat > "\$SNIP" <<'EOF'
# Charting Library at /charting_library/ → /var/www/forge-web/charts/charting_library/
# Long cache: ~2k bundles; short TTL forces IR/CF clients to re-open many TCP flows
# (connection reset risk). Entry script stays no-cache.
location ^~ /charting_library/ {
    root /var/www/forge-web/charts;
    sendfile on;
    tcp_nopush on;
    send_timeout 120s;
    expires 7d;
    add_header Cache-Control "public, max-age=604800" always;
    add_header X-Content-Type-Options nosniff always;
    try_files \$uri =404;
}
# Entry script: avoid Cloudflare caching a temporary 404 for hours.
location = /charting_library/charting_library.js {
    root /var/www/forge-web/charts;
    default_type application/javascript;
    expires -1;
    add_header Cache-Control "no-cache, must-revalidate" always;
    add_header X-Content-Type-Options nosniff always;
    try_files /charting_library/charting_library.js =404;
}
EOF

# Stable SPA entry + never let Cloudflare cache a missing hashed bundle.
ASSET_SNIP=/etc/nginx/snippets/forge-assets.conf
cat > "\$ASSET_SNIP" <<'EOF'
# Stable entries — overwritten each deploy; must not be immutable-cached.
# forge-app.js kept as alias for any mid-flight HTML; forge-main.js is current.
location = /assets/forge/forge-main.js {
    root /var/www/forge-web;
    default_type application/javascript;
    expires -1;
    etag off;
    if_modified_since off;
    add_header Cache-Control "no-store, no-cache, must-revalidate, max-age=0" always;
    add_header CDN-Cache-Control "no-store" always;
    add_header Pragma "no-cache" always;
    add_header X-Content-Type-Options nosniff always;
    try_files /assets/forge/forge-main.js =404;
}
location = /assets/forge/forge-app.js {
    root /var/www/forge-web;
    default_type application/javascript;
    expires -1;
    etag off;
    if_modified_since off;
    add_header Cache-Control "no-store, no-cache, must-revalidate, max-age=0" always;
    add_header CDN-Cache-Control "no-store" always;
    add_header Pragma "no-cache" always;
    add_header X-Content-Type-Options nosniff always;
    try_files /assets/forge/forge-main.js =404;
}
location /assets/forge/ {
    root /var/www/forge-web;
    send_timeout 120s;
    expires 7d;
    add_header Cache-Control "public, max-age=604800" always;
    add_header X-Content-Type-Options nosniff always;
    try_files \$uri @forge_asset_miss;
}
# Stale HTML sometimes asks for an old hashed entry (index-XXXX.js). Never let
# Cloudflare cache that 404 as immutable — send them the stable forge-main.js.
location @forge_asset_miss {
    default_type text/plain;
    add_header Cache-Control "no-store" always;
    add_header CDN-Cache-Control "no-store" always;
    if (\$uri ~* "^/assets/forge/index-.+\.js\$") {
        return 302 /assets/forge/forge-main.js;
    }
    return 404;
}
EOF

# HTTP :8089 Forge-only fallback (bypasses Cloudflare — for IR "connection was reset").
FALLBACK=/etc/nginx/sites-enabled/forge-charts-fallback
cat > "\$FALLBACK" <<EOF
# Forge charts HTTP fallback — dedicated Forge tree only (no Anil homepage).
# Port 8089 is not proxied by Cloudflare; use when forgechart.ir RST mid-TLS.
server {
    listen 8089;
    listen [::]:8089;
    server_name _;

    client_max_body_size 12m;
    sendfile on;
    tcp_nodelay on;
    send_timeout 120s;
    keepalive_timeout 75s;

    gzip on;
    gzip_vary on;
    gzip_min_length 256;
    gzip_types text/css application/javascript application/json font/woff2 image/svg+xml text/plain;

    root /var/www/forge-web;

    location = / {
        return 302 /charts/;
    }

    location /charts/ {
        try_files \\\$uri \\\$uri/ /charts/index.html;
        add_header Cache-Control "no-store" always;
    }

    include /etc/nginx/snippets/forge-charting-library.conf;
    include /etc/nginx/snippets/forge-assets.conf;
    include /etc/nginx/snippets/cp-fetcher-api.conf;
}
EOF

# Inject origin fallback URL into charts index (helps users who get HTML but not bundles).
CHART_INDEX=/var/www/forge-web/charts/index.html
if [[ -f "\$CHART_INDEX" ]]; then
  python3 - "\$CHART_INDEX" "\$ORIGIN_HOST" <<'PY'
from pathlib import Path
import sys
p = Path(sys.argv[1])
host = sys.argv[2].strip()
text = p.read_text()
fallback = f"http://{host}:8088/charts/"
snippet = f'<script>window.__FORGE_ORIGIN_FALLBACK__={fallback!r};</script>\n'
import re
# Boot UI references the name as a string — only replace an existing assignment tag.
assign_re = re.compile(
    r"<script>window\.__FORGE_ORIGIN_FALLBACK__=.*?</script>\n?",
)
if assign_re.search(text):
    text = assign_re.sub(snippet, text, count=1)
elif "</head>" in text:
    text = text.replace("</head>", snippet + "</head>", 1)
else:
    text = snippet + text
p.write_text(text)
print(f"injected origin fallback → {fallback}")
PY
fi

for conf in /etc/nginx/sites-enabled/forgechart /etc/nginx/sites-enabled/forge-landing-8088 /etc/nginx/sites-enabled/forge-charts-fallback; do
  [[ -f "\$conf" ]] || continue
  python3 - "\$conf" <<'PY'
from pathlib import Path
import re
import sys
p = Path(sys.argv[1])
text = p.read_text()
changed = False

# Restore visitor IPs behind Cloudflare (logging / rate limits).
realip = "include /etc/nginx/snippets/cloudflare-realip.conf;\n"
if "forgechart.ir" in text and "cloudflare-realip.conf" not in text:
    # Insert once after the first server_name line in each server block that names forgechart.
    lines = text.splitlines(keepends=True)
    out = []
    i = 0
    while i < len(lines):
        if re.match(r"server\s*\{", lines[i].strip()) or lines[i].strip() == "server {":
            block = [lines[i]]
            depth = lines[i].count("{") - lines[i].count("}")
            i += 1
            while i < len(lines) and depth > 0:
                block.append(lines[i])
                depth += lines[i].count("{") - lines[i].count("}")
                i += 1
            blk = "".join(block)
            if "forgechart.ir" in blk and "cloudflare-realip.conf" not in blk:
                inserted = False
                for j, line in enumerate(block):
                    if "server_name" in line and "forgechart.ir" in line:
                        block.insert(j + 1, "    " + realip)
                        inserted = True
                        break
                if not inserted:
                    block.insert(1, "    " + realip)
                blk = "".join(block)
                changed = True
                print(f"patched real_ip in {p}")
            out.append(blk)
            continue
        out.append(lines[i])
        i += 1
    text = "".join(out)

# Per server-block: ensure forge-assets.conf is included (HTTP + HTTPS + 8089).
lines = text.splitlines(keepends=True)
out = []
i = 0
inc_line = "    include /etc/nginx/snippets/forge-assets.conf;\n"
while i < len(lines):
    if re.match(r"server\s*\{", lines[i].strip()) or lines[i].strip() == "server {":
        block = [lines[i]]
        depth = lines[i].count("{") - lines[i].count("}")
        i += 1
        while i < len(lines) and depth > 0:
            block.append(lines[i])
            depth += lines[i].count("{") - lines[i].count("}")
            i += 1
        blk = "".join(block)
        needs = ("forge-web" in blk or "forgechart.ir" in blk or "8088" in blk or "8089" in blk) and (
            "forge-assets.conf" not in blk
        )
        if needs:
            for anchor in (
                "include /etc/nginx/snippets/forge-charts-nocache.conf;\n",
                "include /etc/nginx/snippets/forge-charting-library.conf;\n",
                "include /etc/nginx/snippets/cp-fetcher-api.conf;\n",
            ):
                if anchor in blk:
                    blk = blk.replace(anchor, anchor + inc_line, 1)
                    changed = True
                    print(f"patched server block in {p}")
                    break
        out.append(blk)
        continue
    out.append(lines[i])
    i += 1
text = "".join(out)

for snip in ("forge-charting-library.conf",):
    inc = f"include /etc/nginx/snippets/{snip};"
    if inc not in text:
        needle = "include /etc/nginx/snippets/cp-fetcher-api.conf;"
        if needle in text:
            text = text.replace(needle, inc + "\n\n    " + needle, 1)
            changed = True
            print(f"patched {p} + {snip}")

def comment_block(match: re.Match[str]) -> str:
    lines = match.group(0).splitlines(keepends=True)
    out = []
    for line in lines:
        stripped = line.lstrip()
        if not stripped or stripped.startswith("#"):
            out.append(line)
        else:
            out.append(re.sub(r"^(\s*)", r"\1# ", line, count=1))
    return "".join(out)

new_text, n = re.subn(
    r"(?m)^[ \t]*location /assets/forge/ \{.*?^[ \t]*\}[ \t]*\n?",
    comment_block,
    text,
    flags=re.S,
)
if n:
    text = new_text
    changed = True
    print(f"commented {n} inline /assets/forge/ in {p}")

# Longer send/keepalive on forgechart HTTPS (large CL fan-out).
if "forgechart.ir" in text and "send_timeout 120s" not in text:
    text2, n2 = re.subn(
        r"(listen \[::\]:443 ssl http2;\n)",
        r"\1    send_timeout 120s;\n    keepalive_timeout 75s;\n",
        text,
        count=1,
    )
    if n2:
        text = text2
        changed = True
        print(f"patched timeouts in {p}")

if changed:
    p.write_text(text)
PY
done
nginx -t && systemctl reload nginx
REMOTE

echo "Done."
echo "  https://forgechart.ir/charts/"
echo "  http://${HOST}:8088/charts/   # CF bypass (IR connection-reset)"
echo "  http://${HOST}:8089/charts/   # CF bypass (Forge-only)"
echo "  http://${HOST}/charts/"
