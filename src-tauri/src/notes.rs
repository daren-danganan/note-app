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

/// Smoke tests for the verify-note-app skill (see
/// .claude/skills/verify-note-app/SKILL.md). They call the exact functions
/// the Tauri commands in lib.rs wrap, against the real notes directory
/// (~/Documents/Notes), so a pass proves the backend + filesystem side
/// effects a user would see, without needing GUI automation. Every note
/// they create is tagged and removed again, even on failure/panic.
#[cfg(test)]
mod verify_skill_tests {
    use super::*;

    struct Cleanup(String);
    impl Drop for Cleanup {
        fn drop(&mut self) {
            if let Ok(path) = note_path(&self.0) {
                let _ = fs::remove_file(path);
            }
        }
    }

    #[test]
    fn create_list_read_save_delete_round_trip() {
        let id = create_note().expect("create_note should create a .md file");
        let _cleanup = Cleanup(id.clone());

        let path = note_path(&id).unwrap();
        assert!(path.exists(), "create_note did not write {path:?}");

        let listed = list_notes().expect("list_notes should read the notes dir");
        assert!(
            listed.iter().any(|n| n.id == id),
            "new note {id} missing from list_notes output"
        );

        let marker = "verify-skill-smoke-test content";
        save_note(&id, &format!("# Verify Skill Smoke\n{marker}")).expect("save_note failed");
        let content = read_note(&id).expect("read_note failed");
        assert!(content.contains(marker), "save_note/read_note round trip failed");

        delete_note(&id).expect("delete_note failed");
        assert!(!path.exists(), "delete_note did not remove {path:?}");

        // Cleanup guard will no-op (file already gone); std::mem::forget avoids
        // a confusing double-delete attempt in Drop while still exercising it.
        std::mem::forget(_cleanup);
    }

    /// Closes the verify-note-app skill's "sort order / title derivation
    /// only partially tested" gap: proves `list_notes` sorts by mtime
    /// descending (not creation order or filename), and that the title it
    /// reports for each note is `derive_title`'s first-non-empty-line
    /// (with leading `#` stripped), not the raw first line or the id.
    #[test]
    fn list_notes_sorts_by_mtime_desc_and_derives_titles_from_headings() {
        let older_id = create_note().expect("create_note (older) failed");
        let _cleanup_older = Cleanup(older_id.clone());
        save_note(&older_id, "# zz-verify-older\nolder body").expect("save_note (older) failed");

        // Force a real, distinct mtime gap instead of relying on two
        // fs::write calls happening in the same clock tick.
        std::thread::sleep(std::time::Duration::from_millis(1100));

        let newer_id = create_note().expect("create_note (newer) failed");
        let _cleanup_newer = Cleanup(newer_id.clone());
        save_note(&newer_id, "# zz-verify-newer\nnewer body").expect("save_note (newer) failed");

        let listed = list_notes().expect("list_notes failed");
        let newer_pos = listed.iter().position(|n| n.id == newer_id);
        let older_pos = listed.iter().position(|n| n.id == older_id);
        assert!(newer_pos.is_some() && older_pos.is_some(), "both notes should be listed");
        assert!(
            newer_pos.unwrap() < older_pos.unwrap(),
            "list_notes should sort the more-recently-modified note ({newer_id}) before the \
             older one ({older_id}), but got order: {:?}",
            listed.iter().map(|n| &n.id).collect::<Vec<_>>()
        );

        let newer_summary = listed.iter().find(|n| n.id == newer_id).unwrap();
        assert_eq!(
            newer_summary.title, "zz-verify-newer",
            "list_notes title should be derive_title's output (heading marker stripped), not \
             the raw first line or the id"
        );
        let older_summary = listed.iter().find(|n| n.id == older_id).unwrap();
        assert_eq!(older_summary.title, "zz-verify-older");
    }
}
