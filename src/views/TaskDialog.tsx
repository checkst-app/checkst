import { Calendar, Check, FileText, Plus, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { SyntaxInput, type SyntaxInputHandle, useStats } from "../components/SyntaxInput";
import { Button, ContextChip, Keycap, Popover, ProjectChip, Segmented, Toggle, usePopover } from "../components/ui";
import { formatLong, isValidIso, todayIso } from "../lib/dates";
import { useT } from "../lib/i18n";
import { useSettings } from "../lib/settings";
import { useTodos } from "../lib/store";
import { highlight } from "../lib/suggest";
import { addToken, formatLine, parseLine, removeToken, setTag, type Task } from "../lib/todo";

interface Props {
  mode: "create" | "edit";
  task?: Task;
  onClose: () => void;
  defaultProject?: string;
  defaultContext?: string;
  defaultDue?: string;
}

export function TaskDialog({ mode, task, onClose, defaultProject, defaultContext, defaultDue }: Props) {
  const { t, lang } = useT();
  const { settings } = useSettings();
  const store = useTodos();
  const today = todayIso();
  const inputRef = useRef<SyntaxInputHandle>(null);

  const initialDescription = useMemo(() => {
    if (task) return setTag(task.body, "due", undefined);
    let d = "";
    if (defaultContext) d = addToken(d, `@${defaultContext}`);
    if (defaultProject) d = addToken(d, `+${defaultProject}`);
    return d ? ` ${d}` : "";
  }, [task, defaultProject, defaultContext]);

  const [description, setDescription] = useState(initialDescription);
  const [priority, setPriority] = useState<string>(task?.priority ?? (mode === "create" ? settings.defaultPriority : ""));
  const [due, setDue] = useState(task ? task.due ?? "" : defaultDue ?? "");
  const [done, setDone] = useState(task?.done ?? false);
  const [error, setError] = useState<string>();
  const creationDate = task ? task.creationDate : settings.addCreationDate ? today : undefined;

  // Start typing at the beginning when the field was prefilled with a token.
  useEffect(() => {
    const el = inputRef.current?.input;
    if (!el) return;
    el.focus();
    const pos = mode === "create" ? 0 : el.value.length;
    el.setSelectionRange(pos, pos);
  }, [mode]);

  const parsed = useMemo(() => parseLine(`x ${description}`, 0), [description]);
  const projects = parsed?.projects ?? [];
  const contexts = parsed?.contexts ?? [];

  const body = setTag(description.trim().replace(/\s+/g, " "), "due", isValidIso(due) ? due : undefined);
  const line = formatLine({
    done,
    completionDate: done ? task?.completionDate ?? today : undefined,
    priority: done ? undefined : priority || undefined,
    creationDate,
    body: done && priority ? setTag(body, "pri", priority) : body,
  });

  const submit = async () => {
    if (!description.trim()) return setError(t("dlg.emptyText"));
    if (due && !isValidIso(due)) return setError(t("dlg.invalidDate"));
    if (mode === "edit" && task) await store.replaceLine(task, line);
    else await store.addLine(line);
    onClose();
  };

  const remove = async () => {
    if (task) await store.deleteTask(task);
    onClose();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "Enter" && e.ctrlKey) {
        e.preventDefault();
        submit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const lineNo = mode === "edit" && task ? task.line + 1 : store.file.lines.length + 1;
  const prioOptions = ["", "A", "B", "C", "D", ...(priority && !"ABCD".includes(priority) ? [priority] : [])];

  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal>
        <div className="dialog-header">
          <div className="dialog-heading">
            <h2>{mode === "edit" ? t("dlg.editTitle") : t("dlg.newTitle")}</h2>
            <p>
              {mode === "edit" && task
                ? task.creationDate
                  ? t("dlg.editSubtitle", { n: task.line + 1, date: formatLong(task.creationDate, lang) })
                  : t("dlg.editSubtitleNoDate", { n: task.line + 1 })
                : t("dlg.newSubtitle")}
            </p>
          </div>
          <div className="dialog-header-right">
            {mode === "edit" && (
              <>
                <label className="done-toggle">
                  <span>{t("dlg.done")}</span>
                  <Toggle on={done} onChange={setDone} label={t("dlg.done")} />
                </label>
                <span className="vsep" />
              </>
            )}
            <button type="button" className="icon-btn" onClick={onClose} title={t("dlg.cancel")}>
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="dialog-form">
          <div className="field">
            <div className="field-label-row">
              <span className="field-label">{t("dlg.description")}</span>
              <span className="field-tip">
                {t("dlg.tip1")} <b className="tok-project">+</b> {t("dlg.tip2")} <b className="tok-context">@</b> {t("dlg.tip3")}
              </span>
            </div>
            <div className="dialog-input">
              <SyntaxInput
                ref={inputRef}
                variant="dialog"
                value={description}
                onChange={(v) => {
                  setDescription(v);
                  setError(undefined);
                }}
                popupWidth={304}
              />
            </div>
            {error && <span className="field-error">{error}</span>}
          </div>

          <div className="row-meta">
            <div className="field grow">
              <span className="field-label">{t("dlg.priority")}</span>
              <Segmented
                className="prio-segmented"
                value={priority}
                onChange={setPriority}
                options={prioOptions.map((p) => ({ value: p, label: p || t("dlg.none"), className: p ? `mono prio-seg-${p.toLowerCase()}` : "" }))}
              />
            </div>
            <DateField label={t("dlg.due")} value={due} onChange={setDue} invalid={!!due && !isValidIso(due)} />
            <div className="field" style={{ width: 190 }}>
              <span className="field-label">{t("dlg.created")}</span>
              <div className="text-field readonly">
                <span className="mono">{creationDate ?? "—"}</span>
                {mode === "create" && creationDate && <span className="auto">{t("dlg.auto")}</span>}
              </div>
            </div>
          </div>

          <div className="row-tags">
            <TokenField
              kind="project"
              label={t("dlg.projects")}
              values={projects}
              placeholder={t("dlg.noProject")}
              addLabel={t("dlg.addProject")}
              onAdd={(n) => setDescription((d) => addToken(d.trim(), `+${n}`))}
              onRemove={(n) => setDescription((d) => removeToken(d, `+${n}`))}
            />
            <TokenField
              kind="context"
              label={t("dlg.contexts")}
              values={contexts}
              placeholder={t("dlg.noContext")}
              addLabel={t("dlg.addContext")}
              onAdd={(n) => setDescription((d) => addToken(d.trim(), `@${n}`))}
              onRemove={(n) => setDescription((d) => removeToken(d, `@${n}`))}
            />
          </div>

          <div className="line-preview">
            <div className="line-preview-header">
              <span>
                <FileText size={14} />
                {t("dlg.preview")}
              </span>
              <span>{mode === "edit" ? t("dlg.replaces", { n: lineNo }) : t("dlg.appendAs", { n: lineNo })}</span>
            </div>
            <div className="line-preview-text">
              {highlight(line).map((s) => (
                <span key={s.start} className={`seg seg-${s.kind}`}>
                  {s.text}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="dialog-footer">
          {mode === "edit" ? (
            <Button variant="danger" icon={Trash2} onClick={remove}>
              {t("dlg.delete")}
            </Button>
          ) : (
            <span className="footer-hint">
              <Keycap small>Strg</Keycap>
              <Keycap small>Enter</Keycap>
              {t("dlg.toCreate")}
            </span>
          )}
          <div className="dialog-actions">
            <Button variant="secondary" onClick={onClose}>
              {t("dlg.cancel")}
            </Button>
            <Button variant="primary" icon={Check} onClick={submit}>
              {mode === "edit" ? t("dlg.save") : t("dlg.create")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DateField({ label, value, onChange, invalid }: { label: string; value: string; onChange: (v: string) => void; invalid: boolean }) {
  const picker = useRef<HTMLInputElement>(null);
  return (
    <div className="field" style={{ width: 170 }}>
      <span className="field-label">{label}</span>
      <div className={`text-field ${invalid ? "invalid" : ""}`}>
        <input className="mono" value={value} placeholder="JJJJ-MM-TT" onChange={(e) => onChange(e.target.value.trim())} spellCheck={false} />
        <button
          type="button"
          className="field-icon"
          onClick={() => {
            const el = picker.current;
            if (!el) return;
            el.value = isValidIso(value) ? value : todayIso();
            el.showPicker?.();
          }}
        >
          <Calendar size={16} />
        </button>
        <input ref={picker} type="date" className="hidden-date" tabIndex={-1} onChange={(e) => e.target.value && onChange(e.target.value)} />
      </div>
    </div>
  );
}

function TokenField({
  kind,
  label,
  values,
  placeholder,
  addLabel,
  onAdd,
  onRemove,
}: {
  kind: "project" | "context";
  label: string;
  values: string[];
  placeholder: string;
  addLabel: string;
  onAdd: (name: string) => void;
  onRemove: (name: string) => void;
}) {
  const { t } = useT();
  const stats = useStats();
  const pop = usePopover();
  const btn = useRef<HTMLButtonElement>(null);
  const [q, setQ] = useState("");
  const list = (kind === "project" ? stats.projects : stats.contexts).filter((s) => !values.includes(s.name)).sort((a, b) => b.total - a.total);
  const suggestions = list.slice(0, 3);
  const Chip = kind === "project" ? ProjectChip : ContextChip;
  const filtered = list.filter((s) => s.name.toLowerCase().includes(q.toLowerCase())).slice(0, 8);
  const add = (name: string) => {
    const clean = name.replace(/^[+@]/, "").replace(/\s+/g, "");
    if (clean) onAdd(clean);
    setQ("");
    pop.setOpen(false);
  };

  return (
    <div className="field grow">
      <span className="field-label">{label}</span>
      <div className="chip-field">
        {values.length === 0 && <span className="chip-placeholder">{placeholder}</span>}
        {values.map((v) => (
          <Chip key={v} name={v} onRemove={() => onRemove(v)} />
        ))}
        <span className="spacer" />
        <button ref={btn} type="button" className="chip-add" onClick={() => pop.toggle(btn.current)}>
          <Plus size={14} />
          {addLabel}
        </button>
      </div>
      {suggestions.length > 0 && (
        <div className="chip-suggestions">
          <span>{t("dlg.suggestions")}</span>
          {suggestions.map((s) => (
            <Chip key={s.name} name={s.name} outlined onClick={() => onAdd(s.name)} />
          ))}
        </div>
      )}
      <Popover anchor={pop.anchor} open={pop.open} onClose={() => pop.setOpen(false)} align="right" minWidth={240}>
        <div className="token-picker">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={kind === "project" ? "+Projekt" : "@Kontext"}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add(filtered[0] && !q ? filtered[0].name : q || filtered[0]?.name || "");
              }
            }}
          />
          {filtered.map((s) => (
            <button key={s.name} type="button" className="menu-item" onClick={() => add(s.name)}>
              <Chip name={s.name} />
              <span className="menu-hint">{s.total === 1 ? t("ac.task") : t("ac.tasks", { n: s.total })}</span>
            </button>
          ))}
        </div>
      </Popover>
    </div>
  );
}
