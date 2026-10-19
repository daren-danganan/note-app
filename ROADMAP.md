# Roadmap

A living backlog of features not yet implemented. Nothing here is committed
scope — it's a list of candidates, roughly grouped by theme. See
[README.md](README.md#features) for what's already built.

## Organization

- [ ] Tags — attach one or more tags to a note, filter the sidebar by tag.
- [ ] Folders / notebooks — group notes into collections.
- [ ] Pinning / favorites — keep important notes at the top of the sidebar.
- [ ] Sort options — by title, by creation date, or manual drag-to-reorder
  (currently fixed to most-recently-modified).

## Editing & content

- [ ] Note linking / backlinks — `[[note title]]` style links between notes,
  with a backlinks panel showing what links to the current note.
- [ ] Image / file attachments — drag-drop or paste an image into the editor,
  stored alongside the note and referenced via markdown image syntax.
- [ ] Checklists with persistent checked-state — click a `- [ ]` item in
  preview mode to toggle it and save, instead of hand-editing the markdown.
- [ ] Word / character count.
- [ ] Table editing helpers — insert/delete rows and columns without hand
  editing markdown table syntax.

## Search & navigation

- [ ] Fuzzy search — current search is exact substring only.
- [ ] Recently-viewed list.
- [ ] Quick-switcher — jump directly to a note by name, separate from the
  markdown-insert command palette.

## Data & sync

- [ ] Export — a single note or all notes, to a `.zip` or `.pdf`.
- [ ] Import — bring notes in from other note apps.
- [ ] Versioned backups / note history beyond in-session undo.
- [ ] Optional cloud sync — e.g. pointing the notes directory at iCloud
  Drive, since notes are already plain files on disk.

## UI & personalization

- [ ] Themes — light/dark and custom accent color.
- [ ] Adjustable editor font and size.
- [ ] Split-pane edit + preview, as an alternative to the current toggle.
- [ ] Customizable keyboard shortcuts.

## Quality of life

- [ ] Global hotkey to create a note from anywhere (menu bar / Spotlight-style).
- [ ] User-defined templates, beyond the 4 built-in ones in the command
  palette.
- [ ] Multi-window support.
- [ ] Trash / recently-deleted — delete is currently permanent.

## Platform

- [ ] Windows / Linux support — currently macOS-only.
- [ ] Auto-update.
