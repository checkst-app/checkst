//! Taskbar icon on Windows. Tauri's `set_icon` only sets ICON_SMALL; the taskbar uses
//! ICON_BIG and otherwise falls back to the icon embedded in the exe.
//!
//! The installed app has an AppUserModelID (Velopack sets the one of its Start menu and
//! desktop shortcuts). Then the taskbar shows the icon of the matching shortcut instead of
//! the window icon, so the accent icon also has to go into those shortcuts.

use std::path::{Path, PathBuf};
use windows::core::{Interface, HSTRING, PCWSTR};
use windows::Win32::Foundation::{HWND, LPARAM, WPARAM};
use windows::Win32::Storage::EnhancedStorage::PKEY_AppUserModel_ID;
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize, IPersistFile, CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED,
    STGM_READWRITE,
};
use windows::Win32::UI::Shell::PropertiesSystem::IPropertyStore;
use windows::Win32::UI::Shell::{GetCurrentProcessExplicitAppUserModelID, IShellLinkW, SHChangeNotify, ShellLink, SHCNE_ASSOCCHANGED, SHCNF_IDLIST};
use windows::Win32::UI::WindowsAndMessaging::{CreateIcon, SendMessageW, ICON_BIG, WM_SETICON};

pub fn set_big_icon(hwnd: isize, rgba: &[u8], size: u32) -> Result<(), String> {
    // Same conversion as tao: RGBA -> BGRA, alpha doubles as AND mask.
    let mut bgra = rgba.to_vec();
    let mut and_mask = Vec::with_capacity(bgra.len() / 4);
    for px in bgra.chunks_exact_mut(4) {
        and_mask.push(px[3].wrapping_sub(u8::MAX));
        px.swap(0, 2);
    }
    unsafe {
        let icon = CreateIcon(None, size as i32, size as i32, 1, 32, and_mask.as_ptr(), bgra.as_ptr()).map_err(|e| e.to_string())?;
        SendMessageW(
            HWND(hwnd as *mut core::ffi::c_void),
            WM_SETICON,
            Some(WPARAM(ICON_BIG as usize)),
            Some(LPARAM(icon.0 as isize)),
        );
    }
    Ok(())
}

/// The AppUserModelID of this process; none when started outside the installation (e.g. `tauri dev`).
pub fn process_app_id() -> Option<String> {
    unsafe {
        let id = GetCurrentProcessExplicitAppUserModelID().ok()?;
        let s = id.to_string().ok();
        CoTaskMemFree(Some(id.0 as _));
        s
    }
}

/// Points every shortcut in `dirs` that carries `app_id` at `icon` and returns how many changed.
pub fn set_shortcut_icons(dirs: &[PathBuf], app_id: &str, icon: &Path) -> usize {
    unsafe {
        let com = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        let mut changed = 0;
        for dir in dirs {
            let Ok(entries) = std::fs::read_dir(dir) else { continue };
            for path in entries.flatten().map(|e| e.path()) {
                if path.extension().is_some_and(|e| e.eq_ignore_ascii_case("lnk")) && set_shortcut_icon(&path, app_id, icon).unwrap_or(false) {
                    changed += 1;
                }
            }
        }
        if com.is_ok() {
            CoUninitialize();
        }
        changed
    }
}

unsafe fn set_shortcut_icon(path: &Path, app_id: &str, icon: &Path) -> windows::core::Result<bool> {
    let link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER)?;
    let file: IPersistFile = link.cast()?;
    file.Load(&HSTRING::from(path), STGM_READWRITE)?;
    if link.cast::<IPropertyStore>()?.GetValue(&PKEY_AppUserModel_ID)?.to_string() != app_id {
        return Ok(false);
    }
    let mut current = [0u16; 260];
    let mut index = 0;
    link.GetIconLocation(&mut current, &mut index)?;
    let icon = HSTRING::from(icon);
    if index == 0 && PCWSTR(current.as_ptr()).to_string().is_ok_and(|c| c.eq_ignore_ascii_case(&icon.to_string_lossy())) {
        return Ok(false);
    }
    link.SetIconLocation(&icon, 0)?;
    file.Save(PCWSTR::null(), true)?;
    Ok(true)
}

/// Makes Explorer and the taskbar reload icons, including those of running windows.
pub fn refresh_shell_icons() {
    unsafe { SHChangeNotify(SHCNE_ASSOCCHANGED, SHCNF_IDLIST, None, None) };
}

#[cfg(test)]
mod tests {
    use super::*;
    use windows::Win32::System::Com::StructuredStorage::PROPVARIANT;

    unsafe fn make_shortcut(path: &Path, app_id: &str) {
        let link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER).unwrap();
        link.SetPath(&HSTRING::from("C:\\Windows\\notepad.exe")).unwrap();
        let store: IPropertyStore = link.cast().unwrap();
        store.SetValue(&PKEY_AppUserModel_ID, &PROPVARIANT::from(app_id)).unwrap();
        store.Commit().unwrap();
        link.cast::<IPersistFile>().unwrap().Save(&HSTRING::from(path), true).unwrap();
    }

    unsafe fn icon_of(path: &Path) -> String {
        let link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER).unwrap();
        link.cast::<IPersistFile>().unwrap().Load(&HSTRING::from(path), STGM_READWRITE).unwrap();
        let mut buf = [0u16; 260];
        link.GetIconLocation(&mut buf, &mut 0).unwrap();
        PCWSTR(buf.as_ptr()).to_string().unwrap()
    }

    #[test]
    fn only_shortcuts_with_our_app_id_get_the_icon() {
        let dir = std::env::temp_dir().join(format!("checkst-test-{}-lnk", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let (ours, other) = (dir.join("checkst.lnk"), dir.join("other.lnk"));
        let icon = dir.join("app-icon.ico");
        unsafe {
            let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
            make_shortcut(&ours, "test.checkst");
            make_shortcut(&other, "test.other");
            assert_eq!(set_shortcut_icons(&[dir.clone()], "test.checkst", &icon), 1);
            assert_eq!(icon_of(&ours), icon.to_string_lossy());
            assert_eq!(icon_of(&other), "");
            // Already pointing there: nothing to do.
            assert_eq!(set_shortcut_icons(&[dir.clone()], "test.checkst", &icon), 0);
        }
        let _ = std::fs::remove_dir_all(dir);
    }
}
