import { emit, listen } from "@tauri-apps/api/event";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { backend } from "./backend";
import { todayIso } from "./dates";
import type { Settings } from "./settings";
import {
  completeLine,
  joinFile,
  lineFromInput,
  parseFile,
  splitFile,
  type Task,
  type TodoFile,
  uncompleteLine,
} from "./todo";

export type SaveStatus = "idle" | "saving" | "saved" | "error" | "missing";

export interface TodoStore {
  ready: boolean;
  file: TodoFile;
  tasks: Task[];
  archived: Task[];
  status: SaveStatus;
  error?: string;
  /** Adds a task from free input (quick add). Returns the new line index. */
  addFromInput: (input: string) => Promise<number | undefined>;
  addLine: (line: string) => Promise<number>;
  replaceLine: (task: Task, raw: string) => Promise<void>;
  toggleDone: (task: Task) => Promise<void>;
  deleteTask: (task: Task) => Promise<() => Promise<void>>;
  archive: () => Promise<number>;
  reload: () => Promise<void>;
  renameToken: (from: string, to: string | undefined) => Promise<void>;
}

const emptyFile: TodoFile = { lines: [], eol: "\r\n", bom: false, trailingNewline: true };

export const TodoContext = createContext<TodoStore | null>(null);

export function useTodos(): TodoStore {
  const s = useContext(TodoContext);
  if (!s) throw new Error("TodoContext missing");
  return s;
}

export function useTodoStore(settings: Settings, active: boolean): TodoStore {
  const [file, setFile] = useState<TodoFile>(emptyFile);
  const [archiveFile, setArchiveFile] = useState<TodoFile>(emptyFile);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState<string>();
  const fileRef = useRef(file);
  const lastContent = useRef<string | null>(null);
  const { todoPath, donePath } = settings;

  const commit = useCallback(
    async (next: TodoFile) => {
      fileRef.current = next;
      setFile(next);
      if (!todoPath) return;
      const content = joinFile(next);
      lastContent.current = content;
      setStatus("saving");
      try {
        await backend.writeTextFile(todoPath, content, next.bom);
        setStatus("saved");
        setError(undefined);
        // Let the other window (main list / quick-capture bar) pick up the change right away.
        emit("tasks-changed", todoPath).catch(() => {});
      } catch (e) {
        setStatus("error");
        setError(String(e));
        throw e;
      }
    },
    [todoPath],
  );

  const loadArchive = useCallback(async () => {
    if (!donePath) return setArchiveFile(emptyFile);
    try {
      const f = await backend.readTextFile(donePath);
      setArchiveFile(splitFile(f.content, f.bom));
    } catch {
      setArchiveFile(emptyFile);
    }
  }, [donePath]);

  const reload = useCallback(async () => {
    if (!todoPath) {
      setReady(true);
      return;
    }
    try {
      const f = await backend.readTextFile(todoPath);
      if (lastContent.current !== null && f.content === lastContent.current) {
        setReady(true);
        return;
      }
      lastContent.current = f.content;
      const next = splitFile(f.content, f.bom);
      fileRef.current = next;
      setFile(next);
      setStatus(f.exists ? "saved" : "missing");
      setError(undefined);
    } catch (e) {
      setStatus("error");
      setError(String(e));
    }
    setReady(true);
  }, [todoPath]);

  // Initial load, backup and archive.
  useEffect(() => {
    if (!active) return;
    lastContent.current = null;
    reload();
    loadArchive();
  }, [active, reload, loadArchive]);

  useEffect(() => {
    if (!active || !todoPath || settings.backupDays <= 0) return;
    backend.backupFile(todoPath, settings.backupDays).catch(() => {});
    if (donePath) backend.backupFile(donePath, settings.backupDays).catch(() => {});
  }, [active, todoPath, donePath, settings.backupDays]);

  // External changes (editor, Dropbox, quick capture window).
  useEffect(() => {
    if (!active || !todoPath) return;
    let timer: number | undefined;
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        reload();
        loadArchive();
      }, 150);
    };
    const paths = [todoPath, donePath].filter(Boolean);
    if (settings.watchExternal) backend.watchFiles(paths).catch(() => {});
    else backend.watchFiles([]).catch(() => {});
    const un1 = listen("file-changed", () => settings.watchExternal && schedule());
    const un2 = listen("tasks-appended", schedule);
    const un3 = listen("tasks-changed", schedule);
    return () => {
      window.clearTimeout(timer);
      un1.then((f) => f());
      un2.then((f) => f());
      un3.then((f) => f());
    };
  }, [active, todoPath, donePath, settings.watchExternal, reload, loadArchive]);

  const tasks = useMemo(() => parseFile(file), [file]);
  const archived = useMemo(() => parseFile(archiveFile).map((t) => ({ ...t, line: -1 - t.line })), [archiveFile]);

  /** Finds the current index of a task, even if lines shifted since it was rendered. */
  const locate = (task: Task): number => {
    const lines = fileRef.current.lines;
    if (lines[task.line] === task.raw) return task.line;
    return lines.indexOf(task.raw);
  };

  const addLine = useCallback(
    async (line: string) => {
      const cur = fileRef.current;
      const next = { ...cur, lines: [...cur.lines, line], trailingNewline: true };
      await commit(next);
      return next.lines.length - 1;
    },
    [commit],
  );

  const addFromInput = useCallback(
    async (input: string) => {
      if (!input.trim()) return undefined;
      const line = lineFromInput(input, {
        creationDate: settings.addCreationDate ? todayIso() : undefined,
        defaultPriority: settings.defaultPriority || undefined,
      });
      return addLine(line);
    },
    [addLine, settings.addCreationDate, settings.defaultPriority],
  );

  const replaceLine = useCallback(
    async (task: Task, raw: string) => {
      const i = locate(task);
      if (i < 0) return;
      const lines = [...fileRef.current.lines];
      lines[i] = raw;
      await commit({ ...fileRef.current, lines });
    },
    [commit],
  );

  const toggleDone = useCallback(
    (task: Task) => replaceLine(task, task.done ? uncompleteLine(task) : completeLine(task, todayIso())),
    [replaceLine],
  );

  const deleteTask = useCallback(
    async (task: Task) => {
      const i = locate(task);
      if (i < 0) return async () => {};
      const lines = [...fileRef.current.lines];
      const [removed] = lines.splice(i, 1);
      await commit({ ...fileRef.current, lines });
      return async () => {
        const restored = [...fileRef.current.lines];
        restored.splice(Math.min(i, restored.length), 0, removed);
        await commit({ ...fileRef.current, lines: restored });
      };
    },
    [commit],
  );

  const archive = useCallback(async () => {
    if (!donePath) return 0;
    const cur = fileRef.current;
    const doneLines = cur.lines.filter((l) => /^x /.test(l.trimStart()));
    if (doneLines.length === 0) return 0;
    const f = await backend.readTextFile(donePath);
    const done = splitFile(f.content, f.bom);
    const eol = f.exists ? done.eol : cur.eol;
    await backend.writeTextFile(donePath, joinFile({ ...done, eol, lines: [...done.lines, ...doneLines], trailingNewline: true }), done.bom);
    await commit({ ...cur, lines: cur.lines.filter((l) => !/^x /.test(l.trimStart())) });
    await loadArchive();
    return doneLines.length;
  }, [commit, donePath, loadArchive]);

  const renameToken = useCallback(
    async (from: string, to: string | undefined) => {
      const lines = fileRef.current.lines.map((l) => {
        const words = l.split(" ");
        if (!words.includes(from)) return l;
        return words
          .map((w) => (w === from ? to ?? "" : w))
          .filter(Boolean)
          .join(" ");
      });
      await commit({ ...fileRef.current, lines });
    },
    [commit],
  );

  const fullReload = useCallback(async () => {
    lastContent.current = null;
    await reload();
    await loadArchive();
  }, [reload, loadArchive]);

  return useMemo(
    () => ({
      ready,
      file,
      tasks,
      archived,
      status,
      error,
      addFromInput,
      addLine,
      replaceLine,
      toggleDone,
      deleteTask,
      archive,
      reload: fullReload,
      renameToken,
    }),
    [ready, file, tasks, archived, status, error, addFromInput, addLine, replaceLine, toggleDone, deleteTask, archive, fullReload, renameToken],
  );
}
