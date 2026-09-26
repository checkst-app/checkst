// todo.txt parsing and serialization, following https://github.com/todotxt/todo.txt
//
// A line looks like:
//   x 2026-09-24 2026-09-20 Zahnarzt anrufen @telefon +Gesundheit due:2026-09-25
//   (A) 2026-09-21 Neue Texte übernehmen +Website @büro due:2026-09-25
//
// checkst never rewrites lines it did not touch, so unknown tags and formatting survive.

export interface Task {
  /** 0-based index of the line in the file. */
  line: number;
  raw: string;
  done: boolean;
  completionDate?: string;
  priority?: string;
  creationDate?: string;
  /** Everything after priority and dates, including +projects, @contexts and key:value tags. */
  body: string;
  /** body without +projects, @contexts and key:value tags. */
  title: string;
  projects: string[];
  contexts: string[];
  due?: string;
  tags: Record<string, string>;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TAG = /^([^\s:]+):([^\s:][^\s]*)$/;

export function isDate(s: string | undefined): s is string {
  return !!s && DATE.test(s);
}

function isProject(word: string) {
  return word.length > 1 && word.startsWith("+");
}

function isContext(word: string) {
  return word.length > 1 && word.startsWith("@");
}

/** key:value tag, but not URLs like https://… or times like 10:30. */
function asTag(word: string): [string, string] | undefined {
  const m = TAG.exec(word);
  if (!m) return undefined;
  const [, key, value] = m;
  if (value.startsWith("//") || /^\d+$/.test(key)) return undefined;
  return [key, value];
}

export function parseLine(raw: string, line: number): Task | undefined {
  if (!raw.trim()) return undefined;
  let rest = raw.trimStart();
  let done = false;
  let completionDate: string | undefined;
  let priority: string | undefined;
  let creationDate: string | undefined;

  const words = () => rest.split(" ");
  if (rest.startsWith("x ")) {
    done = true;
    rest = rest.slice(2).trimStart();
    const w = words();
    if (isDate(w[0])) {
      completionDate = w[0];
      rest = w.slice(1).join(" ");
      const w2 = words();
      if (isDate(w2[0])) {
        creationDate = w2[0];
        rest = w2.slice(1).join(" ");
      }
    }
  } else {
    const m = /^\(([A-Z])\) /.exec(rest);
    if (m) {
      priority = m[1];
      rest = rest.slice(4);
    }
    const w = words();
    if (isDate(w[0])) {
      creationDate = w[0];
      rest = w.slice(1).join(" ");
    }
  }

  const body = rest.trim();
  const projects: string[] = [];
  const contexts: string[] = [];
  const tags: Record<string, string> = {};
  const titleWords: string[] = [];
  for (const word of body.split(/\s+/)) {
    if (!word) continue;
    if (isProject(word)) {
      if (!projects.includes(word.slice(1))) projects.push(word.slice(1));
    } else if (isContext(word)) {
      if (!contexts.includes(word.slice(1))) contexts.push(word.slice(1));
    } else {
      const tag = asTag(word);
      if (tag) tags[tag[0]] = tag[1];
      else titleWords.push(word);
    }
  }
  const due = isDate(tags.due) ? tags.due : undefined;
  // Completed tasks keep their priority as pri:X (todo.txt convention).
  if (done && !priority && tags.pri && /^[A-Z]$/.test(tags.pri)) priority = tags.pri;

  return {
    line,
    raw,
    done,
    completionDate,
    priority,
    creationDate,
    body,
    title: titleWords.join(" "),
    projects,
    contexts,
    due,
    tags,
  };
}

export type BodyPart = { kind: "text"; text: string } | { kind: "project"; name: string } | { kind: "context"; name: string };

/**
 * The description split into text runs and +project/@context tokens, in their original order,
 * so badges can be rendered where they were typed. key:value tags (due: …) are left out,
 * they have their own column.
 */
export function bodyParts(body: string): BodyPart[] {
  const parts: BodyPart[] = [];
  let words: string[] = [];
  const flush = () => {
    if (words.length) parts.push({ kind: "text", text: words.join(" ") });
    words = [];
  };
  for (const word of body.split(/\s+/)) {
    if (!word) continue;
    if (isProject(word)) {
      flush();
      parts.push({ kind: "project", name: word.slice(1) });
    } else if (isContext(word)) {
      flush();
      parts.push({ kind: "context", name: word.slice(1) });
    } else if (!asTag(word)) {
      words.push(word);
    }
  }
  flush();
  return parts;
}

export interface TaskFields {
  done: boolean;
  completionDate?: string;
  priority?: string;
  creationDate?: string;
  body: string;
}

export function formatLine(t: TaskFields): string {
  const parts: string[] = [];
  if (t.done) {
    parts.push("x");
    if (t.completionDate) parts.push(t.completionDate);
    if (t.creationDate && t.completionDate) parts.push(t.creationDate);
  } else {
    if (t.priority) parts.push(`(${t.priority})`);
    if (t.creationDate) parts.push(t.creationDate);
  }
  if (t.body) parts.push(t.body);
  return parts.join(" ");
}

/** Sets, replaces or removes a key:value tag in a body. */
export function setTag(body: string, key: string, value: string | undefined): string {
  const words = body.split(/\s+/).filter(Boolean);
  const idx = words.findIndex((w) => asTag(w)?.[0] === key);
  if (value === undefined || value === "") {
    if (idx >= 0) words.splice(idx, 1);
  } else if (idx >= 0) {
    words[idx] = `${key}:${value}`;
  } else {
    words.push(`${key}:${value}`);
  }
  return words.join(" ");
}

export function addToken(body: string, token: string): string {
  const words = body.split(/\s+/).filter(Boolean);
  if (words.includes(token)) return body;
  // Keep due: and other tags at the end, tokens before them.
  const firstTag = words.findIndex((w) => !!asTag(w));
  if (firstTag >= 0) words.splice(firstTag, 0, token);
  else words.push(token);
  return words.join(" ");
}

export function removeToken(body: string, token: string): string {
  return body
    .split(/\s+/)
    .filter((w) => w && w !== token)
    .join(" ");
}

export function completeLine(task: Task, today: string): string {
  let body = task.body;
  if (task.priority) body = setTag(body, "pri", task.priority);
  return formatLine({
    done: true,
    completionDate: today,
    creationDate: task.creationDate,
    body,
  });
}

export function uncompleteLine(task: Task): string {
  const pri = task.tags.pri && /^[A-Z]$/.test(task.tags.pri) ? task.tags.pri : undefined;
  return formatLine({
    done: false,
    priority: pri,
    creationDate: task.creationDate,
    body: setTag(task.body, "pri", undefined),
  });
}

/**
 * Normalizes free input from the quick-add fields into a todo.txt line:
 * a typed "(A)" prefix is kept, and the creation date is inserted after it.
 */
export function lineFromInput(input: string, opts: { creationDate?: string; defaultPriority?: string }): string {
  let rest = input.trim().replace(/\s+/g, " ");
  let priority: string | undefined;
  const m = /^\(([A-Za-z])\)\s*/.exec(rest);
  if (m) {
    priority = m[1].toUpperCase();
    rest = rest.slice(m[0].length);
  } else if (opts.defaultPriority) {
    priority = opts.defaultPriority;
  }
  let creationDate = opts.creationDate;
  const first = rest.split(" ")[0];
  if (isDate(first)) {
    creationDate = first;
    rest = rest.slice(first.length).trim();
  }
  return formatLine({ done: false, priority, creationDate, body: rest });
}

export interface TodoFile {
  lines: string[];
  eol: "\r\n" | "\n";
  bom: boolean;
  trailingNewline: boolean;
}

export function splitFile(content: string, bom = false): TodoFile {
  const eol = content.includes("\r\n") || !content.includes("\n") ? "\r\n" : "\n";
  const trailingNewline = content === "" || /\r?\n$/.test(content);
  const body = content.replace(/\r?\n$/, "");
  const lines = body === "" ? [] : body.split(/\r?\n/);
  return { lines, eol, bom, trailingNewline };
}

export function joinFile(file: TodoFile): string {
  if (file.lines.length === 0) return "";
  return file.lines.join(file.eol) + (file.trailingNewline ? file.eol : "");
}

export function parseFile(file: TodoFile): Task[] {
  const tasks: Task[] = [];
  file.lines.forEach((raw, i) => {
    const t = parseLine(raw, i);
    if (t) tasks.push(t);
  });
  return tasks;
}
