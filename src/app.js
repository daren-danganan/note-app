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
  if (!confirm("Delete this note? This cannot be undone.")) return;
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

window.addEventListener("DOMContentLoaded", async () => {
  await loadNoteList();
});
