import type { Task } from "./todo";

export interface HistoryEntry {
  line: string;
  at: number;
}

export interface QuickItem {
  task: Task;
  at?: number;
  section: "recent" | "due";
}

/**
 * Tasks shown under the quick-capture input: up to 3 recently added ones (from the bar's
 * history, filled up with the newest lines of the file) and up to 5 due today or overdue.
 * Tasks checked off during the current session (`touched`) stay in the list.
 */
export function quickListItems(tasks: Task[], history: HistoryEntry[], touched: string[], today: string): QuickItem[] {
  const byRaw = new Map(tasks.map((x) => [x.raw, x]));
  const visible = (x: Task) => !x.done || touched.includes(x.raw);
  const isDue = (x: Task) => !!x.due && x.due <= today;

  let recent: QuickItem[] = history
    .map((h) => ({ task: byRaw.get(h.line)!, at: h.at as number | undefined, section: "recent" as const }))
    .filter((x) => x.task && visible(x.task))
    .slice(0, 3);
  if (recent.length < 3) {
    const have = new Set(recent.map((x) => x.task.raw));
    const fill = tasks
      .filter((x) => visible(x) && !have.has(x.raw) && !isDue(x))
      .slice(-(3 - recent.length))
      .reverse()
      .map((task) => ({ task, at: undefined, section: "recent" as const }));
    recent = [...recent, ...fill];
  }

  const shown = new Set(recent.map((x) => x.task.raw));
  const due: QuickItem[] = tasks
    .filter((x) => isDue(x) && visible(x) && !shown.has(x.raw))
    .sort((a, b) => a.due!.localeCompare(b.due!) || (a.priority ?? "~").localeCompare(b.priority ?? "~"))
    .slice(0, 5)
    .map((task) => ({ task, at: undefined, section: "due" as const }));

  return [...recent, ...due];
}
