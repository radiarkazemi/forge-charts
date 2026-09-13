#!/usr/bin/env bash
# Deploy Forge-only landing on :8088 and isolate chart/Danora URLs.
# Usage: SSHPASS='...' ./scripts/deploy-landing.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOST="${VPS_HOST:-185.222.163.116}"
USER="${VPS_USER:-root}"
REMOTE_LANDING="${REMOTE_LANDING:-/var/www/forge-landing}"
REMOTE_FORGE_WEB="${REMOTE_FORGE_WEB:-/var/www/forge-web}"
ANIL_DIST="${ANIL_DIST:-/var/www/anil/frontend/dist}"

SSH=(ssh -o StrictHostKeyChecking=accept-new)
SCP=(scp -o StrictHostKeyChecking=accept-new)
if [[ -n "${SSHPASS:-}" ]]; then
  SSH=(sshpass -e ssh -o StrictHostKeyChecking=accept-new)
  SCP=(sshpass -e scp -o StrictHostKeyChecking=accept-new)
fi

cd "$ROOT"

echo "Uploading Forge landing → ${USER}@${HOST}:${REMOTE_LANDING}"
"${SSH[@]}" "${USER}@${HOST}" "mkdir -p '${REMOTE_LANDING}/brand'"
tar -C landing -cf - . | "${SSH[@]}" "${USER}@${HOST}" \
  "tar -C '${REMOTE_LANDING}' -xf - && chown -R www-data:www-data '${REMOTE_LANDING}'"

echo "Installing nginx configs (Forge :8088/:8089, Danora :8092)"
"${SCP[@]}" \
  deploy/nginx/forge-landing-8088.conf \
  deploy/nginx/forge-charts-fallback.conf \
  deploy/nginx/danora.conf \
  "${USER}@${HOST}:/tmp/"

"${SSH[@]}" "${USER}@${HOST}" bash -s <<REMOTE
set -euo pipefail
ANIL_DIST='${ANIL_DIST}'
REMOTE_FORGE_WEB='${REMOTE_FORGE_WEB}'

# Build a Forge-only web root: charts + forge assets (no Anil marketing site)
mkdir -p "\${REMOTE_FORGE_WEB}/charts" "\${REMOTE_FORGE_WEB}/assets/forge"
if [[ -d "\${ANIL_DIST}/charts" && -d "\${ANIL_DIST}/assets/forge" ]]; then
  rsync -a --delete "\${ANIL_DIST}/charts/" "\${REMOTE_FORGE_WEB}/charts/"
  rsync -a --delete "\${ANIL_DIST}/assets/forge/" "\${REMOTE_FORGE_WEB}/assets/forge/"
  # Keep brand icons next to charts for relative ./brand/ links
  if [[ -d "\${ANIL_DIST}/charts/brand" ]]; then
    rsync -a "\${ANIL_DIST}/charts/brand/" "\${REMOTE_FORGE_WEB}/charts/brand/"
  fi
  chown -R www-data:www-data "\${REMOTE_FORGE_WEB}"
  echo "Synced Forge charts tree from Anil dist into \${REMOTE_FORGE_WEB}"
else
  echo "WARN: \${ANIL_DIST}/charts or assets/forge missing — leaving existing forge-web as-is" >&2
fi

install -m 644 /tmp/forge-landing-8088.conf /etc/nginx/sites-available/forge-landing-8088
install -m 644 /tmp/forge-charts-fallback.conf /etc/nginx/sites-available/forge-charts-fallback
install -m 644 /tmp/danora.conf /etc/nginx/sites-available/danora

ln -sfn /etc/nginx/sites-available/forge-landing-8088 /etc/nginx/sites-enabled/forge-landing-8088
ln -sfn /etc/nginx/sites-available/forge-charts-fallback /etc/nginx/sites-enabled/forge-charts-fallback
ln -sfn /etc/nginx/sites-available/danora /etc/nginx/sites-enabled/danora

# Remove legacy confusing site names if present
rm -f /etc/nginx/sites-enabled/forge-landing-8088.bak 2>/dev/null || true

ufw allow 8092/tcp comment 'Danora staging' || true
nginx -t
systemctl reload nginx
ss -tlnp | grep -E ':8088|:8089|:8092' || true
echo "nginx reloaded"
REMOTE

echo "Done."
echo "  Forge landing : http://${HOST}:8088/"
echo "  Forge charts  : http://${HOST}:8088/charts/"
echo "  Forge fallback: http://${HOST}:8089/charts/"
echo "  Danora staging: http://${HOST}:8092/"
echo "  Danora public : https://danoura.ir/ (hostname)"
