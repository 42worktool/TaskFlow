#!/bin/sh
# Start/stop a persistent SSH reverse tunnel forwarding the VPS's HTTPS_PORT
# to this machine, so the deployed app stays reachable through the public
# VPS for as long as the production stack is running.
#
# Unlike the certbot tunnel (lib-ssh-tunnel.sh), this one is meant to outlive
# the script that starts it, so its pid is tracked in a pidfile instead of
# being killed when this script exits.
set -eu

PID_FILE="./.taskflow/app-tunnel.pid"
LOG_FILE="./.taskflow/app-tunnel.log"

start() {
  if [ -z "${SSH_TUNNEL_HOST:-}" ]; then
    echo "[tunnel] SSH_TUNNEL_HOST not set in .env.prod - skipping app tunnel."
    return 0
  fi

  PORT="${HTTPS_PORT:-443}"

  if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    echo "[tunnel] App tunnel already running (pid $(cat "$PID_FILE"))."
    return 0
  fi

  mkdir -p "$(dirname "$PID_FILE")"
  echo "[tunnel] Opening persistent SSH tunnel via '$SSH_TUNNEL_HOST' (VPS:$PORT -> localhost:$PORT)..."
  nohup ssh -N \
    -o ExitOnForwardFailure=yes \
    -o ServerAliveInterval=30 \
    -o ServerAliveCountMax=3 \
    -o BatchMode=yes \
    -o StrictHostKeyChecking=accept-new \
    -R "$PORT:localhost:$PORT" "$SSH_TUNNEL_HOST" \
    >"$LOG_FILE" 2>&1 </dev/null &
  echo $! > "$PID_FILE"

  sleep 2
  if kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    echo "[tunnel] App tunnel established (pid $(cat "$PID_FILE"))."
  else
    echo "[tunnel] Failed to establish app tunnel - see $LOG_FILE"
    rm -f "$PID_FILE"
  fi
}

stop() {
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
