mod notes;
mod search;

use notes::NoteSummary;
use search::SearchResult;

#[tauri::command]
fn list_notes() -> Result<Vec<NoteSummary>, String> {
    notes::list_notes()
}

#[tauri::command]
fn read_note(id: String) -> Result<String, String> {
    notes::read_note(&id)
}

#[tauri::command]
fn save_note(id: String, content: String) -> Result<(), String> {
    notes::save_note(&id, &content)
}

#[tauri::command]
fn create_note() -> Result<String, String> {
    notes::create_note()
}

#[tauri::command]
fn delete_note(id: String) -> Result<(), String> {
    notes::delete_note(&id)
}

#[tauri::command]
fn search_notes(query: String) -> Result<Vec<SearchResult>, String> {
    search::search(&query)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            list_notes,
            read_note,
            save_note,
            create_note,
            delete_note,
            search_notes,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
