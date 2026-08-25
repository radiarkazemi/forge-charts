#!/usr/bin/env bash
# Deploy Forge Charts to the cp_fetcher VPS (goldanil / anil nginx root).
# Usage:
#   VPS_HOST=185.222.163.116 VPS_USER=root ./scripts/deploy-vps.sh
# Auth: SSH key preferred. For password auth: SSHPASS='...' ./scripts/deploy-vps.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOST="${VPS_HOST:-185.222.163.116}"
USER="${VPS_USER:-root}"
REMOTE_APP="${REMOTE_APP:-/var/www/forge-charts}"
REMOTE_ANIL_CHARTS="${REMOTE_ANIL_CHARTS:-/var/www/anil/frontend/dist/charts}"
REMOTE_ANIL_ASSETS="${REMOTE_ANIL_ASSETS:-/var/www/anil/frontend/dist/assets/forge}"

SSH=(ssh -o StrictHostKeyChecking=accept-new)
SCP=(scp -o StrictHostKeyChecking=accept-new)
if [[ -n "${SSHPASS:-}" ]]; then
  SSH=(sshpass -e ssh -o StrictHostKeyChecking=accept-new)
  SCP=(sshpass -e scp -o StrictHostKeyChecking=accept-new)
fi

cd "$ROOT"
npm run build

echo "Ensuring remote dirs on ${USER}@${HOST}"
"${SSH[@]}" "${USER}@${HOST}" "mkdir -p '${REMOTE_ANIL_ASSETS}' '${REMOTE_ANIL_CHARTS}' '${REMOTE_APP}/assets'"

echo "Uploading /assets/forge hashed bundles"
tar -C dist/assets -cf - . | "${SSH[@]}" "${USER}@${HOST}" \
  "tar -C '${REMOTE_ANIL_ASSETS}' -xf - && chown -R www-data:www-data '${REMOTE_ANIL_ASSETS}'"

echo "Uploading /charts/index.html"
"${SCP[@]}" dist/index.html "${USER}@${HOST}:${REMOTE_ANIL_CHARTS}/index.html"
"${SSH[@]}" "${USER}@${HOST}" "chown www-data:www-data '${REMOTE_ANIL_CHARTS}/index.html'"

echo "Mirroring full dist → ${REMOTE_APP}"
tar -C dist -cf - . | "${SSH[@]}" "${USER}@${HOST}" \
  "tar -C '${REMOTE_APP}' -xf - && chown -R www-data:www-data '${REMOTE_APP}'"

echo "Done. Open http://${HOST}/charts/"
