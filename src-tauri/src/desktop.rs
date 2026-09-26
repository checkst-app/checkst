//! Desktop only: main and quick-capture windows, tray, global shortcut, taskbar icon and
//! Velopack updates.

use std::sync::Mutex;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{App, AppHandle, Emitter, Manager, PhysicalPosition, Window, WindowEvent, Wry};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

use crate::{updater, watcher};

const TRAY_ID: &str = "checkst-tray";
const DEFAULT_SHORTCUT: &str = "Ctrl+Alt+T";

pub struct AppState {
    shortcut: Mutex<Option<String>>,
    start_minimized: bool,
    quitting: Mutex<bool>,
}

pub fn plugins(builder: tauri::Builder<Wry>) -> tauri::Builder<Wry> {
    let start_minimized = std::env::args().any(|a| a == "--minimized");
    builder
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main_window(app);
        }))
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
        .manage(watcher::FileWatcher::default())
        .manage(AppState {
            shortcut: Mutex::new(None),
            start_minimized,
            quitting: Mutex::new(false),
        })
}

pub fn setup(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
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
}

pub fn on_window_event(window: &Window, event: &WindowEvent) {
    match (window.label(), event) {
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
    }
}

// ---------- files ----------

#[tauri::command]
pub fn watch_files(app: AppHandle, state: tauri::State<watcher::FileWatcher>, paths: Vec<String>) -> Result<(), String> {
    state.watch(app, paths)
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
pub fn app_ready(app: AppHandle, state: tauri::State<AppState>) {
    if !state.start_minimized {
        show_main_window(&app);
    }
}

/// Shows the main window. With `focus_line` (1-based) the list jumps to that task,
/// `raw` helps to find it if lines moved, `edit` opens the edit dialog.
#[tauri::command]
pub fn show_main(app: AppHandle, focus_line: Option<usize>, raw: Option<String>, edit: Option<bool>) {
    show_main_window(&app);
    if let Some(line) = focus_line {
        let payload = serde_json::json!({ "line": line, "raw": raw, "edit": edit.unwrap_or(false) });
        let _ = app.emit_to("main", "focus-line", payload);
    }
}

#[tauri::command]
pub fn show_quick(app: AppHandle) {
    show_quick_window(&app);
}

#[tauri::command]
pub fn hide_quick(app: AppHandle) {
    if let Some(w) = app.get_webview_window("quick") {
        let _ = w.hide();
    }
}

#[tauri::command]
pub fn set_quick_shortcut(app: AppHandle, state: tauri::State<AppState>, accelerator: String) -> Result<(), String> {
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
pub fn set_tray_labels(app: AppHandle, open: String, new_task: String, quit: String) -> Result<(), String> {
    let menu = build_tray_menu(&app, &open, &new_task, &quit).map_err(|e| e.to_string())?;
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        tray.set_menu(Some(menu)).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Replaces the taskbar (window) and tray icon, e.g. to follow the accent color.
#[tauri::command]
pub fn set_app_icon(app: AppHandle, window_rgba: Vec<u8>, window_size: u32, tray_rgba: Vec<u8>, tray_size: u32) -> Result<(), String> {
    use tauri::image::Image;
    if let Some(w) = app.get_webview_window("main") {
        #[cfg(windows)]
        if let Ok(hwnd) = w.hwnd() {
            crate::winicon::set_big_icon(hwnd.0 as isize, &window_rgba, window_size)?;
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
pub fn quit_app(app: AppHandle, state: tauri::State<AppState>) {
    if let Ok(mut q) = state.quitting.lock() {
        *q = true;
    }
    app.exit(0);
}

#[tauri::command]
pub fn started_minimized(state: tauri::State<AppState>) -> bool {
    state.start_minimized
}

// ---------- updates ----------

#[tauri::command]
pub async fn check_update(app: AppHandle) -> updater::UpdateStatus {
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
pub async fn download_update() -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(updater::download)
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn apply_update() -> Result<(), String> {
    updater::apply_and_restart()
}

#[tauri::command]
pub fn update_url() -> &'static str {
    updater::UPDATE_URL
}

// ---------- tray ----------

fn build_tray_menu(app: &AppHandle, open: &str, new_task: &str, quit: &str) -> tauri::Result<Menu<Wry>> {
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
