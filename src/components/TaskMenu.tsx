import {
  CalendarChevronsRight,
  CalendarOff,
  CalendarPlus,
  Check,
  Copy,
  CopyPlus,
  FlagOff,
  type LucideIcon,
  Pencil,
  RotateCcw,
  Sun,
  Sunrise,
  Trash2,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { formatShort } from "../lib/dates";
import { useT } from "../lib/i18n";
import { useSettings } from "../lib/settings";
import { type Task, withDue, withPriority } from "../lib/todo";
import { rescheduleTargets } from "../lib/views";
import { Popover, PriorityBadge } from "./ui";

interface Action {
  key: string;
  label: string;
  icon?: LucideIcon;
  /** Shown in a chip instead of the icon. */
  chip?: ReactNode;
  hint?: string;
  checked?: boolean;
  danger?: boolean;
  run: () => void;
}

/** A single action, a row of chips under a title (due dates, priorities) or a divider. */
type Line = { key: string; action: Action } | { key: string; title: string; current: string; chips: Action[] } | { key: string; divider: true };

export interface TaskMenuActions {
  onToggle: (t: Task) => void;
  onEdit: (t: Task) => void;
  onDelete: (t: Task) => void;
  onReplace: (t: Task, raw: string) => void;
  onDuplicate: (t: Task) => void;
  onCopy: (t: Task) => void;
}

/** Context menu of a task row (right click or Shift+F10): the quick actions in one place. */
export function TaskMenu({
  task,
  at,
  today,
  onClose,
  ...a
}: { task: Task; at: { x: number; y: number }; today: string; onClose: () => void } & TaskMenuActions) {
  const { t, lang } = useT();
  const { settings } = useSettings();
  const [pos, setPos] = useState<[number, number] | null>(null);
  const targets = rescheduleTargets(today, settings.weekStart);
  const editable = task.line >= 0;
  const date = (iso: string) => formatShort(iso, lang, today);

  const due = (key: string, label: string, icon: LucideIcon, iso?: string): Action => ({
    key,
    label: iso ? `${label} · ${date(iso)}` : label,
    icon,
    checked: task.due === iso,
    run: () => a.onReplace(task, withDue(task, iso)),
  });
  const prio = (p?: string): Action => ({
    key: p ?? "none",
    label: p ? t("filter.prio", { p }) : t("row.noPriority"),
    chip: p ? <PriorityBadge priority={p} /> : undefined,
    icon: FlagOff,
    checked: task.priority === p,
    run: () => a.onReplace(task, withPriority(task, p)),
  });

  const lines: Line[] = [];
  if (editable) {
    lines.push(
      {
        key: "toggle",
        action: {
          key: "toggle",
          label: task.done ? t("menu.reopen") : t("menu.complete"),
          icon: task.done ? RotateCcw : Check,
          hint: t("menu.keySpace"),
          run: () => a.onToggle(task),
        },
      },
      { key: "edit", action: { key: "edit", label: t("row.edit"), icon: Pencil, hint: "Enter", run: () => a.onEdit(task) } },
    );
  }
  if (editable && !task.done) {
    lines.push(
      { key: "d1", divider: true },
      {
        key: "due",
        title: t("menu.due"),
        current: task.due ? date(task.due) : t("row.noDue"),
        chips: [
          due("today", t("ac.today"), Sun, targets.today),
          due("tomorrow", t("ac.tomorrow"), Sunrise, targets.tomorrow),
          due("week", settings.weekStart === "sunday" ? t("ac.sunday") : t("ac.monday"), CalendarChevronsRight, targets.weekStart),
          due("inaweek", t("ac.inAWeek"), CalendarPlus, targets.inAWeek),
          due("none", t("row.noDue"), CalendarOff),
        ],
      },
      {
        key: "prio",
        title: t("row.priority"),
        current: task.priority ? t("filter.prio", { p: task.priority }) : t("row.noPriority"),
        chips: [...["A", "B", "C", "D"].map(prio), prio(undefined)],
      },
    );
  }
  if (lines.length) lines.push({ key: "d2", divider: true });
  lines.push(
    { key: "dup", action: { key: "dup", label: t("menu.duplicate"), icon: CopyPlus, run: () => a.onDuplicate(task) } },
    { key: "copy", action: { key: "copy", label: t("menu.copy"), icon: Copy, run: () => a.onCopy(task) } },
  );
  if (editable) {
    lines.push(
      { key: "d3", divider: true },
      { key: "del", action: { key: "del", label: t("row.delete"), icon: Trash2, hint: t("menu.keyDelete"), danger: true, run: () => a.onDelete(task) } },
    );
  }

  // Keyboard: up/down between lines, left/right inside a chip row.
  const rows = lines.flatMap((l) => ("action" in l ? [[l.action]] : "chips" in l ? [l.chips] : []));
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const [r, c] = pos ?? [-1, 0];
      const go = (row: number, col: number) => {
        e.preventDefault();
        const next = (row + rows.length) % rows.length;
        setPos([next, Math.max(0, Math.min(col, rows[next].length - 1))]);
      };
      if (e.key === "ArrowDown") go(r + 1, c);
      else if (e.key === "ArrowUp") go(r < 0 ? rows.length - 1 : r - 1, c);
      else if (e.key === "ArrowRight" && r >= 0) go(r, c + 1);
      else if (e.key === "ArrowLeft" && r >= 0) go(r, c - 1);
      // A focused menu button (Tab) is activated by the browser itself.
      else if ((e.key === "Enter" || e.key === " ") && r >= 0 && !(e.target as HTMLElement).closest?.(".task-menu")) {
        e.preventDefault();
        rows[r][c].run();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pos, rows, onClose]);

  // Like a native context menu: gone when the window loses focus, resizes or the list scrolls.
  useEffect(() => {
    window.addEventListener("blur", onClose);
    window.addEventListener("resize", onClose);
    window.addEventListener("wheel", onClose, { passive: true });
    return () => {
      window.removeEventListener("blur", onClose);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("wheel", onClose);
    };
  }, [onClose]);

  const run = (x: Action) => {
    x.run();
    onClose();
  };

  let row = -1;
  return (
    <Popover at={at} open onClose={onClose} offset={2}>
      <div className="menu task-menu" role="menu" aria-label={t("menu.label")} onMouseLeave={() => setPos(null)} onContextMenu={(e) => e.preventDefault()}>
        {lines.map((l) => {
          if ("divider" in l) return <div key={l.key} className="menu-divider" />;
          const r = ++row;
          if ("action" in l) {
            const Icon = l.action.icon;
            return (
              <button
                key={l.key}
                type="button"
                role="menuitem"
                className={`menu-item ${pos?.[0] === r ? "active" : ""} ${l.action.danger ? "danger" : ""}`}
                onMouseEnter={() => setPos([r, 0])}
                onClick={() => run(l.action)}
              >
                {Icon && <Icon size={15} />}
                <span className="menu-label">{l.action.label}</span>
                {l.action.hint && <span className="menu-hint">{l.action.hint}</span>}
              </button>
            );
          }
          const active = pos?.[0] === r ? l.chips[pos[1]] : undefined;
          return (
            <div key={l.key} className="menu-chips" role="group" aria-label={l.title}>
              <div className="menu-chips-head">
                <span>{l.title}</span>
                <span className="menu-hint">{active?.label ?? l.current}</span>
              </div>
              <div className="menu-chip-row">
                {l.chips.map((c, i) => {
                  const Icon = c.icon;
                  return (
                    <button
                      key={c.key}
                      type="button"
                      role="menuitemradio"
                      aria-checked={!!c.checked}
                      aria-label={c.label}
                      className={`menu-chip ${active === c ? "active" : ""} ${c.checked ? "checked" : ""}`}
                      onMouseEnter={() => setPos([r, i])}
                      onClick={() => run(c)}
                    >
                      {c.chip ?? (Icon && <Icon size={15} />)}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </Popover>
  );
}
