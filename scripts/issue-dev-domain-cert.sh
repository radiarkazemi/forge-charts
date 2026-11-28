#!/usr/bin/env bash
# Issue a public certificate for the dev subdomain once its DNS points here.
# forgechart.ir and www stay on the product origin; this script never requests
# a certificate that would let the dev machine impersonate them.
set -euo pipefail
HOST="dev.forgechart.ir"
HERE="91.107.171.162"
WEBROOT="/var/www/certbot"
SSL_SNIPPET="/etc/nginx/snippets/forge-dev-subdomain-ssl.conf"

if ! command -v certbot >/dev/null 2>&1; then
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq certbot
fi
mkdir -p "$WEBROOT/.well-known/acme-challenge"

IPS=()
if out=$(getent ahostsv4 "$HOST" 2>/dev/null); then
  mapfile -t IPS < <(printf '%s\n' "$out" | awk '{print $1}' | sort -u)
fi
MATCH=0
for ip in "${IPS[@]}"; do
  if [[ "$ip" == "$HERE" ]]; then MATCH=1; fi
done
if [[ "$MATCH" != 1 ]]; then
  echo "DNS for ${HOST} does not point at this host yet"
  exit 0
fi

certbot certonly --webroot -w "$WEBROOT" -d "$HOST" \
  --non-interactive --agree-tos --register-unsafely-without-email \
  --keep-until-expiring

cat > "$SSL_SNIPPET" <<EOF
ssl_certificate     /etc/letsencrypt/live/${HOST}/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/${HOST}/privkey.pem;
EOF
nginx -t
nginx -s reload
echo "certificate ready for ${HOST}"
