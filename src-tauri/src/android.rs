//! Android only: todo.txt access through the Storage Access Framework.
//!
//! A picked file is a `content://` URI with a persisted read/write grant, so checkst can keep
//! using a todo.txt in a Syncthing, OneDrive or Google Drive folder. The Kotlin side lives in
//! `gen/android/app/src/main/java/de/checkst/app/CheckstPlugin.kt`.

use serde::{Deserialize, Serialize};
use tauri::plugin::{Builder, PluginHandle, TauriPlugin};
use tauri::{AppHandle, Manager, Wry};

use crate::files::{self, FileInfo, TextFile};

struct Native(PluginHandle<Wry>);

pub fn init() -> TauriPlugin<Wry> {
    Builder::new("checkst-android")
        .setup(|app, api| {
            let handle = api.register_android_plugin("de.checkst.app", "CheckstPlugin")?;
            app.manage(Native(handle));
            Ok(())
        })
        .build()
}

pub fn is_uri(path: &str) -> bool {
    path.starts_with("content://")
}

fn call<T: serde::de::DeserializeOwned>(app: &AppHandle, command: &str, payload: impl Serialize) -> Result<T, String> {
    let native = app.try_state::<Native>().ok_or("Android plugin not loaded")?;
    native.0.run_mobile_plugin(command, payload).map_err(|e| e.to_string())
}

#[derive(Serialize)]
struct UriArgs<'a> {
    uri: &'a str,
}

#[derive(Serialize)]
struct WriteArgs<'a> {
    uri: &'a str,
    text: &'a str,
}

#[derive(Deserialize)]
struct ReadResult {
    exists: bool,
    text: String,
}

#[derive(Deserialize)]
struct InfoResult {
    exists: bool,
}

pub fn read(app: &AppHandle, uri: &str) -> Result<TextFile, String> {
    let r: ReadResult = call(app, "read", UriArgs { uri })?;
    Ok(if r.exists { TextFile::from_text(r.text) } else { TextFile::missing() })
}

pub fn write(app: &AppHandle, uri: &str, content: &str, bom: bool) -> Result<(), String> {
    let text = files::with_bom(content, bom);
    call::<serde_json::Value>(app, "write", WriteArgs { uri, text: &text }).map(|_| ())
}

pub fn info(app: &AppHandle, uri: &str) -> FileInfo {
    let exists = call::<InfoResult>(app, "info", UriArgs { uri }).map(|r| r.exists).unwrap_or(false);
    FileInfo { exists, is_file: exists, dir_exists: true }
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Picked {
    /// None when the picker was cancelled.
    pub uri: Option<String>,
    /// Readable location, e.g. "Syncthing/Aufgaben/todo.txt" or "Drive · todo.txt".
    pub label: Option<String>,
}

#[derive(Serialize)]
struct PickArgs<'a> {
    create: bool,
    name: &'a str,
}

/// Opens the system file picker: an existing file, or a new one when `create` is set.
#[tauri::command]
pub async fn pick_file(app: AppHandle, create: bool, name: String) -> Result<Picked, String> {
    tauri::async_runtime::spawn_blocking(move || call(&app, "pick", PickArgs { create, name: &name }))
        .await
        .map_err(|e| e.to_string())?
}

#[derive(Serialize)]
struct BarsArgs<'a> {
    dark: bool,
    top: &'a str,
    bottom: &'a str,
}

/// Colors the status bar (top) and navigation bar (bottom) area and picks light or dark icons.
#[tauri::command]
pub async fn set_system_bars(app: AppHandle, dark: bool, top: String, bottom: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || call::<serde_json::Value>(&app, "systemBars", BarsArgs { dark, top: &top, bottom: &bottom }).map(|_| ()))
        .await
        .map_err(|e| e.to_string())?
}
