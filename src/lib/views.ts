import { addDays, dueStatus, fromIso } from "./dates";
import type { I18nKey } from "./i18n";
import type { GroupBy, SortBy } from "./settings";
import type { Task } from "./todo";

export type View =
  | { kind: "all" }
  | { kind: "today" }
  | { kind: "upcoming" }
  | { kind: "prioA" }
  | { kind: "done" }
  | { kind: "project"; name: string }
  | { kind: "context"; name: string };

export interface Filters {
  due: "any" | "has" | "none";
  priorities: string[];
}

export const noFilters: Filters = { due: "any", priorities: [] };

export function sameView(a: View, b: View) {
  if (a.kind !== b.kind) return false;
  if ((a.kind === "project" || a.kind === "context") && (b.kind === "project" || b.kind === "context")) return a.name === b.name;
  return true;
}

function inView(t: Task, view: View, today: string): boolean {
  switch (view.kind) {
    case "all":
      return true;
    case "today":
      return !!t.due && t.due <= today;
    case "upcoming":
      return !!t.due && t.due > today;
    case "prioA":
      return t.priority === "A";
    case "done":
      return t.done;
    case "project":
      return t.projects.includes(view.name);
    case "context":
      return t.contexts.includes(view.name);
  }
}

function matchesSearch(t: Task, q: string) {
  return !q || t.raw.toLowerCase().includes(q.toLowerCase());
}

function matchesFilters(t: Task, f: Filters) {
  if (f.due === "has" && !t.due) return false;
  if (f.due === "none" && t.due) return false;
  if (f.priorities.length && !f.priorities.includes(t.priority ?? "-")) return false;
  return true;
}

export interface Selection {
  open: Task[];
  done: Task[];
  archived: Task[];
}

export function selectTasks(tasks: Task[], archived: Task[], view: View, search: string, filters: Filters, today: string): Selection {
  const pass = (t: Task) => inView(t, view, today) && matchesSearch(t, search) && matchesFilters(t, filters);
  if (view.kind === "done") {
    return { open: [], done: tasks.filter(pass), archived: archived.filter(pass) };
  }
  return {
    open: tasks.filter((t) => !t.done && pass(t)),
    done: tasks.filter((t) => t.done && pass(t)),
    archived: [],
  };
}

const prioRank = (p?: string) => (p ? p.charCodeAt(0) - 64 : 99);
const dueRank = (d?: string) => d ?? "9999-99-99";

export function sortTasks(list: Task[], sortBy: SortBy): Task[] {
  const arr = [...list];
  arr.sort((a, b) => {
    if (sortBy === "file") return a.line - b.line;
    if (sortBy === "alpha") return (a.title || a.body).localeCompare(b.title || b.body, "de") || a.line - b.line;
    if (sortBy === "priority") return prioRank(a.priority) - prioRank(b.priority) || dueRank(a.due).localeCompare(dueRank(b.due)) || a.line - b.line;
    return dueRank(a.due).localeCompare(dueRank(b.due)) || prioRank(a.priority) - prioRank(b.priority) || a.line - b.line;
  });
  return arr;
}

export interface Group {
  key: string;
  titleKey: I18nKey;
  titleVars?: Record<string, string>;
  /** Raw title for project groups. */
  title?: string;
  tone: "danger" | "normal";
  tasks: Task[];
}

export function groupTasks(open: Task[], groupBy: GroupBy, sortBy: SortBy, today: string): Group[] {
  const sorted = sortTasks(open, sortBy);
  if (groupBy === "none") return sorted.length ? [{ key: "all", titleKey: "grp.tasks", tone: "normal", tasks: sorted }] : [];

  if (groupBy === "date") {
    const g: Record<string, Task[]> = { overdue: [], today: [], later: [], none: [] };
    for (const t of sorted) {
      if (!t.due) g.none.push(t);
      else {
        const s = dueStatus(t.due, today);
        if (s === "overdue") g.overdue.push(t);
        else if (s === "today") g.today.push(t);
        else g.later.push(t);
      }
    }
    const out: Group[] = [
      { key: "overdue", titleKey: "grp.overdue", tone: "danger", tasks: g.overdue },
      { key: "today", titleKey: "grp.today", tone: "normal", tasks: g.today },
      { key: "later", titleKey: "grp.later", tone: "normal", tasks: g.later },
      { key: "none", titleKey: "grp.noDue", tone: "normal", tasks: g.none },
    ];
    return out.filter((x) => x.tasks.length);
  }

  if (groupBy === "priority") {
    const map = new Map<string, Task[]>();
    for (const t of sorted) {
      const k = t.priority ?? "~";
      map.set(k, [...(map.get(k) ?? []), t]);
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, tasks]) =>
        k === "~"
          ? { key: "p-none", titleKey: "grp.noPriority", tone: "normal", tasks }
          : { key: `p-${k}`, titleKey: "grp.priority", titleVars: { p: k }, tone: "normal", tasks },
      );
  }

  // project
  const map = new Map<string, Task[]>();
  for (const t of sorted) {
    const k = t.projects[0] ?? "";
    map.set(k, [...(map.get(k) ?? []), t]);
  }
  return [...map.entries()]
    .sort(([a], [b]) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b, "de")))
    .map(([k, tasks]) =>
      k === ""
        ? { key: "pr-none", titleKey: "grp.noProject", tone: "normal", tasks }
        : { key: `pr-${k}`, titleKey: "grp.tasks", title: `+${k}`, tone: "normal", tasks },
    );
}

export interface Counts {
  all: number;
  today: number;
  upcoming: number;
  prioA: number;
  done: number;
  overdue: number;
  dueToday: number;
  projects: [string, number][];
  contexts: [string, number][];
}

export function countTasks(tasks: Task[], archived: Task[], today: string): Counts {
  const open = tasks.filter((t) => !t.done);
  const tally = (key: "projects" | "contexts") => {
    const m = new Map<string, number>();
    for (const t of tasks) for (const n of t[key]) m.set(n, (m.get(n) ?? 0) + (t.done ? 0 : 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "de"));
  };
  return {
    all: open.length,
    today: open.filter((t) => t.due && t.due <= today).length,
    upcoming: open.filter((t) => t.due && t.due > today).length,
    prioA: open.filter((t) => t.priority === "A").length,
    done: tasks.length - open.length + archived.length,
    overdue: open.filter((t) => t.due && t.due < today).length,
    dueToday: open.filter((t) => t.due === today).length,
    projects: tally("projects"),
    contexts: tally("contexts"),
  };
}

/** Reschedule targets for the row menu. */
export function rescheduleTargets(today: string, weekStart: "monday" | "sunday") {
  const d = fromIso(today);
  const target = weekStart === "sunday" ? 0 : 1;
  let toStart = (target - d.getDay() + 7) % 7;
  if (toStart === 0) toStart = 7;
  return {
    today,
    tomorrow: addDays(today, 1),
    weekStart: addDays(today, toStart),
    inAWeek: addDays(today, 7),
  };
}
