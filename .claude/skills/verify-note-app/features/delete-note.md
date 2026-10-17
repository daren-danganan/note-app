# Delete a note

The Delete button in the editor toolbar removes the currently open note
after a confirmation dialog, permanently (no trash/undo).

## Sub-features

- `deleteNoteBtn` click handler in `src/app.js`: if no note is open
  (`activeNoteId` is null), does nothing. Otherwise shows a native
  `confirm("Delete this note? This cannot be undone.")`; if cancelled, does
  nothing and the file is untouched.
- On confirm: `invoke("delete_note", {id})` (-> `notes::delete_note`, a
  plain `fs::remove_file`), clears `activeNoteId`, clears the editor and
  preview panes, clears save status, refreshes the sidebar list.
- Deletion is immediate and irreversible at the app level -- `fs::remove_file`
  with no trash/recycle-bin step.

## How to get to it (user POV)

1. Open a note (click it in the sidebar).
2. Click "Delete" in the editor toolbar.
3. Confirm the native dialog.
4. The note disappears from the sidebar; the editor goes blank.

## Driving it with cargo test

```bash
bash .claude/skills/verify-note-app/scripts/drive_headless.sh
```

`notes.rs::verify_skill_tests::create_list_read_save_delete_round_trip`
calls `delete_note(id)` and asserts the file no longer exists via
`path.exists()`.

Manual check:

```bash
ls ~/Documents/Notes/<id>.md     # exists
# ...click Delete, confirm dialog...
ls ~/Documents/Notes/<id>.md     # No such file or directory
```

## Driving it with AppleScript/System Events (GUI, when `gui_automation: AVAILABLE`)

Attempted end-to-end on 2026-10-17: with a tagged test note open, clicked
the UI element with `class is button` / `name is "Delete"` the same way as
the "New note" button in create-note.md. Result: **the file was not
deleted** and no new window/sheet/dialog appeared in
`get name of every window` immediately after the click. This is consistent
with WKWebView's JS `confirm()` having no native dialog delegate configured
in this Tauri app, so `confirm(...)` silently returns `false` (or never
resolves), and the `if (!confirm(...)) return;` guard in `deleteNoteBtn`'s
handler short-circuits before `invoke("delete_note", ...)` ever fires. The
test note had to be removed with a plain `rm` for cleanup instead of
through the UI.

This means **the GUI path cannot currently prove the delete journey
end-to-end** in this environment -- not because Accessibility access is
missing (it isn't: the click itself registers, as shown by the "clicked"
return value), but because the `confirm()` dialog this handler depends on
never surfaces for System Events to accept. Treat this as an open
verification gap for delete specifically, not a reconfirmation of the old
"Accessibility blocked" gap (which is now closed for create/edit, see
create-note.md and open-edit-note.md). A real fix would require either:
instrumenting `confirm()` at the JS layer for test runs, or finding
whatever native sheet it should produce and giving System Events a moment
longer / the right window reference to catch it.

## Gotchas

- The confirm dialog is a blocking native `confirm()` -- GUI automation
  must dismiss/accept it (it pauses JS execution), and it's a separate UI
  surface from the webview DOM, so `osascript`/AppleScript targeting may
  need to address a sheet/dialog rather than a webview element. **Verified
  2026-10-17: a plain `click` on the Delete button alone does not progress
  past this dialog** -- no sheet was observed and the file survived, so the
  GUI path for delete remains unproven even with Accessibility access
  available. Use the headless path for delete proof until this is resolved.
- Cancelling the dialog must leave the file untouched -- a FAIL if the file
  still disappears after Cancel (would mean the delete call fired before
  the confirm, a real regression to check for explicitly).
- No confirmation is required at the `delete_note` Tauri-command layer
  itself; the confirm dialog is purely a frontend gate. Driving
  `notes::delete_note` directly (headless path) always "confirms" --
  that's expected and consistent with testing backend logic only.
