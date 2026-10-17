#!/usr/bin/env bash
# Launch the note-app Tauri dev build in the background and wait for the
# native window's process to appear. Prints the window process PID on
# success. Logs go to $LOG (default: scratchpad-style temp file).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
LOG="${LOG:-/tmp/note-app-verify-dev.log}"
TIMEOUT_S="${TIMEOUT_S:-60}"

cd "$REPO_ROOT"
nohup npm run tauri dev >"$LOG" 2>&1 &
DEV_SHELL_PID=$!
echo "started npm/tauri dev watcher, shell pid $DEV_SHELL_PID, log at $LOG" >&2

elapsed=0
while [ "$elapsed" -lt "$TIMEOUT_S" ]; do
  PID="$(pgrep -f "target/(debug|release)/note-app$" | head -n1 || true)"
  if [ -n "${PID:-}" ]; then
    echo "$PID"
    exit 0
  fi
  if grep -qi "error\[" "$LOG" 2>/dev/null; then
    echo "build error detected, see $LOG" >&2
    exit 1
  fi
  sleep 1
  elapsed=$((elapsed + 1))
done

echo "timed out waiting for note-app window process, see $LOG" >&2
exit 1
