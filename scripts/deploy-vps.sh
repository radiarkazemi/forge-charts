#!/usr/bin/env bash
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
"${SSH[@]}" "${USER}@${HOST}" "mkdir -p '${REMOTE_ANIL_ASSETS}' '${REMOTE_ANIL_CHARTS}' '${REMOTE_APP}/assets'"
tar -C dist/assets -cf - . | "${SSH[@]}" "${USER}@${HOST}" "rm -rf '${REMOTE_ANIL_ASSETS}' && mkdir -p '${REMOTE_ANIL_ASSETS}' && tar -C '${REMOTE_ANIL_ASSETS}' -xf - && chown -R www-data:www-data '${REMOTE_ANIL_ASSETS}'"
"${SCP[@]}" dist/index.html "${USER}@${HOST}:${REMOTE_ANIL_CHARTS}/index.html"
[[ -f SUPERCHART-PARITY.md ]] && "${SCP[@]}" SUPERCHART-PARITY.md "${USER}@${HOST}:${REMOTE_ANIL_CHARTS}/SUPERCHART-PARITY.md" || true
"${SSH[@]}" "${USER}@${HOST}" "chown -R www-data:www-data '${REMOTE_ANIL_CHARTS}'"
tar -C dist -cf - . | "${SSH[@]}" "${USER}@${HOST}" "tar -C '${REMOTE_APP}' -xf - && chown -R www-data:www-data '${REMOTE_APP}'"
echo "Done. Open http://${HOST}/charts/"
