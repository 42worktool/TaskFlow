#!/bin/sh
# VPS의 공개 443번 포트를 이 머신의 HTTPS_PORT로 연결하는 지속형 SSH reverse tunnel을
# 시작하거나 중지한다. 운영 스택이 실행되는 동안 외부 요청이 로컬 nginx에 도달하게 한다.
#
# certbot용 임시 터널과 달리 시작 스크립트가 끝난 뒤에도 살아 있어야 하므로,
# 프로세스를 즉시 종료하지 않고 pidfile에 PID를 저장해 후속 stop에서 정확히 정리한다.
set -eu

PID_FILE="./.taskflow/app-tunnel.pid"
LOG_FILE="./.taskflow/app-tunnel.log"

start() {
  # 터널을 사용하지 않는 직접 배포 구성도 같은 명령을 사용할 수 있게 정상 종료한다.
  if [ -z "${SSH_TUNNEL_HOST:-}" ]; then
    echo "[tunnel] SSH_TUNNEL_HOST not set in .env.prod - skipping app tunnel."
    return 0
  fi

  LOCAL_HTTPS_PORT="${HTTPS_PORT:-443}"

  # pidfile의 프로세스가 실제로 살아 있으면 중복 터널과 포트 충돌을 만들지 않는다.
  if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    echo "[tunnel] App tunnel already running (pid $(cat "$PID_FILE"))."
    return 0
  fi

  mkdir -p "$(dirname "$PID_FILE")"
  echo "[tunnel] Opening persistent SSH tunnel via '$SSH_TUNNEL_HOST' (VPS:443 -> localhost:$LOCAL_HTTPS_PORT)..."
  nohup ssh -N \
    -o ExitOnForwardFailure=yes \
    -o ServerAliveInterval=30 \
    -o ServerAliveCountMax=3 \
    -o BatchMode=yes \
    -o StrictHostKeyChecking=accept-new \
    -R "443:localhost:$LOCAL_HTTPS_PORT" "$SSH_TUNNEL_HOST" \
    >"$LOG_FILE" 2>&1 </dev/null &
  echo $! > "$PID_FILE"

  # nohup 실행 직후의 SSH 포워딩 실패를 감지해 죽은 PID를 성공 상태로 남기지 않는다.
  sleep 2
  if kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    echo "[tunnel] App tunnel established (pid $(cat "$PID_FILE"))."
  else
    echo "[tunnel] Failed to establish app tunnel - see $LOG_FILE"
    rm -f "$PID_FILE"
  fi
}

stop() {
  # 이 스크립트가 기록한 PID만 종료해 다른 SSH 세션을 건드리지 않는다.
  if [ -f "$PID_FILE" ]; then
    PID="$(cat "$PID_FILE")"
    if kill -0 "$PID" 2>/dev/null; then
      echo "[tunnel] Closing app tunnel (pid $PID)..."
      kill "$PID" 2>/dev/null || true
    fi
    rm -f "$PID_FILE"
  fi
}

case "${1:-}" in
  start) start ;;
  stop) stop ;;
  *) echo "usage: $0 {start|stop}" >&2; exit 1 ;;
esac
