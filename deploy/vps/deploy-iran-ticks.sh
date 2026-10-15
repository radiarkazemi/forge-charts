#!/usr/bin/env bash
# Deploy Iran gold tick/history services (market_ticks + Faraz history proxy).
#
# Usage:
#   SSHPASS='…' ./deploy/vps/deploy-iran-ticks.sh
#   # or with key auth already configured:
#   ./deploy/vps/deploy-iran-ticks.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
GERMANY="${FARAZ_GERMANY_HOST:-2.28.37.51}"
IRAN="${FARAZ_IRAN_HOST:-185.222.163.116}"

SSH=(ssh -o StrictHostKeyChecking=accept-new)
SCP=(scp -o StrictHostKeyChecking=accept-new)
if [[ -n "${SSHPASS:-}" ]]; then
  SSH=(sshpass -e ssh -o StrictHostKeyChecking=accept-new)
  SCP=(sshpass -e scp -o StrictHostKeyChecking=accept-new)
fi

# Paths used on the live hosts (forge-market-ticks / faraz-history-proxy units).
IRAN_MT_DEST="${IRAN_MARKET_TICKS_PATH:-/opt/cp_fetcher/ws/market_ticks.py}"
GERMANY_PROXY_DEST="${FARAZ_PROXY_PATH:-/opt/faraz-history-proxy/faraz_history_proxy.py}"

echo "Uploading faraz_history_proxy.py → root@${GERMANY}:${GERMANY_PROXY_DEST}"
"${SCP[@]}" "$ROOT/deploy/vps/faraz_history_proxy.py" "root@${GERMANY}:${GERMANY_PROXY_DEST}"
"${SSH[@]}" "root@${GERMANY}" \
  "systemctl restart faraz-history-proxy.service && sleep 1 && curl -sS http://127.0.0.1:8091/health && echo && curl -sS 'http://127.0.0.1:8091/faraz/public-market?cache=false' | head -c 200 && echo"

echo "Uploading market_ticks.py → root@${IRAN}:${IRAN_MT_DEST}"
"${SCP[@]}" "$ROOT/deploy/vps/market_ticks.py" "root@${IRAN}:${IRAN_MT_DEST}"
"${SSH[@]}" "root@${IRAN}" \
  "systemctl restart forge-market-ticks.service && sleep 2 && systemctl is-active forge-market-ticks.service && curl -sS 'http://127.0.0.1:8765/iran-gold/quote' 2>/dev/null | head -c 300 || curl -sS 'https://forgechart.ir/iran-gold/quote' | head -c 300; echo"

echo "Done. Verify G18 moves with Faraz geramTalaHejdah (not a frozen mesghal-derived value)."
