#!/bin/sh
set -e

SSL_DIR=/etc/nginx/ssl
KEY_FILE=${SSL_DIR}/privkey.pem
CERT_FILE=${SSL_DIR}/fullchain.pem

mkdir -p "$SSL_DIR"

if [ ! -f "$KEY_FILE" ] || [ ! -f "$CERT_FILE" ]; then
  echo "[entrypoint] SSL certificate not found — generating self-signed certificate"
  openssl req -x509 -nodes -days 365 \
    -newkey rsa:2048 \
    -keyout "$KEY_FILE" \
    -out "$CERT_FILE" \
    -subj "/C=KR/ST=Seoul/L=Seoul/O=dev/CN=localhost"
  chmod 600 "$KEY_FILE"
  chmod 644 "$CERT_FILE"
else
  echo "[entrypoint] SSL certificate found, skipping generation"
fi

exec nginx -g 'daemon off;'
