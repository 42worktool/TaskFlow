#!/bin/sh
# Attempt to obtain a Let's Encrypt certificate for $DOMAIN before nginx starts.
# Runs certbot in standalone mode, so it needs host port 80 free (nginx must
# not be running yet when this script is called).
#
# On any failure (DOMAIN unset, tunnel/port 80 unreachable, rate limited, ...)
# this exits 0 without writing any files, so nginx/docker-entrypoint.sh falls
# back to generating its self-signed certificate as it already does today.
set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
. "$SCRIPT_DIR/lib-ssh-tunnel.sh"
trap close_tunnel EXIT

TLS_DIR="${TLS_CERT_DIR:-./.taskflow/tls}"
LETSENCRYPT_DIR="./.taskflow/letsencrypt"

if [ -z "${DOMAIN:-}" ]; then
  echo "[certbot] DOMAIN not set in .env.prod - skipping issuance, self-signed cert will be used."
  exit 0
fi

mkdir -p "$TLS_DIR" "$LETSENCRYPT_DIR"

if [ -f "$LETSENCRYPT_DIR/live/$DOMAIN/fullchain.pem" ]; then
  echo "[certbot] A Let's Encrypt certificate for $DOMAIN already exists - reusing it (run 'make prod-renew' to renew)."
  cp "$LETSENCRYPT_DIR/live/$DOMAIN/fullchain.pem" "$TLS_DIR/fullchain.pem"
  cp "$LETSENCRYPT_DIR/live/$DOMAIN/privkey.pem" "$TLS_DIR/privkey.pem"
  exit 0
fi

open_tunnel

echo "[certbot] Requesting a Let's Encrypt certificate for $DOMAIN..."
if docker run --rm -p 80:80 \
    -v "$(pwd)/$LETSENCRYPT_DIR:/etc/letsencrypt" \
    certbot/certbot certonly --standalone --non-interactive --agree-tos --no-eff-email \
    -m "${CERTBOT_EMAIL:-admin@$DOMAIN}" \
    -d "$DOMAIN" --cert-name "$DOMAIN"; then
  cp "$LETSENCRYPT_DIR/live/$DOMAIN/fullchain.pem" "$TLS_DIR/fullchain.pem"
  cp "$LETSENCRYPT_DIR/live/$DOMAIN/privkey.pem" "$TLS_DIR/privkey.pem"
  echo "[certbot] Certificate installed for $DOMAIN."
else
  echo "[certbot] Certificate issuance failed - nginx will fall back to a self-signed certificate."
fi
