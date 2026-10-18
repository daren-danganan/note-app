const { invoke } = window.__TAURI__.core;

const SAVE_DEBOUNCE_MS = 400;
const SEARCH_DEBOUNCE_MS = 200;

const noteListEl = document.querySelector("#note-list");
const searchInputEl = document.querySelector("#search-input");
const newNoteBtn = document.querySelector("#new-note-btn");
const editorEl = document.querySelector("#editor");
const previewEl = document.querySelector("#preview");
const togglePreviewBtn = document.querySelector("#toggle-preview-btn");
const deleteNoteBtn = document.querySelector("#delete-note-btn");
const saveStatusEl = document.querySelector("#save-status");
const confirmDialogEl = document.querySelector("#confirm-dialog");
const confirmDialogMessageEl = document.querySelector("#confirm-dialog-message");
const confirmDialogOkBtn = document.querySelector("#confirm-dialog-ok");
const confirmDialogCancelBtn = document.querySelector("#confirm-dialog-cancel");
const paletteEl = document.querySelector("#command-palette");
const paletteInputEl = document.querySelector("#palette-input");
const paletteListEl = document.querySelector("#palette-list");

let activeNoteId = null;
let saveTimer = null;
let searchTimer = null;
let previewVisible = false;

function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function renderNoteList(notes, { emptyMessage = "No notes yet" } = {}) {
  noteListEl.innerHTML = "";

  if (notes.length === 0) {
    const li = document.createElement("li");
    li.className = "note-list-empty";
    li.textContent = emptyMessage;
    noteListEl.appendChild(li);
    return;
  }

  for (const note of notes) {
    const li = document.createElement("li");
    li.className = "note-item";
    li.dataset.id = note.id;
    if (note.id === activeNoteId) li.classList.add("active");

    const title = document.createElement("div");
    title.className = "note-item-title";
    title.textContent = note.title;

    const meta = document.createElement("div");
    meta.className = "note-item-meta";
    const dateSpan = document.createElement("span");
    dateSpan.textContent = formatDate(note.modified_at);
    const previewSpan = document.createElement("span");
    previewSpan.className = "note-item-preview";
    previewSpan.textContent = note.snippet ?? note.preview ?? "";
    meta.append(dateSpan, previewSpan);

    li.append(title, meta);
    li.addEventListener("click", () => openNote(note.id));
    noteListEl.appendChild(li);
  }
}

async function loadNoteList() {
  const query = searchInputEl.value.trim();
  if (query) {
    const results = await invoke("search_notes", { query });
    renderNoteList(results, { emptyMessage: "No matches" });
  } else {
    const notes = await invoke("list_notes");
    renderNoteList(notes);
  }
}

async function openNote(id) {
  activeNoteId = id;
  const content = await invoke("read_note", { id });
  editorEl.value = content;
  updatePreview();
  setSaveStatus("");
  markActiveInList();
  editorEl.focus();
}

function markActiveInList() {
  for (const li of noteListEl.querySelectorAll(".note-item")) {
    li.classList.toggle("active", li.dataset.id === activeNoteId);
  }
}

function setSaveStatus(text) {
  saveStatusEl.textContent = text;
}

// Custom in-page confirmation modal. WKWebView (the macOS Tauri webview)
// does not implement the JS dialog UIDelegate by default, so the native
// `window.confirm()` resolves to `false` immediately instead of showing a
// dialog and blocking -- it never actually prompts the user. This renders
// our own modal and resolves once the user picks an option.
function confirmDialog(message) {
  return new Promise((resolve) => {
    confirmDialogMessageEl.textContent = message;
    confirmDialogEl.classList.remove("hidden");

    function cleanup(result) {
      confirmDialogEl.classList.add("hidden");
      confirmDialogOkBtn.removeEventListener("click", onOk);
      confirmDialogCancelBtn.removeEventListener("click", onCancel);
      resolve(result);
    }

    function onOk() {
      cleanup(true);
    }
    function onCancel() {
      cleanup(false);
    }

    confirmDialogOkBtn.addEventListener("click", onOk);
    confirmDialogCancelBtn.addEventListener("click", onCancel);
  });
}

const persistNote = debounce(async () => {
  if (!activeNoteId) return;
  await invoke("save_note", { id: activeNoteId, content: editorEl.value });
  setSaveStatus("Saved");
  await loadNoteList();
  markActiveInList();
}, SAVE_DEBOUNCE_MS);

function updatePreview() {
  if (!previewVisible) return;
  previewEl.innerHTML = window.marked.parse(editorEl.value);
}

editorEl.addEventListener("input", () => {
  setSaveStatus("Saving…");
  updatePreview();
  persistNote();
});

togglePreviewBtn.addEventListener("click", () => {
  previewVisible = !previewVisible;
  previewEl.classList.toggle("hidden", !previewVisible);
  editorEl.classList.toggle("hidden", previewVisible);
  togglePreviewBtn.textContent = previewVisible ? "Edit" : "Preview";
  updatePreview();
});

deleteNoteBtn.addEventListener("click", async () => {
  if (!activeNoteId) return;
  const confirmed = await confirmDialog("Delete this note? This cannot be undone.");
  if (!confirmed) return;
  await invoke("delete_note", { id: activeNoteId });
  activeNoteId = null;
  editorEl.value = "";
  previewEl.innerHTML = "";
  setSaveStatus("");
  await loadNoteList();
});

newNoteBtn.addEventListener("click", async () => {
  const id = await invoke("create_note");
  await loadNoteList();
  await openNote(id);
});

searchInputEl.addEventListener(
  "input",
  debounce(() => loadNoteList(), SEARCH_DEBOUNCE_MS)
);

// ---------------------------------------------------------------------------
// Command palette
// ---------------------------------------------------------------------------

// Wraps (or replaces) the current selection in editorEl with markdown syntax,
// leaving the inner text selected so the user can immediately type over it.
function insertMarkdown({ before = "", after = "", placeholder = "", block = false }) {
  const el = editorEl;
  const start = el.selectionStart;
  const end = el.selectionEnd;
  const selected = el.value.slice(start, end);
  const text = selected || placeholder;

  let leadingNewline = "";
  let trailingNewline = "";
  if (block) {
    const pre = el.value.slice(0, start);
    const post = el.value.slice(end);
    if (pre.length > 0 && !pre.endsWith("\n")) leadingNewline = "\n";
    if (post.length > 0 && !post.startsWith("\n")) trailingNewline = "\n";
  }

  const insertion = leadingNewline + before + text + after + trailingNewline;
  el.value = el.value.slice(0, start) + insertion + el.value.slice(end);

  const selStart = start + leadingNewline.length + before.length;
  const selEnd = selStart + text.length;
  el.focus();
  el.setSelectionRange(selStart, selEnd);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

// Inserts a literal block of text (e.g. a table skeleton) at the cursor,
// placing the cursor right after it rather than wrapping a selection.
function insertBlock(text) {
  const el = editorEl;
  const start = el.selectionStart;
  const end = el.selectionEnd;
  const pre = el.value.slice(0, start);
  const post = el.value.slice(end);
  const leadingNewline = pre.length > 0 && !pre.endsWith("\n") ? "\n" : "";
  const trailingNewline = post.length > 0 && !post.startsWith("\n") ? "\n" : "";
  const insertion = leadingNewline + text + trailingNewline;

  el.value = pre + insertion + post;
  const cursor = start + insertion.length;
  el.focus();
  el.setSelectionRange(cursor, cursor);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

async function createNoteFromTemplate(content) {
  const id = await invoke("create_note");
  if (content) await invoke("save_note", { id, content });
  await loadNoteList();
  await openNote(id);
}

function todayLabel() {
  return new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

const insertCommands = [
  { title: "Heading 1", keywords: "h1 title", run: () => insertMarkdown({ before: "# ", placeholder: "Heading 1", block: true }) },
  { title: "Heading 2", keywords: "h2 subtitle", run: () => insertMarkdown({ before: "## ", placeholder: "Heading 2", block: true }) },
  { title: "Heading 3", keywords: "h3", run: () => insertMarkdown({ before: "### ", placeholder: "Heading 3", block: true }) },
  { title: "Bold", keywords: "strong b", run: () => insertMarkdown({ before: "**", after: "**", placeholder: "bold text" }) },
  { title: "Italic", keywords: "emphasis i", run: () => insertMarkdown({ before: "_", after: "_", placeholder: "italic text" }) },
  { title: "Strikethrough", keywords: "strike del", run: () => insertMarkdown({ before: "~~", after: "~~", placeholder: "strikethrough text" }) },
  { title: "Inline code", keywords: "code span", run: () => insertMarkdown({ before: "`", after: "`", placeholder: "code" }) },
  { title: "Code block", keywords: "fence pre", run: () => insertMarkdown({ before: "```\n", after: "\n```", placeholder: "code", block: true }) },
  { title: "Link", keywords: "url href anchor", run: () => insertMarkdown({ before: "[", after: "](https://)", placeholder: "link text" }) },
  { title: "Image", keywords: "img picture", run: () => insertMarkdown({ before: "![", after: "](https://)", placeholder: "alt text" }) },
  { title: "Bulleted list", keywords: "unordered ul bullet", run: () => insertMarkdown({ before: "- ", placeholder: "List item", block: true }) },
  { title: "Numbered list", keywords: "ordered ol", run: () => insertMarkdown({ before: "1. ", placeholder: "List item", block: true }) },
  { title: "Task list", keywords: "todo checkbox checklist", run: () => insertMarkdown({ before: "- [ ] ", placeholder: "Task", block: true }) },
  { title: "Blockquote", keywords: "quote cite", run: () => insertMarkdown({ before: "> ", placeholder: "Quote", block: true }) },
  { title: "Horizontal rule", keywords: "divider hr line separator", run: () => insertBlock("---") },
  {
    title: "Table",
    keywords: "grid rows columns",
    run: () =>
      insertBlock(
        "| Column 1 | Column 2 |\n| --- | --- |\n| Row 1 | Row 1 |\n| Row 2 | Row 2 |"
      ),
  },
];

const templateCommands = [
  { title: "Blank note", keywords: "empty new", run: () => createNoteFromTemplate("") },
  {
    title: "Meeting notes",
    keywords: "meeting agenda attendees minutes",
    run: () =>
      createNoteFromTemplate(
        "# Meeting Notes\n\n**Date:** \n**Attendees:** \n\n## Agenda\n\n\n## Notes\n\n\n## Action Items\n- [ ] \n"
      ),
  },
  {
    title: "Daily journal",
    keywords: "journal diary day",
    run: () =>
      createNoteFromTemplate(
        `# Daily Journal — ${todayLabel()}\n\n## Highlights\n\n\n## Gratitude\n\n\n## Tomorrow's focus\n\n`
      ),
  },
  {
    title: "To-do list",
    keywords: "todo tasks checklist",
    run: () => createNoteFromTemplate("# To-Do List\n\n- [ ] \n- [ ] \n- [ ] \n"),
  },
  {
    title: "Project plan",
    keywords: "project plan spec roadmap",
    run: () =>
      createNoteFromTemplate(
        "# Project Plan\n\n## Goal\n\n\n## Milestones\n- [ ] \n\n## Risks\n\n"
      ),
  },
];

function buildPaletteCommands() {
  const commands = [];
  if (activeNoteId) {
    for (const c of insertCommands) commands.push({ ...c, category: "Insert" });
  }
  for (const c of templateCommands) commands.push({ ...c, category: "New Note" });
  return commands;
}

let paletteCommands = [];
let paletteFiltered = [];
let paletteSelectedIndex = 0;

function filterPaletteCommands(query) {
  const q = query.trim().toLowerCase();
  if (!q) return paletteCommands;
  return paletteCommands.filter((c) =>
    `${c.title} ${c.keywords ?? ""}`.toLowerCase().includes(q)
  );
}

function renderPaletteList() {
  paletteListEl.innerHTML = "";

  if (paletteFiltered.length === 0) {
    const li = document.createElement("li");
    li.className = "palette-empty";
    li.textContent = "No matching commands";
    paletteListEl.appendChild(li);
    return;
  }

  paletteFiltered.forEach((command, index) => {
    const li = document.createElement("li");
    li.className = "palette-item";
    if (index === paletteSelectedIndex) li.classList.add("selected");

    const title = document.createElement("span");
    title.className = "palette-item-title";
    title.textContent = command.title;

    const category = document.createElement("span");
    category.className = "palette-item-category";
    category.textContent = command.category;

    li.append(title, category);
    li.addEventListener("mousedown", (e) => {
      e.preventDefault();
      runPaletteCommand(index);
    });
    paletteListEl.appendChild(li);
  });
}

function runPaletteCommand(index) {
  const command = paletteFiltered[index];
  if (!command) return;
  closePalette();
  command.run();
}

function openPalette() {
  paletteCommands = buildPaletteCommands();
  paletteFiltered = paletteCommands;
  paletteSelectedIndex = 0;
  paletteInputEl.value = "";
  paletteEl.classList.remove("hidden");
  renderPaletteList();
  paletteInputEl.focus();
}

function closePalette() {
  paletteEl.classList.add("hidden");
  editorEl.focus();
}

function isPaletteOpen() {
  return !paletteEl.classList.contains("hidden");
}

paletteInputEl.addEventListener("input", () => {
  paletteFiltered = filterPaletteCommands(paletteInputEl.value);
  paletteSelectedIndex = 0;
  renderPaletteList();
});

paletteInputEl.addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown") {
    e.preventDefault();
    if (paletteFiltered.length > 0) {
      paletteSelectedIndex = (paletteSelectedIndex + 1) % paletteFiltered.length;
      renderPaletteList();
    }
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    if (paletteFiltered.length > 0) {
      paletteSelectedIndex =
        (paletteSelectedIndex - 1 + paletteFiltered.length) % paletteFiltered.length;
      renderPaletteList();
    }
  } else if (e.key === "Enter") {
    e.preventDefault();
    runPaletteCommand(paletteSelectedIndex);
  } else if (e.key === "Escape") {
    e.preventDefault();
    closePalette();
  }
});

paletteEl.addEventListener("mousedown", (e) => {
  if (e.target === paletteEl) closePalette();
});

document.addEventListener("keydown", (e) => {
  const isModK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k";
  if (isModK) {
    e.preventDefault();
    if (isPaletteOpen()) {
      closePalette();
    } else {
      openPalette();
    }
  }
});

window.addEventListener("DOMContentLoaded", async () => {
  await loadNoteList();
});
