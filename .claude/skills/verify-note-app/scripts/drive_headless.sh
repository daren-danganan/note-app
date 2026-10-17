#!/usr/bin/env bash
# Headless drive: runs the verify-skill smoke tests embedded in
# src-tauri/src/notes.rs and src-tauri/src/search.rs. These tests call the
# exact functions the Tauri commands (create_note, list_notes, read_note,
# save_note, delete_note, search_notes) wrap, against the real
# ~/Documents/Notes directory, and clean up every file they create.
#
# Three tests run: the create/list/read/save/delete round trip, list_notes'
# mtime-descending sort order + heading-derived titles, and search's
# content/title substring match. See each feature's .md file under
# features/ for what each one specifically proves.
#
# Use this when GUI automation is unavailable (see doctor.sh). It proves
# backend logic + real filesystem side effects, but NOT that app.js wires
# the UI to these commands correctly -- cross-check that by reading
# src/app.js's invoke(...) calls against src-tauri/src/lib.rs's
# #[tauri::command] names (see SKILL.md Drive section).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
cd "$REPO_ROOT/src-tauri"

echo "--- notes dir before ---"
ls -la "${HOME}/Documents/Notes" 2>/dev/null || echo "(does not exist yet)"

cargo test --lib verify_skill_tests -- --nocapture

echo "--- notes dir after (should be unchanged: tests clean up their own files) ---"
ls -la "${HOME}/Documents/Notes" 2>/dev/null || echo "(does not exist)"
