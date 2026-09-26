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

impl TextFile {
    pub fn missing() -> Self {
        TextFile { exists: false, content: String::new(), bom: false }
    }

    /// Splits off a leading BOM so it can be written back unchanged.
    pub fn from_text(text: String) -> Self {
        let bom = text.starts_with(BOM);
        let content = if bom { text[BOM.len()..].to_string() } else { text };
        TextFile { exists: true, content, bom }
    }
}

/// The text to store for `content`, with the BOM put back if the file had one.
#[cfg_attr(not(target_os = "android"), allow(dead_code))]
pub fn with_bom(content: &str, bom: bool) -> String {
    if bom {
        format!("{BOM}{content}")
    } else {
        content.to_string()
    }
}

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

pub fn read(path: &str) -> Result<TextFile, String> {
    let p = Path::new(path);
    if !p.exists() {
        return Ok(TextFile::missing());
    }
    let bytes = fs::read(p).map_err(err)?;
    Ok(TextFile::from_text(String::from_utf8_lossy(&bytes).into_owned()))
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

/// `content` with one more line, keeping the file's line endings, and the new line count.
pub fn with_line_appended(content: &str, line: &str) -> (String, usize) {
    let eol = detect_eol(content);
    let mut next = content.to_string();
    if !next.is_empty() && !next.ends_with('\n') {
        next.push_str(eol);
    }
    next.push_str(line);
    next.push_str(eol);
    let count = next.lines().count();
    (next, count)
}

/// `content` without its last line if that line equals `line` (undo for quick capture).
pub fn without_last_line(content: &str, line: &str) -> Option<String> {
    let eol = detect_eol(content);
    let mut lines: Vec<&str> = content.lines().collect();
    while lines.last().map(|l| l.trim().is_empty()).unwrap_or(false) {
        lines.pop();
    }
    if lines.last().map(|l| *l == line) != Some(true) {
        return None;
    }
    lines.pop();
    let mut next = lines.join(eol);
    if !next.is_empty() {
        next.push_str(eol);
    }
    Some(next)
}

/// Appends one line, keeping the file's line endings. Returns the 1-based line number.
#[cfg(test)]
pub fn append_line(path: &str, line: &str) -> Result<usize, String> {
    let file = read(path)?;
    let (content, count) = with_line_appended(&file.content, line);
    write(path, &content, file.bom)?;
    Ok(count)
}

/// Removes the last line if it equals `line` (undo for quick capture).
#[cfg(test)]
pub fn remove_last_line_if(path: &str, line: &str) -> Result<bool, String> {
    let file = read(path)?;
    match without_last_line(&file.content, line) {
        Some(content) => {
            write(path, &content, file.bom)?;
            Ok(true)
        }
        None => Ok(false),
    }
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
