# Notes

A local-first markdown note app for macOS, built with Tauri 2 (Rust backend)
and a vanilla HTML/CSS/JS frontend. No bundler, no dev server, no network —
notes are plain `.md` files on disk.

## Features

- **Create, edit, delete notes** — each note is a standalone `.md` file.
- **Autosave** — edits are written to disk automatically (debounced).
- **Markdown preview** — toggle between raw markdown and rendered HTML
  (via [marked](https://github.com/markedjs/marked), vendored locally).
- **Search** — case-insensitive substring search across note titles and
  content.
- **Sidebar list** — notes sorted by most-recently-modified, with a title
  and preview snippet derived from each note's content.

## How it works

Notes are stored as individual `.md` files in `~/Documents/Notes` (created
automatically on first run). A note's id is the first 12 hex characters of a
UUIDv4, used directly as the filename stem (e.g. `a1b2c3d4e5f6.md`). A
note's title and preview are *derived*, not stored separately: the title is
the first non-empty line with any leading `#` stripped, and the preview is
the next non-empty line.

The frontend (`src/app.js`) calls backend logic exclusively through Tauri's
`invoke()` bridge. Every `invoke()` call maps 1:1 to a `#[tauri::command]` in
`src-tauri/src/lib.rs`, which delegates to a plain function:

| UI action           | `invoke()` name | Command (`lib.rs`) | Logic                  |
|----------------------|-----------------|---------------------|-------------------------|
| click "+"            | `create_note`   | `create_note`       | `notes::create_note`   |
| sidebar list         | `list_notes`    | `list_notes`        | `notes::list_notes`    |
| click a note         | `read_note`     | `read_note`         | `notes::read_note`     |
| typing (debounced)   | `save_note`     | `save_note`         | `notes::save_note`     |
| "Delete" button      | `delete_note`   | `delete_note`       | `notes::delete_note`   |
| search box           | `search_notes`  | `search_notes`      | `search::search`       |

Markdown preview rendering is pure frontend (no Rust involved) — it calls
`window.marked.parse()` directly on the editor's content.

The delete confirmation is a custom in-page modal, not the native
`window.confirm()` — the macOS Tauri webview (WKWebView) doesn't implement
the JS dialog delegate, so `confirm()` would resolve to `false` instantly
without ever prompting the user.

## Project structure

```
src/                     Frontend (served as static files, no build step)
  index.html             App shell: sidebar, editor, preview pane, confirm dialog
  app.js                 All UI logic and invoke() calls into the Rust backend
  styles.css             Styling
  vendor/marked.js        Vendored copy of the marked markdown renderer

src-tauri/               Backend (Rust)
  src/main.rs            Entry point
  src/lib.rs             Tauri commands (the invoke() surface) + app setup
  src/notes.rs           Note CRUD: create/list/read/save/delete, title/preview derivation
  src/search.rs          Substring search over note titles and content
  tauri.conf.json        App config (window size, bundle identifier, icons)
  capabilities/          Tauri permission/capability manifest

.claude/skills/verify-note-app/   Claude Code skill for driving and verifying
                                    the app's behavior end-to-end (see below)
```

## Getting started

### Prerequisites

- [Node.js](https://nodejs.org/) and npm
- [Rust](https://www.rust-lang.org/tools/install) and Cargo
- Tauri's platform prerequisites for macOS — see the
  [Tauri prerequisites guide](https://v2.tauri.app/start/prerequisites/)

### Install dependencies

```bash
npm install
```

### Run in development

```bash
npm run tauri dev
```

This compiles the Rust backend and opens the app in a native window. First
run is slow (full Rust compile); subsequent runs are near-instant thanks to
`cargo`'s build cache. There is no dev server/URL — the frontend is served
directly from the `src/` folder by Tauri's webview.

### Build a release bundle

```bash
npm run tauri build
```

Produces a signed, optimized app bundle for macOS (see `tauri.conf.json` for
bundle targets and icons).

## Testing

Backend logic has smoke tests covering the full create → list → read → save
→ delete round trip and search, run against the real `~/Documents/Notes`
directory (self-cleaning, even on failure):

```bash
cd src-tauri
cargo test --lib verify_skill_tests
```

Markdown rendering can be verified independently of the Rust backend by
loading the vendored `marked.js` in a bare Node context:

```bash
node .claude/skills/verify-note-app/scripts/marked_proof.cjs
```

### Verifying app behavior end-to-end

This repo includes a Claude Code skill, `verify-note-app`
(`.claude/skills/verify-note-app/`), with scripts to launch the app, check
its running state, drive it (via GUI automation or the headless test path
above), and clean up afterward. See
[`.claude/skills/verify-note-app/SKILL.md`](.claude/skills/verify-note-app/SKILL.md)
for details, including known gotchas (autosave debounce timing, GUI
automation permission requirements, etc).

## Notes on data storage

- Notes live in `~/Documents/Notes` — this is a real, persistent user
  directory, not a sandboxed app data folder.
- Note ids are restricted to alphanumeric characters, `-`, and `_` to
  prevent path traversal when resolving filenames.
- There is no cloud sync, database, or network dependency — "local-first"
  here means *local-only*.
