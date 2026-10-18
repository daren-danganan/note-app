# Command palette

Pressing Cmd/Ctrl+K opens a searchable command palette overlay with two
kinds of commands: inserting a markdown element into the currently open
note, and creating a new note from a template. There is no button for
this in the UI -- the keyboard shortcut is the only entry point.

## Sub-features

- **Insert commands** (`insertCommands` in `src/app.js`): Heading 1/2/3,
  Bold, Italic, Strikethrough, Inline code, Code block, Link, Image,
  Bulleted list, Numbered list, Task list, Blockquote, Horizontal rule,
  Table. Each wraps/replaces the current textarea selection
  (`insertMarkdown`) or inserts a literal block at the cursor
  (`insertBlock`, used by Horizontal rule and Table), then dispatches a
  synthetic `input` event so the existing autosave/preview wiring picks up
  the change exactly as if the user had typed it.
- Insert commands are **only included when a note is open**
  (`buildPaletteCommands()` checks `activeNoteId` truthy) -- with no note
  active, the palette shows template commands only. No Rust/Tauri command
  is involved; this is pure DOM/textarea manipulation.
- **Template commands** (`templateCommands`): Blank note, Meeting notes,
  Daily journal, To-do list, Project plan. Always shown regardless of
  whether a note is open. Each calls `createNoteFromTemplate(content)`,
  which does `invoke("create_note")` then (if `content` is non-empty)
  `invoke("save_note", {id, content})`, then refreshes the sidebar and
  opens the new note -- the same two Tauri commands create-note.md and
  open-edit-note.md already prove, just invoked from the palette instead
  of the "+" button.
- Palette UI: `#command-palette` (`.hidden` toggles visibility),
  `#palette-input` (filter text box), `#palette-list` (`<li>` per matching
  command, each tagged with a category label "Insert" or "New Note").
- Filtering (`filterPaletteCommands`) matches the query against
  `title + keywords`, case-insensitive substring; empty query shows
  everything.
- Keyboard nav in `#palette-input`'s `keydown` handler: ArrowUp/ArrowDown
  move `paletteSelectedIndex` (wrapping), Enter runs the selected command
  via `runPaletteCommand` (closes the palette first, then calls
  `command.run()`), Escape closes without running anything. Clicking a
  list item (`mousedown` with `preventDefault`) runs that command directly.
  Clicking the dimmed overlay background (`mousedown` on `#command-palette`
  itself, not its box) also closes it.
- Global `keydown` listener on `document` toggles the palette on
  Cmd/Ctrl+K (`isModK`): opens if closed, closes if already open. This is
  the only way to open it -- there is no visible button for it in
  `index.html`.
- `closePalette()` returns focus to `#editor` after running/cancelling, so
  the user can keep typing immediately.

## How to get to it (user POV)

1. Press Cmd+K (macOS) or Ctrl+K anywhere in the app window.
2. A centered overlay appears with a text input and a filtered command
   list ("Insert" commands only if a note is currently open, "New Note"
   templates always).
3. Type to filter, use arrow keys or mouse to select, press Enter or click
   to run.
4. For an Insert command: the markdown snippet appears in the editor at
   the cursor/selection, palette closes, focus returns to the editor.
5. For a New Note template: a new note is created with the template's
   starter content already filled in, appears in the sidebar, and opens
   in the editor.

## Driving it with cargo test

Not applicable for the insert-commands half -- no Rust code is involved,
it's pure `textarea` DOM manipulation. The template-commands half reuses
`create_note`/`save_note`, which `drive_headless.sh` already proves at the
backend level (see create-note.md/open-edit-note.md); that does **not**
prove the palette's own wiring (filtering, keyboard nav, the
`activeNoteId` gating, or that each template's `run()` actually calls
`createNoteFromTemplate` with the content described above) -- confirm that
by reading `src/app.js`'s `insertCommands`/`templateCommands` arrays, or
with the GUI path below.

## Driving it with AppleScript/System Events (GUI, when `gui_automation: AVAILABLE`)

Confirmed end-to-end on 2026-10-18. With the app focused:

```applescript
tell application "System Events"
  tell (first process whose name is "note-app")
    set frontmost to true
    delay 0.3
    keystroke "k" using {command down}
    delay 0.3
    keystroke "To-do list"
    delay 0.3
    key code 36 -- Enter
    delay 0.5
  end tell
end tell
```

Result: a new `<12-hex>.md` file appeared in `~/Documents/Notes` containing
the exact To-Do List template text (`# To-Do List\n\n- [ ] \n- [ ] \n- [ ] \n`),
and that note opened in the editor (confirmed by it becoming the active
note for the next step). Repeating the same keystroke sequence with
`keystroke "Heading 1"` while that note was open appended `# Heading 1` to
the file after the 400ms autosave debounce, proving an Insert command also
reaches the textarea and survives to disk. Relaunching the app fresh (no
note open) and reading `entire contents of window "Notes"` after Cmd+K
showed only the five template titles ("Blank note", "Meeting notes",
"Daily journal", "To-do list", "Project plan") each labeled "New Note" --
no "Heading 1"/"Bold"/etc. and no "Insert" labels were present, confirming
the `activeNoteId` gate on insert commands. Cleaned up the test note via
`rm` (no distinguishing marker was needed since it was the only new file).

No separate dialog/sheet is involved here (unlike delete-note.md's old
`confirm()` issue), so this path has no known GUI-automation gap for this
feature.

## Gotchas

- **Cmd+K is the only entry point** -- there's no palette button in
  `index.html` to click instead; GUI automation must send the keystroke
  (`keystroke "k" using {command down}`), not look for a button.
- **Insert commands require an open note.** A test driving an insert
  command with no note active will find the palette simply doesn't list
  it (not an error, not a disabled state) -- `filterPaletteCommands` will
  return no match for e.g. "heading" and the list shows "No matching
  commands". Open or create a note first.
- **Autosave debounce still applies** (`SAVE_DEBOUNCE_MS` = 400ms, see
  SKILL.md Gotchas) -- an insert command's effect lands in the textarea
  immediately but the file on disk only updates after the debounce; read
  the file too soon and you'll see stale content and wrongly conclude the
  command didn't fire.
- **Template commands write to the real `~/Documents/Notes`** immediately
  on Enter, same as the "+" button -- always clean up (`rm`/`delete_note`)
  any template note created during verification.
- Running a command closes the palette first (`closePalette()`) and
  *then* calls `command.run()` -- for insert commands this matters because
  `closePalette()` also does nothing to the textarea itself (it only hides
  the overlay and refocuses `#editor`), so order isn't actually
  observable here, but don't assume `run()` executes before focus returns;
  if a future command depended on focus being on the palette input rather
  than the editor, this ordering would break it.
- Table/Horizontal rule use `insertBlock` (inserts literal text, cursor
  placed after it) while every other insert command uses `insertMarkdown`
  (wraps/replaces the current selection with the cursor landing inside the
  placeholder, pre-selected for overtyping) -- don't assume uniform
  insertion behavior across all fourteen insert commands when writing a
  precise assertion about cursor/selection position.
