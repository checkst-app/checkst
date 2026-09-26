import { Check, ChevronDown, type LucideIcon } from "lucide-react";
import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { bodyParts } from "../lib/todo";

/** The "Offenes c" mark: exact geometry from the design (viewBox 100). */
export function Mark({ size = 18, color = "currentColor", check, weight = 12 }: { size?: number; color?: string; check?: string; weight?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth={weight} aria-hidden>
      <path d="M70 15.36 A40 40 0 1 0 70 84.64" stroke={color} />
      <path d="M32 50 l16 16 42 -40" stroke={check ?? color} />
    </svg>
  );
}

export function AppIcon({ size = 18, radius = 5 }: { size?: number; radius?: number }) {
  return (
    <span className="app-icon" style={{ width: size, height: size, borderRadius: radius }}>
      <Mark size={Math.round(size * 0.66)} color="var(--on-accent)" weight={13} />
    </span>
  );
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  variant = "secondary",
  icon: Icon,
  children,
  onClick,
  disabled,
  title,
  className = "",
  style,
  type = "button",
  iconColor,
}: {
  variant?: ButtonVariant;
  icon?: LucideIcon;
  children?: ReactNode;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  title?: string;
  className?: string;
  style?: CSSProperties;
  type?: "button" | "submit";
  iconColor?: string;
}) {
  return (
    <button
      type={type}
      className={`btn btn-${variant} ${children ? "" : "btn-icon-only"} ${className}`}
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={style}
    >
      {Icon && <Icon size={16} strokeWidth={2} style={iconColor ? { color: iconColor } : undefined} />}
      {children && <span className="btn-label">{children}</span>}
    </button>
  );
}

export function ProjectChip({ name, onRemove, outlined, onClick }: { name: string; onRemove?: () => void; outlined?: boolean; onClick?: () => void }) {
  return (
    <span className={`chip chip-project ${outlined ? "chip-outlined" : ""} ${onClick ? "chip-clickable" : ""}`} onClick={onClick}>
      +{name}
      {onRemove && <ChipRemove onRemove={onRemove} />}
    </span>
  );
}

export function ContextChip({ name, onRemove, outlined, onClick }: { name: string; onRemove?: () => void; outlined?: boolean; onClick?: () => void }) {
  return (
    <span className={`chip chip-context ${outlined ? "chip-outlined" : ""} ${onClick ? "chip-clickable" : ""}`} onClick={onClick}>
      @{name}
      {onRemove && <ChipRemove onRemove={onRemove} />}
    </span>
  );
}

function ChipRemove({ onRemove }: { onRemove: () => void }) {
  return (
    <button
      type="button"
      className="chip-remove"
      onClick={(e) => {
        e.stopPropagation();
        onRemove();
      }}
      aria-label="remove"
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M18 6 6 18M6 6l12 12" />
      </svg>
    </button>
  );
}

/** Task description with +project / @context badges inline, where they were typed. */
export function TaskBody({
  body,
  className = "",
  onProject,
  onContext,
}: {
  body: string;
  className?: string;
  onProject?: (name: string) => void;
  onContext?: (name: string) => void;
}) {
  const parts = bodyParts(body);
  return (
    <span className={`task-text ${className}`}>
      {parts.map((p, i) =>
        p.kind === "text" ? (
          <span key={i} className="task-words">
            {p.text}
          </span>
        ) : p.kind === "project" ? (
          <ProjectChip key={i} name={p.name} onClick={onProject ? () => onProject(p.name) : undefined} />
        ) : (
          <ContextChip key={i} name={p.name} onClick={onContext ? () => onContext(p.name) : undefined} />
        ),
      )}
    </span>
  );
}

export function prioClass(p?: string) {
  return p === "A" ? "a" : p === "B" ? "b" : p === "C" ? "c" : "other";
}

export function PriorityBadge({ priority }: { priority: string }) {
  return <span className={`prio-badge prio-${prioClass(priority)}`}>{priority}</span>;
}

export function Checkbox({
  checked,
  onChange,
  highlight,
  label,
  title,
}: {
  checked: boolean;
  onChange?: () => void;
  highlight?: boolean;
  label?: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      title={title}
      className={`checkbox ${checked ? "checked" : ""} ${highlight ? "highlight" : ""}`}
      onClick={(e) => {
        e.stopPropagation();
        onChange?.();
      }}
    >
      {checked && <Check size={12} strokeWidth={3} />}
    </button>
  );
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className={`toggle ${on ? "on" : ""}`} onClick={() => onChange(!on)}>
      <span className="knob" />
    </button>
  );
}

export function Keycap({ children, small }: { children: ReactNode; small?: boolean }) {
  return <kbd className={`keycap ${small ? "keycap-sm" : ""}`}>{children}</kbd>;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className = "",
}: {
  options: { value: T; label: ReactNode; className?: string }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={`segmented ${className}`} role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={`segment ${o.value === value ? "active" : ""} ${o.className ?? ""}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---------- popover / menu ----------

export interface MenuItem {
  key: string;
  label: ReactNode;
  icon?: LucideIcon;
  iconColor?: string;
  checked?: boolean;
  danger?: boolean;
  hint?: ReactNode;
  divider?: boolean;
  onSelect?: () => void;
}

export function usePopover() {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLElement | null>(null);
  const toggle = useCallback((el?: HTMLElement | null) => {
    if (el) anchor.current = el;
    setOpen((o) => !o);
  }, []);
  return { open, setOpen, anchor, toggle };
}

export function Popover({
  anchor,
  open,
  onClose,
  children,
  align = "left",
  offset = 6,
  className = "",
  minWidth,
}: {
  anchor: React.RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  align?: "left" | "right";
  offset?: number;
  className?: string;
  minWidth?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; minWidth: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !anchor.current) return;
    const r = anchor.current.getBoundingClientRect();
    const width = ref.current?.offsetWidth ?? 220;
    const height = ref.current?.offsetHeight ?? 200;
    let left = align === "right" ? r.right - width : r.left;
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
    let top = r.bottom + offset;
    if (top + height > window.innerHeight - 8) top = Math.max(8, r.top - height - offset);
    setPos({ top, left, minWidth: minWidth ?? r.width });
  }, [open, anchor, align, offset, minWidth]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current?.contains(e.target as Node) || anchor.current?.contains(e.target as Node)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("mousedown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open, onClose, anchor]);

  if (!open) return null;
  return createPortal(
    <div
      ref={ref}
      className={`popover ${className}`}
      style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, minWidth: pos?.minWidth, visibility: pos ? "visible" : "hidden" }}
    >
      {children}
    </div>,
    document.body,
  );
}

export function MenuList({ items, onClose }: { items: MenuItem[]; onClose: () => void }) {
  const [active, setActive] = useState(() => Math.max(0, items.findIndex((i) => i.checked)));
  const selectable = items.filter((i) => !i.divider);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((a) => (a + 1) % selectable.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((a) => (a - 1 + selectable.length) % selectable.length);
      } else if (e.key === "Enter") {
        e.preventDefault();
        selectable[active]?.onSelect?.();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, selectable, onClose]);

  let idx = -1;
  return (
    <div className="menu" role="menu">
      {items.map((item) => {
        if (item.divider) return <div key={item.key} className="menu-divider" />;
        idx++;
        const i = idx;
        const Icon = item.icon;
        return (
          <button
            key={item.key}
            type="button"
            role="menuitem"
            className={`menu-item ${i === active ? "active" : ""} ${item.danger ? "danger" : ""}`}
            onMouseEnter={() => setActive(i)}
            onClick={() => {
              item.onSelect?.();
              onClose();
            }}
          >
            {Icon && <Icon size={15} style={item.iconColor ? { color: item.iconColor } : undefined} />}
            <span className="menu-label">{item.label}</span>
            {item.hint && <span className="menu-hint">{item.hint}</span>}
            {item.checked && <Check size={14} className="menu-check" />}
          </button>
        );
      })}
    </div>
  );
}

export function MenuButton({
  items,
  children,
  icon,
  variant = "secondary",
  align = "left",
  title,
  className,
}: {
  items: MenuItem[];
  children?: ReactNode;
  icon?: LucideIcon;
  variant?: ButtonVariant;
  align?: "left" | "right";
  title?: string;
  className?: string;
}) {
  const pop = usePopover();
  const wrap = useRef<HTMLSpanElement>(null);
  return (
    <>
      <span ref={wrap} className="menu-anchor">
        <Button variant={variant} icon={icon} title={title} className={className} onClick={() => pop.toggle(wrap.current)}>
          {children}
        </Button>
      </span>
      <Popover anchor={pop.anchor} open={pop.open} onClose={() => pop.setOpen(false)} align={align} minWidth={180}>
        <MenuList items={items} onClose={() => pop.setOpen(false)} />
      </Popover>
    </>
  );
}

export function Select<T extends string | number>({
  value,
  options,
  onChange,
  width = 200,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
  width?: number;
}) {
  const pop = usePopover();
  const btn = useRef<HTMLButtonElement>(null);
  const current = options.find((o) => o.value === value);
  return (
    <>
      <button ref={btn} type="button" className="select" style={{ width }} onClick={() => pop.toggle(btn.current)}>
        <span className="select-value">{current?.label}</span>
        <ChevronDown size={16} />
      </button>
      <Popover anchor={pop.anchor} open={pop.open} onClose={() => pop.setOpen(false)}>
        <MenuList
          items={options.map((o) => ({ key: String(o.value), label: o.label, checked: o.value === value, onSelect: () => onChange(o.value) }))}
          onClose={() => pop.setOpen(false)}
        />
      </Popover>
    </>
  );
}
