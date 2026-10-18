# Delete a note

The Delete button in the editor toolbar removes the currently open note
after a confirmation dialog, permanently (no trash/undo).

## Sub-features

- `deleteNoteBtn` click handler in `src/app.js`: if no note is open
  (`activeNoteId` is null), does nothing. Otherwise awaits a custom
  in-page `confirmDialog("Delete this note? This cannot be undone.")`
  (shows `#confirm-dialog`, resolves `true`/`false` on
  `#confirm-dialog-ok`/`#confirm-dialog-cancel` click); if cancelled, does
  nothing and the file is untouched. **This was previously a native
  `window.confirm()`, which never surfaced a dialog in WKWebView and
  silently returned `false`, so Delete never worked at all -- fixed in
  commit `ae3428d` by replacing it with this custom DOM modal.** Don't
  automate this as a native sheet/dialog; it's a plain `<div>` overlay in
  the webview DOM.
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

**Re-confirmed working end-to-end on 2026-10-18**, after the `ae3428d` fix
replaced native `confirm()` with the custom `#confirm-dialog` DOM modal
described above. The earlier attempt (2026-10-17, before that fix) found
the delete journey unprovable via GUI because `confirm()` never surfaced a
native dialog for System Events to accept -- that gap is now closed.

Proof: created a tagged note (`zzverifytag.md`, content
`palette-delete-verify-tag`) directly on disk, launched the app, clicked
the sidebar entry containing that text (found via `entire contents of
window "Notes"`, matching the `group` whose descendants include the
title/meta/preview static text trio -- clicking `button N of window`
directly is *not* this; those indices are the native title-bar
close/minimize/zoom buttons and clicking one quits the app, as discovered
while re-proving this), then clicked the toolbar's `button "Delete"`. This
opened the custom confirm overlay, which added a **second** button also
named `"Delete"` (`#confirm-dialog-ok`, `class="danger"`) alongside
`"Cancel"` -- disambiguated from the toolbar's `"Delete"` by `position`
(the dialog's pair sits at the same y-coordinate, centered, well below the
toolbar's). Clicking that second `"Delete"` button removed
`zzverifytag.md` from `~/Documents/Notes` immediately. Also confirmed via
`doctor.sh`/`ls` that the file count returned to its pre-test baseline (2
notes) afterward -- no stray file left over.

## Gotchas

- The confirm dialog is a custom in-page DOM modal (`#confirm-dialog`), not
  a native sheet -- GUI automation targets it as an ordinary webview
  element (`class is button`, `name is "Delete"`/`"Cancel"`) via `entire
  contents of window`, same as every other button in this app. There are
  now **two** elements named `"Delete"` on screen at once once the dialog
  is open (toolbar + dialog's confirm button); disambiguate by `position`
  (see the GUI section above) or by scoping the search to the dialog's own
  subtree, not by assuming the first match found is the right one.
- Window-chrome buttons (`button 1`/`2`/`3` of `window "Notes"` with no
  `name`, i.e. `name` reads `missing value`) are the native macOS
  close/minimize/zoom controls, not sidebar note items -- clicking one
  (e.g. `button 1`) **quits the app** since this is a single-window app.
  Always use `entire contents of window` + a `class`/`name`/position
  filter to reach real webview elements, never a direct `button N of
  window` index.
- Cancelling the dialog must leave the file untouched -- a FAIL if the file
  still disappears after Cancel (would mean the delete call fired before
  the confirm, a real regression to check for explicitly).
- No confirmation is required at the `delete_note` Tauri-command layer
  itself; the confirm dialog is purely a frontend gate. Driving
  `notes::delete_note` directly (headless path) always "confirms" --
  that's expected and consistent with testing backend logic only.
