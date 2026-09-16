#!/usr/bin/env bash
# tests/support/run_legacy_scripts.sh
# Runs the pre-existing ad-hoc test_*/verify_*/check_* scripts and reports
# outcomes. These are NOT part of `npm test` (they have no assertions and many
# require live third-party credentials); this harness exists only to record
# their status before/after refactoring.
cd "$(dirname "$0")/../.." || exit 1
export GROQ_API_KEY="${GROQ_API_KEY:-}"

printf "%-40s %-10s %s\n" "SCRIPT" "EXIT" "NOTE"
printf "%-40s %-10s %s\n" "----------------------------------------" "----------" "----"

for f in "$@"; do
  OUT=$(timeout 45 node "$f" 2>&1)
  CODE=$?
  NOTE=""
  if echo "$OUT" | grep -qiE "Cannot find module"; then
    NOTE="BLOCKED: missing module"
  elif echo "$OUT" | grep -qiE "ECONNREFUSED"; then
    NOTE="needs running server"
  elif echo "$OUT" | grep -qiE "401|403|Invalid credentials"; then
    NOTE="auth rejected"
  elif [ $CODE -eq 124 ]; then
    NOTE="TIMEOUT (45s)"
  elif [ $CODE -eq 0 ]; then
    NOTE="completed"
  else
    NOTE="nonzero exit"
  fi
  printf "%-40s %-10s %s\n" "$f" "$CODE" "$NOTE"
done
