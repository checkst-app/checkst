mod files;
mod updater;
mod watcher;
#[cfg(windows)]
mod winicon;

use serde_json::Value;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, WindowEvent};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

const TRAY_ID: &str = "checkst-tray";
const DEFAULT_SHORTCUT: &str = "Ctrl+Alt+T";

struct AppState {
    shortcut: Mutex<Option<String>>,
    start_minimized: bool,
    quitting: Mutex<bool>,
}

// ---------- files ----------

#[tauri::command]
fn read_text_file(path: String) -> Result<files::TextFile, String> {
    files::read(&path)
}

#[tauri::command]
fn write_text_file(path: String, content: String, bom: bool) -> Result<(), String> {
    files::write(&path, &content, bom)
}

#[tauri::command]
fn append_line(app: AppHandle, path: String, line: String) -> Result<usize, String> {
    let n = files::append_line(&path, &line)?;
    let _ = app.emit("tasks-appended", &path);
    Ok(n)
}

#[tauri::command]
fn remove_last_line_if(app: AppHandle, path: String, line: String) -> Result<bool, String> {
    let removed = files::remove_last_line_if(&path, &line)?;
    let _ = app.emit("tasks-appended", &path);
    Ok(removed)
}

#[tauri::command]
fn file_info(path: String) -> files::FileInfo {
    files::info(&path)
}

#[tauri::command]
fn backup_file(path: String, keep_days: u32) -> Result<Option<String>, String> {
    files::backup(&path, keep_days)
}

#[tauri::command]
fn watch_files(app: AppHandle, state: tauri::State<watcher::FileWatcher>, paths: Vec<String>) -> Result<(), String> {
    state.watch(app, paths)
}

#[tauri::command]
fn default_documents_dir(app: AppHandle) -> String {
    app.path()
        .document_dir()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default()
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

// ---------- windows ----------

fn show_main_window(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

fn show_quick_window(app: &AppHandle) {
    let Some(w) = app.get_webview_window("quick") else { return };
    // Open the bar on the monitor under the mouse, horizontally centered, in the upper third.
    let monitor = app
        .cursor_position()
        .ok()
        .and_then(|p| app.monitor_from_point(p.x, p.y).ok().flatten())
        .or_else(|| w.primary_monitor().ok().flatten());
    if let (Some(m), Ok(size)) = (monitor, w.outer_size()) {
        let area = m.work_area();
        let x = area.position.x + (area.size.width as i32 - size.width as i32) / 2;
        let y = area.position.y + (area.size.height as f64 * 0.16) as i32;
        let _ = w.set_position(PhysicalPosition::new(x, y));
    }
    let _ = w.show();
    let _ = w.set_focus();
    let _ = w.emit("quick-opened", ());
}

fn toggle_quick_window(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("quick") {
        if w.is_visible().unwrap_or(false) {
            let _ = w.hide();
        } else {
            show_quick_window(app);
        }
    }
}

#[tauri::command]
fn app_ready(app: AppHandle, state: tauri::State<AppState>) {
    if !state.start_minimized {
        show_main_window(&app);
    }
}

/// Shows the main window. With `focus_line` (1-based) the list jumps to that task,
/// `raw` helps to find it if lines moved, `edit` opens the edit dialog.
#[tauri::command]
fn show_main(app: AppHandle, focus_line: Option<usize>, raw: Option<String>, edit: Option<bool>) {
    show_main_window(&app);
    if let Some(line) = focus_line {
        let payload = serde_json::json!({ "line": line, "raw": raw, "edit": edit.unwrap_or(false) });
        let _ = app.emit_to("main", "focus-line", payload);
    }
}

#[tauri::command]
fn show_quick(app: AppHandle) {
    show_quick_window(&app);
}

#[tauri::command]
fn hide_quick(app: AppHandle) {
    if let Some(w) = app.get_webview_window("quick") {
        let _ = w.hide();
    }
}

#[tauri::command]
fn set_quick_shortcut(app: AppHandle, state: tauri::State<AppState>, accelerator: String) -> Result<(), String> {
    let gs = app.global_shortcut();
    let mut current = state.shortcut.lock().map_err(|e| e.to_string())?;
    if let Some(old) = current.take() {
        let _ = gs.unregister(old.as_str());
    }
    if accelerator.trim().is_empty() {
        return Ok(());
    }
    gs.register(accelerator.as_str()).map_err(|e| e.to_string())?;
    *current = Some(accelerator);
    Ok(())
}

#[tauri::command]
fn set_tray_labels(app: AppHandle, open: String, new_task: String, quit: String) -> Result<(), String> {
    let menu = build_tray_menu(&app, &open, &new_task, &quit).map_err(|e| e.to_string())?;
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        tray.set_menu(Some(menu)).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Replaces the taskbar (window) and tray icon, e.g. to follow the accent color.
#[tauri::command]
fn set_app_icon(app: AppHandle, window_rgba: Vec<u8>, window_size: u32, tray_rgba: Vec<u8>, tray_size: u32) -> Result<(), String> {
    use tauri::image::Image;
    if let Some(w) = app.get_webview_window("main") {
        #[cfg(windows)]
        if let Ok(hwnd) = w.hwnd() {
            winicon::set_big_icon(hwnd.0 as isize, &window_rgba, window_size)?;
        }
        w.set_icon(Image::new_owned(window_rgba, window_size, window_size))
            .map_err(|e| e.to_string())?;
    }
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        tray.set_icon(Some(Image::new_owned(tray_rgba, tray_size, tray_size)))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn quit_app(app: AppHandle, state: tauri::State<AppState>) {
    if let Ok(mut q) = state.quitting.lock() {
        *q = true;
    }
    app.exit(0);
}

#[tauri::command]
fn started_minimized(state: tauri::State<AppState>) -> bool {
    state.start_minimized
}

// ---------- updates ----------

#[tauri::command]
async fn check_update(app: AppHandle) -> updater::UpdateStatus {
    let version = app.package_info().version.to_string();
    tauri::async_runtime::spawn_blocking(move || updater::check(&version))
        .await
        .unwrap_or(updater::UpdateStatus {
            supported: false,
            current_version: app.package_info().version.to_string(),
            available_version: None,
            notes: None,
            ready_to_install: false,
        })
}

#[tauri::command]
async fn download_update() -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(updater::download)
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
fn apply_update() -> Result<(), String> {
    updater::apply_and_restart()
}

#[tauri::command]
fn update_url() -> &'static str {
    updater::UPDATE_URL
}

// ---------- tray ----------

fn build_tray_menu(app: &AppHandle, open: &str, new_task: &str, quit: &str) -> tauri::Result<Menu<tauri::Wry>> {
    let open_i = MenuItem::with_id(app, "open", open, true, None::<&str>)?;
    let new_i = MenuItem::with_id(app, "new", new_task, true, None::<&str>)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let quit_i = MenuItem::with_id(app, "quit", quit, true, None::<&str>)?;
    Menu::with_items(app, &[&open_i, &new_i, &sep, &quit_i])
}

fn request_quit(app: &AppHandle) {
    // Let the UI archive completed tasks first; exit anyway if it does not answer.
    let _ = app.emit_to("main", "quit-requested", ());
    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(4));
        handle.exit(0);
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let start_minimized = std::env::args().any(|a| a == "--minimized");

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main_window(app);
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::Builder::new().args(["--minimized"]).build())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        toggle_quick_window(app);
                    }
                })
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .manage(watcher::FileWatcher::default())
        .manage(AppState {
            shortcut: Mutex::new(None),
            start_minimized,
            quitting: Mutex::new(false),
        })
        .setup(|app| {
            let handle = app.handle().clone();
            let menu = build_tray_menu(&handle, "checkst öffnen", "Neue Aufgabe …", "Beenden")?;
            TrayIconBuilder::with_id(TRAY_ID)
                .icon(app.default_window_icon().cloned().expect("app icon"))
                .tooltip("checkst")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => show_main_window(app),
                    "new" => show_quick_window(app),
                    "quit" => request_quit(app),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                        show_main_window(tray.app_handle());
                    }
                })
                .build(app)?;

            // Register the default shortcut right away; the UI re-registers the user's choice.
            let state = app.state::<AppState>();
            if app.global_shortcut().register(DEFAULT_SHORTCUT).is_ok() {
                *state.shortcut.lock().unwrap() = Some(DEFAULT_SHORTCUT.to_string());
            }
            Ok(())
        })
        .on_window_event(|window, event| match (window.label(), event) {
            ("main", WindowEvent::CloseRequested { api, .. }) => {
                let quitting = window.state::<AppState>().quitting.lock().map(|q| *q).unwrap_or(false);
                if !quitting {
                    // Closing keeps checkst in the tray so the quick-capture shortcut keeps working.
                    api.prevent_close();
                    let _ = window.hide();
                    let _ = window.emit("main-hidden", ());
                }
            }
            ("quick", WindowEvent::Focused(false)) => {
                // WebView2 briefly reports a focus loss while focus moves into the webview.
                // Only hide when the bar is still unfocused a moment later.
                let w = window.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(200));
                    if !w.is_focused().unwrap_or(false) {
                        let _ = w.hide();
                    }
                });
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            read_text_file,
            write_text_file,
            append_line,
            remove_last_line_if,
            file_info,
            backup_file,
            watch_files,
            default_documents_dir,
            load_settings,
            save_settings,
            app_ready,
            show_main,
            show_quick,
            hide_quick,
            set_quick_shortcut,
            set_tray_labels,
            set_app_icon,
            quit_app,
            started_minimized,
            check_update,
            download_update,
            apply_update,
            update_url,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
