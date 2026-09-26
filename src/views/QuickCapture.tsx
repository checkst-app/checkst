import { listen } from "@tauri-apps/api/event";
import { LogicalSize, getCurrentWindow } from "@tauri-apps/api/window";
import { Calendar, CalendarPlus, CalendarX2, Check, ExternalLink, FileText, RefreshCw, TriangleAlert, Undo2 } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { type Completion, SuggestionList, SyntaxInput, type SyntaxInputHandle } from "../components/SyntaxInput";
import { AppIcon, Button, Checkbox, Keycap, TaskBody } from "../components/ui";
import { backend, fileName } from "../lib/backend";
import { dueStatus, formatShort, formatTime, todayIso } from "../lib/dates";
import { useT } from "../lib/i18n";
import { useSettings } from "../lib/settings";
import { type HistoryEntry, type QuickItem, quickListItems } from "../lib/quickList";
import { useTodos } from "../lib/store";
import { completeLine, lineFromInput, parseLine, type Task, uncompleteLine } from "../lib/todo";

const HISTORY_KEY = "checkst.quickHistory";
const SAVED_MS = 3000;

function loadHistory(): HistoryEntry[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  } catch {
    return [];
  }
}

function pushHistory(line: string) {
  const list = [{ line, at: Date.now() }, ...loadHistory().filter((h) => h.line !== line)].slice(0, 20);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
}

/** Keeps a history entry pointing at its task after the line changed (checked off / undone). */
function replaceHistory(from: string, to: string) {
  const list = loadHistory().map((h) => (h.line === from ? { ...h, line: to } : h));
  localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
}

type ListItem = QuickItem;

type Phase = { kind: "input" } | { kind: "saved"; line: string; lineNo: number } | { kind: "error"; message: string };

export function QuickCapture() {
  const { t, lang } = useT();
  const { settings } = useSettings();
  const store = useTodos();
  const [value, setValue] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "input" });
  const [completion, setCompletion] = useState<Completion | null>(null);
  const [openedAt, setOpenedAt] = useState(0);
  const [sel, setSel] = useState(-1);
  const [touched, setTouched] = useState<string[]>([]);
  const [undoStack, setUndoStack] = useState<{ from: string; to: string }[]>([]);
  const inputRef = useRef<SyntaxInputHandle>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<number | undefined>(undefined);
  const file = fileName(settings.todoPath || "todo.txt");

  const hide = useCallback(() => {
    window.clearTimeout(hideTimer.current);
    backend.hideQuick();
  }, []);

  // Fresh state whenever the shortcut opens the bar.
  useEffect(() => {
    const un = listen("quick-opened", () => {
      window.clearTimeout(hideTimer.current);
      // Start empty, except after a failed save: then the text must survive.
      setPhase((p) => {
        if (p.kind !== "error") setValue("");
        return p.kind === "error" ? p : { kind: "input" };
      });
      setOpenedAt(Date.now());
      setSel(-1);
      setTouched([]);
      setUndoStack([]);
      store.reload();
      requestAnimationFrame(() => inputRef.current?.focus());
    });
    return () => {
      un.then((f) => f());
    };
  }, [store.reload]);

  // Keep the transparent window exactly as tall as the bar.
  useLayoutEffect(() => {
    const el = barRef.current;
    if (!el) return;
    // Grow right away, shrink only if the smaller height persists: no flicker on re-renders.
    let current = 0;
    let shrinkTimer: number | undefined;
    const apply = (h: number) => {
      current = h;
      getCurrentWindow()
        .setSize(new LogicalSize(780, h + 48))
        .catch(() => {});
    };
    const ro = new ResizeObserver(() => {
      const h = Math.ceil(el.getBoundingClientRect().height);
      window.clearTimeout(shrinkTimer);
      if (h >= current) apply(h);
      else shrinkTimer = window.setTimeout(() => apply(Math.ceil(el.getBoundingClientRect().height)), 150);
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      window.clearTimeout(shrinkTimer);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && phase.kind !== "input") {
        e.preventDefault();
        hide();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, hide]);

  const line = useMemo(
    () =>
      value.trim()
        ? lineFromInput(value, {
            creationDate: settings.addCreationDate ? todayIso() : undefined,
            defaultPriority: settings.defaultPriority || undefined,
          })
        : "",
    [value, settings.addCreationDate, settings.defaultPriority],
  );

  const save = async (open: boolean) => {
    if (!line || !settings.todoPath) return;
    try {
      const lineNo = await backend.appendLine(settings.todoPath, line);
      pushHistory(line);
      setValue("");
      if (open) {
        await backend.showMain(lineNo);
        hide();
        setPhase({ kind: "input" });
        return;
      }
      setPhase({ kind: "saved", line, lineNo });
      hideTimer.current = window.setTimeout(() => {
        hide();
        setPhase({ kind: "input" });
      }, SAVED_MS);
    } catch (e) {
      setPhase({ kind: "error", message: String(e) });
    }
  };

  const undo = async () => {
    if (phase.kind !== "saved") return;
    window.clearTimeout(hideTimer.current);
    await backend.removeLastLineIf(settings.todoPath, phase.line).catch(() => false);
    const parsed = parseLine(phase.line, 0);
    setValue(parsed ? `${parsed.priority ? `(${parsed.priority}) ` : ""}${parsed.body}` : phase.line);
    setPhase({ kind: "input" });
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  // Tasks shown under the input: recently added ones and what is due today.
  // Tasks checked off in this session stay visible (struck through) until the bar closes.
  const today = todayIso();
  // openedAt refreshes the history (and relative times) each time the bar opens.
  const items = useMemo(() => quickListItems(store.tasks, loadHistory(), touched, today), [store.tasks, touched, today, openedAt]);

  useEffect(() => {
    if (sel >= items.length) setSel(items.length - 1);
  }, [items.length, sel]);

  const toggle = async (item: ListItem) => {
    const task = store.tasks.find((x) => x.raw === item.task.raw) ?? item.task;
    const next = task.done ? uncompleteLine(task) : completeLine(task, todayIso());
    // Mark the new line as "touched" before saving, otherwise it drops out of the list for a
    // moment (done but not yet touched) and the bar shrinks and grows again.
    setTouched((ts) => [...ts.filter((r) => r !== task.raw), next]);
    replaceHistory(task.raw, next);
    setUndoStack((u) => [...u, { from: task.raw, to: next }]);
    await store.replaceLine(task, next);
  };

  const undoToggle = async () => {
    const last = undoStack[undoStack.length - 1];
    if (!last) return;
    const task = store.tasks.find((x) => x.raw === last.to);
    setUndoStack((u) => u.slice(0, -1));
    if (!task) return;
    setTouched((ts) => [...ts.filter((r) => r !== last.to), last.from]);
    replaceHistory(last.to, last.from);
    await store.replaceLine(task, last.from);
  };

  const openTask = async (item: ListItem) => {
    const task = store.tasks.find((x) => x.raw === item.task.raw) ?? item.task;
    await backend.showMain(task.line + 1, { raw: task.raw, edit: true });
    hide();
  };

  // List shortcuts: arrows select, Space checks off, Enter opens, Alt+1…9 checks off directly, Ctrl+Z undoes.
  const onListKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (phase.kind !== "input") return false;
    if (e.altKey && !e.ctrlKey && /^Digit[1-9]$/.test(e.code)) {
      const item = items[Number(e.code.slice(5)) - 1];
      if (item) {
        e.preventDefault();
        toggle(item);
      }
      return true;
    }
    if (value.trim()) return false;
    if (e.key === "ArrowDown" && items.length) {
      e.preventDefault();
      setSel((s) => Math.min(items.length - 1, s + 1));
      return true;
    }
    if (e.key === "ArrowUp" && sel >= 0) {
      e.preventDefault();
      setSel((s) => s - 1);
      return true;
    }
    if (e.key === " " && items[sel]) {
      e.preventDefault();
      toggle(items[sel]);
      return true;
    }
    if (e.key === "Enter" && items[sel]) {
      e.preventDefault();
      openTask(items[sel]);
      return true;
    }
    if (e.ctrlKey && e.key.toLowerCase() === "z" && undoStack.length) {
      e.preventDefault();
      undoToggle();
      return true;
    }
    return false;
  };

  const dueLabel = (task: Task) => {
    if (!task.due) return null;
    const s = dueStatus(task.due, today);
    return (
      <span className={`quick-due due-${s}`}>
        {s === "overdue" ? <CalendarX2 size={13} /> : <Calendar size={13} />}
        {s === "today" ? t("due.today") : formatShort(task.due, lang, today)}
      </span>
    );
  };

  const ago = (at?: number) => {
    if (!at) return "";
    const min = Math.floor((Date.now() - at) / 60000);
    if (min < 1) return t("qc.justNow");
    if (min < 60) return t("qc.minutesAgo", { n: min });
    const h = Math.floor(min / 60);
    if (h < 6) return t("qc.hoursAgo", { n: h });
    return formatTime(new Date(at), settings.timeFormat, lang);
  };

  const suggestionsOpen = phase.kind === "input" && completion?.open;

  return (
    <div className="quick-root">
      <div className="quick-bar" ref={barRef}>
        {phase.kind === "saved" ? (
          <>
            <div className="quick-input-row">
              <span className="quick-saved-icon">
                <Check size={17} strokeWidth={2.5} />
              </span>
              <span className="quick-saved-title">{t("qc.saved")}</span>
              <Button variant="ghost" icon={Undo2} onClick={undo}>
                {t("row.undo")}
              </Button>
              <Button
                variant="secondary"
                icon={ExternalLink}
                onClick={async () => {
                  await backend.showMain(phase.lineNo);
                  hide();
                  setPhase({ kind: "input" });
                }}
              >
                {t("qc.open")}
              </Button>
            </div>
            <div className="quick-saved-line">
              <SavedRow line={phase.line} />
            </div>
            <div className="quick-timer">
              <span style={{ animationDuration: `${SAVED_MS}ms` }} />
            </div>
          </>
        ) : (
          <>
            <div className="quick-input-row">
              <AppIcon size={28} radius={8} />
              {settings.setupDone ? (
                <SyntaxInput
                  ref={inputRef}
                  variant="capture"
                  value={value}
                  onChange={(v) => {
                    setValue(v);
                    setSel(-1);
                    if (phase.kind === "error") setPhase({ kind: "input" });
                  }}
                  popup={false}
                  onCompletion={setCompletion}
                  onKeyPassthrough={onListKey}
                  placeholder={t("quick.placeholder")}
                  autoFocus
                  onSubmit={(e) => {
                    e.preventDefault();
                    save(e.ctrlKey);
                  }}
                  onEscape={hide}
                />
              ) : (
                <span className="quick-no-file">{t("qc.noFile")}</span>
              )}
            </div>

            {phase.kind === "error" && (
              <div className="quick-error">
                <TriangleAlert size={17} />
                <div>
                  <b>{t("qc.errorTitle", { file })}</b>
                  <span>{t("qc.errorDesc")}</span>
                </div>
                <Button variant="secondary" icon={RefreshCw} onClick={() => save(false)}>
                  {t("qc.retry")}
                </Button>
              </div>
            )}

            {phase.kind === "input" && value.trim() && (
              <div className="quick-preview">
                <span className="label">{t("qc.preview")}</span>
                <span className="raw">{line}</span>
              </div>
            )}

            {suggestionsOpen && completion && (
              <div className="quick-list">
                <SuggestionList completion={completion} variant="capture" />
              </div>
            )}

            {phase.kind === "input" && !value.trim() && settings.setupDone && items.length > 0 && (
              <div className="quick-list">
                {items.map((item, i) => {
                  const { task } = item;
                  const header =
                    i === 0 || items[i - 1].section !== item.section ? (
                      <div key={`h-${item.section}`} className={`ac-section ${i > 0 ? "ac-section-gap" : ""}`}>
                        <span>{item.section === "recent" ? t("qc.recent") : t("qc.dueSection")}</span>
                        <span>{item.section === "recent" ? t("qc.today") : ""}</span>
                      </div>
                    ) : null;
                  return (
                    <div key={task.raw} className="quick-row-wrap">
                      {header}
                      <div
                        className={`quick-recent ${i === sel ? "active" : ""} ${task.done ? "done" : ""}`}
                        onClick={() => openTask(item)}
                        title={t("qc.clickToOpen")}
                      >
                        <Checkbox
                          checked={task.done}
                          onChange={() => toggle(item)}
                          label={t("qc.check")}
                          title={task.done ? t("qc.uncheckTitle") : t("qc.checkTitle")}
                        />
                        <TaskBody body={task.body} className="quick-recent-text" />
                        <span className="spacer" />
                        {i < 9 && (
                          <span className="quick-row-key">
                            <Keycap>Alt</Keycap>
                            <Keycap>{i + 1}</Keycap>
                          </span>
                        )}
                        {item.section === "due" && !task.done ? dueLabel(task) : <span className="quick-time">{ago(item.at)}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="quick-footer">
              <span>
                <Keycap>↑</Keycap>
                <Keycap>↓</Keycap>
                {t("ac.select")}
              </span>
              {sel >= 0 && !value.trim() ? (
                <>
                  <span>
                    <Keycap>{t("qc.space")}</Keycap>
                    {t("qc.check")}
                  </span>
                  <span>
                    <Keycap>Enter</Keycap>
                    {t("qc.openTask")}
                  </span>
                  {undoStack.length > 0 && (
                    <span>
                      <Keycap>{lang === "de" ? "Strg" : "Ctrl"}</Keycap>
                      <Keycap>Z</Keycap>
                      {t("qc.undoCheck")}
                    </span>
                  )}
                </>
              ) : (
                <>
                  <span>
                    <Keycap>Enter</Keycap>
                    {t("qc.save")}
                  </span>
                  <span>
                    <Keycap>{lang === "de" ? "Strg" : "Ctrl"}</Keycap>
                    <Keycap>Enter</Keycap>
                    {t("qc.saveOpen")}
                  </span>
                </>
              )}
              <span>
                <Keycap>Esc</Keycap>
                {t("ac.close")}
              </span>
              <span className="spacer" />
              <span className="quick-target">
                <FileText size={13} />
                <span className="mono">{file}</span>
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SavedRow({ line }: { line: string }) {
  const { t } = useT();
  const task = parseLine(line, 0);
  if (!task) return null;
  return (
    <div className="saved-row">
      <Checkbox checked={false} />
      <TaskBody body={task.body} className="saved-text" />
      <span className="spacer" />
      <span className="saved-created">
        <CalendarPlus size={13} />
        {t("qc.createdToday")}
      </span>
    </div>
  );
}
