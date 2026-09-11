#!/usr/bin/env bash
# Deploy Forge Charts + FXPro/news Node feeds to the goldanil VPS.
# Usage:
#   VPS_HOST=185.222.163.116 VPS_USER=root ./scripts/deploy-vps.sh
# Password auth: SSHPASS='...' ./scripts/deploy-vps.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOST="${VPS_HOST:-185.222.163.116}"
USER="${VPS_USER:-root}"
REMOTE_APP="${REMOTE_APP:-/var/www/forge-charts}"
REMOTE_SRC="${REMOTE_SRC:-/opt/forge-charts}"
REMOTE_ANIL_CHARTS="${REMOTE_ANIL_CHARTS:-/var/www/anil/frontend/dist/charts}"
REMOTE_ANIL_ASSETS="${REMOTE_ANIL_ASSETS:-/var/www/anil/frontend/dist/assets/forge}"

SSH=(ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15)
SCP=(scp -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15)
if [[ -n "${SSHPASS:-}" ]]; then
  if ! command -v sshpass >/dev/null 2>&1; then
    echo "sshpass is required for SSHPASS=..." >&2
    exit 1
  fi
  SSH=(sshpass -e ssh -o PreferredAuthentications=password -o PubkeyAuthentication=no -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15)
  SCP=(sshpass -e scp -o PreferredAuthentications=password -o PubkeyAuthentication=no -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15)
else
  SSH=(ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15)
  SCP=(scp -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15)
fi

cd "$ROOT"
echo "Building production SPA (base /charts/, assets /assets/forge/)"
npm run build

echo "Ensuring remote dirs on ${USER}@${HOST}"
"${SSH[@]}" "${USER}@${HOST}" "mkdir -p '${REMOTE_ANIL_ASSETS}' '${REMOTE_ANIL_CHARTS}' '${REMOTE_APP}/assets' '${REMOTE_SRC}/server' /var/lib/forge-charts /etc/nginx/snippets"

echo "Uploading /assets/forge hashed bundles"
tar -C dist/assets -cf - . | "${SSH[@]}" "${USER}@${HOST}" \
  "rm -rf '${REMOTE_ANIL_ASSETS}' && mkdir -p '${REMOTE_ANIL_ASSETS}' && tar -C '${REMOTE_ANIL_ASSETS}' -xf - && chown -R www-data:www-data '${REMOTE_ANIL_ASSETS}'"

echo "Uploading /charts/index.html"
"${SCP[@]}" dist/index.html "${USER}@${HOST}:${REMOTE_ANIL_CHARTS}/index.html"
"${SSH[@]}" "${USER}@${HOST}" "chown -R www-data:www-data '${REMOTE_ANIL_CHARTS}'"

echo "Mirroring full dist → ${REMOTE_APP}"
tar -C dist -cf - . | "${SSH[@]}" "${USER}@${HOST}" \
  "tar -C '${REMOTE_APP}' -xf - && chown -R www-data:www-data '${REMOTE_APP}'"

echo "Uploading Node feeds (FXPro + news/calendar)"
tar -C "$ROOT" -cf - server/market server/news deploy/forge-market.service deploy/forge-news.service deploy/nginx-forge-api.conf \
  | "${SSH[@]}" "${USER}@${HOST}" "tar -C '${REMOTE_SRC}' -xf - && \
    mkdir -p '${REMOTE_SRC}/deploy' && \
    cp -f '${REMOTE_SRC}/deploy/forge-market.service' /etc/systemd/system/forge-market.service && \
    cp -f '${REMOTE_SRC}/deploy/forge-news.service' /etc/systemd/system/forge-news.service && \
    cp -f '${REMOTE_SRC}/deploy/nginx-forge-api.conf' /etc/nginx/snippets/forge-api.conf && \
    chown -R www-data:www-data '${REMOTE_SRC}' /var/lib/forge-charts && \
    if ! command -v node >/dev/null 2>&1 || ! node -v | grep -qE 'v(2[2-9]|[3-9])'; then
      curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y nodejs
    fi && \
    ln -sfn \$(command -v node) /usr/bin/node && \
    systemctl daemon-reload && \
    systemctl enable --now forge-market forge-news && \
    systemctl restart forge-market forge-news && \
    if ! grep -q 'snippets/forge-api.conf' /etc/nginx/sites-enabled/* /etc/nginx/conf.d/* /etc/nginx/nginx.conf 2>/dev/null; then
      echo 'NOTE: add  include /etc/nginx/snippets/forge-api.conf;  to the HTTPS/HTTP server block (before the SPA fallback), then: nginx -t && systemctl reload nginx'
    else
      nginx -t && systemctl reload nginx
    fi"

echo "Done. Chart: http://${HOST}/charts/"
echo "FXPro:  http://${HOST}/market-api/health"
echo "News:   http://${HOST}/news-api/health"
