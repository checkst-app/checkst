use serde::Serialize;
use velopack::{sources::HttpSource, UpdateCheck, UpdateManager};

/// GitHub releases feed. `vpk upload github` publishes `releases.win.json` and the
/// packages as release assets; `/releases/latest/download/<file>` always resolves
/// to the newest published release.
pub const UPDATE_URL: &str = "https://github.com/checkst-app/checkst/releases/latest/download";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateStatus {
    /// false when running outside a Velopack install (e.g. `tauri dev`).
    pub supported: bool,
    pub current_version: String,
    pub available_version: Option<String>,
    pub notes: Option<String>,
    pub ready_to_install: bool,
}

fn manager() -> Result<UpdateManager, String> {
    UpdateManager::new(HttpSource::new(UPDATE_URL), None, None).map_err(|e| e.to_string())
}

pub fn check(app_version: &str) -> UpdateStatus {
    let mut status = UpdateStatus {
        supported: false,
        current_version: app_version.to_string(),
        available_version: None,
        notes: None,
        ready_to_install: false,
    };
    let Ok(um) = manager() else { return status };
    status.supported = true;
    status.current_version = um.get_current_version_as_string();
    if let Some(pending) = um.get_update_pending_restart() {
        status.available_version = Some(pending.Version.clone());
        status.notes = Some(pending.NotesMarkdown.clone());
        status.ready_to_install = true;
        return status;
    }
    if let Ok(UpdateCheck::UpdateAvailable(info)) = um.check_for_updates() {
        status.available_version = Some(info.TargetFullRelease.Version.clone());
        status.notes = Some(info.TargetFullRelease.NotesMarkdown.clone());
    }
    status
}

/// Downloads the newest release. It is applied on restart (or on next launch).
pub fn download() -> Result<bool, String> {
    let um = manager()?;
    match um.check_for_updates().map_err(|e| e.to_string())? {
        UpdateCheck::UpdateAvailable(info) => {
            um.download_updates(&info, None).map_err(|e| e.to_string())?;
            Ok(true)
        }
        _ => Ok(um.get_update_pending_restart().is_some()),
    }
}

pub fn apply_and_restart() -> Result<(), String> {
    let um = manager()?;
    let pending = um.get_update_pending_restart().ok_or("Kein Update heruntergeladen")?;
    um.apply_updates_and_restart(&pending).map_err(|e| e.to_string())
}
