#!/bin/sh
# Renew the Let's Encrypt certificate for $DOMAIN.
# Runs certbot in standalone mode, so it needs host port 80 free
# (the caller is expected to have stopped nginx first).
set -eu

TLS_DIR="${TLS_CERT_DIR:-./.taskflow/tls}"
LETSENCRYPT_DIR="./.taskflow/letsencrypt"

if [ -z "${DOMAIN:-}" ]; then
  echo "[certbot] DOMAIN not set in .env.prod - nothing to renew."
  exit 0
fi

if [ ! -d "$LETSENCRYPT_DIR/live/$DOMAIN" ]; then
  echo "[certbot] No existing certificate for $DOMAIN in $LETSENCRYPT_DIR - run 'make prod-up' first to issue one."
  exit 0
fi

echo "[certbot] Renewing certificate for $DOMAIN..."
if docker run --rm -p 80:80 \
    -v "$(pwd)/$LETSENCRYPT_DIR:/etc/letsencrypt" \
    certbot/certbot renew --standalone --non-interactive; then
  cp "$LETSENCRYPT_DIR/live/$DOMAIN/fullchain.pem" "$TLS_DIR/fullchain.pem"
  cp "$LETSENCRYPT_DIR/live/$DOMAIN/privkey.pem" "$TLS_DIR/privkey.pem"
  echo "[certbot] Certificate renewed for $DOMAIN."
else
  echo "[certbot] Renewal failed - keeping the existing certificate."
fi
