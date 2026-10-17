# Create a note

Clicking the "+" button in the sidebar creates a new, empty note and opens
it immediately in the editor, ready for typing. There is no title/filename
prompt -- the note starts untitled and the sidebar derives a display title
from the first non-empty line once content exists.

## Sub-features

- New note gets a fresh id: the first 12 hex characters of a UUIDv4
  (`notes::create_note` in `src-tauri/src/notes.rs`).
- A new `<id>.md` file is written to `~/Documents/Notes` immediately,
  empty (`fs::write(&path, "")`), even before the user types anything.
- The frontend opens the new note right after creating it
  (`newNoteBtn` click handler in `src/app.js`: `invoke("create_note")` then
  `openNote(id)`), so the editor is focused and ready.
- The sidebar list refreshes to include the new note (shows as "Untitled"
  until content is saved, per `derive_title`'s fallback).

## How to get to it (user POV)

1. Launch the app (native window titled "Notes").
2. Click the "+" button at the top of the sidebar (`#new-note-btn`,
   aria-label "New note").
3. The editor pane clears and gets focus; a new entry appears at the top of
   the sidebar list.

## Driving it with cargo test

```bash
bash .claude/skills/verify-note-app/scripts/drive_headless.sh
```

Exercises `notes::create_note()` directly (same function the `create_note`
Tauri command wraps) inside
`src-tauri/src/notes.rs::verify_skill_tests::create_list_read_save_delete_round_trip`.
Asserts the returned id's `.md` file exists on disk and appears in
`list_notes()`'s output, then cleans it up via a `Drop` guard.

Manual check without the test harness:

```bash
ls ~/Documents/Notes                      # before
# ...click "+" in the running app...
ls ~/Documents/Notes                      # after: one new <12-hex>.md file
cat ~/Documents/Notes/<new-id>.md         # empty
```

## Driving it with AppleScript/System Events (GUI, when `gui_automation: AVAILABLE`)

Confirmed end-to-end on 2026-10-17: launched the app via `launch.sh`, then
(since a direct `button "New note" of window "Notes"` reference fails with
`-1728` even when Accessibility access is granted -- the button is nested
several levels deep, not a direct child of the window) enumerated `entire
contents of window "Notes"`, found the UI element with `class is button` and
`name is "New note"`, and `click`ed that specific reference:

```applescript
tell application "System Events"
  tell (first process whose name is "note-app")
    set allElems to entire contents of window "Notes"
    repeat with e in allElems
      if (class of e is button) and (name of e is "New note") then
        click e
        exit repeat
      end if
    end repeat
  end tell
end tell
```

Result: a new `<12-hex>.md` file (`b16fdd8a74bd.md`) appeared in
`~/Documents/Notes` immediately, empty, confirming `app.js`'s `newNoteBtn`
handler really calls `invoke("create_note")` and the Tauri command really
writes the file -- not just that the headless `cargo test` path works.
Cleaned up by `rm`ing the tagged file afterward (see open-edit-note.md for
why the GUI Delete button couldn't be used for this cleanup).

## Gotchas

- The file is created on click, before any typing -- "create" and "first
  save" are the same filesystem event here, there's no separate draft state.
- `create_note` doesn't take or derive a title; don't assert on filename
  content, only on the fixed 12-hex-char id format.
- Creating many notes in a loop without cleanup pollutes the user's real
  `~/Documents/Notes` -- always delete via `delete_note`/`rm` what you
  create during verification.
