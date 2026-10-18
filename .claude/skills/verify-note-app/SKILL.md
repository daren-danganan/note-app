---
name: verify-note-app
description: Launch, drive, and capture evidence for the note-app Tauri desktop app (create/list/open/edit/delete/search notes, markdown preview, command palette). Use when verifying a claim about note-app's behavior.
---

# Verify note-app

note-app is a local-first markdown note app: Tauri (Rust) backend + vanilla
HTML/JS frontend (no bundler, no dev server). Notes are plain `.md` files in
`~/Documents/Notes`. There is no network API and no browser URL -- the UI is
a single native macOS window.

Every frontend `invoke(...)` call in `src/app.js` maps 1:1 to a
`#[tauri::command]` in `src-tauri/src/lib.rs`, which calls straight through
to a plain function in `src-tauri/src/notes.rs` or `src-tauri/src/search.rs`.
That plain function is the one source of truth for each feature's real
behavior and filesystem side effects:

| UI action | invoke() name | Rust command (lib.rs) | Logic (notes.rs / search.rs) |
|---|---|---|---|
| click "+" | `create_note` | `create_note` | `notes::create_note` |
| sidebar list | `list_notes` | `list_notes` | `notes::list_notes` |
| click a note | `read_note` | `read_note` | `notes::read_note` |
| typing (debounced) | `save_note` | `save_note` | `notes::save_note` |
| Delete button | `delete_note` | `delete_note` | `notes::delete_note` |
| search box | `search_notes` | `search_notes` | `search::search` |
| Cmd/Ctrl+K palette, "Insert" commands | none (pure textarea DOM edit) | n/a | n/a |
| Cmd/Ctrl+K palette, "New Note" templates | `create_note` + `save_note` | same as above | same as above |

## Launch

```bash
bash .claude/skills/verify-note-app/scripts/launch.sh
```

Runs `npm run tauri dev` in the background (logs to `/tmp/note-app-verify-dev.log`
by default, override with `LOG=...`), waits up to 60s for the
`target/debug/note-app` process to appear, and prints its PID. First run
compiles Rust (slow); subsequent runs are near-instant since `cargo` caches.

No separate "open a URL" step exists -- the window itself appears on the
user's desktop once the process starts.

## Doctor

```bash
bash .claude/skills/verify-note-app/scripts/doctor.sh
```

Reports three things:
- `app`: whether the note-app window process is running (`pgrep`).
- `notes_dir`: whether `~/Documents/Notes` exists and how many `.md` files
  are in it right now (read this *before* driving, to tell real deltas from
  pre-existing user notes).
- `gui_automation`: whether `osascript`/System Events has Accessibility
  access to read window UI elements. In most sandboxed/CI shells this is
  **BLOCKED** (`osascript is not allowed assistive access (-1728)`), even
  though it can list process *names* without that permission -- don't be
  fooled by a check that only does the latter. This gates which Drive path
  below is usable.

## Drive

There are two drive paths. Prefer the GUI path when `doctor.sh` reports
`gui_automation: AVAILABLE`; otherwise use the headless path and say so in
your report (it's real functional proof, but it doesn't exercise `app.js`).

### GUI path (real user journey, needs Accessibility access)

Grant Terminal/osascript Accessibility access once in System Settings >
Privacy & Security > Accessibility, then drive via AppleScript UI scripting.

**Confirmed 2026-10-17** (first time `gui_automation` read `AVAILABLE` in
this environment -- it was `BLOCKED` in earlier maintain passes): a direct
reference like `button "New note" of window 1` fails with `-1728` even
with Accessibility access granted, because the button is nested several
groups/scroll-areas deep, not a direct child of the window. Enumerate
`entire contents of window "Notes"` and match by `class`/`name` instead:

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

For typing into the editor, `set focused of e to true` on the `text area`
element does **not** give it real keyboard focus (keystrokes are silently
dropped) -- `click e` first, then `delay 0.3`, then `keystroke`. See
create-note.md and open-edit-note.md for the full proven scripts (create +
autosave both confirmed working this way). **Delete is now provable via
this GUI path** (re-confirmed 2026-10-18, after commit `ae3428d` replaced
the old blocking native `confirm()` -- which never surfaced a dialog for
System Events to accept -- with a custom in-page `#confirm-dialog` modal):
click the toolbar "Delete" button, then click the dialog's own "Delete"
button (disambiguate it from the toolbar one, which shares the same name,
by `position` -- see delete-note.md). The command palette (Cmd/Ctrl+K,
see command-palette.md) is also GUI-provable the same way, via `keystroke`
into `#palette-input` rather than clicking a button, since it has no
on-screen trigger.

**Window-chrome trap**: `button 1`/`2`/`3` of `window "Notes"` with no
`name` are the native close/minimize/zoom controls, not webview content --
clicking one quits the app (single-window app, closing it exits). Always
reach real sidebar/toolbar/dialog elements via `entire contents of window`
+ a `class`/`name`/position filter, never a direct `button N of window`
index.

Button/field identifiers come from `src/index.html`'s ids/aria-labels
(`#new-note-btn`, `#search-input`, `#toggle-preview-btn`, `#delete-note-btn`,
`#editor`). WKWebView exposes standard HTML buttons/inputs/textareas to the
accessibility tree, so `button "..."`/`text field 1` style references
generally work for simple apps, but as above, nesting depth here means you
usually need `entire contents` + a `class`/`name` filter rather than a
direct reference; verify the exact AX names once with
`osascript -e 'tell application "System Events" to tell (first process whose name is "note-app") to entire contents of window "Notes"'`.

### Headless path (backend truth, works anywhere, no GUI needed)

```bash
bash .claude/skills/verify-note-app/scripts/drive_headless.sh
```

Runs `cargo test --lib verify_skill_tests` from `src-tauri/`, which executes
the `#[cfg(test)]` modules at the bottom of `notes.rs` and `search.rs`.
These call `create_note` / `list_notes` / `read_note` / `save_note` /
`delete_note` / `search` directly -- the exact same functions the Tauri
commands wrap -- against the real `~/Documents/Notes` directory, and clean
up every file they create (even on assertion failure, via a `Drop` guard in
the notes test). A pass proves:
- `create_note` writes a new `.md` file and returns its id.
- `list_notes` returns that id (sidebar-list proof).
- `save_note` + `read_note` round-trip content (edit/autosave proof).
- `delete_note` removes the file (delete proof).
- `search` finds a note by a content substring (search proof).

This does **not** prove `app.js` calls these commands correctly -- cross-check
that separately by reading `src/app.js`'s `invoke("command_name", {...})`
calls against the table above and against `src-tauri/src/lib.rs`'s
`tauri::generate_handler![...]` list. A command referenced by one but not
the other is a real bug (would surface at runtime as "command not found").

### Markdown preview (frontend-only feature)

Preview toggle has no Rust command and no filesystem side effect -- it's
pure JS: `togglePreviewBtn` click handler in `src/app.js` toggles
`previewVisible` and calls `window.marked.parse(editorEl.value)` into
`#preview`. The `cargo test` headless path can't exercise this, but the
*rendering logic itself* (not the GUI wiring) can be proven with:

```bash
node .claude/skills/verify-note-app/scripts/marked_proof.cjs
```

This loads the real `src/vendor/marked.js` into a bare Node `vm` context
(no `module`/`exports`, so its UMD wrapper takes the browser
`globalThis.marked = f()` branch, same as `<script src="vendor/marked.js">`
does in the webview) and asserts `marked.parse(...)` renders
headings/bold/lists correctly. Plain `require()` does **not** work for
this file -- `package.json` has `"type": "module"`, so Node's CJS-interop
loader returns an empty ES-module namespace for it instead of the UMD
exports. This proves the renderer works; it does **not** prove `app.js`
calls it correctly on toggle/typing -- cross-check that by reading
`src/app.js`'s `togglePreviewBtn`/`updatePreview()`, or use the GUI path.

## Evidence

For every claim, capture at minimum:
- `ls -la ~/Documents/Notes` before and after the action (file count, names,
  mtimes) -- the ground truth for create/list/delete/autosave.
- `cat` the specific `<id>.md` file for content checks (save/edit, search
  substring match).
- For search: confirm the match is a real substring of file content or
  derived title (see `derive_title`/`derive_preview` in `notes.rs`), not
  just "the list shrank" -- an empty query returns `list_notes`, not
  `search_notes` (see `loadNoteList` in `app.js`), so an empty-string search
  test proves nothing about `search_notes`.
- `cargo test --lib verify_skill_tests -- --nocapture` output (pass/fail per
  function), captured via `drive_headless.sh`.
- For markdown preview specifically: `node scripts/marked_proof.cjs` output
  (rendered HTML + pass/fail assertions) -- see the Markdown preview
  subsection below.

## Cleanup

```bash
bash .claude/skills/verify-note-app/scripts/cleanup.sh
```

Kills the `note-app` window process and the `tauri dev` watcher started by
`launch.sh`. Never deletes anything under `~/Documents/Notes` -- that's the
user's real note store. If your own verification run created stray notes
(e.g. from a GUI-path test you didn't finish), delete only the specific
`<id>.md` files you created, identified by the id `create_note` returned to
you or a distinguishing marker string you wrote into the content.

## Gotchas

- **`~/Documents/Notes` is a real, persistent, shared directory** -- it is
  not a scratch/test fixture. Snapshot it with `doctor.sh`/`ls` before
  driving so you can tell your side effects apart from the user's existing
  notes (there were 2 real notes present when this skill was authored:
  `582039e18bc2.md` = "Hello", `1d5af014e1eb.md` = empty). Tag any note you
  create during verification with a distinctive content string so it's
  identifiable, and delete it via `delete_note`/`rm` when done.
- **No devUrl / no browser automation.** `tauri.conf.json` has no `devUrl`;
  `frontendDist` is the static `src/` folder served by Tauri's own
  webview, not a Vite/webpack dev server. There is no `localhost:PORT` to
  point Playwright/curl at.
- **GUI automation needs a one-time macOS permission** (System Settings >
  Privacy & Security > Accessibility for Terminal/osascript) that is often
  absent in sandboxed/CI shells, but can change between verification runs
  (observed flipping from `BLOCKED` to `AVAILABLE` between maintain passes
  without any code change) -- always re-run `doctor.sh` fresh, don't trust
  a prior run's reading. `doctor.sh` tests for this correctly by probing
  window-level AX access (via Finder), not just process-name enumeration --
  the latter succeeds even when the former is blocked, which will give a
  false "automation available" reading if you reimplement the check
  carelessly. Note that `AVAILABLE` only means window-level AX reads work;
  it does **not** guarantee every interaction (e.g. accepting a JS
  `confirm()` dialog) is automatable -- see delete-note.md.
- **The empty-search-equals-list-notes branch.** `loadNoteList()` in
  `app.js` calls `search_notes` only when the search box is non-empty;
  clearing the box calls `list_notes` instead. A test that types then
  clears the search box only re-proves `list_notes`.
- **Autosave has a 400ms debounce** (`SAVE_DEBOUNCE_MS` in `app.js`); reading
  the file immediately after a keystroke in a GUI-path test will race it.
  Wait >400ms (search debounce is 200ms, `SEARCH_DEBOUNCE_MS`).
- **IDs are the first 12 hex chars of a UUIDv4** (`create_note` in
  `notes.rs`), used directly as the filename stem. Don't assume any other
  id format when asserting on filenames.
