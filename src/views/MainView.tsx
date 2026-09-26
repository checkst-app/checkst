import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import {
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  Ellipsis,
  FileText,
  Layers,
  ListFilter,
  Plus,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import type { UpdateState } from "../App";
import { Sidebar } from "../components/Sidebar";
import { SyntaxInput, type SyntaxInputHandle } from "../components/SyntaxInput";
import { TaskRow } from "../components/TaskRow";
import { Keycap, type MenuItem, MenuButton } from "../components/ui";
import { type FocusRequest, fileName } from "../lib/backend";
import { todayIso } from "../lib/dates";
import { useT } from "../lib/i18n";
import { type GroupBy, type SortBy, useSettings } from "../lib/settings";
import { useTodos } from "../lib/store";
import type { Task } from "../lib/todo";
import { countTasks, type Filters, groupTasks, noFilters, selectTasks, type View } from "../lib/views";
import { SettingsView, type SettingsTab } from "./SettingsView";
import { TaskDialog } from "./TaskDialog";

const GROUP_LIMIT = 12;

function useToday() {
  const [today, setToday] = useState(todayIso);
  useEffect(() => {
    const id = window.setInterval(() => setToday(todayIso()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  return today;
}

export function MainView({ update, onCheckUpdate }: { update: UpdateState; onCheckUpdate: () => void }) {
  const store = useTodos();
  const today = useToday();
  const [view, setView] = useState<View>({ kind: "all" });
  const [page, setPage] = useState<"tasks" | "settings">("tasks");
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("files");
  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState<{ mode: "create" } | { mode: "edit"; task: Task } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const counts = useMemo(() => countTasks(store.tasks, store.archived, today), [store.tasks, store.archived, today]);
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);
  const [focusTarget, setFocusTarget] = useState<{ line: number; raw: string; nonce: number } | null>(null);

  // Jump to a task from the quick-capture bar ("In checkst öffnen", click on a task).
  useEffect(() => {
    const un = listen<FocusRequest>("focus-line", (e) => {
      setPage("tasks");
      setView({ kind: "all" });
      setSearch("");
      setFocusRequest(e.payload);
    });
    return () => {
      un.then((f) => f());
    };
  }, []);

  // Resolve the request once the task is loaded (a freshly added line arrives a moment later).
  useEffect(() => {
    if (!focusRequest) return;
    const task =
      (focusRequest.raw ? store.tasks.find((x) => x.raw === focusRequest.raw) : undefined) ??
      store.tasks.find((x) => x.line === focusRequest.line - 1);
    if (!task) {
      const giveUp = window.setTimeout(() => setFocusRequest(null), 3000);
      return () => window.clearTimeout(giveUp);
    }
    setFocusTarget({ line: task.line, raw: task.raw, nonce: Date.now() });
    if (focusRequest.edit) setDialog({ mode: "edit", task });
    setFocusRequest(null);
  }, [focusRequest, store.tasks]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (dialog) return;
      if (e.ctrlKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        setDialog({ mode: "create" });
      } else if (e.ctrlKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setPage("tasks");
        searchRef.current?.focus();
        searchRef.current?.select();
      } else if (e.ctrlKey && e.key === ",") {
        e.preventDefault();
        setPage("settings");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dialog]);

  return (
    <div className="body">
      <Sidebar
        ref={searchRef}
        view={view}
        onView={(v) => {
          setView(v);
          setPage("tasks");
        }}
        counts={counts}
        search={search}
        onSearch={(q) => {
          setSearch(q);
          setPage("tasks");
        }}
        onNewTask={() => setDialog({ mode: "create" })}
        onSettings={() => {
          if (update.phase === "available") setSettingsTab("about");
          setPage("settings");
        }}
        settingsActive={page === "settings"}
        update={update}
      />
      <div className="content">
        {page === "tasks" ? (
          <TasksPane
            view={view}
            setView={setView}
            search={search}
            today={today}
            counts={counts}
            focusTarget={focusTarget}
            onEdit={(task) => setDialog({ mode: "edit", task })}
          />
        ) : (
          <SettingsView tab={settingsTab} onTab={setSettingsTab} update={update} onCheckUpdate={onCheckUpdate} />
        )}
        {dialog && (
          <TaskDialog
            mode={dialog.mode}
            task={dialog.mode === "edit" ? dialog.task : undefined}
            onClose={() => setDialog(null)}
            defaultProject={view.kind === "project" ? view.name : undefined}
            defaultContext={view.kind === "context" ? view.name : undefined}
          />
        )}
      </div>
    </div>
  );
}

function TasksPane({
  view,
  setView,
  search,
  today,
  counts,
  focusTarget,
  onEdit,
}: {
  view: View;
  setView: (v: View) => void;
  search: string;
  today: string;
  counts: ReturnType<typeof countTasks>;
  focusTarget: { line: number; raw: string; nonce: number } | null;
  onEdit: (t: Task) => void;
}) {
  const { t } = useT();
  const store = useTodos();
  const { settings, update } = useSettings();
  const [filters, setFilters] = useState<Filters>(noFilters);
  const [selected, setSelected] = useState<{ line: number; raw: string } | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ done: true });
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<{ text: string; undo: () => void } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const quickRef = useRef<SyntaxInputHandle>(null);

  const sel = useMemo(() => selectTasks(store.tasks, store.archived, view, search, filters, today), [store.tasks, store.archived, view, search, filters, today]);
  const groups = useMemo(() => groupTasks(sel.open, settings.groupBy, settings.sortBy, today), [sel.open, settings.groupBy, settings.sortBy, today]);

  // Flat list of visible tasks, for keyboard navigation.
  const visible = useMemo(() => {
    const out: Task[] = [];
    for (const g of groups) {
      if (collapsed[g.key]) continue;
      out.push(...(expanded[g.key] ? g.tasks : g.tasks.slice(0, GROUP_LIMIT)));
    }
    if (view.kind === "done" || !collapsed.done) out.push(...sel.done);
    if (view.kind === "done" && !collapsed.archived) out.push(...sel.archived);
    return out;
  }, [groups, collapsed, expanded, sel, view.kind]);

  const selectedTask = useMemo(() => {
    if (!selected) return undefined;
    return visible.find((x) => x.raw === selected.raw && x.line === selected.line) ?? visible.find((x) => x.raw === selected.raw);
  }, [selected, visible]);

  useEffect(() => {
    if (focusTarget) setSelected({ line: focusTarget.line, raw: focusTarget.raw });
  }, [focusTarget]);

  useEffect(() => {
    if (!selectedTask) return;
    listRef.current?.querySelector(`[data-line="${selectedTask.line}"]`)?.scrollIntoView({ block: "nearest" });
  }, [selectedTask]);

  const showToast = useCallback((text: string, undo: () => void) => {
    setToast({ text, undo });
  }, []);
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 6000);
    return () => window.clearTimeout(id);
  }, [toast]);

  const onDelete = useCallback(
    async (task: Task) => {
      const undo = await store.deleteTask(task);
      showToast(t("row.undoDelete"), () => {
        undo();
        setToast(null);
      });
    },
    [store, showToast, t],
  );

  // Keyboard navigation inside the list.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, .popover, .dialog")) return;
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      const idx = selectedTask ? visible.indexOf(selectedTask) : -1;
      const pick = (i: number) => {
        const task = visible[Math.max(0, Math.min(visible.length - 1, i))];
        if (task) setSelected({ line: task.line, raw: task.raw });
      };
      if (e.key === "ArrowDown") {
        e.preventDefault();
        pick(idx + 1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        pick(idx <= 0 ? 0 : idx - 1);
      } else if (!selectedTask) {
        if (e.key === "n") {
          e.preventDefault();
          quickRef.current?.focus();
        }
        return;
      } else if (e.key === " ") {
        e.preventDefault();
        if (selectedTask.line >= 0) store.toggleDone(selectedTask);
      } else if (e.key === "Enter" || e.key === "F2") {
        e.preventDefault();
        if (selectedTask.line >= 0) onEdit(selectedTask);
      } else if (e.key === "Delete") {
        e.preventDefault();
        if (selectedTask.line >= 0) {
          pick(idx + 1 < visible.length ? idx + 1 : idx - 1);
          onDelete(selectedTask);
        }
      } else if (e.key === "n") {
        e.preventDefault();
        quickRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, selectedTask, store, onEdit, onDelete]);

  const title =
    view.kind === "project"
      ? `+${view.name}`
      : view.kind === "context"
        ? `@${view.name}`
        : t(
            view.kind === "all"
              ? "nav.all"
              : view.kind === "today"
                ? "nav.today"
                : view.kind === "upcoming"
                  ? "nav.upcoming"
                  : view.kind === "prioA"
                    ? "nav.priorityA"
                    : "nav.done",
          );

  const sortLabels: Record<SortBy, string> = { due: t("sort.due"), priority: t("sort.priority"), file: t("sort.file"), alpha: t("sort.alpha") };
  const groupLabels: Record<GroupBy, string> = { date: t("group.date"), project: t("group.project"), priority: t("group.priority"), none: t("group.none") };
  const sortItems: MenuItem[] = (Object.keys(sortLabels) as SortBy[]).map((k) => ({
    key: k,
    label: sortLabels[k],
    checked: settings.sortBy === k,
    onSelect: () => update({ sortBy: k }),
  }));
  const groupItems: MenuItem[] = (Object.keys(groupLabels) as GroupBy[]).map((k) => ({
    key: k,
    label: groupLabels[k],
    checked: settings.groupBy === k,
    onSelect: () => update({ groupBy: k }),
  }));
  const activeFilters = (filters.due !== "any" ? 1 : 0) + filters.priorities.length;
  const togglePrio = (p: string) =>
    setFilters((f) => ({ ...f, priorities: f.priorities.includes(p) ? f.priorities.filter((x) => x !== p) : [...f.priorities, p] }));
  const filterItems: MenuItem[] = [
    { key: "has", label: t("filter.hasDue"), checked: filters.due === "has", onSelect: () => setFilters((f) => ({ ...f, due: f.due === "has" ? "any" : "has" })) },
    { key: "none", label: t("filter.noDue"), checked: filters.due === "none", onSelect: () => setFilters((f) => ({ ...f, due: f.due === "none" ? "any" : "none" })) },
    { key: "d1", label: "", divider: true },
    ...["A", "B", "C"].map((p) => ({ key: p, label: t("filter.prio", { p }), checked: filters.priorities.includes(p), onSelect: () => togglePrio(p) })),
    { key: "d2", label: "", divider: true },
    { key: "reset", label: t("filter.reset"), onSelect: () => setFilters(noFilters) },
  ];
  const moreItems: MenuItem[] = [
    { key: "archive", label: t("more.archive"), onSelect: () => store.archive() },
    { key: "reload", label: t("more.reload"), onSelect: () => store.reload() },
    { key: "d", label: "", divider: true },
    { key: "open", label: t("more.openFile"), onSelect: () => settings.todoPath && openPath(settings.todoPath) },
    { key: "reveal", label: t("more.reveal"), onSelect: () => settings.todoPath && revealItemInDir(settings.todoPath) },
  ];

  const selectTask = useCallback((task: Task) => setSelected({ line: task.line, raw: task.raw }), []);
  const replace = useCallback((task: Task, raw: string) => store.replaceLine(task, raw), [store]);
  const rowProps = {
    today,
    onSelect: selectTask,
    onToggle: store.toggleDone,
    onEdit,
    onDelete,
    onReplace: replace,
    onFilterProject: (name: string) => setView({ kind: "project", name }),
    onFilterContext: (name: string) => setView({ kind: "context", name }),
  };

  const isEmpty = groups.length === 0 && sel.done.length === 0 && sel.archived.length === 0;
  const file = fileName(settings.todoPath || "todo.txt");

  return (
    <div className="tasks-pane">
      <header className="list-header">
        <div className="title-group">
          <h1>{title}</h1>
          <div className="summary">
            {view.kind === "done" ? (
              <span>{t("list.open", { n: counts.all })}</span>
            ) : (
              <span>{t("list.open", { n: sel.open.length })}</span>
            )}
            {counts.overdue > 0 && view.kind !== "done" && (
              <>
                <span className="divider" />
                <span className="overdue">{t("list.overdue", { n: counts.overdue })}</span>
              </>
            )}
            <span className="divider" />
            <span className="file">{file}</span>
          </div>
        </div>
        <div className="controls">
          <MenuButton items={sortItems} icon={ArrowUpDown}>
            {t("sort.label", { v: sortLabels[settings.sortBy] })}
          </MenuButton>
          <MenuButton items={filterItems} icon={ListFilter} className={activeFilters ? "btn-filter-active" : ""}>
            {activeFilters ? t("filter.active", { n: activeFilters }) : t("filter.label")}
          </MenuButton>
          <MenuButton items={groupItems} icon={Layers}>
            {t("group.label", { v: groupLabels[settings.groupBy] })}
          </MenuButton>
          <span className="controls-sep" />
          <MenuButton items={moreItems} icon={Ellipsis} variant="ghost" align="right" />
        </div>
      </header>

      <QuickAdd inputRef={quickRef} defaultToken={view.kind === "project" ? `+${view.name}` : view.kind === "context" ? `@${view.name}` : undefined} />

      <div className="task-list" ref={listRef}>
        {isEmpty && (
          <div className="empty">
            <CircleCheck size={28} />
            <b>{t("empty.title")}</b>
            <span>{search ? t("empty.search", { q: search }) : view.kind === "all" ? t("empty.all") : t("empty.filtered")}</span>
          </div>
        )}
        {groups.map((g) => {
          const isCollapsed = collapsed[g.key];
          const shown = expanded[g.key] ? g.tasks : g.tasks.slice(0, GROUP_LIMIT);
          const hidden = g.tasks.length - shown.length;
          return (
            <section key={g.key} className="group">
              <button type="button" className="group-header" onClick={() => setCollapsed((c) => ({ ...c, [g.key]: !c[g.key] }))}>
                {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                <span className={`group-title ${g.tone === "danger" ? "danger" : ""}`}>{g.title ?? t(g.titleKey, g.titleVars)}</span>
                <span className="group-count">{g.tasks.length}</span>
                <span className="group-rule" />
              </button>
              {!isCollapsed &&
                shown.map((task) => <TaskRow key={`${task.line}:${task.raw}`} task={task} selected={task === selectedTask} {...rowProps} />)}
              {!isCollapsed && (hidden > 0 || expanded[g.key]) && g.tasks.length > GROUP_LIMIT && (
                <button type="button" className="show-more" onClick={() => setExpanded((x) => ({ ...x, [g.key]: !x[g.key] }))}>
                  {expanded[g.key] ? t("grp.showLess") : t("grp.showMore", { n: hidden })}
                  <ChevronDown size={13} style={expanded[g.key] ? { transform: "rotate(180deg)" } : undefined} />
                </button>
              )}
            </section>
          );
        })}

        {view.kind !== "done" && sel.done.length > 0 && (
          <section className="group">
            <button type="button" className="done-collapsed" onClick={() => setCollapsed((c) => ({ ...c, done: !c.done }))}>
              {collapsed.done ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
              <CircleCheck size={14} className="accent" />
              <span className="group-title muted">{t("grp.done")}</span>
              <span className="group-count">{sel.done.length}</span>
              <span className="spacer" />
              <span className="hint">{t("grp.notArchived")}</span>
            </button>
            {!collapsed.done && (
              <div className="done-rows">
                {sel.done.map((task) => (
                  <TaskRow key={`${task.line}:${task.raw}`} task={task} selected={task === selectedTask} {...rowProps} />
                ))}
              </div>
            )}
          </section>
        )}

        {view.kind === "done" && (
          <>
            {sel.done.length > 0 && (
              <section className="group">
                <div className="group-header static">
                  <span className="group-title">{t("grp.notArchived")}</span>
                  <span className="group-count">{sel.done.length}</span>
                  <span className="group-rule" />
                </div>
                {sel.done.map((task) => (
                  <TaskRow key={`${task.line}:${task.raw}`} task={task} selected={task === selectedTask} {...rowProps} />
                ))}
              </section>
            )}
            {sel.archived.length > 0 && (
              <section className="group">
                <button type="button" className="group-header" onClick={() => setCollapsed((c) => ({ ...c, archived: !c.archived }))}>
                  {collapsed.archived ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                  <span className="group-title">{t("grp.archived")}</span>
                  <span className="group-count">{sel.archived.length}</span>
                  <span className="group-rule" />
                </button>
                {!collapsed.archived &&
                  [...sel.archived]
                    .reverse()
                    .slice(0, expanded.archived ? undefined : 50)
                    .map((task) => <TaskRow key={`a${task.line}`} task={task} selected={task === selectedTask} {...rowProps} />)}
                {!collapsed.archived && sel.archived.length > 50 && (
                  <button type="button" className="show-more" onClick={() => setExpanded((x) => ({ ...x, archived: !x.archived }))}>
                    {expanded.archived ? t("grp.showLess") : t("grp.showMore", { n: sel.archived.length - 50 })}
                  </button>
                )}
              </section>
            )}
          </>
        )}
      </div>

      {toast && (
        <div className="toast">
          <span>{toast.text}</span>
          <button type="button" onClick={toast.undo}>
            {t("row.undo")}
          </button>
        </div>
      )}

      <StatusBar task={selectedTask} />
    </div>
  );
}

function QuickAdd({ inputRef, defaultToken }: { inputRef: React.RefObject<SyntaxInputHandle | null>; defaultToken?: string }) {
  const { t } = useT();
  const store = useTodos();
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);

  const submit = async () => {
    let v = value.trim();
    if (!v) return;
    if (defaultToken && !v.split(" ").includes(defaultToken)) v = `${v} ${defaultToken}`;
    await store.addFromInput(v);
    setValue("");
  };

  return (
    <div className="quick-add-wrap">
      <div className={`quick-add ${focused ? "focused" : ""}`} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} onClick={() => inputRef.current?.focus()}>
        <Plus size={16} className="accent" />
        <SyntaxInput
          ref={inputRef}
          variant="quickadd"
          value={value}
          onChange={setValue}
          placeholder={t("quick.placeholder")}
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          onEscape={() => {
            setValue("");
            (document.activeElement as HTMLElement)?.blur();
          }}
        />
        <span className="quick-hint">
          {t("quick.add")}
          <Keycap>Enter</Keycap>
        </span>
      </div>
      <div className="syntax-help">
        <span>
          <code className="tok-prio-a">(A)</code>
          {t("syntax.priority")}
        </span>
        <span>
          <code className="tok-project">+Projekt</code>
          {t("syntax.project")}
        </span>
        <span>
          <code className="tok-context">@Kontext</code>
          {t("syntax.context")}
        </span>
        <span>
          <code className="tok-due">{t("syntax.dueToken")}</code>
          {t("syntax.due")}
        </span>
      </div>
    </div>
  );
}

function StatusBar({ task }: { task?: Task }) {
  const { t } = useT();
  const { file } = useTodos();
  return (
    <footer className="status-bar">
      <FileText size={13} />
      {task && task.line >= 0 ? (
        <>
          <span>{t("statusbar.line", { n: task.line + 1 })}</span>
          <span className="divider" />
          <span className="raw">{task.raw}</span>
        </>
      ) : (
        <span>{t("statusbar.noSelection")}</span>
      )}
      <span className="spacer" />
      <span>{file.bom ? t("statusbar.bom") : "UTF-8"}</span>
      <span>{file.eol === "\r\n" ? "CRLF" : "LF"}</span>
    </footer>
  );
}
