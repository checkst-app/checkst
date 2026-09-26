use serde::Serialize;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

const BOM: &str = "\u{feff}";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TextFile {
    pub exists: bool,
    pub content: String,
    pub bom: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileInfo {
    pub exists: bool,
    pub is_file: bool,
    pub dir_exists: bool,
}

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

pub fn read(path: &str) -> Result<TextFile, String> {
    let p = Path::new(path);
    if !p.exists() {
        return Ok(TextFile { exists: false, content: String::new(), bom: false });
    }
    let bytes = fs::read(p).map_err(err)?;
    let text = String::from_utf8_lossy(&bytes).into_owned();
    let bom = text.starts_with(BOM);
    let content = if bom { text[BOM.len()..].to_string() } else { text };
    Ok(TextFile { exists: true, content, bom })
}

/// Writes the file atomically: temp file in the same folder, then rename.
/// A crash mid-write can never leave a half-written todo.txt behind.
pub fn write(path: &str, content: &str, bom: bool) -> Result<(), String> {
    let p = Path::new(path);
    if let Some(dir) = p.parent() {
        if !dir.as_os_str().is_empty() {
            fs::create_dir_all(dir).map_err(err)?;
        }
    }
    let file_name = p.file_name().ok_or("Ungültiger Dateiname")?.to_string_lossy().to_string();
    let tmp = p.with_file_name(format!(".{file_name}.checkst-tmp"));
    {
        let mut f = fs::File::create(&tmp).map_err(err)?;
        if bom {
            f.write_all(BOM.as_bytes()).map_err(err)?;
        }
        f.write_all(content.as_bytes()).map_err(err)?;
        f.sync_all().map_err(err)?;
    }
    fs::rename(&tmp, p).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        err(e)
    })
}

fn detect_eol(content: &str) -> &'static str {
    if content.contains("\r\n") || content.is_empty() {
        "\r\n"
    } else {
        "\n"
    }
}

/// Appends one line, keeping the file's line endings. Returns the 1-based line number.
pub fn append_line(path: &str, line: &str) -> Result<usize, String> {
    let file = read(path)?;
    let eol = detect_eol(&file.content);
    let mut content = file.content;
    if !content.is_empty() && !content.ends_with('\n') {
        content.push_str(eol);
    }
    content.push_str(line);
    content.push_str(eol);
    write(path, &content, file.bom)?;
    Ok(content.lines().count())
}

/// Removes the last line if it equals `line` (undo for quick capture).
pub fn remove_last_line_if(path: &str, line: &str) -> Result<bool, String> {
    let file = read(path)?;
    let eol = detect_eol(&file.content);
    let mut lines: Vec<&str> = file.content.lines().collect();
    while lines.last().map(|l| l.trim().is_empty()).unwrap_or(false) {
        lines.pop();
    }
    if lines.last().map(|l| *l == line).unwrap_or(false) {
        lines.pop();
        let mut content = lines.join(eol);
        if !content.is_empty() {
            content.push_str(eol);
        }
        write(path, &content, file.bom)?;
        return Ok(true);
    }
    Ok(false)
}

pub fn info(path: &str) -> FileInfo {
    let p = Path::new(path);
    FileInfo {
        exists: p.exists(),
        is_file: p.is_file(),
        dir_exists: p.parent().map(|d| d.exists()).unwrap_or(false),
    }
}

fn backup_dir(path: &Path) -> PathBuf {
    path.parent().unwrap_or(Path::new(".")).join(".checkst-backup")
}

/// Creates at most one backup per day next to the file and prunes old ones.
pub fn backup(path: &str, keep_days: u32) -> Result<Option<String>, String> {
    let p = Path::new(path);
    if !p.is_file() {
        return Ok(None);
    }
    let stem = p.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_else(|| "todo".into());
    let ext = p.extension().map(|s| s.to_string_lossy().to_string()).unwrap_or_else(|| "txt".into());
    let dir = backup_dir(p);
    fs::create_dir_all(&dir).map_err(err)?;
    let today = chrono::Local::now().date_naive();
    let target = dir.join(format!("{stem}-{}.{ext}", today.format("%Y-%m-%d")));
    let created = if target.exists() {
        None
    } else {
        fs::copy(p, &target).map_err(err)?;
        Some(target.to_string_lossy().to_string())
    };

    let prefix = format!("{stem}-");
    let suffix = format!(".{ext}");
    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            let Some(date) = name.strip_prefix(&prefix).and_then(|r| r.strip_suffix(&suffix)) else {
                continue;
            };
            if let Ok(d) = chrono::NaiveDate::parse_from_str(date, "%Y-%m-%d") {
                if (today - d).num_days() >= keep_days as i64 {
                    let _ = fs::remove_file(entry.path());
                }
            }
        }
    }
    Ok(created)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp(name: &str) -> String {
        let dir = std::env::temp_dir().join(format!("checkst-test-{}-{name}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir.join("todo.txt").to_string_lossy().to_string()
    }

    #[test]
    fn append_keeps_crlf_and_bom() {
        let p = tmp("append");
        write(&p, "a\r\nb\r\n", true).unwrap();
        assert_eq!(append_line(&p, "c").unwrap(), 3);
        let f = read(&p).unwrap();
        assert!(f.bom);
        assert_eq!(f.content, "a\r\nb\r\nc\r\n");
        assert!(remove_last_line_if(&p, "c").unwrap());
        assert_eq!(read(&p).unwrap().content, "a\r\nb\r\n");
        assert!(!remove_last_line_if(&p, "zzz").unwrap());
    }

    #[test]
    fn append_to_missing_file_creates_it() {
        let p = tmp("missing");
        append_line(&p, "first").unwrap();
        assert_eq!(read(&p).unwrap().content, "first\r\n");
    }

    #[test]
    fn backup_once_per_day() {
        let p = tmp("backup");
        write(&p, "x", false).unwrap();
        assert!(backup(&p, 7).unwrap().is_some());
        assert!(backup(&p, 7).unwrap().is_none());
    }
}
