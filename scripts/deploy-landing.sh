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

echo "Installing nginx configs (Forge :8088/:8089 + forgechart.ir, Danora :8092)"
"${SCP[@]}" \
  deploy/nginx/forge-landing-8088.conf \
  deploy/nginx/forge-charts-fallback.conf \
  deploy/nginx/forgechart.conf \
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
install -m 644 /tmp/forgechart.conf /etc/nginx/sites-available/forgechart
install -m 644 /tmp/danora.conf /etc/nginx/sites-available/danora

# Bootstrap TLS for forgechart.ir (Cloudflare Full needs :443 on origin).
mkdir -p /etc/ssl/forgechart /var/www/forge-landing/.well-known/acme-challenge
if [[ -f /etc/letsencrypt/live/forgechart.ir/fullchain.pem ]]; then
  ln -sfn /etc/letsencrypt/live/forgechart.ir/fullchain.pem /etc/ssl/forgechart/fullchain.pem
  ln -sfn /etc/letsencrypt/live/forgechart.ir/privkey.pem /etc/ssl/forgechart/privkey.pem
  echo "Using Let's Encrypt cert for forgechart.ir"
elif [[ ! -f /etc/ssl/forgechart/privkey.pem || ! -f /etc/ssl/forgechart/fullchain.pem ]]; then
  openssl req -x509 -nodes -newkey rsa:2048 -days 825 \
    -keyout /etc/ssl/forgechart/privkey.pem \
    -out /etc/ssl/forgechart/fullchain.pem \
    -subj "/CN=forgechart.ir" \
    -addext "subjectAltName=DNS:forgechart.ir,DNS:www.forgechart.ir"
  echo "Created self-signed bootstrap cert for forgechart.ir"
fi
chown -R www-data:www-data /var/www/forge-landing/.well-known || true

ln -sfn /etc/nginx/sites-available/forge-landing-8088 /etc/nginx/sites-enabled/forge-landing-8088
ln -sfn /etc/nginx/sites-available/forge-charts-fallback /etc/nginx/sites-enabled/forge-charts-fallback
ln -sfn /etc/nginx/sites-available/forgechart /etc/nginx/sites-enabled/forgechart
ln -sfn /etc/nginx/sites-available/danora /etc/nginx/sites-enabled/danora

rm -f /etc/nginx/sites-enabled/forge-landing-8088.bak 2>/dev/null || true

ufw allow 8092/tcp comment 'Danora staging' || true
nginx -t
systemctl reload nginx
ss -tlnp | grep -E ':80 |:443 |:8088|:8089|:8092' || true
echo "nginx reloaded"

RESOLVED="\$(dig +short forgechart.ir A 2>/dev/null | head -1 || true)"
echo "forgechart.ir A currently resolves to: \${RESOLVED:-<none>}"
if [[ -n "\${RESOLVED}" && ! -f /etc/letsencrypt/live/forgechart.ir/fullchain.pem ]]; then
  certbot certonly --webroot -w /var/www/forge-landing \
    -d forgechart.ir -d www.forgechart.ir \
    --non-interactive --agree-tos --register-unsafely-without-email \
    || echo "WARN: certbot skipped/failed (DNS may still be propagating)" >&2
  if [[ -f /etc/letsencrypt/live/forgechart.ir/fullchain.pem ]]; then
    ln -sfn /etc/letsencrypt/live/forgechart.ir/fullchain.pem /etc/ssl/forgechart/fullchain.pem
    ln -sfn /etc/letsencrypt/live/forgechart.ir/privkey.pem /etc/ssl/forgechart/privkey.pem
    nginx -t && systemctl reload nginx
    echo "Installed Let's Encrypt cert for forgechart.ir"
  fi
fi
REMOTE

echo "Done."
echo "  Forge domain  : https://forgechart.ir/  (and http://)"
echo "  Forge charts  : https://forgechart.ir/charts/"
echo "  Forge landing : http://${HOST}:8088/"
echo "  Forge charts  : http://${HOST}:8088/charts/"
echo "  Forge fallback: http://${HOST}:8089/charts/"
echo "  Danora staging: http://${HOST}:8092/"
echo "  Danora public : https://danoura.ir/ (hostname)"
