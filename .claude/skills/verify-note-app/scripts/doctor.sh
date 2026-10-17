#!/usr/bin/env bash
# Health check for the note-app verification environment. Reports:
# - whether the note-app window process is running
# - whether ~/Documents/Notes exists and is readable
# - whether GUI automation (System Events / osascript) is available, since
#   that's needed for real click-driven verification vs. the headless
#   cargo-test fallback (see SKILL.md Drive section).
set -uo pipefail

NOTES_DIR="${HOME}/Documents/Notes"

PID="$(pgrep -f "target/(debug|release)/note-app$" | head -n1 || true)"
if [ -n "$PID" ]; then
  echo "app: RUNNING (pid $PID)"
else
  echo "app: NOT RUNNING"
fi

if [ -d "$NOTES_DIR" ]; then
  COUNT="$(ls "$NOTES_DIR"/*.md 2>/dev/null | wc -l | tr -d ' ')"
  echo "notes_dir: OK ($NOTES_DIR, $COUNT note(s))"
else
  echo "notes_dir: MISSING ($NOTES_DIR) -- will be created on first create_note call"
fi

# Enumerating process names works without Accessibility; reading a window's
# UI elements does not. Probe window-level access against Finder (always
# running) since it's a true test of what UI scripting needs.
if osascript -e 'tell application "System Events" to get name of every window of (first process whose name is "Finder")' >/dev/null 2>&1; then
  echo "gui_automation: AVAILABLE (System Events can read window UI elements)"
else
  echo "gui_automation: BLOCKED (osascript lacks Accessibility access --" \
       "grant it to Terminal/osascript in System Settings > Privacy &" \
       "Security > Accessibility, or use the headless cargo-test drive" \
       "path in SKILL.md instead)"
fi
