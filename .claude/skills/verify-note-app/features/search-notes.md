# Search notes

Typing in the sidebar search box live-filters the note list to notes whose
content or title contains the query, case-insensitively, as a substring.

## Sub-features

- Debounced 200ms (`SEARCH_DEBOUNCE_MS` in `src/app.js`) on every `input`
  event on `#search-input`.
- `loadNoteList()` branches on whether the trimmed query is non-empty: if
  so, calls `invoke("search_notes", {query})` (-> `search::search`); if the
  box is empty (including after clearing it), calls `list_notes` instead
  (see `list-notes.md`) -- `search_notes` is never called with an empty
  string from the UI.
- `search::search` (`src-tauri/src/search.rs`) lowercases the query and
  checks, per note: does any line of the file content contain it
  (case-insensitive substring)? If yes, the matching line (trimmed,
  truncated to 140 chars) becomes the result's `snippet`. Else, does the
  derived title contain it? If yes, the title itself is the result and the
  snippet.
- A note matching neither content nor title is excluded entirely -- this is
  substring search, not fuzzy/ranked search.
- Results sorted by `modified_at` descending, same as `list_notes`.
- Empty/whitespace-only query passed directly to `search::search` (e.g. via
  a headless test) returns an empty vec immediately, before touching the
  filesystem -- this is a backend guard, separate from the frontend's
  empty-query-uses-list_notes branch.

## How to get to it (user POV)

1. Type into the search box at the top of the sidebar
   (`#search-input`, placeholder "Search notes…").
2. After a short pause, the list below filters to matches; clearing the box
   restores the full list.
3. An empty-result search shows "No matches" instead of "No notes yet".

## Driving it with cargo test

```bash
bash .claude/skills/verify-note-app/scripts/drive_headless.sh
```

`search.rs::verify_skill_tests::search_finds_note_by_content_and_title`
creates a note containing a unique marker string, calls `search(needle)`,
and asserts the note's id is in the results, then deletes the note.

Manual check:

```bash
echo "zzverify needle is here" > ~/Documents/Notes/zzverify-search.md
# ...in the running app, type "zzverify needle" into the search box...
# ...sidebar should show only zzverify-search.md...
rm ~/Documents/Notes/zzverify-search.md
```

## Gotchas

- **Don't test "search" by typing then clearing the box** -- clearing calls
  `list_notes`, not `search_notes`. To prove `search_notes` specifically,
  the query in the search box must stay non-empty for the check.
- Matching is per-line: a query string split across two lines (e.g. "hel" +
  newline + "lo" for query "hello") will NOT match, even though it reads as
  one sentence visually with soft-wrap.
- Title-only matches report the *title* as both `title` and `snippet` --
  don't assume `snippet` is always a content excerpt.
- Case-insensitivity is via `.to_lowercase()`, which is Unicode-aware but
  can behave unexpectedly for some non-ASCII scripts; stick to ASCII query
  strings for straightforward verification.
