#!/usr/bin/env bash
# Stop the demo services started by run-demo.sh.
# Terminates ONLY the PIDs recorded in logs/*.pid — never broad pkill.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

stop_pid() { # stop_pid <name> <pidfile>
  local name="$1" pidfile="$2"
  if [ ! -f "$pidfile" ]; then
    echo "$name: no PID file (not started by run-demo.sh)."
    return 0
  fi
  local pid
  pid="$(cat "$pidfile")"
  if ! kill -0 "$pid" 2>/dev/null; then
    echo "$name: pid $pid not running; cleaning up PID file."
    rm -f "$pidfile"
    return 0
  fi
  kill "$pid" 2>/dev/null || true
  for _ in $(seq 1 10); do
    kill -0 "$pid" 2>/dev/null || break
    sleep 1
  done
  if kill -0 "$pid" 2>/dev/null; then
    echo "$name: pid $pid did not exit gracefully; sending SIGKILL."
    kill -9 "$pid" 2>/dev/null || true
  fi
  rm -f "$pidfile"
  echo "$name stopped (was pid $pid)."
}

stop_pid "API" "$ROOT/logs/api.pid"
stop_pid "Frontend" "$ROOT/logs/web.pid"
