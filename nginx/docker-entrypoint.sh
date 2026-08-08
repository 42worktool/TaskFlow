#!/bin/sh
set -e

SSL_DIR=/etc/nginx/ssl
KEY_FILE=${SSL_DIR}/privkey.pem
CERT_FILE=${SSL_DIR}/fullchain.pem

mkdir -p "$SSL_DIR"

# 개발·운영 어느 환경이든 외부 인증서가 없을 때 HTTPS 계약을 유지하도록 두 파일 중
# 하나라도 없으면 localhost CN의 self-signed 인증서 쌍을 새로 만든다.
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

# foreground 모드로 실행해 nginx가 컨테이너의 주 프로세스가 되고 종료 신호를 직접 받는다.
exec nginx -g 'daemon off;'
