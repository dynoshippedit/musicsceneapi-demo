#!/usr/bin/env bash
# One-command launch for The Music Scene (Pulsegrid) demo.
# Starts the API (port 4000) and the React frontend (port 5173) in the background.
# Usage: ./scripts/run-demo.sh        (from the repo root)
# Stop:  ./scripts/stop-demo.sh
#
# DEMO_MODE=true is set for the API: the fictional Pulsegrid demo dataset is
# seeded into the throwaway demo database (.demo-data/demo.sqlite). Customer
# instances must NOT set DEMO_MODE — they boot with an empty database.
#
# Demo credentials: the API JWT_SECRET is demo-only. It is generated on first
# launch into .demo-data/.env (gitignored) -- never hardcoded in this script and
# never to be copied to a production environment. See "Demo-only credentials".
#
# Process management uses PID files (logs/*.pid) and exact-PID termination.
# No broad pkill/pgrep patterns — the stop script kills only the recorded PIDs.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA="$ROOT/.demo-data"
mkdir -p "$DATA" "$ROOT/logs"

API_PORT="${API_PORT:-4000}"
UI_PORT="${UI_PORT:-${WEB_PORT:-5173}}"
HOST_IP="$(hostname -I | awk '{print $1}')"
API_PID="$ROOT/logs/api.pid"
WEB_PID="$ROOT/logs/web.pid"

alive() { # alive <pidfile> — true if the recorded PID is our node process
  [ -f "$1" ] || return 1
  local pid; pid="$(cat "$1")"
  kill -0 "$pid" 2>/dev/null || return 1
  # Guard against PID reuse: confirm the process is node running our code.
  ps -p "$pid" -o args= 2>/dev/null | grep -q "node" || return 1
}

# --- Demo-only credentials ---
# JWT_SECRET is demo-only and is NEVER hardcoded in this script. On first launch
# a random 256-bit secret is generated into .demo-data/.env (gitignored, mode 600);
# that file is the only place a demo secret lives on disk. It signs session tokens
# for the throwaway demo database only: it must never be copied to a production
# environment, and rotating or losing it only invalidates demo sessions (users
# simply log in again). server.js refuses to start without a JWT_SECRET
# (fail-closed CRITICAL-2 check in src/config/index.js).
DEMO_ENV="$DATA/.env"
if [ ! -f "$DEMO_ENV" ]; then
  if ! command -v openssl >/dev/null 2>&1; then
    echo "ERROR: openssl is required to generate the demo JWT_SECRET." >&2
    exit 1
  fi
  _new_secret="$(openssl rand -hex 32)"
  ( umask 077; printf 'JWT_SECRET=%s\n' "$_new_secret" > "$DEMO_ENV" )
  unset _new_secret
  echo "Created $DEMO_ENV with a fresh random demo-only JWT_SECRET (gitignored)."
fi
# Load the demo-only secret into the environment; fail closed when absent.
set -a
# shellcheck disable=SC1090
. "$DEMO_ENV"
set +a
: "${JWT_SECRET:?JWT_SECRET is not set in $DEMO_ENV}"

# --- API ---
if alive "$API_PID"; then
  echo "API already running (pid $(cat "$API_PID"))."
else
  (cd "$ROOT" && PORT="$API_PORT" NODE_ENV=development \
    DB_STORAGE="$DATA/demo.sqlite" \
    DEMO_MODE=true \
    JWT_SECRET="$JWT_SECRET" \
    SCHEDULE_JOBS=false \
    nohup node server.js >"$ROOT/logs/api.log" 2>&1 &
   echo $! > "$API_PID")
  echo "API starting on port $API_PORT (pid $(cat "$API_PID")) ..."
fi

# --- Frontend ---
if alive "$WEB_PID"; then
  echo "Frontend already running (pid $(cat "$WEB_PID"))."
else
  (cd "$ROOT/web" && VITE_API_BASE_URL="http://$HOST_IP:$API_PORT" \
    nohup ./node_modules/vite/bin/vite.js --host 0.0.0.0 --port "$UI_PORT" --strictPort \
    >"$ROOT/logs/web.log" 2>&1 &
   echo $! > "$WEB_PID")
  echo "Frontend starting on port $UI_PORT (pid $(cat "$WEB_PID")) ..."
fi

# --- Health check before returning (fail closed) ---
healthy=0
for i in $(seq 1 30); do
  if curl -sf -o /dev/null "http://127.0.0.1:$API_PORT/health" 2>/dev/null \
     && curl -sf -o /dev/null "http://127.0.0.1:$UI_PORT/" 2>/dev/null; then
    healthy=1
    break
  fi
  sleep 1
done
if [ "$healthy" -ne 1 ]; then
  echo "ERROR: services did not become healthy within 30s." >&2
  echo "Check $ROOT/logs/api.log and $ROOT/logs/web.log for details." >&2
  exit 1
fi

echo ""
echo "API:      http://$HOST_IP:$API_PORT"
echo "Frontend: http://$HOST_IP:$UI_PORT"
echo "Logs:     $ROOT/logs/api.log, $ROOT/logs/web.log"
