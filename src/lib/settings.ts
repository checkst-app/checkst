import { createContext, useContext } from "react";
import type { DateFormat, Lang, TimeFormat, WeekStart } from "./dates";

export type ThemeSetting = "light" | "dark" | "system";
export type Density = "compact" | "standard" | "relaxed";
export type SortBy = "due" | "priority" | "file" | "alpha";
export type GroupBy = "date" | "project" | "priority" | "none";
export type AccentName = "green" | "blue" | "purple" | "orange" | "raspberry" | "graphite";

export interface Settings {
  version: 1;
  setupDone: boolean;
  language: Lang | "system";
  theme: ThemeSetting;
  accent: AccentName;
  density: Density;
  fontSize: 12 | 13 | 14 | 15;
  strikeDone: boolean;
  showRaw: boolean;
  todoPath: string;
  donePath: string;
  /** Readable location of a picked Android file, e.g. "Syncthing/Aufgaben/todo.txt". */
  todoLabel: string;
  doneLabel: string;
  autoArchive: boolean;
  watchExternal: boolean;
  autostart: boolean;
  backupDays: number; // 0 = off
  addCreationDate: boolean;
  defaultPriority: string; // "" = none
  suggest: boolean;
  suggestOrder: "frequency" | "alpha";
  suggestFromDone: boolean;
  dateFormat: DateFormat;
  weekStart: WeekStart;
  timeFormat: TimeFormat;
  quickShortcut: string;
  autoUpdate: boolean;
  sortBy: SortBy;
  groupBy: GroupBy;
  /** Windows: "Heute" is pinned as a note above all windows. */
  notePinned: boolean;
  /** Android: vibrate when checking off, swiping and adding. */
  haptics: boolean;
  /** Android: soft sound when checking off (never in silent or vibrate mode). */
  sounds: boolean;
}

export const defaultSettings: Settings = {
  version: 1,
  setupDone: false,
  language: "system",
  theme: "system",
  accent: "green",
  density: "standard",
  fontSize: 13,
  strikeDone: true,
  showRaw: false,
  todoPath: "",
  donePath: "",
  todoLabel: "",
  doneLabel: "",
  autoArchive: true,
  watchExternal: true,
  autostart: false,
  backupDays: 0,
  addCreationDate: true,
  defaultPriority: "",
  suggest: true,
  suggestOrder: "frequency",
  suggestFromDone: false,
  dateFormat: "dmy",
  weekStart: "monday",
  timeFormat: "24h",
  quickShortcut: "Ctrl+Alt+T",
  autoUpdate: true,
  sortBy: "due",
  groupBy: "date",
  notePinned: false,
  haptics: true,
  sounds: true,
};

export function mergeSettings(raw: unknown): Settings {
  if (!raw || typeof raw !== "object") return { ...defaultSettings };
  return { ...defaultSettings, ...(raw as Partial<Settings>), version: 1 };
}

export interface SettingsApi {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
}

export const SettingsContext = createContext<SettingsApi>({ settings: defaultSettings, update: () => {} });

export function useSettings() {
  return useContext(SettingsContext);
}

export const ACCENTS: Record<AccentName, { light: [string, string, string, string]; dark: [string, string, string, string] }> = {
  // [accent, hover, soft, on-accent]
  green: { light: ["#1D7657", "#17654A", "#E2F1EA", "#FFFFFF"], dark: ["#4DC393", "#62D1A3", "#1C3A2E", "#0C1F17"] },
  blue: { light: ["#2F62D8", "#2552BD", "#E5ECFB", "#FFFFFF"], dark: ["#7EA2F2", "#96B4F5", "#1E2A45", "#0B1530"] },
  purple: { light: ["#7A4FD6", "#6840BF", "#EFE9FB", "#FFFFFF"], dark: ["#B59BF0", "#C5AFF4", "#2D2545", "#170E30"] },
  orange: { light: ["#D0582A", "#B64A20", "#FBEBE3", "#FFFFFF"], dark: ["#F2946A", "#F5A983", "#3F2419", "#2A1105"] },
  raspberry: { light: ["#B8325A", "#A0284D", "#FAE6EC", "#FFFFFF"], dark: ["#EE8AA8", "#F2A1B9", "#3D1E28", "#2A0A14"] },
  graphite: { light: ["#55585E", "#46494E", "#ECECEC", "#FFFFFF"], dark: ["#B4B7BD", "#C6C8CD", "#2E2F33", "#16171A"] },
};
