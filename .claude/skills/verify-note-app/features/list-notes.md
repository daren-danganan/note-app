# List notes (sidebar)

The sidebar shows every note as a title + date + preview snippet, sorted
most-recently-modified first, so the note you just edited is always at the
top.

## Sub-features

- Enumerates every `*.md` file in `~/Documents/Notes`
  (`notes::list_notes` in `src-tauri/src/notes.rs`).
- Title = first non-empty line of the file with leading `#`/markdown
  heading markers stripped (`derive_title`); falls back to "Untitled" if
  the file is empty or only whitespace/heading markers.
- Preview = first non-empty line *other than* the title line, truncated to
  140 chars (`derive_preview`).
- Sort key is filesystem mtime, descending (`modified_at`, via
  `fs::metadata(...).modified()`), computed fresh on every call -- not
  cached.
- Refreshed by the frontend after every create/save/delete
  (`loadNoteList()` calls in `src/app.js`), and on initial page load
  (`DOMContentLoaded`).
- Only invoked when the search box is empty; a non-empty search box calls
  `search_notes` instead (see `search-notes.md`).

## How to get to it (user POV)

Visible by default in the left sidebar as soon as the app window opens;
no action needed. Updates automatically after create/edit/delete.

## Driving it with cargo test

Membership is covered by the round-trip test as create-note
(`notes.rs::verify_skill_tests::create_list_read_save_delete_round_trip`):
after `create_note()`, asserts the new id is present in `list_notes()`'s
output.

Sort order and title derivation specifically are covered by
`notes.rs::verify_skill_tests::list_notes_sorts_by_mtime_desc_and_derives_titles_from_headings`:
creates two notes ~1.1s apart with different `# heading` content, asserts
`list_notes()` orders the more-recently-saved one first (proving the
mtime-descending sort, not creation order or filename), and asserts each
summary's `title` matches `derive_title`'s heading-stripped output (not
the raw first line). Run both via:

```bash
bash .claude/skills/verify-note-app/scripts/drive_headless.sh
```

Manual check:

```bash
touch -t 202001010000 ~/Documents/Notes/zzverify-old.md   # fake old mtime
echo '# New Title' > ~/Documents/Notes/zzverify-new.md
# ...open app, sidebar should show zzverify-new.md's title above the old one...
rm ~/Documents/Notes/zzverify-old.md ~/Documents/Notes/zzverify-new.md
```

## Gotchas

- "Most recently modified" means `save_note` (which rewrites the whole
  file) bumps a note to the top -- even if the edit was trivial.
- Title derivation strips heading markers but not other markdown syntax; a
  note starting with `**bold**` shows the asterisks literally in the title.
- An unreadable/corrupt file's content read falls back to `""`
  (`unwrap_or_default()`), so it still appears in the list as "Untitled"
  rather than erroring the whole list -- a FAIL mode worth checking if a
  bug report mentions "a note disappeared from the sidebar".
