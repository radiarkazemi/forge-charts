#!/usr/bin/env bash
# Install a Faraz browser session so customer trading-view history
# can use max countback (10000).
#
# Usage (from a machine that can SSH the VPSes):
#   FARAZ_COOKIE='connect.sid=...; ...' ./deploy/vps/set_faraz_session.sh
#
# How to get the cookie:
#   1. Log into https://faraz.io/dashboard in Chrome
#   2. DevTools → Network → any /api/customer/* request → Request Headers → Cookie
#   3. Paste the full Cookie header value into FARAZ_COOKIE

set -euo pipefail

COOKIE="${FARAZ_COOKIE:-}"
USER_ID="${FARAZ_USER_ID:-}"
TOKEN="${FARAZ_TOKEN:-}"

if [[ -z "$COOKIE" && -z "$TOKEN" ]]; then
  echo "Set FARAZ_COOKIE (preferred) or FARAZ_TOKEN first." >&2
  exit 1
fi

GERMANY="${FARAZ_GERMANY_HOST:-2.28.37.51}"
IRAN="${FARAZ_IRAN_HOST:-185.222.163.116}"

write_env() {
  local host="$1"
  local path="$2"
  ssh -o StrictHostKeyChecking=accept-new "root@${host}" "cat > ${path}" <<EOF
FARAZ_COOKIE=${COOKIE}
FARAZ_USER_ID=${USER_ID}
FARAZ_TOKEN=${TOKEN}
EOF
  echo "wrote ${host}:${path}"
}

write_env "$GERMANY" /etc/default/faraz-history-proxy
ssh "root@${GERMANY}" 'systemctl restart faraz-history-proxy.service && curl -sS http://127.0.0.1:8091/health; echo'

write_env "$IRAN" /etc/default/faraz-session
ssh "root@${IRAN}" 'systemctl restart forge-market-ticks.service && sleep 2 && systemctl is-active forge-market-ticks.service'

echo "Done. Watch Iran logs for: faraz bootstrap iran:g18 1 bars=… (customer max countback)"
echo "  journalctl -u forge-market-ticks -f | grep bootstrap"
