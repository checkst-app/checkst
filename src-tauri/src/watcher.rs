use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};

#[derive(Default)]
pub struct FileWatcher {
    inner: Mutex<Option<RecommendedWatcher>>,
}

fn normalize(p: &Path) -> String {
    p.to_string_lossy().replace('/', "\\").to_lowercase()
}

impl FileWatcher {
    /// Watches the parent folders of the given files. Watching the folder instead of
    /// the file survives atomic replaces done by editors, Dropbox or checkst itself.
    pub fn watch(&self, app: AppHandle, files: Vec<String>) -> Result<(), String> {
        let mut guard = self.inner.lock().map_err(|e| e.to_string())?;
        *guard = None;
        if files.is_empty() {
            return Ok(());
        }
        let wanted: HashSet<String> = files.iter().map(|f| normalize(Path::new(f))).collect();
        let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
            let Ok(event) = res else { return };
            if !(event.kind.is_modify() || event.kind.is_create() || event.kind.is_remove()) {
                return;
            }
            for path in &event.paths {
                let key = normalize(path);
                if wanted.contains(&key) {
                    let _ = app.emit("file-changed", path.to_string_lossy().to_string());
                }
            }
        })
        .map_err(|e| e.to_string())?;

        let dirs: HashSet<PathBuf> = files
            .iter()
            .filter_map(|f| Path::new(f).parent().map(|d| d.to_path_buf()))
            .filter(|d| d.exists())
            .collect();
        for dir in dirs {
            watcher.watch(&dir, RecursiveMode::NonRecursive).map_err(|e| e.to_string())?;
        }
        *guard = Some(watcher);
        Ok(())
    }
}
