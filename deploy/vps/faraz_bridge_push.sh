#!/usr/bin/env bash
# Push live Faraz public-market quotes onto the Iran VPS when Germany is offline.
# This host must reach faraz.io; the Iran VPS is Cloudflare-blocked.
#
# Usage:
#   SSHPASS='…' ./deploy/vps/faraz_bridge_push.sh
#   SSHPASS='…' ./deploy/vps/faraz_bridge_push.sh --once
set -euo pipefail

IRAN="${FARAZ_IRAN_HOST:-185.222.163.116}"
REMOTE_PATH="${FARAZ_BRIDGE_QUOTE_PATH:-/tmp/faraz_live_quote.json}"
INTERVAL="${FARAZ_BRIDGE_INTERVAL:-2}"
ONCE=0
[[ "${1:-}" == "--once" ]] && ONCE=1

SSH=(ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15)
SCP=(scp -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15)
if [[ -n "${SSHPASS:-}" ]]; then
  SSH=(sshpass -e ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15)
  SCP=(sshpass -e scp -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15)
fi

SYMBOLS_JSON='["abshodeNaghdi","geramTalaHejdah","tala24Estjt","sekkeNewEstjt","nimSekkeEstjt","robSekkeEstjt","FOREXCOM_XAUUSD"]'
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

push_once() {
  curl -sS -m 6 -G \
    'https://faraz.io/api/public/market/get-data' \
    --data-urlencode "symbolNames=${SYMBOLS_JSON}" \
    --data-urlencode 'cache=false' \
    -H 'Accept: application/json' \
    -H 'Origin: https://faraz.io' \
    -H 'Referer: https://faraz.io/markets/gold-currency' \
    -H 'User-Agent: Mozilla/5.0 ForgeFarazBridge/1.0' \
    -o "$TMP"
  python3 - "$TMP" <<'PY'
import json, sys
path = sys.argv[1]
with open(path) as f:
    data = json.load(f)
assert isinstance(data, dict) and data.get("geramTalaHejdah"), "bad faraz payload"
# keep file compact
with open(path, "w") as f:
    json.dump(data, f, separators=(",", ":"))
print("g18", data["geramTalaHejdah"].get("price"), "abshode", data["abshodeNaghdi"].get("price"))
PY
  "${SCP[@]}" "$TMP" "root@${IRAN}:${REMOTE_PATH}"
}

if [[ "$ONCE" -eq 1 ]]; then
  push_once
  exit 0
fi

echo "Faraz bridge → root@${IRAN}:${REMOTE_PATH} every ${INTERVAL}s"
while true; do
  push_once || echo "bridge push failed at $(date -u +%H:%M:%S)" >&2
  sleep "$INTERVAL"
done
