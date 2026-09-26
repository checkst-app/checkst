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
  setTrayLabels: (open: string, newTask: string, quit: string) => invoke<void>("set_tray_labels", { open, newTask, quit }),
  setAppIcon: (windowRgba: number[], windowSize: number, trayRgba: number[], traySize: number) =>
    invoke<void>("set_app_icon", { windowRgba, windowSize, trayRgba, traySize }),
  quitApp: () => invoke<void>("quit_app"),
  startedMinimized: () => invoke<boolean>("started_minimized"),
  checkUpdate: () => invoke<UpdateStatus>("check_update"),
  downloadUpdate: () => invoke<boolean>("download_update"),
  applyUpdate: () => invoke<void>("apply_update"),
  updateUrl: () => invoke<string>("update_url"),
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
