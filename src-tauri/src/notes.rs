use std::fs;
use std::path::PathBuf;

use chrono::{DateTime, Local};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone)]
pub struct NoteSummary {
    pub id: String,
    pub title: String,
    pub preview: String,
    pub modified_at: String,
}

/// Directory notes are stored in: ~/Documents/Notes (created on first use).
pub fn notes_dir() -> Result<PathBuf, String> {
    let base = dirs::document_dir().or_else(dirs::home_dir).ok_or_else(|| {
        "Could not determine a home or Documents directory for this user".to_string()
    })?;
    let dir = base.join("Notes");
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create notes directory: {e}"))?;
    Ok(dir)
}

/// Ids are filesystem path segments, so they must be restricted to characters that
/// can't be used to escape the notes directory (no `/`, `..`, etc).
fn validate_id(id: &str) -> Result<(), String> {
    let valid = !id.is_empty()
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
    if valid {
        Ok(())
    } else {
        Err(format!("Invalid note id: {id}"))
    }
}

fn note_path(id: &str) -> Result<PathBuf, String> {
    validate_id(id)?;
    Ok(notes_dir()?.join(format!("{id}.md")))
}

/// Derive a display title from the note's content: the first non-empty line,
/// with a leading markdown heading marker stripped.
pub fn derive_title(content: &str) -> String {
    content
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(|line| line.trim_start_matches('#').trim().to_string())
        .filter(|title| !title.is_empty())
        .unwrap_or_else(|| "Untitled".to_string())
}

fn derive_preview(content: &str) -> String {
    let title = derive_title(content);
    let body = content
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty() && line.trim_start_matches('#').trim() != title)
        .unwrap_or("");
    body.chars().take(140).collect()
}

fn format_modified(path: &PathBuf) -> String {
    fs::metadata(path)
        .and_then(|m| m.modified())
        .map(|t| DateTime::<Local>::from(t).to_rfc3339())
        .unwrap_or_default()
}

pub fn list_notes() -> Result<Vec<NoteSummary>, String> {
    let dir = notes_dir()?;
    let mut notes = Vec::new();

    let entries = fs::read_dir(&dir).map_err(|e| format!("Failed to read notes directory: {e}"))?;
    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read directory entry: {e}"))?;
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("md") {
            continue;
        }
        let id = match path.file_stem().and_then(|s| s.to_str()) {
            Some(s) => s.to_string(),
            None => continue,
        };
        let content = fs::read_to_string(&path).unwrap_or_default();
        notes.push(NoteSummary {
            id,
            title: derive_title(&content),
            preview: derive_preview(&content),
            modified_at: format_modified(&path),
        });
    }

    notes.sort_by(|a, b| b.modified_at.cmp(&a.modified_at));
    Ok(notes)
}

pub fn read_note(id: &str) -> Result<String, String> {
    let path = note_path(id)?;
    fs::read_to_string(&path).map_err(|e| format!("Failed to read note: {e}"))
}

pub fn save_note(id: &str, content: &str) -> Result<(), String> {
    let path = note_path(id)?;
    fs::write(&path, content).map_err(|e| format!("Failed to save note: {e}"))
}

pub fn create_note() -> Result<String, String> {
    let id = uuid::Uuid::new_v4().simple().to_string()[..12].to_string();
    let path = note_path(&id)?;
    fs::write(&path, "").map_err(|e| format!("Failed to create note: {e}"))?;
    Ok(id)
}

pub fn delete_note(id: &str) -> Result<(), String> {
    let path = note_path(id)?;
    fs::remove_file(&path).map_err(|e| format!("Failed to delete note: {e}"))
}
