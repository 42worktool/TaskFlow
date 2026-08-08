#!/bin/sh
# DOMAIN의 기존 Let's Encrypt 인증서를 갱신한다.
# certbot standalone은 LOCAL_HTTP_PORT(기본 8080)에서 대기하고,
# SSH 터널이 VPS의 80번 HTTP-01 요청을 로컬 포트로 전달한다.
set -eu

# 갱신 중에 연 임시 터널은 어떤 종료 경로에서도 남지 않게 EXIT trap으로 닫는다.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
. "$SCRIPT_DIR/lib-ssh-tunnel.sh"
trap close_tunnel EXIT

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

open_tunnel

# 갱신 성공 시에만 nginx가 마운트하는 사본을 교체한다. 실패하면 기존 인증서를
# 그대로 두어 일시적인 ACME 장애가 서비스 인증서를 깨뜨리지 않게 한다.
echo "[certbot] Renewing certificate for $DOMAIN..."
if docker run --rm -p "${LOCAL_HTTP_PORT:-8080}:80" \
    -v "$(pwd)/$LETSENCRYPT_DIR:/etc/letsencrypt" \
    certbot/certbot renew --standalone --non-interactive; then
  cp "$LETSENCRYPT_DIR/live/$DOMAIN/fullchain.pem" "$TLS_DIR/fullchain.pem"
  cp "$LETSENCRYPT_DIR/live/$DOMAIN/privkey.pem" "$TLS_DIR/privkey.pem"
  echo "[certbot] Certificate renewed for $DOMAIN."
else
  echo "[certbot] Renewal failed - keeping the existing certificate."
fi
