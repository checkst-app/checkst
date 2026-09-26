import { dateSuggestions, type DateSuggestion, type WeekStart } from "./dates";
import type { Task } from "./todo";

export type TokenKind = "project" | "context" | "due";

export interface CaretToken {
  kind: TokenKind;
  start: number;
  end: number;
  /** Text typed after the sigil (+, @ or due:). */
  query: string;
}

export function tokenAtCaret(value: string, caret: number): CaretToken | undefined {
  let start = caret;
  while (start > 0 && value[start - 1] !== " ") start--;
  let end = caret;
  while (end < value.length && value[end] !== " ") end++;
  const word = value.slice(start, caret);
  if (word.startsWith("+")) return { kind: "project", start, end, query: word.slice(1) };
  if (word.startsWith("@")) return { kind: "context", start, end, query: word.slice(1) };
  if (word.toLowerCase().startsWith("due:")) return { kind: "due", start, end, query: word.slice(4) };
  return undefined;
}

export interface TokenStat {
  name: string;
  open: number;
  total: number;
  onlyDone: boolean;
}

export interface Stats {
  projects: TokenStat[];
  contexts: TokenStat[];
}

export function tokenStats(tasks: Task[], archived: Task[], includeArchive: boolean): Stats {
  const collect = (key: "projects" | "contexts") => {
    const map = new Map<string, TokenStat>();
    const add = (name: string, open: boolean, fromArchive: boolean) => {
      const s = map.get(name) ?? { name, open: 0, total: 0, onlyDone: true };
      s.total++;
      if (open) s.open++;
      if (!fromArchive) s.onlyDone = false;
      map.set(name, s);
    };
    for (const t of tasks) for (const n of t[key]) add(n, !t.done, false);
    if (includeArchive) for (const t of archived) for (const n of t[key]) add(n, false, true);
    return [...map.values()];
  };
  return { projects: collect("projects"), contexts: collect("contexts") };
}

export type Suggestion =
  | { type: "token"; kind: "project" | "context"; name: string; stat: TokenStat; insert: string }
  | { type: "new"; kind: "project" | "context"; name: string; insert: string }
  | { type: "date"; date: DateSuggestion; insert: string };

export function suggestionsFor(
  token: CaretToken,
  stats: Stats,
  opts: { order: "frequency" | "alpha"; today: string; weekStart: WeekStart; limit?: number },
): Suggestion[] {
  if (token.kind === "due") {
    const q = token.query;
    return dateSuggestions(opts.today, opts.weekStart)
      .filter((d) => !q || d.iso.startsWith(q))
      .map((d) => ({ type: "date", date: d, insert: `due:${d.iso}` }));
  }
  const sigil = token.kind === "project" ? "+" : "@";
  const list = token.kind === "project" ? stats.projects : stats.contexts;
  const q = token.query.toLowerCase();
  const scored = list
    .filter((s) => !q || s.name.toLowerCase().includes(q))
    .sort((a, b) => {
      const pa = a.name.toLowerCase().startsWith(q) ? 0 : 1;
      const pb = b.name.toLowerCase().startsWith(q) ? 0 : 1;
      if (pa !== pb) return pa - pb;
      if (a.onlyDone !== b.onlyDone) return a.onlyDone ? 1 : -1;
      if (opts.order === "frequency" && a.total !== b.total) return b.total - a.total;
      return a.name.localeCompare(b.name, "de");
    })
    .slice(0, opts.limit ?? 5)
    .map<Suggestion>((s) => ({ type: "token", kind: token.kind as "project" | "context", name: s.name, stat: s, insert: sigil + s.name }));
  const exact = list.some((s) => s.name.toLowerCase() === q);
  if (q && !exact) scored.push({ type: "new", kind: token.kind, name: token.query, insert: sigil + token.query });
  return scored;
}

/** Inserts a suggestion in place of the token and returns the new value and caret position. */
export function applySuggestion(value: string, token: CaretToken, insert: string): { value: string; caret: number } {
  const before = value.slice(0, token.start);
  const after = value.slice(token.end);
  const spacer = after.startsWith(" ") ? "" : " ";
  const next = before + insert + spacer + after;
  return { value: next, caret: before.length + insert.length + 1 };
}

/** The not-yet-typed rest of the best suggestion, shown as ghost text after the caret. */
export function ghostFor(token: CaretToken | undefined, first: Suggestion | undefined): string {
  if (!token || !first || first.type === "new") return "";
  const full = first.type === "date" ? first.date.iso : first.name;
  if (!full.toLowerCase().startsWith(token.query.toLowerCase())) return "";
  return full.slice(token.query.length);
}

export type SegKind = "text" | "space" | "prio-a" | "prio-b" | "prio-c" | "prio" | "date" | "project" | "context" | "due" | "tag" | "done";

export interface Segment {
  text: string;
  kind: SegKind;
  start: number;
}

/** Splits raw input into colored segments, keeping every character (including spaces). */
export function highlight(value: string): Segment[] {
  const segs: Segment[] = [];
  const re = /(\s+)|(\S+)/g;
  let m: RegExpExecArray | null;
  let wordIndex = 0;
  let prefixOpen = true; // priority/date prefix only at the start
  while ((m = re.exec(value))) {
    const text = m[0];
    const start = m.index;
    if (m[1]) {
      segs.push({ text, kind: "space", start });
      continue;
    }
    let kind: SegKind = "text";
    const pm = /^\(([A-Za-z])\)$/.exec(text);
    if (wordIndex === 0 && text === "x") kind = "done";
    else if (prefixOpen && wordIndex === 0 && pm) {
      const p = pm[1].toUpperCase();
      kind = p === "A" ? "prio-a" : p === "B" ? "prio-b" : p === "C" ? "prio-c" : "prio";
    } else if (prefixOpen && /^\d{4}-\d{2}-\d{2}$/.test(text)) kind = "date";
    else {
      prefixOpen = false;
      if (text.length > 1 && text.startsWith("+")) kind = "project";
      else if (text.length > 1 && text.startsWith("@")) kind = "context";
      else if (/^due:/i.test(text)) kind = "due";
      else if (/^[^\s:]+:[^\s:/][^\s]*$/.test(text) && !/^\d+:/.test(text)) kind = "tag";
    }
    if (kind === "text") prefixOpen = false;
    segs.push({ text, kind, start });
    wordIndex++;
  }
  return segs;
}
