import { emit, listen } from "@tauri-apps/api/event";
import { PhysicalPosition, PhysicalSize, availableMonitors, getCurrentWindow, primaryMonitor } from "@tauri-apps/api/window";
import { CircleCheck, ExternalLink, Plus, Sun, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { type Completion, SuggestionList, SyntaxInput, type SyntaxInputHandle } from "../components/SyntaxInput";
import { Checkbox, PriorityBadge, TaskBody } from "../components/ui";
import { backend } from "../lib/backend";
import { formatShort } from "../lib/dates";
import { useT } from "../lib/i18n";
import { useSettings } from "../lib/settings";
import { useTodos } from "../lib/store";
import { type Task, withDefaults } from "../lib/todo";
import { sortTasks, viewDefaults } from "../lib/views";
import { useToday } from "./MainView";

const BOUNDS_KEY = "checkst.noteBounds";
/** Distance from the screen edge when the note opens for the first time (logical pixels). */
const MARGIN = 24;

interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

function loadBounds(): Bounds | null {
  try {
    const b = JSON.parse(localStorage.getItem(BOUNDS_KEY) || "null");
    return b && [b.x, b.y, b.width, b.height].every(Number.isFinite) ? b : null;
  } catch {
    return null;
  }
}

/** Last position and size, or top right on the primary screen if that spot is gone. */
async function placeWindow() {
  const win = getCurrentWindow();
  const saved = loadBounds();
  const monitors = await availableMonitors();
  // The header has to stay reachable, e.g. after a second screen was unplugged.
  const reachable = (b: Bounds) =>
    monitors.some(({ workArea: { position: p, size: s } }) => {
      const overlap = Math.min(b.x + b.width, p.x + s.width) - Math.max(b.x, p.x);
      return overlap >= 80 && b.y >= p.y && b.y + 40 <= p.y + s.height;
    });
  if (saved && reachable(saved)) {
    await win.setSize(new PhysicalSize(saved.width, saved.height));
    await win.setPosition(new PhysicalPosition(saved.x, saved.y));
    return;
  }
  const monitor = (await primaryMonitor()) ?? monitors[0];
  if (!monitor) return;
  const { position: p, size: s } = monitor.workArea;
  const size = await win.outerSize();
  const margin = Math.round(MARGIN * monitor.scaleFactor);
  await win.setPosition(new PhysicalPosition(p.x + s.width - size.width - margin, p.y + margin));
}

/** Shows or hides the note window and remembers where it was dragged and how big it was made. */
export function useNoteWindow(visible: boolean) {
  const { update } = useSettings();
  const placed = useRef(false);

  useEffect(() => {
    const win = getCurrentWindow();
    if (!visible) {
      win.hide().catch(() => {});
      return;
    }
    (async () => {
      if (!placed.current) {
        placed.current = true;
        await placeWindow().catch(() => {});
      }
      await win.show();
    })().catch(() => {});
  }, [visible]);

  useEffect(() => {
    const win = getCurrentWindow();
    let timer: number | undefined;
    const remember = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(async () => {
        if (!(await win.isVisible()) || (await win.isMinimized())) return;
        const [pos, size] = await Promise.all([win.outerPosition(), win.innerSize()]);
        localStorage.setItem(BOUNDS_KEY, JSON.stringify({ x: pos.x, y: pos.y, width: size.width, height: size.height }));
      }, 300);
    };
    const unlisten = [
      win.onMoved(remember),
      win.onResized(remember),
      // Alt+F4 unpins the note, like its close button.
      listen("note-close-requested", () => update({ notePinned: false })),
    ];
    return () => {
      window.clearTimeout(timer);
      for (const un of unlisten) un.then((f) => f());
    };
  }, [update]);
}

/** "Heute" as a small note above all windows: check off, add, drag and resize. */
export function TodayNote() {
  const { t } = useT();
  const { update } = useSettings();
  const store = useTodos();
  const today = useToday();
  const [value, setValue] = useState("");
  const [completion, setCompletion] = useState<Completion | null>(null);
  const inputRef = useRef<SyntaxInputHandle>(null);

  // Open ones first (overdue before today), then what was checked off today.
  const tasks = useMemo(() => {
    const inToday = store.tasks.filter((x) => !!x.due && x.due <= today && (!x.done || x.completionDate === today));
    return [...sortTasks(inToday.filter((x) => !x.done), "due"), ...inToday.filter((x) => x.done)];
  }, [store.tasks, today]);
  const open = tasks.filter((x) => !x.done).length;
  const overdue = tasks.filter((x) => !x.done && x.due! < today).length;

  const add = async () => {
    if (!value.trim()) return;
    try {
      await store.addFromInput(withDefaults(value, viewDefaults({ kind: "today" }, today)));
      setValue("");
    } catch {
      // The text stays in the field so nothing is lost.
    }
  };

  // Dragging by hand instead of data-tauri-drag-region: a double click must not maximize the note.
  const startDrag = (e: React.MouseEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("button")) return;
    getCurrentWindow().startDragging().catch(() => {});
  };

  const startResize = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    getCurrentWindow().startResizeDragging("SouthEast").catch(() => {});
  };

  const openMain = () => {
    emit("open-today").catch(() => {});
    backend.showMain().catch(() => {});
  };

  return (
    <div className="note">
      <header className="note-header" onMouseDown={startDrag}>
        <Sun size={15} className="accent" />
        <span className="note-title">{t("nav.today")}</span>
        <span className="note-summary">
          {t("list.open", { n: open })}
          {overdue > 0 && <span className="overdue"> · {t("list.overdue", { n: overdue })}</span>}
        </span>
        <span className="spacer" />
        <button type="button" className="note-btn" title={t("qc.open")} onClick={openMain}>
          <ExternalLink size={14} />
        </button>
        <button type="button" className="note-btn" title={t("note.unpin")} onClick={() => update({ notePinned: false })}>
          <X size={15} />
        </button>
      </header>

      <div className="note-list">
        {store.ready && tasks.length === 0 && (
          <div className="note-empty">
            <CircleCheck size={22} />
            <span>{t("m.emptyToday")}</span>
          </div>
        )}
        {tasks.map((task) => (
          <NoteRow key={`${task.line}:${task.raw}`} task={task} today={today} />
        ))}
      </div>

      {/* The input sits at the bottom, so suggestions open upwards instead of the usual popup below. */}
      {completion?.open && (
        <div className="note-suggest" onMouseDown={(e) => e.preventDefault()}>
          <SuggestionList completion={completion} variant="popup" />
        </div>
      )}

      <div className="note-add" onClick={() => inputRef.current?.focus()}>
        <Plus size={15} className="accent" />
        <SyntaxInput
          ref={inputRef}
          variant="quickadd"
          value={value}
          onChange={setValue}
          placeholder={t("note.addPlaceholder")}
          popup={false}
          onCompletion={setCompletion}
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
          onEscape={() => {
            setValue("");
            (document.activeElement as HTMLElement)?.blur();
          }}
        />
        <span className="note-grip" title={t("note.resize")} onMouseDown={startResize} onClick={(e) => e.stopPropagation()}>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
            <path d="M9 2 2 9M9 5.5 5.5 9" />
          </svg>
        </span>
      </div>
    </div>
  );
}

function NoteRow({ task, today }: { task: Task; today: string }) {
  const { t, lang } = useT();
  const store = useTodos();
  const overdue = !task.done && !!task.due && task.due < today;
  return (
    <div className={`note-row ${task.done ? "done" : ""}`}>
      <Checkbox
        checked={task.done}
        onChange={() => store.toggleDone(task).catch(() => {})}
        label={t("qc.check")}
        title={task.done ? t("qc.uncheckTitle") : t("qc.checkTitle")}
      />
      <button
        type="button"
        className="note-row-text"
        title={t("qc.clickToOpen")}
        onClick={() => backend.showMain(task.line + 1, { raw: task.raw, edit: true }).catch(() => {})}
      >
        {task.priority && !task.done && <PriorityBadge priority={task.priority} />}
        <TaskBody body={task.body} />
      </button>
      {overdue && <span className="note-due">{formatShort(task.due!, lang, today)}</span>}
    </div>
  );
}
