#!/usr/bin/env bash
# Deploy Forge Charts landing to VPS :8088 and rewire Danora off that port.
# Usage: SSHPASS='...' ./scripts/deploy-landing.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOST="${VPS_HOST:-185.222.163.116}"
USER="${VPS_USER:-root}"
REMOTE_LANDING="${REMOTE_LANDING:-/var/www/forge-landing}"

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

echo "Installing nginx site configs (Forge :8088, Danora :8092)"
"${SCP[@]}" deploy/nginx/forge-landing-8088.conf "${USER}@${HOST}:/etc/nginx/sites-available/forge-landing-8088"
"${SCP[@]}" deploy/nginx/danora.conf "${USER}@${HOST}:/etc/nginx/sites-available/danora"

"${SSH[@]}" "${USER}@${HOST}" bash -s <<'REMOTE'
set -euo pipefail
ln -sfn /etc/nginx/sites-available/forge-landing-8088 /etc/nginx/sites-enabled/forge-landing-8088
ln -sfn /etc/nginx/sites-available/danora /etc/nginx/sites-enabled/danora
# Open Danora staging port (8091 is occupied by another local service)
ufw allow 8092/tcp comment 'Danora staging' || true
nginx -t
systemctl reload nginx
ss -tlnp | grep -E ':8088|:8092' || true
echo "nginx reloaded"
REMOTE

echo "Done."
echo "  Forge landing : http://${HOST}:8088/"
echo "  Forge charts  : http://${HOST}:8088/charts/"
echo "  Danora staging: http://${HOST}:8092/"
