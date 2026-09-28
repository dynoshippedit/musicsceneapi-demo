#!/usr/bin/env bash
# Stop the demo services started by run-demo.sh.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
pkill -f "node $ROOT/server.js" 2>/dev/null && echo "API stopped." || echo "API was not running."
pkill -f "vite.*--port" 2>/dev/null && echo "Frontend stopped." || echo "Frontend was not running."
