import { getVersion } from "@tauri-apps/api/app";
import { CalendarDays, Inbox, LayoutList, Search, Settings, Sun, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Providers, useSettingsState } from "../App";
import { backend } from "../lib/backend";
import { formatShort, todayIso } from "../lib/dates";
import { type I18nKey, useT } from "../lib/i18n";
import type { Settings as SettingsT } from "../lib/settings";
import { TodoContext, useTodoStore, useTodos } from "../lib/store";
import { completeLine, type Task, uncompleteLine } from "../lib/todo";
import { groupTasks, noFilters, selectTasks, type View, viewDefaults } from "../lib/views";
import { useBack } from "./back";
import { AppBar, IconButton, SnackProvider, useSnack, useSystemBars } from "./common";
import { EditSheet } from "./EditSheet";
import { ListsScreen } from "./ListsScreen";
import { QuickAdd } from "./QuickAdd";
import { type MobileUpdate, SettingsScreen, updatePending } from "./SettingsScreen";
import { SetupScreen } from "./SetupScreen";
import { CollapsedGroup, Group, TaskRow } from "./TaskList";
import { isNewer, latestRelease } from "./updates";
import "./mobile.css";

type Tab = "today" | "all" | "upcoming" | "lists";

export default function MobileApp() {
  const { settings, update } = useSettingsState();
  useEffect(() => {
    document.body.classList.add("mobile");
  }, []);
  if (!settings) return null;
  return (
    <Providers settings={settings} update={update}>
      <SnackProvider>{settings.setupDone ? <MobileMain settings={settings} /> : <SetupScreen />}</SnackProvider>
    </Providers>
  );
}

function MobileMain({ settings }: { settings: SettingsT }) {
  const store = useTodoStore(settings, true);
  const [tab, setTab] = useState<Tab>("today");
  const [pushed, setPushed] = useState<View | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [search, setSearch] = useState<string | null>(null);
  const [typing, setTyping] = useState(false);
  const [version, setVersion] = useState("");
  const [update, setUpdate] = useState<MobileUpdate>({ phase: "idle" });

  useBack(!!pushed, () => setPushed(null));
  useBack(showSettings, () => setShowSettings(false));
  useBack(search !== null, () => setSearch(null));
  useBack(!!editing, () => setEditing(null));

  const storeRef = useRef(store);
  storeRef.current = store;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // Changes from Syncthing & co. arrive while the app is in the background: reload on return,
  // and archive completed tasks when leaving (like closing the window on desktop).
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible") storeRef.current.reload().catch(() => {});
      else if (settingsRef.current.autoArchive && settingsRef.current.donePath) storeRef.current.archive().catch(() => 0);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const checkUpdate = useCallback(async (manual: boolean) => {
    if (manual) setUpdate({ phase: "checking" });
    try {
      const current = await getVersion();
      const latest = await latestRelease();
      if (latest && isNewer(latest.version, current)) setUpdate({ phase: "available", ...latest });
      else if (manual) setUpdate({ phase: "uptodate" });
    } catch {
      if (manual) setUpdate({ phase: "error" });
    }
  }, []);

  useEffect(() => {
    getVersion().then(setVersion).catch(() => {});
    if (settings.autoUpdate) checkUpdate(false);
  }, []);

  const updateRef = useRef(update);
  updateRef.current = update;

  // Opens the system installer for the downloaded APK. Without "Install unknown apps" Android
  // shows that setting first; checkst tries again when it comes back to the foreground.
  const openInstaller = useCallback(async (version: string, url: string, askPermission: boolean) => {
    try {
      const r = await backend.installApk(askPermission);
      setUpdate({ phase: r.needsPermission ? "permission" : "downloaded", version, url });
    } catch {
      // The APK is gone (e.g. the cache was cleared): the next tap downloads it again.
      setUpdate({ phase: "downloadError", version, url });
    }
  }, []);

  const installUpdate = useCallback(async () => {
    const u = updateRef.current;
    if (!("version" in u) || u.phase === "downloading") return;
    const { version, url } = u;
    if (u.phase === "permission" || u.phase === "downloaded") return openInstaller(version, url, true);
    setUpdate({ phase: "downloading", version, url, progress: null });
    const poll = window.setInterval(() => {
      backend
        .apkProgress()
        .then(({ downloaded, total }) =>
          setUpdate((cur) => (cur.phase === "downloading" ? { ...cur, progress: total > 0 ? Math.min(1, downloaded / total) : null } : cur)),
        )
        .catch(() => {});
    }, 300);
    try {
      await backend.downloadApk(url);
    } catch {
      setUpdate({ phase: "downloadError", version, url });
      return;
    } finally {
      window.clearInterval(poll);
    }
    await openInstaller(version, url, true);
  }, [openInstaller]);

  // Back from the "Install unknown apps" setting: open the installer if it is allowed now.
  useEffect(() => {
    const onVisible = () => {
      const u = updateRef.current;
      if (document.visibilityState === "visible" && u.phase === "permission") openInstaller(u.version, u.url, false);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [openInstaller]);

  useSystemBars("--surface", !!editing, !showSettings);

  // The snackbar floats just above quick add and navigation.
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = document.documentElement;
    const el = bottom.current;
    if (!el) {
      root.style.setProperty("--m-bottom", "0px");
      return;
    }
    const ro = new ResizeObserver(() => root.style.setProperty("--m-bottom", `${el.offsetHeight}px`));
    ro.observe(el);
    return () => ro.disconnect();
  }, [showSettings]);

  const view: View | null = pushed ?? (tab === "lists" ? null : { kind: tab });
  const openSearch = () => setSearch("");

  return (
    <TodoContext.Provider value={store}>
      <div className={`m-app ${typing ? "typing" : ""}`}>
        {showSettings ? (
          <SettingsScreen
            onBack={() => setShowSettings(false)}
            version={version}
            update={update}
            onCheckUpdate={() => checkUpdate(true)}
            onInstallUpdate={installUpdate}
          />
        ) : (
          <>
            {view ? (
              <ListScreen
                view={view}
                search={search}
                onSearch={setSearch}
                onOpenSearch={openSearch}
                onBack={pushed ? () => setPushed(null) : undefined}
                onSettings={() => setShowSettings(true)}
                onEdit={setEditing}
                updateDot={updatePending(update)}
              />
            ) : (
              <ListsScreen
                onOpen={(v) => setPushed(v)}
                onSearch={() => {
                  setTab("all");
                  openSearch();
                }}
                onSettings={() => setShowSettings(true)}
                updateDot={updatePending(update)}
              />
            )}
            <div className="m-bottom" ref={bottom}>
              {view && view.kind !== "done" && (
                <QuickAdd
                  onFocusChange={setTyping}
                  extraTokens={viewDefaults(view, todayIso())}
                />
              )}
              {!typing && (
                <BottomNav
                  tab={pushed ? "lists" : tab}
                  onChange={(t) => {
                    setPushed(null);
                    setSearch(null);
                    setTab(t);
                  }}
                />
              )}
            </div>
          </>
        )}
        {editing && <EditSheet task={editing} onClose={() => setEditing(null)} />}
      </div>
    </TodoContext.Provider>
  );
}

function BottomNav({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  const { t } = useT();
  const items: [Tab, typeof Sun, I18nKey][] = [
    ["today", Sun, "m.today"],
    ["all", Inbox, "m.all"],
    ["upcoming", CalendarDays, "m.upcoming"],
    ["lists", LayoutList, "m.lists"],
  ];
  return (
    <nav className="m-nav">
      {items.map(([key, Icon, label]) => (
        <button key={key} type="button" className={`m-nav-item ${tab === key ? "active" : ""}`} aria-current={tab === key ? "page" : undefined} onClick={() => onChange(key)}>
          <span className="m-nav-pill">
            <Icon size={20} />
          </span>
          <span className="m-nav-label">{t(label)}</span>
        </button>
      ))}
    </nav>
  );
}

function viewTitle(view: View, t: ReturnType<typeof useT>["t"]): string {
  switch (view.kind) {
    case "today":
      return t("m.today");
    case "all":
      return t("nav.all");
    case "upcoming":
      return t("m.upcoming");
    case "prioA":
      return t("nav.priorityA");
    case "done":
      return t("nav.done");
    case "project":
      return `+${view.name}`;
    case "context":
      return `@${view.name}`;
  }
}

function ListScreen({
  view,
  search,
  onSearch,
  onOpenSearch,
  onBack,
  onSettings,
  onEdit,
  updateDot,
}: {
  view: View;
  search: string | null;
  onSearch: (q: string | null) => void;
  onOpenSearch: () => void;
  onBack?: () => void;
  onSettings: () => void;
  onEdit: (task: Task) => void;
  updateDot?: boolean;
}) {
  const { t, lang } = useT();
  const store = useTodos();
  const snack = useSnack();
  const today = todayIso();
  const query = search ?? "";
  const sel = useMemo(() => selectTasks(store.tasks, store.archived, view, query, noFilters, today), [store.tasks, store.archived, view, query, today]);

  const groups = useMemo(() => {
    if (view.kind !== "upcoming") return groupTasks(sel.open, "date", "due", today);
    // Upcoming: one group per day.
    const byDay = new Map<string, Task[]>();
    for (const task of groupTasks(sel.open, "none", "due", today)[0]?.tasks ?? []) {
      const d = task.due ?? "";
      byDay.set(d, [...(byDay.get(d) ?? []), task]);
    }
    return [...byDay.entries()].map(([d, tasks]) => ({ key: d, titleKey: "grp.tasks" as I18nKey, titleVars: undefined as Record<string, string> | undefined, title: formatShort(d, lang, today), tone: "normal" as const, tasks }));
  }, [sel.open, view.kind, today, lang]);

  // Done: in "Today" everything checked off today (also already archived), elsewhere the done ones in the view.
  const done = useMemo(() => {
    if (view.kind === "today") {
      const fromFile = store.tasks.filter((x) => x.done && x.completionDate === today && (!query || x.raw.toLowerCase().includes(query.toLowerCase())));
      const archived = store.archived.filter((x) => x.completionDate === today && (!query || x.raw.toLowerCase().includes(query.toLowerCase())));
      return [...fromFile, ...archived];
    }
    return sel.done;
  }, [view.kind, store.tasks, store.archived, sel.done, today, query]);

  const toggle = async (task: Task) => {
    const next = task.done ? uncompleteLine(task) : completeLine(task, today);
    await store.toggleDone(task).catch(() => {});
    snack(task.done ? t("m.reopened") : t("m.completed"), {
      label: t("m.undo"),
      run: () => void store.replaceLine({ ...task, raw: next }, task.raw).catch(() => {}),
    });
  };

  const open = sel.open.length;
  const overdue = sel.open.filter((x) => x.due && x.due < today).length;
  const empty = groups.length === 0 && done.length === 0 && sel.archived.length === 0;

  return (
    <>
      {search !== null ? (
        <header className="m-appbar m-searchbar">
          <Search size={19} />
          <input autoFocus value={search} placeholder={t("m.searchPlaceholder")} onChange={(e) => onSearch(e.target.value)} enterKeyHint="search" />
          <button type="button" className="m-icon-btn" aria-label={t("m.cancel")} onClick={() => onSearch(null)}>
            <X size={20} />
          </button>
        </header>
      ) : (
        <AppBar
          title={viewTitle(view, t)}
          onBack={onBack}
          summary={
            view.kind === "done" ? undefined : (
              <>
                <span>{t("list.open", { n: open })}</span>
                {overdue > 0 && (
                  <>
                    <i />
                    <span className="tone-danger">{t("list.overdue", { n: overdue })}</span>
                  </>
                )}
              </>
            )
          }
          actions={
            <>
              <IconButton icon={Search} label={t("nav.search")} onClick={onOpenSearch} />
              <IconButton icon={Settings} label={t("nav.settings")} onClick={onSettings} dot={updateDot} />
            </>
          }
        />
      )}
      <div className="m-scroll m-list">
        {empty && (
          <div className="m-empty">
            <b>{query ? t("m.noResults") : view.kind === "today" ? t("m.emptyToday") : t("m.empty")}</b>
            {!query && view.kind !== "done" && <span>{t("m.emptyHint")}</span>}
          </div>
        )}
        {groups.map((g) => (
          <Group key={g.key} title={g.title ?? t(g.titleKey, g.titleVars)} count={g.tasks.length} tone={g.tone === "danger" ? "danger" : undefined}>
            {g.tasks.map((task) => (
              <TaskRow key={`${task.line}:${task.raw}`} task={task} today={today} onToggle={toggle} onOpen={onEdit} />
            ))}
          </Group>
        ))}
        {view.kind === "done" ? (
          <>
            {done.length > 0 && (
              <Group title={t("grp.notArchived")} count={done.length}>
                {done.map((task) => (
                  <TaskRow key={`${task.line}:${task.raw}`} task={task} today={today} onToggle={toggle} onOpen={onEdit} />
                ))}
              </Group>
            )}
            {sel.archived.length > 0 && (
              <Group title={t("grp.archived")} count={sel.archived.length}>
                {sel.archived.map((task) => (
                  <TaskRow key={`${task.line}:${task.raw}`} task={task} today={today} onToggle={toggle} onOpen={onEdit} readOnly />
                ))}
              </Group>
            )}
          </>
        ) : (
          done.length > 0 && (
            <CollapsedGroup title={view.kind === "today" ? t("m.doneToday") : t("nav.done")} count={done.length}>
              {done.map((task) => (
                <TaskRow key={`${task.line}:${task.raw}`} task={task} today={today} onToggle={toggle} onOpen={onEdit} readOnly={task.line < 0} />
              ))}
            </CollapsedGroup>
          )
        )}
      </div>
    </>
  );
}
