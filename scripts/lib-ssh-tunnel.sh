# Shared helpers to briefly open an SSH reverse tunnel forwarding port 80,
# used by certbot-issue.sh and certbot-renew.sh so Let's Encrypt's HTTP-01
# validator can reach this machine through the public VPS. Sourced, not run
# directly.
#
# Set SSH_TUNNEL_HOST (an alias from ~/.ssh/config) to enable this. Leave it
# unset to skip tunnel management entirely (e.g. if port 80 is already
# reachable some other way).

TUNNEL_PID=""

open_tunnel() {
  if [ -z "${SSH_TUNNEL_HOST:-}" ]; then
    return 0
  fi
  echo "[certbot] Opening SSH tunnel via '$SSH_TUNNEL_HOST' to forward port 80..."
  ssh -N \
    -o ExitOnForwardFailure=yes \
    -o ConnectTimeout=10 \
    -o BatchMode=yes \
    -o StrictHostKeyChecking=accept-new \
    -R 80:localhost:80 "$SSH_TUNNEL_HOST" &
  TUNNEL_PID=$!
  sleep 2
  if ! kill -0 "$TUNNEL_PID" 2>/dev/null; then
    echo "[certbot] Could not establish SSH tunnel via '$SSH_TUNNEL_HOST' - continuing without it."
    TUNNEL_PID=""
  fi
}

close_tunnel() {
  if [ -n "$TUNNEL_PID" ]; then
    echo "[certbot] Closing SSH tunnel..."
    kill "$TUNNEL_PID" 2>/dev/null || true
    wait "$TUNNEL_PID" 2>/dev/null || true
  fi
}
