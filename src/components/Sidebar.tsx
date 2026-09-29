import {
  AtSign,
  CalendarDays,
  CircleArrowDown,
  CircleCheck,
  Flag,
  Folder,
  Inbox,
  type LucideIcon,
  Plus,
  Search,
  Settings as SettingsIcon,
  Sun,
  X,
} from "lucide-react";
import { forwardRef, useState } from "react";
import type { UpdateState } from "../App";
import { backend, fileName } from "../lib/backend";
import { useT } from "../lib/i18n";
import { useSettings } from "../lib/settings";
import { useTodos } from "../lib/store";
import { type Counts, sameView, type View } from "../lib/views";
import { Button } from "./ui";

export function NavItem({
  icon: Icon,
  iconColor,
  label,
  count,
  active,
  onClick,
}: {
  icon: LucideIcon;
  iconColor?: string;
  label: string;
  count?: number;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className={`nav-item ${active ? "active" : ""}`} onClick={onClick}>
      <Icon size={16} style={{ color: active ? "var(--accent)" : iconColor }} />
      <span className="nav-label">{label}</span>
      {count !== undefined && <span className="nav-count">{count}</span>}
    </button>
  );
}

interface Props {
  view: View;
  onView: (v: View) => void;
  counts: Counts;
  search: string;
  onSearch: (q: string) => void;
  onNewTask: () => void;
  onSettings: () => void;
  settingsActive: boolean;
  update: UpdateState;
  onDownloadUpdate: () => void;
}

function UpdateCard({ update, onDownload }: { update: UpdateState; onDownload: () => void }) {
  const { t } = useT();
  if (update.phase !== "available" && update.phase !== "downloading" && update.phase !== "ready") return null;
  const ready = update.phase === "ready";
  return (
    <div className="update-card">
      <div className="update-card-title">
        <CircleArrowDown size={16} />
        <b>{t(ready ? "update.ready" : "update.available", { version: update.version })}</b>
      </div>
      <p>{t(ready ? "update.readyDesc" : update.phase === "downloading" ? "set.downloading" : "update.availableDesc")}</p>
      {ready && (
        <button type="button" onClick={() => backend.applyUpdate()}>
          {t("set.restartNow")}
        </button>
      )}
      {update.phase === "available" && (
        <button type="button" onClick={onDownload}>
          {t("set.download")}
        </button>
      )}
    </div>
  );
}

export const Sidebar = forwardRef<HTMLInputElement, Props>(function Sidebar(
  { view, onView, counts, search, onSearch, onNewTask, onSettings, settingsActive, update, onDownloadUpdate },
  searchRef,
) {
  const { t } = useT();
  const { settings } = useSettings();
  const { status } = useTodos();
  const [hint, setHint] = useState<"project" | "context" | null>(null);
  const file = fileName(settings.todoPath || "todo.txt");
  const is = (v: View) => !settingsActive && sameView(view, v);

  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <Button variant="primary" icon={Plus} onClick={onNewTask} className="new-task-btn">
          {t("nav.newTask")}
        </Button>
        <label className="search">
          <Search size={15} />
          <input ref={searchRef} value={search} onChange={(e) => onSearch(e.target.value)} placeholder={t("nav.search")} spellCheck={false} />
          {search ? (
            <button type="button" className="search-clear" onClick={() => onSearch("")}>
              <X size={13} />
            </button>
          ) : (
            <span className="search-shortcut">{t("nav.searchShortcut")}</span>
          )}
        </label>
      </div>

      <div className="sidebar-scroll">
        <nav className="nav-group">
          <NavItem icon={Sun} label={t("nav.today")} count={counts.today} active={is({ kind: "today" })} onClick={() => onView({ kind: "today" })} />
          <NavItem icon={Inbox} label={t("nav.all")} count={counts.all} active={is({ kind: "all" })} onClick={() => onView({ kind: "all" })} />
          <NavItem
            icon={CalendarDays}
            label={t("nav.upcoming")}
            count={counts.upcoming}
            active={is({ kind: "upcoming" })}
            onClick={() => onView({ kind: "upcoming" })}
          />
          <NavItem icon={Flag} label={t("nav.priorityA")} count={counts.prioA} active={is({ kind: "prioA" })} onClick={() => onView({ kind: "prioA" })} />
          <NavItem icon={CircleCheck} label={t("nav.done")} count={counts.done} active={is({ kind: "done" })} onClick={() => onView({ kind: "done" })} />
        </nav>

        <nav className="nav-group">
          <div className="nav-header">
            <span>{t("nav.projects")}</span>
            <button type="button" onClick={() => setHint(hint === "project" ? null : "project")} title={t("nav.newProjectHint")}>
              <Plus size={14} />
            </button>
          </div>
          {hint === "project" && <p className="nav-hint">{t("nav.newProjectHint")}</p>}
          {counts.projects.map(([name, n]) => (
            <NavItem
              key={name}
              icon={Folder}
              iconColor="var(--project)"
              label={`+${name}`}
              count={n}
              active={is({ kind: "project", name })}
              onClick={() => onView({ kind: "project", name })}
            />
          ))}
        </nav>

        <nav className="nav-group">
          <div className="nav-header">
            <span>{t("nav.contexts")}</span>
            <button type="button" onClick={() => setHint(hint === "context" ? null : "context")} title={t("nav.newContextHint")}>
              <Plus size={14} />
            </button>
          </div>
          {hint === "context" && <p className="nav-hint">{t("nav.newContextHint")}</p>}
          {counts.contexts.map(([name, n]) => (
            <NavItem
              key={name}
              icon={AtSign}
              iconColor="var(--context)"
              label={`@${name}`}
              count={n}
              active={is({ kind: "context", name })}
              onClick={() => onView({ kind: "context", name })}
            />
          ))}
        </nav>
      </div>

      <div className="sidebar-bottom">
        <UpdateCard update={update} onDownload={onDownloadUpdate} />
        {/* Saving is silent; only problems with the file show up here. */}
        {(status === "error" || status === "missing") && (
          <div className={`file-status status-${status}`} title={settings.todoPath}>
            <span className="dot" />
            <span>{status === "error" ? t("status.error") : t("status.missing", { file })}</span>
          </div>
        )}
        <NavItem icon={SettingsIcon} label={t("nav.settings")} active={settingsActive} onClick={onSettings} />
      </div>
    </aside>
  );
});
