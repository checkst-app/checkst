import { Calendar, Check, Copy, CopyPlus, type LucideIcon, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { copyText } from "../lib/clipboard";
import { todayIso } from "../lib/dates";
import { useT } from "../lib/i18n";
import { useSettings } from "../lib/settings";
import { useTodos } from "../lib/store";
import { completeLine, duplicateLine, type Task, uncompleteLine, withDue, withPriority } from "../lib/todo";
import { rescheduleTargets } from "../lib/views";
import { Pill, Segments, useSnack } from "./common";
import { useFeedback } from "./feedback";

/** Checks a task off (or reopens it) with feedback and an undo snackbar. */
export function useToggleTask() {
  const { t } = useT();
  const store = useTodos();
  const snack = useSnack();
  const feedback = useFeedback();
  return async (task: Task) => {
    const next = task.done ? uncompleteLine(task) : completeLine(task, todayIso());
    if (task.done) feedback("tick");
    else feedback("confirm", "complete");
    await store.toggleDone(task).catch(() => {});
    snack(task.done ? t("m.reopened") : t("m.completed"), {
      label: t("m.undo"),
      run: () => void store.replaceLine({ ...task, raw: next }, task.raw).catch(() => {}),
    });
  };
}

/** Long press on a task: its quick actions as a bottom sheet. */
export function TaskSheet({ task, onClose, onEdit }: { task: Task; onClose: () => void; onEdit: () => void }) {
  const { t } = useT();
  const { settings } = useSettings();
  const store = useTodos();
  const snack = useSnack();
  const toggle = useToggleTask();
  const targets = rescheduleTargets(todayIso(), settings.weekStart);
  const editable = task.line >= 0;
  const presets = [
    { key: "today", label: t("ac.today"), iso: targets.today },
    { key: "tomorrow", label: t("ac.tomorrow"), iso: targets.tomorrow },
    { key: "week", label: t("m.nextWeek"), iso: targets.weekStart },
  ];

  const change = (raw: string) => {
    onClose();
    if (raw === task.raw) return;
    store.replaceLine(task, raw).then(
      () => snack(t("menu.changed"), { label: t("m.undo"), run: () => void store.replaceLine({ ...task, raw }, task.raw).catch(() => {}) }),
      () => {},
    );
  };
  const remove = async () => {
    const undo = await store.deleteTask(task).catch(() => undefined);
    if (undo) snack(t("m.deleted"), { label: t("m.undo"), run: () => void undo() });
  };

  // Editing swaps this sheet for the edit sheet (same history entry), every other action closes it.
  const actions: { key: string; label: string; icon: LucideIcon; danger?: boolean; swaps?: boolean; run: () => void }[] = [];
  if (editable) {
    actions.push(
      { key: "toggle", label: task.done ? t("menu.reopen") : t("menu.complete"), icon: task.done ? RotateCcw : Check, run: () => void toggle(task) },
      { key: "edit", label: t("row.edit"), icon: Pencil, swaps: true, run: onEdit },
    );
  }
  actions.push(
    { key: "dup", label: t("menu.duplicate"), icon: CopyPlus, run: () => void store.addLine(duplicateLine(task)).then(() => snack(t("menu.duplicated")), () => {}) },
    { key: "copy", label: t("menu.copy"), icon: Copy, run: () => void copyText(task.raw).then(() => snack(t("menu.copied")), () => {}) },
  );
  if (editable) actions.push({ key: "del", label: t("row.delete"), icon: Trash2, danger: true, run: () => void remove() });

  return (
    <div className="m-scrim" onClick={onClose}>
      <div className="m-sheet m-action-sheet" role="dialog" aria-label={t("menu.label")} onClick={(e) => e.stopPropagation()}>
        <div className="m-handle" />
        <p className="m-menu-task">{task.title || task.body}</p>
        {editable && !task.done && (
          <div className="m-menu-quick">
            <div className="m-field">
              <span className="m-field-label">{t("m.due")}</span>
              <div className="m-pills">
                {presets.map((p) => (
                  <Pill
                    key={p.key}
                    selected={task.due === p.iso}
                    icon={task.due === p.iso ? Calendar : undefined}
                    onClick={() => change(withDue(task, task.due === p.iso ? undefined : p.iso))}
                  >
                    {p.label}
                  </Pill>
                ))}
              </div>
            </div>
            <div className="m-field">
              <span className="m-field-label">{t("dlg.priority")}</span>
              <Segments
                value={task.priority ?? "none"}
                onChange={(p) => change(withPriority(task, p === "none" ? undefined : p))}
                options={[
                  { value: "none", label: t("m.none") },
                  { value: "A", label: "A", className: "mono seg-a" },
                  { value: "B", label: "B", className: "mono seg-b" },
                  { value: "C", label: "C", className: "mono seg-c" },
                ]}
              />
            </div>
          </div>
        )}
        {actions.map((a) => (
          <button
            key={a.key}
            type="button"
            className={`m-action ${a.danger ? "danger" : ""}`}
            onClick={() => {
              if (!a.swaps) onClose();
              a.run();
            }}
          >
            <a.icon size={19} />
            {a.label}
          </button>
        ))}
      </div>
    </div>
  );
}
