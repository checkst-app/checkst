import { listen } from "@tauri-apps/api/event";
import { LogicalSize, getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TitleBar } from "./components/TitleBar";
import { applyAppIcon } from "./lib/appIcon";
import { backend, type UpdateStatus } from "./lib/backend";
import type { Lang } from "./lib/dates";
import { I18nContext, makeT, systemLang } from "./lib/i18n";
import { type Settings, SettingsContext, mergeSettings, useSettings } from "./lib/settings";
import { TodoContext, useTodoStore } from "./lib/store";
import { useApplyTheme } from "./lib/theme";
import { MainView } from "./views/MainView";
import { QuickCapture } from "./views/QuickCapture";
import { Setup } from "./views/Setup";
import { TodayNote, useNoteWindow } from "./views/TodayNote";

export function useSettingsState() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const lastSaved = useRef("");
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    backend
      .loadSettings()
      .then((raw) => {
        const s = mergeSettings(raw);
        lastSaved.current = JSON.stringify(s);
        setSettings(s);
      })
      .catch(() => setSettings(mergeSettings(null)));
    const un = listen<Settings>("settings-changed", (e) => {
      const json = JSON.stringify(e.payload);
      if (json === lastSaved.current) return;
      lastSaved.current = json;
      setSettings(mergeSettings(e.payload));
    });
    return () => {
      un.then((f) => f());
    };
  }, []);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((cur) => {
      if (!cur) return cur;
      const next = { ...cur, ...patch };
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        lastSaved.current = JSON.stringify(next);
        backend.saveSettings(next).catch(() => {});
      }, 250);
      return next;
    });
  }, []);

  return { settings, update };
}

export function useLang(settings: Settings | null): Lang {
  return settings?.language && settings.language !== "system" ? settings.language : systemLang();
}

export type UpdateState =
  | { phase: "idle" }
  | { phase: "checking" }
  | { phase: "available"; version: string }
  | { phase: "downloading"; version: string }
  | { phase: "ready"; version: string }
  | { phase: "uptodate" }
  | { phase: "unsupported" }
  | { phase: "error"; message: string };

export function App() {
  const label = useMemo(() => getCurrentWindow().label, []);
  return label === "quick" ? <QuickRoot /> : label === "note" ? <NoteRoot /> : <MainRoot />;
}

export function Providers({ settings, update, children }: { settings: Settings; update: (p: Partial<Settings>) => void; children: React.ReactNode }) {
  const lang = useLang(settings);
  const i18n = useMemo(() => ({ t: makeT(lang), lang }), [lang]);
  useApplyTheme(settings);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  return (
    <SettingsContext.Provider value={{ settings, update }}>
      <I18nContext.Provider value={i18n}>{children}</I18nContext.Provider>
    </SettingsContext.Provider>
  );
}

function QuickRoot() {
  const { settings, update } = useSettingsState();
  useEffect(() => {
    document.body.classList.add("quick");
  }, []);
  if (!settings) return null;
  return (
    <Providers settings={settings} update={update}>
      <QuickStore settings={settings} />
    </Providers>
  );
}

function QuickStore({ settings }: { settings: Settings }) {
  const store = useTodoStore(settings, settings.setupDone);
  return (
    <TodoContext.Provider value={store}>
      <QuickCapture />
    </TodoContext.Provider>
  );
}

function NoteRoot() {
  const { settings, update } = useSettingsState();
  useEffect(() => {
    document.body.classList.add("note-window");
  }, []);
  if (!settings) return null;
  return (
    <Providers settings={settings} update={update}>
      <NoteStore settings={settings} />
    </Providers>
  );
}

function NoteStore({ settings }: { settings: Settings }) {
  const pinned = settings.setupDone && settings.notePinned;
  const store = useTodoStore(settings, pinned);
  useNoteWindow(pinned);
  return <TodoContext.Provider value={store}>{pinned && <TodayNote />}</TodoContext.Provider>;
}

function MainRoot() {
  const { settings, update } = useSettingsState();
  const readySent = useRef(false);

  useEffect(() => {
    if (settings && !readySent.current) {
      readySent.current = true;
      const win = getCurrentWindow();
      const size = settings.setupDone ? new LogicalSize(1280, 800) : new LogicalSize(960, 640);
      win
        .setSize(size)
        .then(() => win.center())
        .catch(() => {})
        .finally(() => {
          // Wait one frame so the first paint is done before the window appears.
          requestAnimationFrame(() => backend.appReady());
        });
    }
  }, [settings]);

  // Taskbar and tray icon follow the accent color.
  const accent = settings?.accent;
  useEffect(() => {
    if (accent) applyAppIcon(accent).catch(() => {});
  }, [accent]);

  if (!settings) return null;
  return (
    <Providers settings={settings} update={update}>
      {settings.setupDone ? <MainStore settings={settings} /> : <SetupRoot />}
    </Providers>
  );
}

function SetupRoot() {
  return (
    <div className="window">
      <Setup
        onDone={async () => {
          const win = getCurrentWindow();
          await win.setSize(new LogicalSize(1280, 800));
          await win.center();
        }}
      />
    </div>
  );
}

function MainStore({ settings }: { settings: Settings }) {
  const store = useTodoStore(settings, true);
  const lang = useLang(settings);
  const t = useMemo(() => makeT(lang), [lang]);
  const [update, setUpdate] = useState<UpdateState>({ phase: "idle" });
  const { update: patchSettings } = useSettings();
  const storeRef = useRef(store);
  storeRef.current = store;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // Global quick-capture shortcut and tray labels.
  useEffect(() => {
    backend.setQuickShortcut(settings.quickShortcut).catch(() => {});
  }, [settings.quickShortcut]);
  useEffect(() => {
    backend.setTrayLabels(t("tray.open"), t("tray.newTask"), t("tray.pinToday"), settings.notePinned, t("tray.quit")).catch(() => {});
  }, [t, settings.notePinned]);

  // Tray: pin or unpin the today note.
  useEffect(() => {
    const un = listen("toggle-note", () => patchSettings({ notePinned: !settingsRef.current.notePinned }));
    return () => {
      un.then((f) => f());
    };
  }, [patchSettings]);

  // Archive on close / quit.
  useEffect(() => {
    const archiveIfWanted = async () => {
      if (settingsRef.current.autoArchive) await storeRef.current.archive().catch(() => 0);
    };
    const un1 = listen("main-hidden", archiveIfWanted);
    const un2 = listen("quit-requested", async () => {
      await archiveIfWanted();
      await backend.quitApp();
    });
    return () => {
      un1.then((f) => f());
      un2.then((f) => f());
    };
  }, []);

  const checkForUpdates = useCallback(async (manual: boolean) => {
    setUpdate({ phase: "checking" });
    try {
      const status: UpdateStatus = await backend.checkUpdate();
      if (!status.supported) return setUpdate({ phase: "unsupported" });
      if (status.readyToInstall && status.availableVersion) return setUpdate({ phase: "ready", version: status.availableVersion });
      if (!status.availableVersion) return setUpdate({ phase: "uptodate" });
      const version = status.availableVersion;
      if (!manual && !settingsRef.current.autoUpdate) return setUpdate({ phase: "available", version });
      setUpdate({ phase: "downloading", version });
      await backend.downloadUpdate();
      setUpdate({ phase: "ready", version });
    } catch (e) {
      setUpdate({ phase: "error", message: String(e) });
    }
  }, []);

  useEffect(() => {
    if (!settings.autoUpdate) return;
    const first = window.setTimeout(() => checkForUpdates(false), 8000);
    const every = window.setInterval(() => checkForUpdates(false), 6 * 60 * 60 * 1000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(every);
    };
  }, [settings.autoUpdate, checkForUpdates]);

  return (
    <TodoContext.Provider value={store}>
      <div className="window">
        <TitleBar title="checkst" />
        <MainView update={update} onCheckUpdate={() => checkForUpdates(true)} />
      </div>
    </TodoContext.Provider>
  );
}
