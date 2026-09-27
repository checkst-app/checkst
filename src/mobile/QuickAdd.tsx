import { ArrowUp, AtSign, Calendar, Folder, Plus } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Keycap } from "../components/ui";
import { addDays, formatShort, todayIso } from "../lib/dates";
import { useT } from "../lib/i18n";
import { useSettings } from "../lib/settings";
import { useTodos } from "../lib/store";
import { applySuggestion, ghostFor, highlight, type Suggestion, suggestionsFor, tokenAtCaret, tokenStats } from "../lib/suggest";
import { lineFromInput, parseLine, withDefaults } from "../lib/todo";
import { useSnack } from "./common";
import { useFeedback } from "./feedback";

/** "(A) …" → "(B) …" → "(C) …" → "…" */
function cyclePriority(value: string): string {
  const m = /^\(([A-Z])\)\s*/.exec(value);
  if (!m) return `(A) ${value}`;
  const next = { A: "B", B: "C" }[m[1]];
  return next ? `(${next}) ${value.slice(m[0].length)}` : value.slice(m[0].length);
}

function withDue(value: string, iso: string): string {
  const rest = value.replace(/(^|\s)due:\S*/gi, "").trim();
  return `${rest}${rest ? " " : ""}due:${iso} `;
}

export function QuickAdd({ extraTokens = [], onFocusChange }: { extraTokens?: string[]; onFocusChange: (focused: boolean) => void }) {
  const { t, lang } = useT();
  const { settings } = useSettings();
  const store = useTodos();
  const snack = useSnack();
  const feedback = useFeedback();
  const [value, setValue] = useState("");
  const [caret, setCaret] = useState(0);
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState<number | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const mirror = useRef<HTMLDivElement>(null);
  const pendingCaret = useRef<number | null>(null);
  const today = todayIso();

  const stats = useMemo(() => tokenStats(store.tasks, store.archived, settings.suggestFromDone), [store.tasks, store.archived, settings.suggestFromDone]);
  const token = focused ? tokenAtCaret(value, caret) : undefined;
  const suggestions: Suggestion[] =
    token && dismissed !== token.start
      ? suggestionsFor(token, stats, { order: settings.suggestOrder, today, weekStart: settings.weekStart, limit: 3 })
      : [];
  const ghost = caret === value.length ? ghostFor(token, suggestions[0]) : "";

  const withExtras = (v: string) => withDefaults(v, extraTokens);
  const preview = value.trim()
    ? lineFromInput(withExtras(value), { creationDate: settings.addCreationDate ? today : undefined, defaultPriority: settings.defaultPriority || undefined })
    : "";

  // Android's back button hides the keyboard but keeps the focus: blur once the window grows back.
  useEffect(() => {
    if (!focused) return;
    const opened = window.innerHeight;
    let smallest = opened;
    const onResize = () => {
      smallest = Math.min(smallest, window.innerHeight);
      if (smallest < opened - 120 && window.innerHeight > smallest + 120) input.current?.blur();
      else if (smallest === opened && window.innerHeight > opened + 120) input.current?.blur();
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [focused]);

  // Keep the caret where an inserted token or suggestion put it.
  useLayoutEffect(() => {
    const c = pendingCaret.current;
    if (c === null || !input.current) return;
    pendingCaret.current = null;
    input.current.setSelectionRange(c, c);
    setCaret(c);
  });

  const setAt = (next: string, nextCaret: number) => {
    setValue(next);
    pendingCaret.current = nextCaret;
    setDismissed(null);
  };

  const syncScroll = () => {
    if (mirror.current && input.current) mirror.current.scrollLeft = input.current.scrollLeft;
  };

  const accept = (s: Suggestion) => {
    if (!token) return;
    const r = applySuggestion(value, token, s.insert);
    setAt(r.value, r.caret);
  };

  const insert = (text: string) => {
    const before = value.slice(0, caret);
    const after = value.slice(caret);
    const lead = before && !before.endsWith(" ") ? " " : "";
    setAt(before + lead + text + after, before.length + lead.length + text.length);
  };

  const submit = async () => {
    if (!value.trim()) return;
    const typed = value;
    const raw = preview; // exactly the line addFromInput writes
    setValue("");
    setCaret(0);
    try {
      const line = await store.addFromInput(withExtras(typed));
      if (line === undefined) return;
      feedback("tick");
      const added = parseLine(raw, line);
      snack(t("m.added"), added && { label: t("m.undo"), run: () => void store.deleteTask(added).catch(() => {}) });
    } catch {
      setValue(typed);
    }
  };

  const segments = highlight(value);

  return (
    <div className="m-quick">
      {focused && suggestions.length > 0 && token && (
        <div className="m-suggest-wrap">
          <div className="m-suggest" onPointerDown={(e) => e.preventDefault()}>
            <div className="m-suggest-head">
              <span>{token.kind === "due" ? t("ac.pickDue") : token.kind === "project" ? t("ac.projects") : t("ac.contexts")}</span>
              {token.kind !== "due" && <span>{settings.suggestOrder === "frequency" ? t("ac.byFrequency") : t("ac.alphabetical")}</span>}
            </div>
            {suggestions.map((s, i) => (
              <button key={s.insert + i} type="button" className={`m-suggest-item ${i === 0 ? "active" : ""}`} onClick={() => accept(s)}>
                {s.type === "date" ? <Calendar size={17} className="tone-accent" /> : s.kind === "project" ? <Folder size={17} className="tone-project" /> : <AtSign size={17} className="tone-context" />}
                <span className={`m-suggest-name ${s.type === "date" ? "" : s.kind === "project" ? "tone-project" : "tone-context"}`}>
                  {s.type === "date" ? (
                    <>
                      {t(`ac.${s.date.key}` as never)} <small>{formatShort(s.date.iso, lang, today)}</small>
                    </>
                  ) : s.type === "new" ? (
                    <>
                      {s.insert} <small>{s.kind === "project" ? t("ac.newProject") : t("ac.newContext")}</small>
                    </>
                  ) : (
                    <>
                      {s.kind === "project" ? "+" : "@"}
                      <b>{s.name.slice(0, token.query.length)}</b>
                      {s.name.slice(token.query.length)}
                    </>
                  )}
                </span>
                {s.type === "token" && (
                  <span className="m-suggest-meta">{s.stat.open === 1 ? t("ac.openTask") : t("ac.openTasks", { n: s.stat.open })}</span>
                )}
                {i === 0 && <Keycap small>Tab</Keycap>}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="m-quick-wrap">
        <div className={`m-quick-bar ${focused ? "focused" : ""}`} onClick={() => input.current?.focus()}>
          <Plus size={19} className="m-quick-plus" />
          <div className="m-quick-field">
            <div className="m-quick-mirror" ref={mirror} aria-hidden>
              {segments.map((s, i) => (
                <span key={i} className={`seg-${s.kind}`}>
                  {s.text}
                </span>
              ))}
              {ghost && <span className="m-ghost">{ghost}</span>}
            </div>
            <input
              ref={input}
              className="m-quick-input"
              value={value}
              placeholder={t("nav.newTask")}
              enterKeyHint="send"
              autoCapitalize="sentences"
              spellCheck={false}
              onChange={(e) => {
                setValue(e.target.value);
                setCaret(e.target.selectionStart ?? e.target.value.length);
                setDismissed(null);
                requestAnimationFrame(syncScroll);
              }}
              onSelect={(e) => {
                setCaret(e.currentTarget.selectionStart ?? 0);
                syncScroll();
              }}
              onScroll={syncScroll}
              onFocus={() => {
                setFocused(true);
                onFocusChange(true);
              }}
              onBlur={() => {
                setFocused(false);
                onFocusChange(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submit();
                } else if (e.key === "Tab" && suggestions[0]) {
                  e.preventDefault();
                  accept(suggestions[0]);
                } else if (e.key === "Escape" && token) {
                  setDismissed(token.start);
                }
              }}
            />
          </div>
          <button
            type="button"
            className={`m-send ${value.trim() ? "ready" : ""}`}
            aria-label={t("qc.save")}
            onPointerDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.stopPropagation();
              submit();
            }}
          >
            <ArrowUp size={18} />
          </button>
        </div>
      </div>

      {focused && preview && (
        <div className="m-preview">
          <span>{t("qc.preview")}</span>
          <code>{preview}</code>
        </div>
      )}

      {focused && (
        <div className="m-tokenbar" onPointerDown={(e) => e.preventDefault()}>
          <button type="button" className="m-token mono tone-prio-a" onClick={() => setAt(cyclePriority(value), cyclePriority(value).length)}>
            (A)
          </button>
          <button type="button" className="m-token mono tone-project" onClick={() => insert("+")}>
            +
          </button>
          <button type="button" className="m-token mono tone-context" onClick={() => insert("@")}>
            @
          </button>
          <button type="button" className="m-token mono tone-accent" onClick={() => insert("due:")}>
            due:
          </button>
          <button type="button" className="m-token" onClick={() => setAt(withDue(value, today), withDue(value, today).length)}>
            {t("ac.today")}
          </button>
          <button type="button" className="m-token" onClick={() => setAt(withDue(value, addDays(today, 1)), withDue(value, addDays(today, 1)).length)}>
            {t("ac.tomorrow")}
          </button>
        </div>
      )}
    </div>
  );
}
