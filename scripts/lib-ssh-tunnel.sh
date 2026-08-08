# 공개 VPS의 80번 포트를 로컬 포트로 전달하는 임시 SSH reverse tunnel 공통 함수다.
# certbot-issue.sh와 certbot-renew.sh가 이 파일을 source해 Let's Encrypt의
# HTTP-01 검증 요청을 로컬 standalone certbot까지 전달하며, 직접 실행하지 않는다.
#
# ~/.ssh/config의 별칭을 SSH_TUNNEL_HOST에 지정했을 때만 터널을 연다.
# 다른 방식으로 80번 포트가 이미 연결돼 있다면 값을 비워 터널 관리를 건너뛴다.
#
# Let's Encrypt가 항상 80번 포트로 검증하므로 VPS 포트는 고정한다. 로컬 80번은
# 관리자 권한이 필요할 수 있어 LOCAL_HTTP_PORT(기본 8080)로 목적지만 바꿀 수 있다.

TUNNEL_PID=""

open_tunnel() {
  # 별칭이 없다는 것은 터널을 사용하지 않는 배포 구성이므로 정상 종료한다.
  if [ -z "${SSH_TUNNEL_HOST:-}" ]; then
    return 0
  fi
  LOCAL_HTTP_PORT="${LOCAL_HTTP_PORT:-8080}"
  echo "[certbot] Opening SSH tunnel via '$SSH_TUNNEL_HOST' (VPS:80 -> localhost:$LOCAL_HTTP_PORT)..."
  ssh -N \
    -o ExitOnForwardFailure=yes \
    -o ConnectTimeout=10 \
    -o BatchMode=yes \
    -o StrictHostKeyChecking=accept-new \
    -R "80:localhost:$LOCAL_HTTP_PORT" "$SSH_TUNNEL_HOST" &
  TUNNEL_PID=$!
  # ssh가 백그라운드에서 포워딩 실패를 보고할 시간을 잠시 준 뒤 생존 여부를 확인한다.
  sleep 2
  if ! kill -0 "$TUNNEL_PID" 2>/dev/null; then
    echo "[certbot] Could not establish SSH tunnel via '$SSH_TUNNEL_HOST' - continuing without it."
    TUNNEL_PID=""
  fi
}

close_tunnel() {
  # 호출 스크립트의 EXIT trap에서 실행되며, 이번 실행이 만든 프로세스만 정리한다.
  if [ -n "$TUNNEL_PID" ]; then
    echo "[certbot] Closing SSH tunnel..."
    kill "$TUNNEL_PID" 2>/dev/null || true
    wait "$TUNNEL_PID" 2>/dev/null || true
  fi
}
