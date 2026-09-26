import { Calendar, Plus, Trash2, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { addDays, formatShort, todayIso } from "../lib/dates";
import { useT } from "../lib/i18n";
import { useSettings } from "../lib/settings";
import { useTodos } from "../lib/store";
import { highlight, tokenStats } from "../lib/suggest";
import { addToken, formatLine, parseLine, removeToken, setTag, type Task } from "../lib/todo";
import { rescheduleTargets } from "../lib/views";
import { Pill, Segments, useSnack } from "./common";

/** Rebuilds a line with a changed body or priority, keeping done state and dates. */
function rebuild(raw: string, change: { body?: (b: string) => string; priority?: string | undefined }): string {
  const t = parseLine(raw, 0);
  if (!t) return raw;
  let body = change.body ? change.body(t.body) : t.body;
  let priority = "priority" in change ? change.priority : t.priority;
  // Completed tasks keep their priority as pri:X.
  if (t.done) {
    if ("priority" in change) body = setTag(body, "pri", priority);
    priority = undefined;
  }
  return formatLine({ done: t.done, completionDate: t.completionDate, creationDate: t.creationDate, priority, body });
}

export function EditSheet({ task, onClose }: { task: Task; onClose: () => void }) {
  const { t, lang } = useT();
  const { settings } = useSettings();
  const store = useTodos();
  const snack = useSnack();
  const [draft, setDraft] = useState(task.raw);
  const [adding, setAdding] = useState(false);
  const [newTag, setNewTag] = useState("");
  const dateInput = useRef<HTMLInputElement>(null);
  const parsed = parseLine(draft, task.line);
  const today = todayIso();
  const targets = rescheduleTargets(today, settings.weekStart);
  const presets = [
    { key: "today", label: t("ac.today"), iso: targets.today },
    { key: "tomorrow", label: t("ac.tomorrow"), iso: addDays(today, 1) },
    { key: "week", label: t("m.nextWeek"), iso: targets.weekStart },
  ];
  const due = parsed?.due;
  const custom = due && !presets.some((p) => p.iso === due) ? due : undefined;

  const stats = useMemo(() => tokenStats(store.tasks, store.archived, false), [store.tasks, store.archived]);
  const tagSuggestions = useMemo(() => {
    const have = new Set([...(parsed?.projects ?? []).map((p) => `+${p}`), ...(parsed?.contexts ?? []).map((c) => `@${c}`)]);
    const all = [
      ...stats.projects.map((s) => ({ token: `+${s.name}`, total: s.total })),
      ...stats.contexts.map((s) => ({ token: `@${s.name}`, total: s.total })),
    ];
    const q = newTag.trim().toLowerCase();
    return all
      .filter((x) => !have.has(x.token) && (!q || x.token.toLowerCase().includes(q.replace(/^[+@]/, ""))))
      .sort((a, b) => b.total - a.total)
      .slice(0, 6);
  }, [stats, parsed?.projects, parsed?.contexts, newTag]);

  const setDue = (iso: string | undefined) => setDraft((d) => rebuild(d, { body: (b) => setTag(b, "due", iso) }));
  const addTag = (raw: string) => {
    const word = raw.trim().replace(/\s+/g, "");
    if (word.length < 2 || !/^[+@]/.test(word)) return;
    setDraft((d) => rebuild(d, { body: (b) => addToken(b, word) }));
    setNewTag("");
    setAdding(false);
  };

  const save = async () => {
    const line = draft.trim().replace(/\s+/g, " ");
    if (line && line !== task.raw) await store.replaceLine(task, line).catch(() => {});
    onClose();
  };

  const remove = async () => {
    onClose();
    const undo = await store.deleteTask(task).catch(() => undefined);
    if (undo) snack(t("m.deleted"), { label: t("m.undo"), run: () => void undo() });
  };

  return (
    <div className="m-scrim" onClick={onClose}>
      <div className="m-sheet" role="dialog" aria-label={t("m.editTask")} onClick={(e) => e.stopPropagation()}>
        <div className="m-handle" />
        <div className="m-sheet-body">
          <div className="m-sheet-head">
            <h2>{t("m.editTask")}</h2>
            <button type="button" className="m-close" aria-label={t("m.cancel")} onClick={onClose}>
              <X size={18} />
            </button>
          </div>

          <label className="m-field">
            <span className="m-field-label small">{t("m.rawLine")}</span>
            <div className="m-raw">
              <div className="m-raw-mirror" aria-hidden>
                {highlight(draft).map((s, i) => (
                  <span key={i} className={`seg-${s.kind}`}>
                    {s.text}
                  </span>
                ))}
                {"​"}
              </div>
              <textarea
                className="m-raw-input"
                value={draft}
                spellCheck={false}
                autoCapitalize="sentences"
                onChange={(e) => setDraft(e.target.value.replace(/\n/g, " "))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    save();
                  }
                }}
              />
            </div>
          </label>

          {parsed && !parsed.done && (
            <div className="m-field">
              <span className="m-field-label">{t("dlg.priority")}</span>
              <Segments
                value={parsed.priority ?? "none"}
                onChange={(p) => setDraft((d) => rebuild(d, { priority: p === "none" ? undefined : p }))}
                options={[
                  { value: "none", label: t("m.none") },
                  { value: "A", label: "A", className: "mono seg-a" },
                  { value: "B", label: "B", className: "mono seg-b" },
                  { value: "C", label: "C", className: "mono seg-c" },
                ]}
              />
            </div>
          )}

          <div className="m-field">
            <span className="m-field-label">{t("m.due")}</span>
            <div className="m-pills">
              {presets.map((p) => (
                <Pill key={p.key} selected={due === p.iso} icon={due === p.iso ? Calendar : undefined} onClick={() => setDue(due === p.iso ? undefined : p.iso)}>
                  {p.label}
                </Pill>
              ))}
              <Pill
                icon={Calendar}
                selected={!!custom}
                onClick={() => {
                  if (custom) return setDue(undefined);
                  const el = dateInput.current;
                  if (!el) return;
                  try {
                    el.showPicker();
                  } catch {
                    el.click();
                  }
                }}
              >
                {custom ? formatShort(custom, lang, today) : undefined}
              </Pill>
              <input ref={dateInput} type="date" className="m-hidden-date" value={due ?? ""} onChange={(e) => e.target.value && setDue(e.target.value)} />
            </div>
          </div>

          <div className="m-field">
            <span className="m-field-label">{t("m.tags")}</span>
            <div className="m-pills">
              {(parsed?.projects ?? []).map((p) => (
                <button key={`p${p}`} type="button" className="m-pill tag project" onClick={() => setDraft((d) => rebuild(d, { body: (b) => removeToken(b, `+${p}`) }))}>
                  +{p}
                  <X size={14} />
                </button>
              ))}
              {(parsed?.contexts ?? []).map((c) => (
                <button key={`c${c}`} type="button" className="m-pill tag context" onClick={() => setDraft((d) => rebuild(d, { body: (b) => removeToken(b, `@${c}`) }))}>
                  @{c}
                  <X size={14} />
                </button>
              ))}
              {!adding && (
                <Pill icon={Plus} className="add" onClick={() => setAdding(true)}>
                  {t("m.add")}
                </Pill>
              )}
            </div>
            {adding && (
              <div className="m-tag-add">
                <input
                  autoFocus
                  className="m-tag-input"
                  value={newTag}
                  placeholder={t("m.addPlaceholder")}
                  autoCapitalize="off"
                  spellCheck={false}
                  enterKeyHint="done"
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTag(newTag);
                    }
                  }}
                  onBlur={() => !newTag && setAdding(false)}
                />
                <div className="m-pills">
                  {tagSuggestions.map((s) => (
                    <button
                      key={s.token}
                      type="button"
                      className={`m-pill tag ${s.token.startsWith("+") ? "project" : "context"} soft`}
                      onPointerDown={(e) => e.preventDefault()}
                      onClick={() => addTag(s.token)}
                    >
                      {s.token}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="m-sheet-footer">
            <button type="button" className="m-delete" aria-label={t("dlg.delete")} onClick={remove}>
              <Trash2 size={20} />
            </button>
            <button type="button" className="m-primary" onClick={save}>
              {t("dlg.save")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
