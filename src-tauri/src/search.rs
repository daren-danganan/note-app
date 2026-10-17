use serde::{Deserialize, Serialize};

use crate::notes;

#[derive(Serialize, Deserialize, Clone)]
pub struct SearchResult {
    pub id: String,
    pub title: String,
    pub snippet: String,
    pub modified_at: String,
}

/// Case-insensitive substring search over every note's content.
/// Fine for a personal note store of up to a few thousand files; if this
/// ever becomes a bottleneck, swap in an index (e.g. the `tantivy` crate).
pub fn search(query: &str) -> Result<Vec<SearchResult>, String> {
    let query = query.trim();
    if query.is_empty() {
        return Ok(Vec::new());
    }
    let needle = query.to_lowercase();

    let dir = notes::notes_dir()?;
    let mut results = Vec::new();

    let entries =
        std::fs::read_dir(&dir).map_err(|e| format!("Failed to read notes directory: {e}"))?;
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
        let content = std::fs::read_to_string(&path).unwrap_or_default();
        let matching_line = content
            .lines()
            .find(|line| line.to_lowercase().contains(&needle));

        let title = notes::derive_title(&content);
        let title_matches = title.to_lowercase().contains(&needle);

        if let Some(line) = matching_line {
            results.push(build_result(id, title, line.trim().chars().take(140).collect(), &path));
        } else if title_matches {
            results.push(build_result(id, title.clone(), title, &path));
        }
    }

    results.sort_by(|a, b| b.modified_at.cmp(&a.modified_at));
    Ok(results)
}

fn build_result(id: String, title: String, snippet: String, path: &std::path::Path) -> SearchResult {
    let modified_at = std::fs::metadata(path)
        .and_then(|m| m.modified())
        .map(|t| chrono::DateTime::<chrono::Local>::from(t).to_rfc3339())
        .unwrap_or_default();
    SearchResult {
        id,
        title,
        snippet,
        modified_at,
    }
}
