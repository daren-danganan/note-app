# note-app feature map

One file per top-level user-facing feature of note-app. Each file follows:
H1, one paragraph of user-visible behavior, then `Sub-features`,
`How to get to it (user POV)`, `Driving it with <harness>`, `Gotchas`.

"Harness" here is `cargo test` (headless, via
`scripts/drive_headless.sh`) unless a feature is frontend-only, in which
case it's AppleScript/System Events GUI scripting (needs Accessibility
access -- see `SKILL.md` Doctor section) or manual reading of `src/app.js`.

## Features

| File | Feature | Backing Tauri command(s) |
|---|---|---|
| `create-note.md` | Create a note | `create_note` |
| `list-notes.md` | List notes (sidebar) | `list_notes` |
| `open-edit-note.md` | Open/edit a note (autosave) | `read_note`, `save_note` |
| `delete-note.md` | Delete a note | `delete_note` |
| `search-notes.md` | Search notes | `search_notes` |
| `markdown-preview.md` | Markdown preview toggle | none (frontend-only) |

## Entry point for all features

Launch: `bash .claude/skills/verify-note-app/scripts/launch.sh` (starts
`npm run tauri dev`, native macOS window, no URL). See `SKILL.md` for
Doctor/Drive/Evidence/Cleanup shared across all features below.
