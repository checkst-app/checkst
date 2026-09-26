import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useState } from "react";
import { ACCENTS, type Settings } from "./settings";

export function useSystemDark(): boolean {
  const [dark, setDark] = useState(() => window.matchMedia("(prefers-color-scheme: dark)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const on = () => setDark(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return dark;
}

const ROW_HEIGHT = { compact: 32, standard: 38, relaxed: 46 } as const;

/** Applies theme, accent color, font size and density as CSS variables on <html>. */
export function useApplyTheme(settings: Settings): "light" | "dark" {
  const systemDark = useSystemDark();
  const mode = settings.theme === "system" ? (systemDark ? "dark" : "light") : settings.theme;

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = mode;
    const [accent, hover, soft, on] = ACCENTS[settings.accent]?.[mode] ?? ACCENTS.green[mode];
    root.style.setProperty("--accent", accent);
    root.style.setProperty("--accent-hover", hover);
    root.style.setProperty("--accent-soft", soft);
    root.style.setProperty("--on-accent", on);
    root.style.setProperty("--fs-task", `${settings.fontSize}px`);
    root.style.setProperty("--row-h", `${ROW_HEIGHT[settings.density]}px`);
    getCurrentWindow()
      .setTheme(settings.theme === "system" ? null : mode)
      .catch(() => {});
  }, [mode, settings.accent, settings.fontSize, settings.density, settings.theme]);

  return mode;
}
