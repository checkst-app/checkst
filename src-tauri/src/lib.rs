#[cfg(target_os = "android")]
mod android;
#[cfg(desktop)]
mod desktop;
mod files;
#[cfg(desktop)]
mod updater;
#[cfg(desktop)]
mod watcher;
#[cfg(windows)]
mod winicon;

use serde_json::Value;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, Manager};

// ---------- files ----------
//
// Paths are plain file paths, on Android also content:// URIs from the system file picker.
// The commands are async so the Android side never blocks the UI thread.

#[allow(unused_variables)]
fn read_any(app: &AppHandle, path: &str) -> Result<files::TextFile, String> {
    #[cfg(target_os = "android")]
    if android::is_uri(path) {
        return android::read(app, path);
    }
    files::read(path)
}

#[allow(unused_variables)]
fn write_any(app: &AppHandle, path: &str, content: &str, bom: bool) -> Result<(), String> {
    #[cfg(target_os = "android")]
    if android::is_uri(path) {
        return android::write(app, path, content, bom);
    }
    files::write(path, content, bom)
}

async fn blocking<T: Send + 'static>(f: impl FnOnce() -> Result<T, String> + Send + 'static) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(f).await.map_err(|e| e.to_string())?
}

#[tauri::command]
async fn read_text_file(app: AppHandle, path: String) -> Result<files::TextFile, String> {
    blocking(move || read_any(&app, &path)).await
}

#[tauri::command]
async fn write_text_file(app: AppHandle, path: String, content: String, bom: bool) -> Result<(), String> {
    blocking(move || write_any(&app, &path, &content, bom)).await
}

#[tauri::command]
async fn append_line(app: AppHandle, path: String, line: String) -> Result<usize, String> {
    blocking(move || {
        let file = read_any(&app, &path)?;
        let (content, count) = files::with_line_appended(&file.content, &line);
        write_any(&app, &path, &content, file.bom)?;
        let _ = app.emit("tasks-appended", &path);
        Ok(count)
    })
    .await
}

#[tauri::command]
async fn remove_last_line_if(app: AppHandle, path: String, line: String) -> Result<bool, String> {
    blocking(move || {
        let file = read_any(&app, &path)?;
        let Some(content) = files::without_last_line(&file.content, &line) else { return Ok(false) };
        write_any(&app, &path, &content, file.bom)?;
        let _ = app.emit("tasks-appended", &path);
        Ok(true)
    })
    .await
}

#[tauri::command]
#[allow(unused_variables)]
async fn file_info(app: AppHandle, path: String) -> Result<files::FileInfo, String> {
    blocking(move || {
        #[cfg(target_os = "android")]
        if android::is_uri(&path) {
            return Ok(android::info(&app, &path));
        }
        Ok(files::info(&path))
    })
    .await
}

#[tauri::command]
fn backup_file(path: String, keep_days: u32) -> Result<Option<String>, String> {
    // Picked Android files have no writable neighbour folder for backups.
    if path.starts_with("content://") {
        return Ok(None);
    }
    files::backup(&path, keep_days)
}

/// Where a new todo.txt goes by default: Documents on desktop, the app's own storage on mobile.
#[tauri::command]
fn default_documents_dir(app: AppHandle) -> String {
    #[cfg(desktop)]
    let dir = app.path().document_dir();
    #[cfg(mobile)]
    let dir = app.path().app_data_dir();
    dir.map(|p| p.to_string_lossy().to_string()).unwrap_or_default()
}

#[cfg(mobile)]
#[tauri::command]
fn watch_files(_paths: Vec<String>) -> Result<(), String> {
    // Android reloads when the app comes back to the foreground instead.
    Ok(())
}

// ---------- settings ----------

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    Ok(dir.join("settings.json"))
}

#[tauri::command]
fn load_settings(app: AppHandle) -> Result<Option<Value>, String> {
    let p = settings_path(&app)?;
    if !p.exists() {
        return Ok(None);
    }
    let text = std::fs::read_to_string(p).map_err(|e| e.to_string())?;
    Ok(serde_json::from_str(&text).ok())
}

#[tauri::command]
fn save_settings(app: AppHandle, settings: Value) -> Result<(), String> {
    let p = settings_path(&app)?;
    let text = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    files::write(&p.to_string_lossy(), &text, false)?;
    let _ = app.emit("settings-changed", &settings);
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init());

    #[cfg(desktop)]
    let builder = desktop::plugins(builder)
        .setup(|app| desktop::setup(app))
        .on_window_event(desktop::on_window_event)
        .invoke_handler(tauri::generate_handler![
            read_text_file,
            write_text_file,
            append_line,
            remove_last_line_if,
            file_info,
            backup_file,
            default_documents_dir,
            load_settings,
            save_settings,
            desktop::watch_files,
            desktop::app_ready,
            desktop::show_main,
            desktop::show_quick,
            desktop::hide_quick,
            desktop::set_quick_shortcut,
            desktop::set_tray_labels,
            desktop::set_app_icon,
            desktop::quit_app,
            desktop::started_minimized,
            desktop::check_update,
            desktop::download_update,
            desktop::apply_update,
            desktop::update_url,
        ]);

    #[cfg(target_os = "android")]
    let builder = builder.plugin(android::init()).invoke_handler(tauri::generate_handler![
        read_text_file,
        write_text_file,
        append_line,
        remove_last_line_if,
        file_info,
        backup_file,
        default_documents_dir,
        load_settings,
        save_settings,
        watch_files,
        android::pick_file,
        android::set_system_bars,
    ]);

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
