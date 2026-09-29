import { Calendar, CalendarClock, CalendarX2, Flag, Pencil, Trash2 } from "lucide-react";
import { memo, useRef } from "react";
import { dueStatus, formatShort } from "../lib/dates";
import { useT } from "../lib/i18n";
import { useSettings } from "../lib/settings";
import { type Task, withDue, withPriority } from "../lib/todo";
import { rescheduleTargets } from "../lib/views";
import { highlight } from "../lib/suggest";
import { Checkbox, type MenuItem, MenuList, Popover, PriorityBadge, TaskBody, usePopover } from "./ui";

interface Props {
  task: Task;
  selected: boolean;
  today: string;
  onSelect: (t: Task) => void;
  onToggle: (t: Task) => void;
  onEdit: (t: Task) => void;
  onDelete: (t: Task) => void;
  onReplace: (t: Task, raw: string) => void;
  onFilterProject?: (name: string) => void;
  onFilterContext?: (name: string) => void;
  /** Right click: opens the context menu at the cursor. */
  onMenu?: (t: Task, at: { x: number; y: number }) => void;
}

export const TaskRow = memo(function TaskRow({ task, selected, today, onSelect, onToggle, onEdit, onDelete, onReplace, onFilterProject, onFilterContext, onMenu }: Props) {
  const { t, lang } = useT();
  const { settings } = useSettings();
  const due = task.due ? dueStatus(task.due, today) : undefined;
  const dueLabel = task.due
    ? due === "today"
      ? t("due.today")
      : due === "tomorrow"
        ? t("due.tomorrow")
        : formatShort(task.due, lang, today)
    : "";

  return (
    <div
      className={`task-row ${selected ? "selected" : ""} ${task.done ? "done" : ""} ${task.done && settings.strikeDone ? "strike" : ""}`}
      onClick={() => onSelect(task)}
      onDoubleClick={() => onEdit(task)}
      onContextMenu={(e) => {
        e.preventDefault();
        onSelect(task);
        onMenu?.(task, { x: e.clientX, y: e.clientY });
      }}
      data-line={task.line}
    >
      {selected && <span className="selection-indicator" />}
      <Checkbox checked={task.done} onChange={() => onToggle(task)} />
      {settings.showRaw ? (
        <span className="task-raw">
          {highlight(task.raw).map((s) => (
            <span key={s.start} className={`seg seg-${s.kind}`}>
              {s.text}
            </span>
          ))}
        </span>
      ) : (
        <>
          <span className="prio-slot">{task.priority && <PriorityBadge priority={task.priority} />}</span>
          <TaskBody body={task.body} onProject={onFilterProject} onContext={onFilterContext} />
        </>
      )}
      <span className="spacer" />
      {task.line >= 0 && <RowActions task={task} today={today} onEdit={onEdit} onDelete={onDelete} onReplace={onReplace} />}
      <span className={`task-due due-${task.done ? "none" : due ?? "none"}`}>
        {task.due && !task.done && (
          <>
            {due === "overdue" ? <CalendarX2 size={13} /> : <Calendar size={13} />}
            <span>{dueLabel}</span>
          </>
        )}
        {task.done && task.completionDate && <span className="due-done">{formatShort(task.completionDate, lang, today)}</span>}
      </span>
    </div>
  );
});

function RowActions({ task, today, onEdit, onDelete, onReplace }: Pick<Props, "task" | "today" | "onEdit" | "onDelete" | "onReplace">) {
  const { t, lang } = useT();
  const { settings } = useSettings();
  const due = usePopover();
  const prio = usePopover();
  const dueBtn = useRef<HTMLButtonElement>(null);
  const prioBtn = useRef<HTMLButtonElement>(null);
  const targets = rescheduleTargets(today, settings.weekStart);

  const setDue = (iso?: string) => onReplace(task, withDue(task, iso));
  const setPrio = (p?: string) => onReplace(task, withPriority(task, p));

  const dueItems: MenuItem[] = [
    { key: "today", label: t("ac.today"), hint: formatShort(targets.today, lang, today), onSelect: () => setDue(targets.today) },
    { key: "tomorrow", label: t("ac.tomorrow"), hint: formatShort(targets.tomorrow, lang, today), onSelect: () => setDue(targets.tomorrow) },
    {
      key: "week",
      label: settings.weekStart === "sunday" ? t("ac.sunday") : t("ac.monday"),
      hint: formatShort(targets.weekStart, lang, today),
      onSelect: () => setDue(targets.weekStart),
    },
    { key: "inaweek", label: t("ac.inAWeek"), hint: formatShort(targets.inAWeek, lang, today), onSelect: () => setDue(targets.inAWeek) },
    { key: "d", label: "", divider: true },
    { key: "none", label: t("row.noDue"), onSelect: () => setDue(undefined) },
  ];
  const prioItems: MenuItem[] = [
    ...["A", "B", "C", "D"].map((p) => ({
      key: p,
      label: <PriorityBadge priority={p} />,
      hint: t("filter.prio", { p }),
      checked: task.priority === p,
      onSelect: () => setPrio(p),
    })),
    { key: "d", label: "", divider: true },
    { key: "none", label: t("row.noPriority"), checked: !task.priority, onSelect: () => setPrio(undefined) },
  ];

  return (
    <span className={`row-actions ${due.open || prio.open ? "force" : ""}`} onClick={(e) => e.stopPropagation()}>
      <button type="button" className="row-action row-action-edit" title={t("row.edit")} onClick={() => onEdit(task)}>
        <Pencil size={15} />
      </button>
      {!task.done && (
        <>
          <button ref={dueBtn} type="button" className="row-action" title={t("row.reschedule")} onClick={() => due.toggle(dueBtn.current)}>
            <CalendarClock size={15} />
          </button>
          <button ref={prioBtn} type="button" className="row-action" title={t("row.priority")} onClick={() => prio.toggle(prioBtn.current)}>
            <Flag size={15} />
          </button>
        </>
      )}
      <button type="button" className="row-action row-action-delete" title={t("row.delete")} onClick={() => onDelete(task)}>
        <Trash2 size={15} />
      </button>
      <Popover anchor={due.anchor} open={due.open} onClose={() => due.setOpen(false)} align="right" minWidth={220}>
        <MenuList items={dueItems} onClose={() => due.setOpen(false)} />
      </Popover>
      <Popover anchor={prio.anchor} open={prio.open} onClose={() => prio.setOpen(false)} align="right" minWidth={200}>
        <MenuList items={prioItems} onClose={() => prio.setOpen(false)} />
      </Popover>
    </span>
  );
}
