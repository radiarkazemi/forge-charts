#!/usr/bin/env bash
# Issue / renew Let's Encrypt for forgechart.ir once public DNS works.
# Usage: SSHPASS='...' ./scripts/issue-forgechart-cert.sh
set -euo pipefail
HOST="${VPS_HOST:-185.222.163.116}"
USER="${VPS_USER:-root}"
SSH=(ssh -o StrictHostKeyChecking=accept-new)
if [[ -n "${SSHPASS:-}" ]]; then
  SSH=(sshpass -e ssh -o StrictHostKeyChecking=accept-new)
fi
"${SSH[@]}" "${USER}@${HOST}" bash -s <<'REMOTE'
set -euo pipefail
dig +short forgechart.ir A || true
dig +short www.forgechart.ir A || true
mkdir -p /var/www/forge-landing/.well-known/acme-challenge
certbot certonly --webroot -w /var/www/forge-landing \
  -d forgechart.ir -d www.forgechart.ir \
  --non-interactive --agree-tos --register-unsafely-without-email \
  --deploy-hook 'ln -sfn /etc/letsencrypt/live/forgechart.ir/fullchain.pem /etc/ssl/forgechart/fullchain.pem; ln -sfn /etc/letsencrypt/live/forgechart.ir/privkey.pem /etc/ssl/forgechart/privkey.pem; nginx -t && systemctl reload nginx'
REMOTE
