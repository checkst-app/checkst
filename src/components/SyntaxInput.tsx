import { Archive, AtSign, Calendar, Folder, Plus } from "lucide-react";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import { formatWithWeekday, isValidIso, todayIso } from "../lib/dates";
import { useT } from "../lib/i18n";
import { useSettings } from "../lib/settings";
import { useTodos } from "../lib/store";
import {
  applySuggestion,
  type CaretToken,
  ghostFor,
  highlight,
  type Stats,
  type Suggestion,
  suggestionsFor,
  tokenAtCaret,
  tokenStats,
} from "../lib/suggest";
import { Keycap } from "./ui";

export interface Completion {
  token?: CaretToken;
  suggestions: Suggestion[];
  active: number;
  setActive: (i: number) => void;
  open: boolean;
  ghost: string;
  accept: (i?: number) => void;
  dismiss: () => void;
}

export function useStats(): Stats {
  const { tasks, archived } = useTodos();
  const { settings } = useSettings();
  return useMemo(() => tokenStats(tasks, archived, settings.suggestFromDone), [tasks, archived, settings.suggestFromDone]);
}

export interface SyntaxInputHandle {
  focus: () => void;
  input: HTMLInputElement | null;
}

type Variant = "quickadd" | "dialog" | "capture";

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSubmit?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onEscape?: () => void;
  onCompletion?: (c: Completion) => void;
  /** Handles a key before the input does (only while no suggestions are open). Return true if handled. */
  onKeyPassthrough?: (e: React.KeyboardEvent<HTMLInputElement>) => boolean;
  placeholder?: string;
  variant: Variant;
  autoFocus?: boolean;
  /** Render the floating suggestion popup (main window and dialog). */
  popup?: boolean;
  popupWidth?: number;
  className?: string;
}

export const SyntaxInput = forwardRef<SyntaxInputHandle, Props>(function SyntaxInput(
  { value, onChange, onSubmit, onEscape, onCompletion, onKeyPassthrough, placeholder, variant, autoFocus, popup = true, popupWidth = 320, className = "" },
  ref,
) {
  const { settings } = useSettings();
  const stats = useStats();
  const inputRef = useRef<HTMLInputElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [caret, setCaret] = useState(value.length);
  const [focused, setFocused] = useState(false);
  // A prefilled value (edit dialog) must not pop up suggestions for its last token right away.
  const [dismissedAt, setDismissedAt] = useState<number | null>(() => tokenAtCaret(value, value.length)?.start ?? null);
  const [active, setActive] = useState(0);
  const pendingCaret = useRef<number | null>(null);

  useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus(), input: inputRef.current }), []);

  // Parents pass inline handlers; keep them in a ref so callbacks below stay stable.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const token = useMemo(() => tokenAtCaret(value, caret), [value, caret]);
  const suggestions = useMemo(() => {
    if (!token) return [];
    if (token.kind !== "due" && !settings.suggest) return [];
    return suggestionsFor(token, stats, { order: settings.suggestOrder, today: todayIso(), weekStart: settings.weekStart });
  }, [token, stats, settings.suggest, settings.suggestOrder, settings.weekStart]);

  useEffect(() => setActive(0), [token?.kind, token?.query, token?.start]);

  const open = focused && !!token && suggestions.length > 0 && dismissedAt !== token.start;
  const atEnd = !!token && token.end === value.length && caret === value.length;
  const ghost = open && atEnd ? ghostFor(token, suggestions[active]) : "";

  const accept = useCallback(
    (i?: number) => {
      if (!token) return;
      const s = suggestions[i ?? active];
      if (!s) return;
      const res = applySuggestion(value, token, s.insert);
      pendingCaret.current = res.caret;
      onChangeRef.current(res.value);
    },
    [token, suggestions, active, value],
  );

  const completion: Completion = useMemo(
    () => ({ token, suggestions, active, setActive, open, ghost, accept, dismiss: () => token && setDismissedAt(token.start) }),
    [token, suggestions, active, open, ghost, accept],
  );

  useEffect(() => onCompletion?.(completion), [completion, onCompletion]);

  useLayoutEffect(() => {
    if (pendingCaret.current !== null && inputRef.current) {
      const c = pendingCaret.current;
      pendingCaret.current = null;
      inputRef.current.setSelectionRange(c, c);
      setCaret(c);
    }
    syncScroll();
  }, [value]);

  const syncScroll = () => {
    if (layerRef.current && inputRef.current) layerRef.current.scrollLeft = inputRef.current.scrollLeft;
  };

  const updateCaret = () => {
    const el = inputRef.current;
    if (!el) return;
    setCaret(el.selectionStart ?? el.value.length);
    syncScroll();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Parent gets the first say while no suggestions are open (quick bar list navigation).
    if (!open && onKeyPassthrough?.(e)) return;
    if (open) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((active + 1) % suggestions.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((active - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === "Tab") {
        e.preventDefault();
        accept();
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        token && setDismissedAt(token.start);
        return;
      }
    } else if (e.key === "Tab" && ghost) {
      e.preventDefault();
      accept();
      return;
    }
    if (e.key === "Escape") {
      onEscape?.();
      return;
    }
    if (e.key === "Enter") {
      // An unfinished "due:" or a bare "+"/"@" can't be meant literally: take the suggestion instead.
      if (open && token && ((token.kind === "due" && !isValidIso(token.query)) || token.query === "")) {
        e.preventDefault();
        accept();
        return;
      }
      onSubmit?.(e);
    }
  };

  const segments = useMemo(() => highlight(value), [value]);

  // Horizontal position of the current token, for the floating popup.
  const [anchorX, setAnchorX] = useState(0);
  useLayoutEffect(() => {
    if (!token || !layerRef.current) return;
    const el = layerRef.current.querySelector<HTMLElement>(`[data-start="${token.start}"]`);
    const x = el ? el.offsetLeft - layerRef.current.scrollLeft : 0;
    setAnchorX(Math.max(0, x - 12));
  }, [token?.start, value, open]);

  return (
    <div ref={wrapRef} className={`syntax-input syntax-${variant} ${className}`}>
      <div className="hl-layer" ref={layerRef} aria-hidden>
        {segments.map((s) => (
          <span key={s.start} data-start={s.start} className={`seg seg-${s.kind}`}>
            {s.text}
          </span>
        ))}
        {ghost && <span className="seg-ghost">{ghost}</span>}
      </div>
      <input
        ref={inputRef}
        className="hl-input"
        value={value}
        placeholder={placeholder}
        spellCheck={false}
        autoComplete="off"
        autoFocus={autoFocus}
        onChange={(e) => {
          onChange(e.target.value);
          setCaret(e.target.selectionStart ?? e.target.value.length);
          setDismissedAt(null);
        }}
        onKeyDown={onKeyDown}
        onKeyUp={updateCaret}
        onClick={updateCaret}
        onSelect={updateCaret}
        onScroll={syncScroll}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 120)}
      />
      {popup && open && (
        <div className="ac-popup" style={{ left: anchorX, width: popupWidth }} onMouseDown={(e) => e.preventDefault()}>
          <SuggestionList completion={completion} variant="popup" />
        </div>
      )}
    </div>
  );
});

export function SuggestionList({ completion, variant }: { completion: Completion; variant: "popup" | "capture" }) {
  const { t, lang } = useT();
  const { settings } = useSettings();
  const { token, suggestions, active, setActive, accept } = completion;
  if (!token) return null;
  const isDue = token.kind === "due";
  const sigil = token.kind === "project" ? "+" : "@";
  const header = isDue ? t("ac.pickDue") : token.kind === "project" ? t("ac.projects") : t("ac.contexts");
  const sortLabel = isDue ? "" : settings.suggestOrder === "frequency" ? t("ac.byFrequency") : t("ac.alphabetical");
  const capture = variant === "capture";
  const items = suggestions.filter((s) => s.type !== "new");
  const newItem = suggestions.find((s) => s.type === "new");

  const count = (n: number, open: boolean) =>
    open ? (n === 1 ? t("ac.openTask") : t("ac.openTasks", { n })) : n === 1 ? t("ac.task") : t("ac.tasks", { n });

  const dayName = (key: string) =>
    key === "monday" ? (settings.weekStart === "sunday" ? t("ac.sunday") : t("ac.monday")) : t(`ac.${key}` as never);

  return (
    <div className={`ac-list ac-${variant}`}>
      <div className="ac-section">
        <span>{header}</span>
        {sortLabel && <span>{sortLabel}</span>}
      </div>
      {items.map((s) => {
        const i = suggestions.indexOf(s);
        const on = i === active;
        return (
          <button
            key={s.insert}
            type="button"
            className={`ac-item ${on ? "active" : ""}`}
            onMouseEnter={() => setActive(i)}
            onClick={() => accept(i)}
          >
            {!capture && <span className="ac-indicator" />}
            {s.type === "date" ? (
              <>
                <Calendar size={16} className="ac-icon-due" />
                <span className="ac-name">{dayName(s.date.key)}</span>
                <span className="ac-meta">{formatWithWeekday(s.date.iso, lang, settings.dateFormat)}</span>
                <span className="ac-raw">due:{s.date.iso}</span>
              </>
            ) : s.type === "token" ? (
              <>
                {s.stat.onlyDone ? (
                  <Archive size={capture ? 17 : 16} className={`ac-icon-${s.kind}`} />
                ) : s.kind === "project" ? (
                  <Folder size={capture ? 17 : 16} className="ac-icon-project" />
                ) : (
                  <AtSign size={capture ? 17 : 16} className="ac-icon-context" />
                )}
                <span className="ac-name">
                  <MatchText name={s.name} query={token.query} sigil={sigil} kind={s.kind} capture={capture} />
                </span>
                <span className="ac-meta">{s.stat.onlyDone ? t("ac.onlyDone") : count(capture ? s.stat.open : s.stat.total, capture)}</span>
                {capture && on && <Keycap>Tab</Keycap>}
              </>
            ) : null}
          </button>
        );
      })}
      {newItem && newItem.type === "new" && (
        <>
          {!capture && items.length > 0 && <div className="ac-divider" />}
          <div className="ac-item ac-new">
            <Plus size={capture ? 17 : 16} />
            <span>{newItem.kind === "project" ? t("ac.newProject") : t("ac.newContext")}</span>
            <span className={`ac-token ac-token-${newItem.kind}`}>{newItem.insert}</span>
            <span>{t("ac.create")}</span>
          </div>
        </>
      )}
      {!capture && (
        <div className="ac-hints">
          <span className="ac-hint">
            <Keycap small>↑</Keycap>
            <Keycap small>↓</Keycap>
            {t("ac.select")}
          </span>
          <span className="ac-hint">
            <Keycap small>Tab</Keycap>
            {t("ac.accept")}
          </span>
          <span className="ac-hint">
            <Keycap small>Esc</Keycap>
            {t("ac.close")}
          </span>
        </div>
      )}
    </div>
  );
}

function MatchText({ name, query, sigil, kind, capture }: { name: string; query: string; sigil: string; kind: "project" | "context"; capture: boolean }) {
  const prefix = name.toLowerCase().startsWith(query.toLowerCase());
  const match = sigil + (prefix ? name.slice(0, query.length) : "");
  const rest = prefix ? name.slice(query.length) : name;
  // Contexts and the capture bar color the typed part; projects in the popup keep it neutral (as in the design).
  const colored = kind === "context" || capture;
  return (
    <>
      <b className={colored ? `ac-match-${kind}` : ""}>{match}</b>
      <span>{rest}</span>
    </>
  );
}
