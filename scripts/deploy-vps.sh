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

echo "Uploading /assets/forge hashed bundles"
tar -C dist/assets -cf - . | "${SSH[@]}" "${USER}@${HOST}" \
  "rm -rf '${REMOTE_ANIL_ASSETS}' && mkdir -p '${REMOTE_ANIL_ASSETS}' && tar -C '${REMOTE_ANIL_ASSETS}' -xf - && chown -R www-data:www-data '${REMOTE_ANIL_ASSETS}'"

echo "Uploading /charts/index.html (+ brand icons / manifest + static docs if present)"
"${SCP[@]}" dist/index.html "${USER}@${HOST}:${REMOTE_ANIL_CHARTS}/index.html"
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
# Sync immediately after Anil upload so a later SSH timeout cannot leave
# index.html pointing at a missing hashed bundle (Cloudflare then caches 404).
echo "Syncing Forge web root → ${REMOTE_FORGE_WEB} (critical path)"
"${SSH[@]}" "${USER}@${HOST}" bash -s <<REMOTE
set -euo pipefail
ANIL_DIST='/var/www/anil/frontend/dist'
REMOTE_FORGE_WEB='${REMOTE_FORGE_WEB}'
mkdir -p "\${REMOTE_FORGE_WEB}/charts" "\${REMOTE_FORGE_WEB}/assets/forge"
if [[ -d "\${ANIL_DIST}/charts" && -d "\${ANIL_DIST}/assets/forge" ]]; then
  rsync -a --delete --exclude charting_library "\${ANIL_DIST}/charts/" "\${REMOTE_FORGE_WEB}/charts/"
  rsync -a --delete "\${ANIL_DIST}/assets/forge/" "\${REMOTE_FORGE_WEB}/assets/forge/"
  if [[ -d "\${ANIL_DIST}/charts/brand" ]]; then
    rsync -a "\${ANIL_DIST}/charts/brand/" "\${REMOTE_FORGE_WEB}/charts/brand/"
  fi
  chown -R www-data:www-data "\${REMOTE_FORGE_WEB}/charts" "\${REMOTE_FORGE_WEB}/assets/forge"
  INDEX_JS=\$(grep -oE 'index-[^\"/]+\\.js' "\${REMOTE_FORGE_WEB}/charts/index.html" | head -1 || true)
  if [[ -n "\${INDEX_JS}" && ! -f "\${REMOTE_FORGE_WEB}/assets/forge/\${INDEX_JS}" ]]; then
    echo "ERROR: forge-web missing \${INDEX_JS} after sync" >&2
    exit 1
  fi
  echo "Synced forge-web from Anil dist (\${INDEX_JS:-ok})"
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

echo "Ensuring nginx serves /charting_library/ from forge-web charts tree"
"${SSH[@]}" "${USER}@${HOST}" bash -s <<'REMOTE'
set -euo pipefail
SNIP=/etc/nginx/snippets/forge-charting-library.conf
cat > "$SNIP" <<'EOF'
# Charting Library at /charting_library/ → /var/www/forge-web/charts/charting_library/
location ^~ /charting_library/ {
    root /var/www/forge-web/charts;
    expires 5m;
    add_header Cache-Control "public, max-age=300, must-revalidate" always;
    add_header X-Content-Type-Options nosniff always;
    try_files $uri =404;
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
for conf in /etc/nginx/sites-enabled/forgechart /etc/nginx/sites-enabled/forge-landing-8088; do
  if [[ -f "$conf" ]] && ! grep -q 'forge-charting-library.conf' "$conf"; then
    python3 - <<PY
from pathlib import Path
p = Path("$conf")
text = p.read_text()
needle = "include /etc/nginx/snippets/cp-fetcher-api.conf;"
inc = "include /etc/nginx/snippets/forge-charting-library.conf;\n\n    "
if "forge-charting-library.conf" not in text:
    p.write_text(text.replace(needle, inc + needle))
    print(f"patched {p}")
PY
  fi
done
nginx -t && systemctl reload nginx
REMOTE

echo "Done."
echo "  https://forgechart.ir/charts/"
echo "  http://${HOST}:8088/charts/"
echo "  http://${HOST}/charts/"
