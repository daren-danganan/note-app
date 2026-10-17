# Open/edit a note (autosave)

Clicking a note in the sidebar loads its content into the editor. Typing
edits it in place; changes are written to disk automatically ~400ms after
the user stops typing, with no explicit save button or "unsaved changes"
state.

## Sub-features

- Open: `openNote(id)` in `src/app.js` calls `invoke("read_note", {id})`
  (-> `notes::read_note`, a plain `fs::read_to_string`), sets the textarea
  value, clears save status, highlights the note in the sidebar list, and
  focuses the editor.
- Autosave: every `input` event on `#editor` sets status text to "Saving…",
  updates the live preview if visible, and calls a debounced
  (`SAVE_DEBOUNCE_MS = 400`) `persistNote()`, which `invoke("save_note",
  {id, content})` (-> `notes::save_note`, a plain `fs::write` that
  overwrites the whole file) then sets status to "Saved" and refreshes the
  sidebar list (so title/preview/sort order reflect the new content).
- `save_note` fully overwrites the file -- there's no merge/diff, no undo
  history beyond the OS/filesystem level.

## How to get to it (user POV)

1. Click any note in the sidebar list.
2. Its content loads into the main editor textarea.
3. Type; after you pause for under a second, the status label near the
   toolbar shows "Saving…" then "Saved".

## Driving it with cargo test

```bash
bash .claude/skills/verify-note-app/scripts/drive_headless.sh
```

`notes.rs::verify_skill_tests::create_list_read_save_delete_round_trip`
calls `save_note(id, "# Verify Skill Smoke\nverify-skill-smoke-test content")`
then `read_note(id)` and asserts the marker string round-trips. This proves
the exact function pair the UI debounces into, but not the debounce timing
itself (JS-only behavior).

Manual check for the debounce:

```bash
# ...in the running app, open a note, type a character, then within <400ms...
cat ~/Documents/Notes/<id>.md   # should NOT yet contain the new character
# ...wait >400ms...
cat ~/Documents/Notes/<id>.md   # now contains it
```

## Driving it with AppleScript/System Events (GUI, when `gui_automation: AVAILABLE`)

Confirmed end-to-end on 2026-10-17 against a note just created via the GUI
(see create-note.md): `set focused of e to true` then `keystroke "..."`
on the `text area` element did **not** reach the DOM (file stayed empty
after the debounce wait) -- the webview's text area needs an actual `click`
to take real keyboard focus, not just `set focused to true`:

```applescript
tell application "System Events"
  set frontmost of (first process whose name is "note-app") to true
  tell (first process whose name is "note-app")
    set allElems to entire contents of window "Notes"
    repeat with e in allElems
      if (class of e is text area) then
        click e
        delay 0.3
        keystroke "GUI-VERIFIER-PROOF-STRING"
        exit repeat
      end if
    end repeat
  end tell
end tell
```

After `click`-then-`keystroke` and a >400ms wait, `cat`ing the note's
`<id>.md` showed exactly `GUI-VERIFIER-PROOF-STRING` -- real proof the
`input` listener, debounce, and `save_note` invoke all fire correctly from
a real keystroke, not just from calling `save_note` directly in a test.

## Gotchas

- 400ms debounce means a read immediately after a keystroke in a GUI-path
  test is a race, not a bug -- always wait >400ms before asserting the file
  changed, and ideally also wait and assert it does *not* change before
  that if testing debounce behavior specifically.
- `save_note` has no empty-content guard: saving an empty textarea
  truncates the file to zero bytes, same as a freshly created note.
- Switching notes while a save is pending: `openNote()` doesn't cancel or
  flush `persistNote`'s pending timer, and `persistNote` always writes to
  `activeNoteId` (the variable, read at fire time, not captured per-call) --
  so a save queued while editing note A, if the user switches to note B
  before the 400ms elapses, writes A's buffered content to note B's id
  instead of A's. This is a real race worth testing explicitly if a bug
  report mentions content appearing on the wrong note.
