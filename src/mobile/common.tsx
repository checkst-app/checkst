import { ArrowLeft, Check, type LucideIcon } from "lucide-react";
import { type ReactNode, createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { backend } from "../lib/backend";
import { useSettings } from "../lib/settings";
import { useSystemDark } from "../lib/theme";

/** CSS hex (#rgb, #rgba, #rrggbb, #rrggbbaa; the build minifies #ffffff to #fff) as #rrggbbaa. */
function longHex(c: string): string {
  const h = c.trim().replace(/^#/, "");
  const full = h.length <= 4 ? [...h].map((x) => x + x).join("") : h;
  return `#${full.padEnd(8, "f").slice(0, 8)}`;
}

/** `base` with the translucent `layer` painted over it, as #rrggbb (what Android understands). */
function over(base: string, layer?: string): string {
  const [b, l] = [longHex(base), longHex(layer ?? "#00000000")];
  const ch = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  const a = ch(l, 3) / 255;
  return `#${[0, 1, 2].map((i) => Math.round(ch(b, i) * (1 - a) + ch(l, i) * a).toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Status bar area in the app bar color, navigation bar area in `bottom` (a CSS variable).
 * With `dim` the status bar gets the sheet scrim too.
 */
export function useSystemBars(bottom: "--surface" | "--bg", dim = false, enabled = true) {
  const { settings } = useSettings();
  const systemDark = useSystemDark();
  useEffect(() => {
    if (!enabled) return;
    const id = requestAnimationFrame(() => {
      const root = document.documentElement;
      const css = getComputedStyle(root);
      const top = css.getPropertyValue("--bg");
      backend
        .setSystemBars(root.dataset.theme === "dark", over(top, dim ? css.getPropertyValue("--scrim") : undefined), over(css.getPropertyValue(bottom)))
        .catch(() => {});
    });
    return () => cancelAnimationFrame(id);
  }, [settings.theme, settings.accent, systemDark, bottom, dim, enabled]);
}

// ---------- snackbar ----------

export interface Snack {
  id: number;
  text: string;
  action?: { label: string; run: () => void };
}

const SnackContext = createContext<(text: string, action?: Snack["action"]) => void>(() => {});
export const useSnack = () => useContext(SnackContext);

export function SnackProvider({ children }: { children: ReactNode }) {
  const [snack, setSnack] = useState<Snack | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const show = useCallback((text: string, action?: Snack["action"]) => {
    window.clearTimeout(timer.current);
    setSnack({ id: Date.now(), text, action });
    timer.current = window.setTimeout(() => setSnack(null), action ? 5000 : 2500);
  }, []);
  return (
    <SnackContext.Provider value={show}>
      {children}
      {snack && (
        <div className="m-snack" key={snack.id} role="status">
          <span>{snack.text}</span>
          {snack.action && (
            <button
              type="button"
              onClick={() => {
                snack.action?.run();
                setSnack(null);
              }}
            >
              {snack.action.label}
            </button>
          )}
        </div>
      )}
    </SnackContext.Provider>
  );
}

// ---------- building blocks from the design ----------

type IconType = LucideIcon | ((p: { size?: number }) => ReactNode);

/** GitHub's octicon "mark-github" (lucide ships no brand icons). */
export function GithubIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

export function IconButton({ icon: Icon, label, onClick, dot }: { icon: LucideIcon; label: string; onClick: () => void; dot?: boolean }) {
  return (
    <button type="button" className="m-icon-btn" aria-label={label} onClick={onClick}>
      <Icon size={21} />
      {dot && <span className="m-dot" />}
    </button>
  );
}

export function AppBar({ title, summary, actions, onBack }: { title: ReactNode; summary?: ReactNode; actions?: ReactNode; onBack?: () => void }) {
  return (
    <header className={`m-appbar ${onBack ? "with-back" : ""}`}>
      {onBack && (
        <button type="button" className="m-icon-btn m-back" aria-label="back" onClick={onBack}>
          <ArrowLeft size={22} />
        </button>
      )}
      <div className="m-title-group">
        <h1 className="m-title">{title}</h1>
        {summary && <div className="m-summary">{summary}</div>}
      </div>
      {actions}
    </header>
  );
}

export function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="m-section">
      <div className="m-section-head">
        <span>{title}</span>
        {aside}
      </div>
      <div className="m-card">{children}</div>
    </section>
  );
}

export function ListRow({
  icon: Icon,
  tone,
  label,
  labelTone,
  sub,
  mono,
  count,
  right,
  onClick,
}: {
  icon?: IconType;
  tone?: "project" | "context" | "prio-a" | "accent";
  label: ReactNode;
  labelTone?: "project" | "context";
  sub?: ReactNode;
  mono?: boolean;
  count?: number;
  right?: ReactNode;
  onClick?: () => void;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag type={onClick ? "button" : undefined} className={`m-row ${sub ? "tall" : ""}`} onClick={onClick}>
      {Icon && (
        <span className={`m-icon-box ${tone ? `tone-${tone}` : ""}`}>
          <Icon size={16} />
        </span>
      )}
      <span className="m-row-text">
        <span className={`m-row-label ${labelTone ? `tone-${labelTone}` : ""}`}>{label}</span>
        {sub && <span className={`m-row-sub ${mono ? "mono" : ""}`}>{sub}</span>}
      </span>
      {count !== undefined && <span className="m-row-count">{count}</span>}
      {right}
    </Tag>
  );
}

export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className={`m-switch ${on ? "on" : ""}`} onClick={() => onChange(!on)}>
      <span className="knob" />
    </button>
  );
}

export function Segments<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: ReactNode; icon?: LucideIcon; className?: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="m-seg" role="radiogroup">
      {options.map((o) => {
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={o.value === value}
            className={`m-seg-item ${o.value === value ? "active" : ""} ${o.className ?? ""}`}
            onClick={() => onChange(o.value)}
          >
            {Icon && <Icon size={16} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Pill({
  children,
  icon: Icon,
  selected,
  onClick,
  className = "",
}: {
  children?: ReactNode;
  icon?: LucideIcon;
  selected?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  const ShownIcon = selected && Icon && children ? Check : Icon;
  return (
    <button type="button" className={`m-pill ${selected ? "selected" : ""} ${children ? "" : "icon-only"} ${className}`} onClick={onClick}>
      {ShownIcon && <ShownIcon size={15} />}
      {children}
    </button>
  );
}

/** Bottom sheet with a list of actions (e.g. "Open another file"). */
export function ActionSheet({
  open,
  onClose,
  actions,
  cancel,
}: {
  open: boolean;
  onClose: () => void;
  actions: { label: string; icon: LucideIcon; run: () => void }[];
  cancel: string;
}) {
  if (!open) return null;
  return (
    <div className="m-scrim" onClick={onClose}>
      <div className="m-sheet m-action-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="m-handle" />
        {actions.map((a) => (
          <button
            key={a.label}
            type="button"
            className="m-action"
            onClick={() => {
              onClose();
              a.run();
            }}
          >
            <a.icon size={19} />
            {a.label}
          </button>
        ))}
        <button type="button" className="m-action cancel" onClick={onClose}>
          {cancel}
        </button>
      </div>
    </div>
  );
}
