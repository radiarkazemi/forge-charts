#!/usr/bin/env bash
# Install cloudflared (Cloudflare Tunnel) for secure phone reachability
set -euo pipefail
ARCH=$(uname -m)
case "$ARCH" in
  x86_64) CF_ARCH=amd64 ;;
  aarch64|arm64) CF_ARCH=arm64 ;;
  *) echo "Unsupported arch: $ARCH"; exit 1 ;;
esac
VER="2025.2.0"
URL="https://github.com/cloudflare/cloudflared/releases/download/${VER}/cloudflared-linux-${CF_ARCH}"
DEST="/usr/local/bin/cloudflared"
if command -v cloudflared >/dev/null 2>&1; then
  echo "cloudflared already installed: $(cloudflared --version)"
  exit 0
fi
curl -fsSL "$URL" -o /tmp/cloudflared
chmod +x /tmp/cloudflared
sudo mv /tmp/cloudflared "$DEST"
cloudflared --version
