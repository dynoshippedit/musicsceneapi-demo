#!/usr/bin/env bash
# One-command launch for The Music Scene (Pulsegrid) demo.
# Starts the API (port 4000) and the React frontend (port 5173) in the background.
# Usage: ./scripts/run-demo.sh        (from the repo root)
# Stop:  ./scripts/stop-demo.sh
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA="$ROOT/.demo-data"
mkdir -p "$DATA" "$ROOT/logs"

API_PORT="${API_PORT:-4000}"
UI_PORT="${UI_PORT:-5173}"
HOST_IP="$(hostname -I | awk '{print $1}')"

# --- API ---
if pgrep -f "node $ROOT/server.js" >/dev/null 2>&1; then
  echo "API already running."
else
  (cd "$ROOT" && PORT="$API_PORT" NODE_ENV=development \
    DB_STORAGE="$DATA/demo.sqlite" \
    JWT_SECRET="${JWT_SECRET:-demo-secret-change-me}" \
    SCHEDULE_JOBS=false \
    nohup node server.js >"$ROOT/logs/api.log" 2>&1 &)
  echo "API starting on port $API_PORT ..."
fi

# --- Frontend ---
if pgrep -f "vite.*--port $UI_PORT" >/dev/null 2>&1; then
  echo "Frontend already running."
else
  (cd "$ROOT/web" && VITE_API_BASE_URL="http://$HOST_IP:$API_PORT" \
    nohup ./node_modules/vite/bin/vite.js --host 0.0.0.0 --port "$UI_PORT" --strictPort \
    >"$ROOT/logs/web.log" 2>&1 &)
  echo "Frontend starting on port $UI_PORT ..."
fi

echo ""
echo "API:      http://$HOST_IP:$API_PORT"
echo "Frontend: http://$HOST_IP:$UI_PORT"
echo "Logs:     $ROOT/logs/api.log, $ROOT/logs/web.log"
