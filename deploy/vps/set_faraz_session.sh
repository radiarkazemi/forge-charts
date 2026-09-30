#!/usr/bin/env bash
# Install a Faraz browser session so customer trading-view history
# can use max countback (10000).
#
# Usage (from a machine that can SSH the VPSes):
#   FARAZ_COOKIE='connect.sid=...; ...' ./deploy/vps/set_faraz_session.sh
#   # or with password auth:
#   SSHPASS='…' FARAZ_COOKIE='…' ./deploy/vps/set_faraz_session.sh
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

# Pull x-access-token / user id out of the Cookie header when not set explicitly.
if [[ -n "$COOKIE" ]]; then
  if [[ -z "$TOKEN" ]]; then
    TOKEN="$(
      python3 - "$COOKIE" <<'PY'
import sys
cookie = sys.argv[1]
for part in cookie.split(";"):
    part = part.strip()
    if part.startswith("x-access-token="):
        print(part.split("=", 1)[1])
        break
PY
    )"
  fi
  if [[ -z "$USER_ID" && -n "$TOKEN" ]]; then
    USER_ID="$(
      python3 - "$TOKEN" <<'PY'
import sys, json, base64
tok = sys.argv[1]
payload = tok.split(".")[1]
pad = "=" * (-len(payload) % 4)
data = json.loads(base64.urlsafe_b64decode(payload + pad))
print(data.get("_id", ""))
PY
    )"
  fi
fi

GERMANY="${FARAZ_GERMANY_HOST:-2.28.37.51}"
IRAN="${FARAZ_IRAN_HOST:-185.222.163.116}"

SSH=(ssh -o StrictHostKeyChecking=accept-new)
if [[ -n "${SSHPASS:-}" ]]; then
  SSH=(sshpass -e ssh -o StrictHostKeyChecking=accept-new)
fi

write_env() {
  local host="$1"
  local path="$2"
  # Quote values so systemd EnvironmentFile keeps ';' inside FARAZ_COOKIE.
  "${SSH[@]}" "root@${host}" "cat > ${path}" <<EOF
FARAZ_COOKIE="${COOKIE}"
FARAZ_USER_ID="${USER_ID}"
FARAZ_TOKEN="${TOKEN}"
EOF
  echo "wrote ${host}:${path}"
}

write_env "$GERMANY" /etc/default/faraz-history-proxy
"${SSH[@]}" "root@${GERMANY}" 'systemctl restart faraz-history-proxy.service && curl -sS http://127.0.0.1:8091/health; echo'

write_env "$IRAN" /etc/default/faraz-session
"${SSH[@]}" "root@${IRAN}" 'systemctl restart forge-market-ticks.service && sleep 2 && systemctl is-active forge-market-ticks.service'

echo "Done. Cookie/token installed (user_id=${USER_ID:-none})."
echo "Watch Iran logs for: faraz bootstrap iran:g18 1 bars=… (customer max countback)"
echo "  journalctl -u forge-market-ticks -f | grep bootstrap"
