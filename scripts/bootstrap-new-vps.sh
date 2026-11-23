#!/usr/bin/env bash
# Bootstrap Forge Charts on a 2-core / 4 GB host.
# Usage: VPS_HOST=x.x.x.x SSHPASS='…' [MONGO_URI=mongodb://…] ./scripts/bootstrap-new-vps.sh
# Never pass the password on argv; sshpass -e reads SSHPASS.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOST="${VPS_HOST:?set VPS_HOST}"
USER="${VPS_USER:-root}"
MONGO_URI="${MONGO_URI:-mongodb://127.0.0.1:27017/}"
API_UPSTREAM="${API_UPSTREAM:-}"

SSH=(ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20)
if [[ -n "${SSHPASS:-}" ]]; then
  SSH=(sshpass -e ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20)
fi

remote() { "${SSH[@]}" "${USER}@${HOST}" "$@"; }

remote 'export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq nginx python3 python3-venv python3-pip tzdata >/dev/null
mkdir -p /var/www/forge-charts /opt/forge-chart-ws /etc/nginx/sites-available
id www-data >/dev/null 2>&1 || useradd -r -s /usr/sbin/nologin www-data
'

# Python deps + chart_ws
remote 'python3 -m venv /opt/forge-chart-ws/venv
/opt/forge-chart-ws/venv/bin/pip install -q --upgrade pip
/opt/forge-chart-ws/venv/bin/pip install -q aiohttp pymongo websockets
'

tar -C "$ROOT/deploy/vps" -cf - chart_ws.py forge-chart-ws.service forge-charts.nginx.conf \
  | remote 'tar -C /tmp -xf - &&
    cp /tmp/chart_ws.py /opt/forge-chart-ws/chart_ws.py &&
    cp /tmp/forge-chart-ws.service /etc/systemd/system/forge-chart-ws.service &&
    cp /tmp/forge-charts.nginx.conf /etc/nginx/sites-available/forge-charts &&
    printf "MONGO_URI=%s\n" "'"${MONGO_URI}"'" > /etc/forge-chart-ws.env &&
    chown -R www-data:www-data /opt/forge-chart-ws &&
    chmod 640 /etc/forge-chart-ws.env &&
    ln -sfn /etc/nginx/sites-available/forge-charts /etc/nginx/sites-enabled/forge-charts &&
    rm -f /etc/nginx/sites-enabled/default &&
    if [[ -n "'"${API_UPSTREAM}"'" ]]; then
      sed -i "s#proxy_pass http://127.0.0.1:8000/;#proxy_pass http://'"${API_UPSTREAM}"'/crypto-api/;#" /etc/nginx/sites-available/forge-charts
    fi
    nginx -t
    systemctl daemon-reload
    systemctl enable --now forge-chart-ws nginx
    systemctl reload nginx
    systemctl restart forge-chart-ws
  '

echo "Bootstrap done on ${HOST}"
