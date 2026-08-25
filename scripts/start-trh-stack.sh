#!/usr/bin/env bash
# Start TRH alert server + Cloudflare quick tunnel (zero-config secure URL)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PORT="${TRH_PORT:-3921}"
SECRETS="$ROOT/indicators/.trh-secrets.json"
TUNNEL_FILE="$ROOT/indicators/.trh-tunnel-url"
LOG_DIR="$ROOT/indicators/.trh-logs"
mkdir -p "$LOG_DIR"

if [[ ! -f "$SECRETS" ]]; then
  node scripts/generate-trh-secrets.mjs
fi

# Install cloudflared if missing
if ! command -v cloudflared >/dev/null 2>&1; then
  bash scripts/install-cloudflared.sh
fi

# Restart server in tmux
SESSION="trh-alert-server"
tmux -f /exec-daemon/tmux.portal.conf kill-session -t "$SESSION" 2>/dev/null || true
tmux -f /exec-daemon/tmux.portal.conf new-session -d -s "$SESSION" -c "$ROOT" -- \
  "node indicators/trh-alert-server.mjs 2>&1 | tee -a '$LOG_DIR/server.log'"

# Restart tunnel in tmux
TSESSION="trh-cloudflared"
tmux -f /exec-daemon/tmux.portal.conf kill-session -t "$TSESSION" 2>/dev/null || true
tmux -f /exec-daemon/tmux.portal.conf new-session -d -s "$TSESSION" -c "$ROOT" -- \
  "cloudflared tunnel --url http://127.0.0.1:${PORT} 2>&1 | tee -a '$LOG_DIR/tunnel.log'"

echo "Waiting for Cloudflare tunnel URL..."
for i in $(seq 1 30); do
  URL=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG_DIR/tunnel.log" 2>/dev/null | head -1 || true)
  if [[ -n "$URL" ]]; then
    echo "$URL" > "$TUNNEL_FILE"
    echo "Tunnel URL: $URL"
    node scripts/embed-android-config.mjs
    echo "Server health:"
    curl -sf "http://127.0.0.1:${PORT}/health" || true
    exit 0
  fi
  sleep 1
done

echo "Tunnel URL not found — check $LOG_DIR/tunnel.log"
exit 1
