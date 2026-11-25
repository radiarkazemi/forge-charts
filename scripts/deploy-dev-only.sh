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
if [[ ! -f dist/assets/forge-main-v25.js ]]; then
  echo "dist/assets/forge-main-v25.js missing — run npx vite build first" >&2
  exit 1
fi

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
mkdir -p "$STAGE/assets" "$STAGE/brand"
cp -a dist/assets/. "$STAGE/assets/"
gzip -kf -9 "$STAGE/assets/"*.js 2>/dev/null || true
# Login art for /dev/ and /team/ only — never /charts/brand/.
if [[ -d "$ROOT/public/brand" ]]; then
  cp -a "$ROOT/public/brand/"*.webp "$STAGE/brand/" 2>/dev/null || true
  cp -a "$ROOT/public/brand/forge-f.png" "$STAGE/brand/" 2>/dev/null || true
fi
sed -e 's|/assets/forge/|/assets/forge-dev/|g' dist/index.html > "$STAGE/index.html"

echo "Deploying /dev/ only → ${USER}@${HOST}:${WEB}"
tar -C "$STAGE" -cf - assets index.html brand | "${SSH[@]}" "${USER}@${HOST}" \
  "python3 -c \"
import os, shutil, sys, tarfile
web = sys.argv[1]
dev = os.path.join(web, 'dev')
team = os.path.join(web, 'team')
assets = os.path.join(web, 'assets', 'forge-dev')
brand_dev = os.path.join(dev, 'brand')
brand_team = os.path.join(team, 'brand')
os.makedirs(dev, exist_ok=True)
os.makedirs(team, exist_ok=True)
os.makedirs(assets, exist_ok=True)
os.makedirs(brand_dev, exist_ok=True)
os.makedirs(brand_team, exist_ok=True)
tf = tarfile.open(fileobj=sys.stdin.buffer, mode='r|')
for m in tf:
    name = m.name.lstrip('./')
    if not m.isfile():
        continue
    if name.startswith('assets/'):
        dest = os.path.join(assets, name[len('assets/'):])
    elif name.startswith('brand/'):
        dest = os.path.join(brand_dev, name[len('brand/'):])
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
if os.path.isdir(brand_dev):
    for fn in os.listdir(brand_dev):
        src = os.path.join(brand_dev, fn)
        if os.path.isfile(src):
            shutil.copyfile(src, os.path.join(brand_team, fn))
print('ok', dev, team, assets, brand_dev)
\" '${WEB}'"

echo "Ensuring /charting_library/ is served on this host (does not touch product /charts/ URLs)"
"${SSH[@]}" "${USER}@${HOST}" 'python3 - <<"PY"
from pathlib import Path
src = Path("/var/www/forge-web/charts/charting_library/charting_library.js")
root_js = Path("/var/www/forge-web/charting_library/charting_library.js")
if src.is_file() and not root_js.is_file():
    link = Path("/var/www/forge-web/charting_library")
    if not link.exists():
        link.symlink_to("/var/www/forge-web/charts/charting_library")
        print("symlink /var/www/forge-web/charting_library")
    else:
        print("charting_library path exists")
else:
    print("charting_library ready" if root_js.is_file() or src.is_file() else "MISSING charting_library")
PY'

echo "OK ${USER}@${HOST} /dev/"
