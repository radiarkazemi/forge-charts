#!/usr/bin/env bash
# Publish the latest Forge build to /dev/ + /assets/forge-dev/ only.
# Never writes /team/, /charts/index.html, or /assets/forge/ (product).
# Usage:
#   VPS_HOST=91.107.171.162 VPS_SSH_PORT=22 ./scripts/deploy-dev-only.sh
# Password auth: SSHPASS='…' ./scripts/deploy-dev-only.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOST="${VPS_HOST:?set VPS_HOST}"
USER="${VPS_USER:-root}"
PORT="${VPS_SSH_PORT:-22}"
WEB="${REMOTE_FORGE_WEB:-/var/www/forge-web}"

SSH=(ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=25 -p "$PORT")
if [[ -n "${SSHPASS:-}" ]]; then
  SSH=(sshpass -e ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=25 -p "$PORT")
fi

cd "$ROOT"
if [[ ! -f dist/assets/forge-main.js ]]; then
  echo "dist/assets/forge-main.js missing — run npx vite build first" >&2
  exit 1
fi

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
mkdir -p "$STAGE/assets"
cp -a dist/assets/. "$STAGE/assets/"
sed -e 's|/assets/forge/|/assets/forge-dev/|g' dist/index.html > "$STAGE/index.html"

echo "Deploying /dev/ only → ${USER}@${HOST}:${WEB}"
tar -C "$STAGE" -cf - assets index.html | "${SSH[@]}" "${USER}@${HOST}" \
  "python3 -c \"
import os, shutil, sys, tarfile
web = sys.argv[1]
dev = os.path.join(web, 'dev')
team = os.path.join(web, 'team')
assets = os.path.join(web, 'assets', 'forge-dev')
os.makedirs(dev, exist_ok=True)
os.makedirs(team, exist_ok=True)
os.makedirs(assets, exist_ok=True)
tf = tarfile.open(fileobj=sys.stdin.buffer, mode='r|')
for m in tf:
    name = m.name.lstrip('./')
    if not m.isfile():
        continue
    if name.startswith('assets/'):
        dest = os.path.join(assets, name[len('assets/'):])
    elif name == 'index.html':
        dest = os.path.join(dev, 'index.html')
    else:
        continue
    os.makedirs(os.path.dirname(dest) or '.', exist_ok=True)
    src = tf.extractfile(m)
    if src is None:
        continue
    with open(dest, 'wb') as out:
        out.write(src.read())
idx = os.path.join(dev, 'index.html')
if os.path.isfile(idx):
    shutil.copyfile(idx, os.path.join(team, 'index.html'))
print('ok', dev, team, assets)
\" '${WEB}'"

echo "OK ${USER}@${HOST} /dev/"
