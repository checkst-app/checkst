import { Calendar, Check, ChevronDown, ChevronRight, RotateCcw } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { ContextChip, PriorityBadge, ProjectChip } from "../components/ui";
import { dueStatus, formatShort, type Lang } from "../lib/dates";
import { type TFunc, useT } from "../lib/i18n";
import { bodyParts, type BodyPart, type Task } from "../lib/todo";
import { useFeedback } from "./feedback";

/**
 * Tokens keep their typed position: +project/@context in the middle of the text stay inline,
 * the ones at the end go to the meta line together with the due date (as in the design).
 */
function splitParts(parts: BodyPart[]): { inline: BodyPart[]; trailing: BodyPart[] } {
  let lastText = -1;
  parts.forEach((p, i) => p.kind === "text" && (lastText = i));
  if (lastText < 0) return { inline: [], trailing: parts };
  return { inline: parts.slice(0, lastText + 1), trailing: parts.slice(lastText + 1) };
}

const token = (p: BodyPart, i: number) =>
  p.kind === "text" ? (
    <span key={i} className="m-words">
      {p.text}
    </span>
  ) : p.kind === "project" ? (
    <ProjectChip key={i} name={p.name} />
  ) : (
    <ContextChip key={i} name={p.name} />
  );

export function dueLabel(due: string, today: string, lang: Lang, t: TFunc): { text: string; tone: "danger" | "accent" | "muted" } {
  const s = dueStatus(due, today);
  if (s === "overdue") return { text: formatShort(due, lang, today), tone: "danger" };
  if (s === "today") return { text: t("grp.today"), tone: "accent" };
  if (s === "tomorrow") return { text: t("grp.tomorrow"), tone: "muted" };
  return { text: formatShort(due, lang, today), tone: "muted" };
}

const SWIPE_DONE = 96;
/** Holding a task this long (ms) without moving opens its quick actions. */
const LONG_PRESS = 450;

export function TaskRow({
  task,
  today,
  onToggle,
  onOpen,
  onMenu,
  readOnly,
}: {
  task: Task;
  today: string;
  onToggle: (task: Task) => void;
  onOpen: (task: Task) => void;
  /** Long press: quick actions. Also for read-only (archived) tasks. */
  onMenu?: (task: Task) => void;
  readOnly?: boolean;
}) {
  const { t, lang } = useT();
  const { inline, trailing } = splitParts(bodyParts(task.body));
  const due = task.due && !task.done ? dueLabel(task.due, today, lang, t) : undefined;
  const [dx, setDx] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const drag = useRef<{ x: number; y: number; id: number; active: boolean; cancelled: boolean } | null>(null);
  const moved = useRef(false);
  const armed = useRef(false);
  const press = useRef<{ timer: number; x: number; y: number } | null>(null);
  const feedback = useFeedback();

  const stopPress = () => {
    if (press.current) window.clearTimeout(press.current.timer);
    press.current = null;
  };
  useEffect(() => stopPress, []);

  // Swipe right to check off (or reopen); vertical movement keeps scrolling the list.
  // Holding still opens the quick actions instead.
  const onPointerDown = (e: React.PointerEvent) => {
    if (leaving) return;
    moved.current = false;
    stopPress();
    if (onMenu) {
      const timer = window.setTimeout(() => {
        press.current = null;
        drag.current = null;
        moved.current = true; // lifting the finger must not open the task as well
        feedback("longpress");
        onMenu(task);
      }, LONG_PRESS);
      press.current = { timer, x: e.clientX, y: e.clientY };
    }
    if (readOnly) return;
    drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId, active: false, cancelled: false };
    armed.current = false;
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const p = press.current;
    if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 10) stopPress();
    const d = drag.current;
    if (!d || d.cancelled) return;
    const mx = e.clientX - d.x;
    const my = e.clientY - d.y;
    if (!d.active) {
      if (Math.abs(my) > 10 && Math.abs(my) > Math.abs(mx)) {
        d.cancelled = true;
        return;
      }
      if (mx > 10 && mx > Math.abs(my)) {
        d.active = true;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } else return;
    }
    moved.current = true;
    const next = Math.max(0, Math.min(mx - 10, 180));
    // A tick as the swipe arms: letting go now checks the task off (or reopens it).
    const nowArmed = next >= SWIPE_DONE;
    if (nowArmed && !armed.current) feedback("threshold");
    armed.current = nowArmed;
    setDx(next);
  };
  const onPointerUp = () => {
    stopPress();
    const d = drag.current;
    drag.current = null;
    if (!d?.active) return;
    if (dx >= SWIPE_DONE) {
      setLeaving(true);
      setDx(window.innerWidth);
      window.setTimeout(() => onToggle(task), 180);
    } else setDx(0);
  };

  const content = (
    <div
      className={`m-task ${task.done ? "done" : ""}`}
      style={dx ? { transform: `translateX(${dx}px)`, transition: drag.current?.active ? "none" : undefined } : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        stopPress();
        drag.current = null;
        setDx(0);
      }}
      onContextMenu={(e) => e.preventDefault()}
      onClick={() => {
        if (moved.current) return;
        if (!readOnly) onOpen(task);
      }}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={task.done}
        aria-label={task.done ? t("qc.uncheckTitle") : t("qc.checkTitle")}
        className={`m-check ${task.done ? "checked" : ""}`}
        disabled={readOnly}
        onClick={(e) => {
          e.stopPropagation();
          if (!moved.current) onToggle(task);
        }}
      >
        {task.done && <Check size={14} strokeWidth={3} />}
      </button>
      <div className="m-task-body">
        <div className="m-task-line">
          {task.priority && !task.done && <PriorityBadge priority={task.priority} />}
          <span className="m-task-text">{inline.length ? inline.map(token) : trailing.length ? null : task.body}</span>
        </div>
        {(trailing.length > 0 || due) && (
          <div className="m-task-meta">
            {trailing.map(token)}
            {due && (
              <span className={`m-due tone-${due.tone}`}>
                <Calendar size={13} />
                {due.text}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className={`m-swipe ${dx ? "swiping" : ""} ${leaving ? "leaving" : ""}`}>
      {dx > 0 && (
        <div className={`m-swipe-action ${dx >= SWIPE_DONE ? "armed" : ""}`}>
          {task.done ? <RotateCcw size={20} /> : <Check size={20} />}
          <span>{task.done ? t("m.reopen") : t("m.completed")}</span>
        </div>
      )}
      {content}
    </div>
  );
}

export function Group({ title, count, tone, children }: { title: string; count: number; tone?: "danger"; children: ReactNode }) {
  return (
    <section className="m-group">
      <div className={`m-group-head ${tone ? `tone-${tone}` : ""}`}>
        <span className="m-group-title">{title}</span>
        <span className="m-group-count">{count}</span>
      </div>
      <div className="m-group-rows">{children}</div>
    </section>
  );
}

export function CollapsedGroup({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="m-group">
      <button type="button" className="m-collapsed" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        <span className="m-group-title">{title}</span>
        <span className="m-group-count">{count}</span>
      </button>
      {open && <div className="m-group-rows">{children}</div>}
    </section>
  );
}
