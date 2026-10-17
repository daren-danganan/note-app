# Markdown preview toggle

A "Preview"/"Edit" button in the editor toolbar switches the editor pane
between the raw-markdown textarea and a rendered-HTML preview of the same
content.

## Sub-features

- Entirely frontend, no Tauri command, no filesystem interaction --
  rendering happens in-process via the vendored `src/vendor/marked.js`
  (`window.marked.parse(...)`), loaded as a plain `<script>` tag in
  `src/index.html` (not an npm-bundled import, even though `marked` is also
  listed in `package.json` dependencies).
- `togglePreviewBtn` click handler in `src/app.js` flips a `previewVisible`
  boolean, toggles the `.hidden` CSS class on `#editor`/`#preview`, flips
  the button's own label between "Preview" and "Edit", and calls
  `updatePreview()`.
- `updatePreview()` is a no-op unless `previewVisible` is true; when true it
  sets `#preview`'s `innerHTML` to `marked.parse(editorEl.value)`.
- Also called on every `input` event (so while the preview pane is open,
  typing in the hidden-but-still-live textarea re-renders the preview live,
  not just on toggle).
- Opening a different note (`openNote()`) also calls `updatePreview()`, so
  switching notes while the preview pane is open shows the new note's
  rendered content immediately.

## How to get to it (user POV)

1. Open a note.
2. Click "Preview" in the editor toolbar.
3. The textarea is replaced by rendered HTML (headings, lists, etc. styled);
   the button now reads "Edit".
4. Click "Edit" to go back to the raw-markdown textarea.

## Driving it with cargo test

Not applicable -- no Rust code is involved; `cargo test` cannot exercise
this feature at all. Verify via one of:

- **Headless rendering proof (no GUI needed)**:

  ```bash
  node .claude/skills/verify-note-app/scripts/marked_proof.cjs
  ```

  Loads the real `src/vendor/marked.js` bundle (the same file
  `src/index.html` serves via `<script src="vendor/marked.js">`) into a
  bare `vm` context with no `module`/`exports` defined, so the UMD wrapper
  takes its browser branch (`globalThis.marked = f()`) exactly as it does
  in the webview, then calls `marked.parse(...)` on sample markdown and
  asserts the heading/bold/list HTML comes out correctly. This proves the
  *rendering logic* `updatePreview()` depends on actually works, using the
  exact vendored file, without needing Tauri, a DOM, or GUI automation.
  Plain `node -e "require('./src/vendor/marked.js')"` does **not** work
  here -- `package.json` has `"type": "module"`, so Node's CJS-interop
  loader treats the `.js` file as an ES module with zero named exports and
  `marked.parse` comes back `undefined`; the script works around this with
  `vm.runInContext` instead of `require`.
  This does **not** prove `app.js` actually calls `marked.parse` on
  toggle/typing and writes it into `#preview` -- that wiring is confirmed
  by the static read-through below, or by the GUI path.
- **GUI path** (needs Accessibility access, see `SKILL.md` Doctor): click
  the toggle button, then read back the DOM/AX state of `#preview` vs.
  `#editor` (e.g. which one lacks the `hidden` class / has focus). Not yet
  run -- still blocked by missing Accessibility permission in this sandbox
  as of the last re-check (see Gotchas).
- **Static read-through**: confirm `src/app.js`'s `togglePreviewBtn`
  handler and `updatePreview()` match the behavior described above, and
  that `src/index.html` loads `vendor/marked.js` before `app.js` (script
  order matters -- `app.js` is deferred and `marked.js` is not, so load
  order is correct as written, but this is worth re-checking after any
  `<script>` tag edits).
- **Manual smoke test**: open the app, type `# Heading` in a note, click
  Preview, visually confirm an `<h1>`-styled "Heading" renders (a screenshot
  is reasonable evidence here given there's no filesystem side effect to
  check).

## Gotchas

- There is no persisted "preview mode" state -- it's a plain JS variable,
  reset to `false` (edit mode) every time the app restarts or (implicitly)
  per session; don't expect it to survive a relaunch.
- Because `updatePreview()` reads `editorEl.value` live, the preview can
  show *unsaved* content (before the 400ms autosave debounce fires) --
  "preview matches the file on disk" is not always true at the moment of
  toggling.
- This is the one feature with zero filesystem side effects to check, so a
  claim about it can only be verified via the GUI, the headless
  `marked_proof.cjs` rendering check, or code read-through -- a verifier
  relying solely on `~/Documents/Notes` snapshots will see no evidence
  either way and should say so rather than guessing.
- `marked_proof.cjs` proves the *renderer*, not the *wiring*: a bug where
  `togglePreviewBtn`'s handler is never attached, or `updatePreview()` is
  never called, would still leave this script passing. Pair it with the
  static read-through (or the GUI path) when the claim is about the toggle
  behaving correctly end-to-end, not just about marked.js rendering
  correctly in isolation.
