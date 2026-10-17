#!/usr/bin/env bash
# Stop the note-app window process and its `tauri dev` watcher started by
# launch.sh. Does not touch ~/Documents/Notes -- that's the user's real
# note store; verification tests clean up their own tagged files.
set -uo pipefail

pkill -f "target/(debug|release)/note-app$" 2>/dev/null && echo "stopped note-app window process" || echo "note-app window process not running"
pkill -f "node .*tauri dev" 2>/dev/null && echo "stopped tauri dev watcher" || echo "tauri dev watcher not running"
