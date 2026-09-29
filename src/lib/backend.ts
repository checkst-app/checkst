import { invoke } from "@tauri-apps/api/core";

export interface TextFile {
  exists: boolean;
  content: string;
  bom: boolean;
}

export interface FileInfo {
  exists: boolean;
  isFile: boolean;
  dirExists: boolean;
}

/** Payload of the "focus-line" event (line is 1-based). */
export interface FocusRequest {
  line: number;
  raw?: string | null;
  edit: boolean;
}

export interface UpdateStatus {
  supported: boolean;
  currentVersion: string;
  availableVersion?: string | null;
  notes?: string | null;
  readyToInstall: boolean;
}

/** Result of the Android file picker; `uri` is missing when it was cancelled. */
export interface PickedFile {
  uri?: string | null;
  label?: string | null;
}

/** Android APK download; `total` is -1 while the size is unknown. */
export interface ApkProgress {
  downloaded: number;
  total: number;
}

export const backend = {
  readTextFile: (path: string) => invoke<TextFile>("read_text_file", { path }),
  writeTextFile: (path: string, content: string, bom: boolean) => invoke<void>("write_text_file", { path, content, bom }),
  appendLine: (path: string, line: string) => invoke<number>("append_line", { path, line }),
  removeLastLineIf: (path: string, line: string) => invoke<boolean>("remove_last_line_if", { path, line }),
  fileInfo: (path: string) => invoke<FileInfo>("file_info", { path }),
  backupFile: (path: string, keepDays: number) => invoke<string | null>("backup_file", { path, keepDays }),
  watchFiles: (paths: string[]) => invoke<void>("watch_files", { paths }),
  documentsDir: () => invoke<string>("default_documents_dir"),
  loadSettings: () => invoke<unknown | null>("load_settings"),
  saveSettings: (settings: unknown) => invoke<void>("save_settings", { settings }),
  appReady: () => invoke<void>("app_ready"),
  showMain: (focusLine?: number, opts?: { raw?: string; edit?: boolean }) =>
    invoke<void>("show_main", { focusLine: focusLine ?? null, raw: opts?.raw ?? null, edit: opts?.edit ?? false }),
  showQuick: () => invoke<void>("show_quick"),
  hideQuick: () => invoke<void>("hide_quick"),
  setQuickShortcut: (accelerator: string) => invoke<void>("set_quick_shortcut", { accelerator }),
  setTrayLabels: (open: string, newTask: string, pin: string, pinned: boolean, quit: string) =>
    invoke<void>("set_tray_labels", { open, newTask, pin, pinned, quit }),
  setAppIcon: (windowPng: number[], trayPng: number[]) => invoke<void>("set_app_icon", { windowPng, trayPng }),
  quitApp: () => invoke<void>("quit_app"),
  startedMinimized: () => invoke<boolean>("started_minimized"),
  checkUpdate: () => invoke<UpdateStatus>("check_update"),
  downloadUpdate: () => invoke<boolean>("download_update"),
  applyUpdate: () => invoke<void>("apply_update"),
  updateUrl: () => invoke<string>("update_url"),
  // Android only
  pickFile: (create: boolean, name: string) => invoke<PickedFile>("pick_file", { create, name }),
  setSystemBars: (dark: boolean, top: string, bottom: string) => invoke<void>("set_system_bars", { dark, top, bottom }),
  downloadApk: (url: string) => invoke<void>("download_apk", { url }),
  apkProgress: () => invoke<ApkProgress>("apk_progress"),
  installApk: (askPermission: boolean) => invoke<{ needsPermission: boolean }>("install_apk", { askPermission }),
  feedback: (haptic?: string, sound?: string) => invoke<void>("feedback", { haptic: haptic ?? null, sound: sound ?? null }),
};

export function fileName(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

export function dirName(path: string): string {
  const i = Math.max(path.lastIndexOf("\\"), path.lastIndexOf("/"));
  return i > 0 ? path.slice(0, i) : path;
}

export function joinPath(dir: string, name: string): string {
  const sep = dir.includes("/") && !dir.includes("\\") ? "/" : "\\";
  return dir.replace(/[\\/]+$/, "") + sep + name;
}
