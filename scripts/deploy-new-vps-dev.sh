#!/usr/bin/env bash
# Publish the latest Forge TV app to the DEV VPS as /dev/ only.
# Does NOT touch https://forgechart.ir/team/ (product).
# Usage: VPS_HOST=91.107.171.162 SSHPASS='…' ./scripts/deploy-new-vps-dev.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOST="${VPS_HOST:?set VPS_HOST to the DEV server, never forgechart.ir}"
USER="${VPS_USER:-root}"
if [[ "$HOST" == *"forgechart.ir"* ]]; then
  echo "refusing to deploy to product host $HOST" >&2
  exit 1
fi

SSH=(ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=25)
SCP=(scp -o StrictHostKeyChecking=accept-new)
if [[ -n "${SSHPASS:-}" ]]; then
  SSH=(sshpass -e ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=25)
  SCP=(sshpass -e scp -o StrictHostKeyChecking=accept-new)
fi

cd "$ROOT"
npx vite build

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
mkdir -p "$STAGE/dev/landing" "$STAGE/assets/forge-dev" "$STAGE/charts"

python3 - <<PY
from pathlib import Path
html = Path("$ROOT/dist/index.html").read_text()
html = html.replace("/assets/forge/", "/assets/forge-dev/")
Path("$STAGE/dev/index.html").write_text(html)
PY
cp -a dist/assets/. "$STAGE/assets/forge-dev/"
cp -a dist/charts/. "$STAGE/charts/"
if [[ -d dist/brand ]]; then
  mkdir -p "$STAGE/charts/brand" "$STAGE/dev/brand"
  cp -a dist/brand/. "$STAGE/charts/brand/"
  cp -a dist/brand/. "$STAGE/dev/brand/"
fi
if [[ -d deploy/dev-site/landing ]]; then
  cp -a deploy/dev-site/landing/. "$STAGE/dev/landing/"
fi

"${SSH[@]}" "${USER}@${HOST}" "mkdir -p /var/www/forge-web /etc/nginx/sites-available"
"${SCP[@]}" "$ROOT/deploy/nginx/new-vps-dev-only.conf" "${USER}@${HOST}:/etc/nginx/sites-available/forge-dev"
tar -C "$STAGE" -cf - . | "${SSH[@]}" "${USER}@${HOST}" \
  "tar -C /var/www/forge-web -xf - && chown -R www-data:www-data /var/www/forge-web &&
   ln -sfn /etc/nginx/sites-available/forge-dev /etc/nginx/sites-enabled/forge-dev &&
   rm -f /etc/nginx/sites-enabled/default /etc/nginx/sites-enabled/forge-charts &&
   nginx -t && systemctl restart nginx"

echo "DEV only: http://${HOST}/dev/"
echo "Product unchanged: https://forgechart.ir/team/"
