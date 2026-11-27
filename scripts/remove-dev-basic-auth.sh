#!/usr/bin/env bash
# Remove the browser password (auth_basic) from the product nginx.
# Does not upload charts, assets, or any other site file.
set -euo pipefail

HOST="${VPS_HOST:-185.222.0.116}"
USER="${VPS_USER:-root}"
PORT="${VPS_SSH_PORT:-2222}"

SSH=(ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=30 -o ServerAliveInterval=10 -p "$PORT")
if [[ -n "${SSHPASS:-}" ]]; then
  SSH=(sshpass -e ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=30 -o ServerAliveInterval=10 -p "$PORT")
fi
if [[ -n "${SSH_KEY:-}" ]]; then
  mkdir -p "${HOME}/.ssh"
  printf '%s\n' "$SSH_KEY" > "${HOME}/.ssh/id_ed25519"
  chmod 600 "${HOME}/.ssh/id_ed25519"
fi

"${SSH[@]}" "${USER}@${HOST}" 'bash -s' << 'REMOTE'
set -euo pipefail
python3 - << 'PY'
from pathlib import Path
root = Path("/etc/nginx")
backup = Path("/root/nginx-auth-backup")
backup.mkdir(parents=True, exist_ok=True)
changed = []
for path in root.rglob("*"):
    if not path.is_file():
        continue
    try:
        text = path.read_text(errors="ignore")
    except OSError:
        continue
    if "auth_basic" not in text and "forge-dev.htpasswd" not in text:
        continue
    out = []
    edited = False
    for line in text.splitlines(keepends=True):
        stripped = line.lstrip()
        if stripped.startswith("#"):
            out.append(line)
            continue
        if "auth_basic" in line or "forge-dev.htpasswd" in line:
            out.append("# " + line)
            edited = True
        else:
            out.append(line)
    if not edited:
        continue
    dest = backup / (str(path).lstrip("/").replace("/", "__"))
    dest.write_text(text)
    path.write_text("".join(out))
    changed.append(str(path))
print("updated", len(changed))
for item in changed:
    print(item)
if not changed:
    raise SystemExit(0)
PY
if ! nginx -t; then
  echo "nginx test failed; restoring backups" >&2
  python3 - << 'PY'
from pathlib import Path
backup = Path("/root/nginx-auth-backup")
for src in backup.iterdir():
    name = src.name
    if not name.startswith("etc__nginx__"):
        continue
    dest = Path("/" + name.replace("__", "/"))
    if dest.exists():
        dest.write_text(src.read_text())
        print("restored", dest)
PY
  exit 1
fi
nginx -s reload
echo "reloaded"
curl -skI --http1.1 --max-time 10 --resolve forgechart.ir:443:127.0.0.1 https://forgechart.ir/dev/ | head -15
REMOTE
