//! Taskbar icon on Windows. Tauri's `set_icon` only sets ICON_SMALL; the taskbar uses
//! ICON_BIG and otherwise falls back to the icon embedded in the exe.

use windows::Win32::Foundation::{HWND, LPARAM, WPARAM};
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
