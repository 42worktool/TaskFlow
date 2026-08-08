#!/bin/sh
# nginx를 시작하기 전에 DOMAIN의 Let's Encrypt 인증서 발급을 시도한다.
# certbot은 로컬 privileged port 권한이 필요 없도록 LOCAL_HTTP_PORT(기본 8080)의
# standalone 모드로 실행하고, SSH 터널이 VPS의 80번 요청을 해당 포트로 전달한다.
#
# DOMAIN 누락, 터널 실패, rate limit 등의 문제는 배포 전체를 중단시키지 않는다.
# 인증서 파일을 만들지 않고 정상 종료하면 nginx entrypoint가 self-signed 인증서로 대체한다.
set -eu

# source한 공통 터널은 성공·실패와 관계없이 스크립트 종료 시 닫는다.
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

# 이미 발급된 원본이 있으면 ACME 요청을 반복하지 않고 nginx용 경로에 복사한다.
if [ -f "$LETSENCRYPT_DIR/live/$DOMAIN/fullchain.pem" ]; then
  echo "[certbot] A Let's Encrypt certificate for $DOMAIN already exists - reusing it (run 'make prod-renew' to renew)."
  cp "$LETSENCRYPT_DIR/live/$DOMAIN/fullchain.pem" "$TLS_DIR/fullchain.pem"
  cp "$LETSENCRYPT_DIR/live/$DOMAIN/privkey.pem" "$TLS_DIR/privkey.pem"
  exit 0
fi

open_tunnel

# ACME 계정과 원본 인증서는 영속 디렉터리에 두고, 성공한 경우에만 nginx가 읽는
# TLS_DIR로 인증서와 개인 키를 복사한다.
echo "[certbot] Requesting a Let's Encrypt certificate for $DOMAIN..."
if docker run --rm -p "${LOCAL_HTTP_PORT:-8080}:80" \
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
