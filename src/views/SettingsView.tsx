import { getVersion } from "@tauri-apps/api/app";
import { disable as disableAutostart, enable as enableAutostart, isEnabled as autostartEnabled } from "@tauri-apps/plugin-autostart";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { openUrl, revealItemInDir } from "@tauri-apps/plugin-opener";
import {
  Bug,
  CircleCheck,
  ExternalLink,
  FileText,
  FolderOpen,
  Globe,
  Info,
  Keyboard,
  Languages,
  ListChecks,
  Monitor,
  Palette,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import type { UpdateState } from "../App";
import { NavItem } from "../components/Sidebar";
import { useStats } from "../components/SyntaxInput";
import { Button, Checkbox, ContextChip, Keycap, Mark, PriorityBadge, ProjectChip, Segmented, Select, Toggle } from "../components/ui";
import { backend, type FileInfo } from "../lib/backend";
import { formatTime, todayIso } from "../lib/dates";
import { useT } from "../lib/i18n";
import { type AccentName, ACCENTS, type Density, type Settings, type ThemeSetting, useSettings } from "../lib/settings";
import { useTodos } from "../lib/store";
import { useSystemDark } from "../lib/theme";

export type SettingsTab = "files" | "appearance" | "language" | "tasks" | "shortcuts" | "about";

const REPO = "https://github.com/checkst-app/checkst";
const WEBSITE = "https://checkst.regbr.de";

export function SettingsView({
  tab,
  onTab,
  update,
  onCheckUpdate,
}: {
  tab: SettingsTab;
  onTab: (t: SettingsTab) => void;
  update: UpdateState;
  onCheckUpdate: () => void;
}) {
  const { t } = useT();
  const tabs: { key: SettingsTab; icon: typeof FolderOpen; label: string }[] = [
    { key: "files", icon: FolderOpen, label: t("set.files") },
    { key: "appearance", icon: Palette, label: t("set.appearance") },
    { key: "language", icon: Languages, label: t("set.language") },
    { key: "tasks", icon: ListChecks, label: t("set.tasks") },
    { key: "shortcuts", icon: Keyboard, label: t("set.shortcuts") },
    { key: "about", icon: Info, label: t("set.about") },
  ];
  return (
    <div className="settings">
      <nav className="settings-nav">
        <h2>{t("set.title")}</h2>
        <div style={{ height: 10 }} />
        {tabs.map((x) => (
          <NavItem key={x.key} icon={x.icon} label={x.label} active={tab === x.key} onClick={() => onTab(x.key)} />
        ))}
      </nav>
      <div className="settings-main">
        {tab === "files" && <FilesPage />}
        {tab === "appearance" && <AppearancePage />}
        {tab === "language" && <LanguagePage />}
        {tab === "tasks" && <TasksPage />}
        {tab === "shortcuts" && <ShortcutsPage />}
        {tab === "about" && <AboutPage update={update} onCheckUpdate={onCheckUpdate} />}
      </div>
    </div>
  );
}

function PageHeader({ title, description }: { title: string; description: string }) {
  const { t } = useT();
  return (
    <header className="page-header">
      <div className="titles">
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <span className="save-state">
        <CircleCheck size={14} />
        {t("set.autosave")}
      </span>
    </header>
  );
}

export function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="set-section">
      <div className="set-section-header">
        <h3>{title}</h3>
        {aside}
      </div>
      <div className="card">{children}</div>
    </section>
  );
}

export function Row({ title, description, children }: { title: ReactNode; description?: ReactNode; children?: ReactNode }) {
  return (
    <div className="set-row">
      <div className="set-row-text">
        <span className="set-row-title">{title}</span>
        {description && <span className="set-row-desc">{description}</span>}
      </div>
      {children}
    </div>
  );
}

// ---------- Dateien ----------

function useFileInfo(path: string) {
  const [info, setInfo] = useState<FileInfo | null>(null);
  const { tasks, archived } = useTodos();
  useEffect(() => {
    if (!path) return setInfo(null);
    backend.fileInfo(path).then(setInfo).catch(() => setInfo(null));
  }, [path, tasks.length, archived.length]);
  return info;
}

function PathField({ label, path, onChange, status }: { label: string; path: string; onChange: (p: string) => void; status: ReactNode }) {
  const { t } = useT();
  const [draft, setDraft] = useState(path);
  useEffect(() => setDraft(path), [path]);
  const browse = async () => {
    const res = await openDialog({ defaultPath: path || undefined, multiple: false, directory: false, filters: [{ name: t("gen.fileFilter"), extensions: ["txt"] }] });
    if (typeof res === "string") onChange(res);
  };
  return (
    <div className="set-row set-row-col">
      <span className="set-row-title">{label}</span>
      <div className="path-controls">
        <div className="text-field grow">
          <input className="mono" value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={() => draft !== path && onChange(draft)} spellCheck={false} />
        </div>
        <Button variant="secondary" icon={FolderOpen} onClick={browse}>
          {t("set.browse")}
        </Button>
        <Button variant="ghost" icon={ExternalLink} onClick={() => path && revealItemInDir(path)}>
          {t("set.reveal")}
        </Button>
      </div>
      {status}
    </div>
  );
}

function FilesPage() {
  const { t } = useT();
  const { settings, update } = useSettings();
  const { tasks, archived } = useTodos();
  const todoInfo = useFileInfo(settings.todoPath);
  const doneInfo = useFileInfo(settings.donePath);
  const [autostart, setAutostart] = useState(settings.autostart);

  useEffect(() => {
    autostartEnabled()
      .then(setAutostart)
      .catch(() => {});
  }, []);

  const toggleAutostart = async (on: boolean) => {
    setAutostart(on);
    try {
      if (on) await enableAutostart();
      else await disableAutostart();
      update({ autostart: on });
    } catch {
      setAutostart(!on);
    }
  };

  const open = tasks.filter((x) => !x.done).length;
  return (
    <div className="page">
      <PageHeader title={t("set.files")} description={t("set.filesDesc")} />
      <Section title={t("set.location")}>
        <PathField
          label={t("set.todoFile")}
          path={settings.todoPath}
          onChange={(p) => update({ todoPath: p })}
          status={
            todoInfo?.isFile ? (
              <span className="path-status ok">
                <CircleCheck size={14} />
                {t("set.fileFound", { n: open })}
              </span>
            ) : (
              <span className="path-status muted">
                <Info size={14} />
                {t("set.fileMissing")}
              </span>
            )
          }
        />
        <PathField
          label={t("set.doneFile")}
          path={settings.donePath}
          onChange={(p) => update({ donePath: p })}
          status={
            doneInfo?.isFile ? (
              <span className="path-status ok">
                <CircleCheck size={14} />
                {t("set.doneFound", { n: archived.length })}
              </span>
            ) : (
              <span className="path-status muted">
                <Info size={14} />
                {t("set.doneMissing")}
              </span>
            )
          }
        />
      </Section>
      <Section title={t("set.automation")}>
        <Row title={t("set.autoArchive")} description={t("set.autoArchiveDesc")}>
          <Toggle on={settings.autoArchive} onChange={(v) => update({ autoArchive: v })} />
        </Row>
        <Row title={t("set.watch")} description={t("set.watchDesc")}>
          <Toggle on={settings.watchExternal} onChange={(v) => update({ watchExternal: v })} />
        </Row>
        <Row title={t("set.autostart")} description={t("set.autostartDesc")}>
          <Toggle on={autostart} onChange={toggleAutostart} />
        </Row>
      </Section>
      <Section title={t("set.backup")}>
        <Row title={t("set.dailyBackup")} description={t("set.dailyBackupDesc")}>
          <Select
            value={settings.backupDays}
            onChange={(v) => update({ backupDays: v })}
            options={[
              { value: 0, label: t("set.backupOff") },
              { value: 3, label: t("set.keepDays", { n: 3 }) },
              { value: 7, label: t("set.keepDays", { n: 7 }) },
              { value: 14, label: t("set.keepDays", { n: 14 }) },
              { value: 30, label: t("set.keepDays", { n: 30 }) },
            ]}
          />
        </Row>
      </Section>
    </div>
  );
}

// ---------- Darstellung ----------

export function MiniPreview({ mode }: { mode: "light" | "dark" }) {
  const rows = [70, 52, 62, 40];
  return (
    <div className={`mini mini-${mode}`}>
      <div className="mini-side">
        <span className="mini-btn" />
        {[22, 16, 22, 16].map((w, i) => (
          <span key={i} className="mini-nav" style={{ width: w }} />
        ))}
      </div>
      <div className="mini-list">
        {rows.map((w, i) => (
          <div key={i} className="mini-row">
            <span className="mini-check" />
            <span className="mini-text" style={{ width: w }} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ThemePreview({ theme }: { theme: ThemeSetting }) {
  return (
    <div className="theme-preview">
      {theme === "system" ? (
        <>
          <MiniPreview mode="light" />
          <MiniPreview mode="dark" />
        </>
      ) : (
        <MiniPreview mode={theme} />
      )}
    </div>
  );
}

function AppearancePage() {
  const { t } = useT();
  const { settings, update } = useSettings();
  const themes: { key: ThemeSetting; label: string; desc: string }[] = [
    { key: "light", label: t("theme.light"), desc: t("theme.lightDesc") },
    { key: "dark", label: t("theme.dark"), desc: t("theme.darkDesc") },
    { key: "system", label: t("theme.system"), desc: t("theme.systemDesc") },
  ];
  const dark = useSystemDark();
  const mode = settings.theme === "system" ? (dark ? "dark" : "light") : settings.theme;
  return (
    <div className="page">
      <PageHeader title={t("set.appearance")} description={t("set.appearanceDesc")} />
      <section className="set-section">
        <div className="set-section-header">
          <h3>{t("set.colorScheme")}</h3>
        </div>
        <div className="theme-cards">
          {themes.map((x) => (
            <button key={x.key} type="button" className={`theme-card ${settings.theme === x.key ? "active" : ""}`} onClick={() => update({ theme: x.key })}>
              <ThemePreview theme={x.key} />
              <div className="theme-card-footer">
                <span className={`radio ${settings.theme === x.key ? "on" : ""}`} />
                <span className="theme-card-text">
                  <b>{x.label}</b>
                  <span>{x.desc}</span>
                </span>
              </div>
            </button>
          ))}
        </div>
      </section>
      <Section title={t("set.customize")}>
        <Row title={t("set.accent")} description={t("set.accentDesc")}>
          <div className="swatches">
            {(Object.keys(ACCENTS) as AccentName[]).map((name) => {
              const color = ACCENTS[name][mode][0];
              const on = settings.accent === name;
              return (
                <button
                  key={name}
                  type="button"
                  className={`swatch ${on ? "on" : ""}`}
                  style={{ borderColor: on ? color : "transparent" }}
                  onClick={() => update({ accent: name })}
                  aria-label={name}
                >
                  <span style={{ background: color }}>{on && <CheckIcon />}</span>
                </button>
              );
            })}
          </div>
        </Row>
        <Row title={t("set.density")} description={t("set.densityDesc")}>
          <Segmented<Density>
            className="seg-pill"
            value={settings.density}
            onChange={(v) => update({ density: v })}
            options={[
              { value: "compact", label: t("set.compact") },
              { value: "standard", label: t("set.standard") },
              { value: "relaxed", label: t("set.relaxed") },
            ]}
          />
        </Row>
        <Row title={t("set.fontSize")}>
          <Select
            value={settings.fontSize}
            onChange={(v) => update({ fontSize: v as Settings["fontSize"] })}
            options={[
              { value: 12, label: t("set.fontSmall") },
              { value: 13, label: t("set.fontStandard") },
              { value: 14, label: t("set.fontLarge") },
              { value: 15, label: t("set.fontXL") },
            ]}
          />
        </Row>
        <Row title={t("set.strike")}>
          <Toggle on={settings.strikeDone} onChange={(v) => update({ strikeDone: v })} />
        </Row>
        <Row title={t("set.raw")} description={t("set.rawDesc")}>
          <Toggle on={settings.showRaw} onChange={(v) => update({ showRaw: v })} />
        </Row>
      </Section>
      <section className="set-section">
        <div className="set-section-header">
          <h3>{t("set.preview")}</h3>
        </div>
        <div className="preview-row" style={{ minHeight: "var(--row-h)" }}>
          <Checkbox checked={false} />
          <PriorityBadge priority="A" />
          <span className="task-text grow">{t("set.previewTask")}</span>
          <ProjectChip name="Website" />
          <ContextChip name={t("setup.exampleContext").slice(1)} />
          <span className="task-due due-prio-a">
            <CalendarSmall />
            {t("due.today")}
          </span>
        </div>
      </section>
    </div>
  );
}

/** GitHub's octicon "mark-github" (lucide ships no brand icons). */
function GithubMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function CalendarSmall() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}

// ---------- Sprache & Region ----------

function LanguagePage() {
  const { t } = useT();
  const { settings, update } = useSettings();
  const sysLang = navigator.language?.toLowerCase().startsWith("de") ? t("set.langDe") : t("set.langEn");
  const now = new Date();
  now.setHours(14, 32);
  const cards = [
    { key: "de" as const, code: "DE", name: t("set.langDe"), region: t("set.langDeRegion"), s1: t("set.sampleDe1"), s2: t("set.sampleDe2") },
    { key: "en" as const, code: "EN", name: t("set.langEn"), region: t("set.langEnRegion"), s1: t("set.sampleEn1"), s2: t("set.sampleEn2") },
    { key: "system" as const, code: "", name: t("set.langSystem"), region: t("set.langSystemCurrent", { lang: sysLang }), s1: t("set.sampleSys1"), s2: t("set.sampleSys2") },
  ];
  const d = todayIso();
  const [y, m, dd] = d.split("-");
  return (
    <div className="page">
      <PageHeader title={t("set.language")} description={t("set.languageDesc")} />
      <section className="set-section">
        <div className="set-section-header">
          <h3>{t("set.uiLanguage")}</h3>
        </div>
        <div className="lang-cards">
          {cards.map((c) => {
            const sel = settings.language === c.key;
            return (
              <button key={c.key} type="button" className={`lang-card ${sel ? "active" : ""}`} onClick={() => update({ language: c.key })}>
                <div className="lang-card-head">
                  <span className="lang-code">{c.code || <Monitor size={16} />}</span>
                  <span className="lang-names">
                    <b>{c.name}</b>
                    <span>{c.region}</span>
                  </span>
                  <span className={`radio ${sel ? "on-thick" : ""}`} />
                </div>
                <div className="lang-sample">
                  <span className="lang-sample-1">
                    {c.code ? <Plus size={13} /> : <RefreshCw size={13} />}
                    {c.s1}
                  </span>
                  <span className="lang-sample-2">{c.s2}</span>
                </div>
              </button>
            );
          })}
        </div>
      </section>
      <Section title={t("set.formats")}>
        <Row title={t("set.dateFormat")} description={t("set.dateFormatDesc")}>
          <Select
            width={220}
            value={settings.dateFormat}
            onChange={(v) => update({ dateFormat: v })}
            options={[
              { value: "dmy", label: `${dd}.${m}.${y}` },
              { value: "mdy", label: `${m}/${dd}/${y}` },
              { value: "iso", label: `${y}-${m}-${dd}` },
            ]}
          />
        </Row>
        <Row title={t("set.weekStart")} description={t("set.weekStartDesc")}>
          <Select
            width={220}
            value={settings.weekStart}
            onChange={(v) => update({ weekStart: v })}
            options={[
              { value: "monday", label: t("set.monday") },
              { value: "sunday", label: t("set.sunday") },
            ]}
          />
        </Row>
        <Row title={t("set.timeFormat")} description={t("set.timeFormatDesc")}>
          <Select
            width={220}
            value={settings.timeFormat}
            onChange={(v) => update({ timeFormat: v })}
            options={[
              { value: "24h", label: t("set.time24", { t: formatTime(now, "24h", "de") }) },
              { value: "12h", label: t("set.time12", { t: formatTime(now, "12h", "en") }) },
            ]}
          />
        </Row>
      </Section>
      <div className="note-card">
        <FileText size={18} />
        <div>
          <b>{t("set.neutralTitle")}</b>
          <p>{t("set.neutralText")}</p>
          <code>{t("set.neutralExample")}</code>
        </div>
      </div>
    </div>
  );
}

// ---------- Aufgaben ----------

function TasksPage() {
  const { t } = useT();
  const { settings, update } = useSettings();
  const stats = useStats();
  const store = useTodos();
  const [renaming, setRenaming] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const all = useMemo(() => {
    const p = stats.projects.map((s) => ({ ...s, token: `+${s.name}`, kind: "project" as const }));
    const c = stats.contexts.map((s) => ({ ...s, token: `@${s.name}`, kind: "context" as const }));
    return [...p, ...c].sort((a, b) => b.open - a.open || a.name.localeCompare(b.name, "de"));
  }, [stats]);
  const example = todayIso();

  return (
    <div className="page">
      <PageHeader title={t("set.tasks")} description={t("set.tasksDesc")} />
      <Section title={t("set.newTasks")}>
        <Row title={t("set.addCreated")} description={t("set.addCreatedDesc", { date: example })}>
          <Toggle on={settings.addCreationDate} onChange={(v) => update({ addCreationDate: v })} />
        </Row>
        <Row title={t("set.defaultPriority")}>
          <Select
            value={settings.defaultPriority}
            onChange={(v) => update({ defaultPriority: v })}
            options={[
              { value: "", label: t("set.noPriority") },
              ...["A", "B", "C", "D"].map((p) => ({ value: p, label: t("set.priorityX", { p }) })),
            ]}
          />
        </Row>
      </Section>
      <Section title={t("set.suggestions")}>
        <Row title={t("set.suggest")} description={t("set.suggestDesc")}>
          <Toggle on={settings.suggest} onChange={(v) => update({ suggest: v })} />
        </Row>
        <Row title={t("set.suggestOrder")}>
          <Select
            value={settings.suggestOrder}
            onChange={(v) => update({ suggestOrder: v })}
            options={[
              { value: "frequency", label: t("set.frequency") },
              { value: "alpha", label: t("set.alphabetical") },
            ]}
          />
        </Row>
        <Row title={t("set.includeDone")} description={t("set.includeDoneDesc")}>
          <Toggle on={settings.suggestFromDone} onChange={(v) => update({ suggestFromDone: v })} />
        </Row>
      </Section>
      <Section
        title={t("set.manage")}
        aside={<span className="section-aside">{t("set.manageCount", { p: stats.projects.length, c: stats.contexts.length })}</span>}
      >
        {all.length === 0 && <div className="set-row set-row-empty">{t("empty.filtered")}</div>}
        {all.map((s) => (
          <div key={s.token} className="manage-row">
            {s.kind === "project" ? <ProjectChip name={s.name} /> : <ContextChip name={s.name} />}
            {renaming === s.token ? (
              <form
                className="rename-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const clean = newName.replace(/^[+@]/, "").replace(/\s+/g, "");
                  if (clean) store.renameToken(s.token, (s.kind === "project" ? "+" : "@") + clean);
                  setRenaming(null);
                }}
              >
                <div className="text-field grow">
                  <input autoFocus className="mono" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={t("set.renamePrompt")} />
                </div>
                <Button variant="primary" type="submit">
                  {t("set.renameSave")}
                </Button>
                <Button variant="ghost" onClick={() => setRenaming(null)}>
                  {t("dlg.cancel")}
                </Button>
              </form>
            ) : (
              <>
                <span className={`manage-count ${s.onlyDone ? "warn" : ""}`}>
                  {s.onlyDone ? t("set.onlyDone") : s.open === 1 ? t("ac.openTask") : t("ac.openTasks", { n: s.open })}
                </span>
                <Button
                  variant="ghost"
                  icon={Pencil}
                  onClick={() => {
                    setRenaming(s.token);
                    setNewName(s.name);
                  }}
                >
                  {t("set.rename")}
                </Button>
                {(s.onlyDone || s.open === 0) && (
                  <Button variant="ghost" icon={Trash2} className="btn-ghost-danger" onClick={() => store.renameToken(s.token, undefined)}>
                    {t("set.remove")}
                  </Button>
                )}
              </>
            )}
          </div>
        ))}
      </Section>
    </div>
  );
}

// ---------- Tastenkürzel ----------

function acceleratorFromEvent(e: React.KeyboardEvent): string | null {
  const key = e.key;
  if (["Control", "Shift", "Alt", "Meta"].includes(key)) return null;
  const parts: string[] = [];
  if (e.ctrlKey) parts.push("Ctrl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  if (e.metaKey) parts.push("Super");
  if (parts.length === 0) return null;
  const code = e.code;
  let name = key.length === 1 ? key.toUpperCase() : key;
  if (/^Key[A-Z]$/.test(code)) name = code.slice(3);
  else if (/^Digit\d$/.test(code)) name = code.slice(5);
  else if (key === " ") name = "Space";
  parts.push(name);
  return parts.join("+");
}

function ShortcutKeys({ accel }: { accel: string }) {
  const { lang } = useT();
  return (
    <span className="shortcut-keys">
      {accel.split("+").map((k) => (
        <Keycap key={k}>{lang === "de" && k === "Ctrl" ? "Strg" : lang === "de" && k === "Shift" ? "Umschalt" : k}</Keycap>
      ))}
    </span>
  );
}

function ShortcutsPage() {
  const { t } = useT();
  const { settings, update } = useSettings();
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState(false);
  const inApp: [string, string][] = [
    [t("sc.newTask"), "Ctrl+N"],
    [t("sc.search"), "Ctrl+F"],
    [t("sc.navigate"), "↑+↓"],
    [t("sc.toggle"), "Space"],
    [t("sc.edit"), "Enter"],
    [t("sc.delete"), "Entf"],
    [t("sc.menu"), "Shift+F10"],
    [t("sc.settings"), "Ctrl+,"],
    [t("sc.close"), "Esc"],
  ];
  return (
    <div className="page">
      <PageHeader title={t("set.shortcuts")} description={t("set.shortcutsDesc")} />
      <Section title={t("set.global")}>
        <Row title={t("set.quickCapture")} description={error ? <span className="danger-text">{t("set.shortcutError")}</span> : t("set.quickCaptureDesc")}>
          {recording ? (
            <input
              className="recorder"
              autoFocus
              readOnly
              value={t("set.recording")}
              onBlur={() => setRecording(false)}
              onKeyDown={async (e) => {
                e.preventDefault();
                if (e.key === "Escape") return setRecording(false);
                const accel = acceleratorFromEvent(e);
                if (!accel) return;
                try {
                  await backend.setQuickShortcut(accel);
                  update({ quickShortcut: accel });
                  setError(false);
                } catch {
                  setError(true);
                  backend.setQuickShortcut(settings.quickShortcut).catch(() => {});
                }
                setRecording(false);
              }}
            />
          ) : (
            <div className="shortcut-edit">
              <ShortcutKeys accel={settings.quickShortcut} />
              <Button variant="secondary" onClick={() => setRecording(true)}>
                {t("set.record")}
              </Button>
            </div>
          )}
        </Row>
      </Section>
      <Section title={t("set.inApp")}>
        {inApp.map(([label, keys]) => (
          <Row key={label} title={label}>
            <ShortcutKeys accel={keys} />
          </Row>
        ))}
      </Section>
    </div>
  );
}

// ---------- Über ----------

function AboutPage({ update: state, onCheckUpdate }: { update: UpdateState; onCheckUpdate: () => void }) {
  const { t, lang } = useT();
  const { settings, update } = useSettings();
  const [version, setVersion] = useState("");
  useEffect(() => {
    getVersion()
      .then(setVersion)
      .catch(() => {});
  }, []);

  let line: ReactNode = null;
  let action: ReactNode = (
    <Button variant="secondary" icon={RefreshCw} onClick={onCheckUpdate} disabled={state.phase === "checking" || state.phase === "downloading"}>
      {state.phase === "checking" ? t("set.checking") : t("set.checkNow")}
    </Button>
  );
  switch (state.phase) {
    case "uptodate":
      line = t("set.upToDate");
      break;
    case "available":
      line = t("set.updateAvailable", { v: state.version });
      action = (
        <Button variant="primary" onClick={onCheckUpdate}>
          {t("set.download")}
        </Button>
      );
      break;
    case "downloading":
      line = t("set.updateAvailable", { v: state.version });
      action = <Button variant="secondary" disabled>{t("set.downloading")}</Button>;
      break;
    case "ready":
      line = t("set.updateReady", { v: state.version });
      action = (
        <Button variant="primary" icon={RefreshCw} onClick={() => backend.applyUpdate()}>
          {t("set.restartNow")}
        </Button>
      );
      break;
    case "unsupported":
      line = t("set.updatesUnsupported");
      break;
    case "error":
      line = <span className="danger-text">{t("set.updateError", { e: state.message })}</span>;
      break;
  }

  return (
    <div className="page">
      <PageHeader title={t("set.about")} description={t("set.aboutDesc")} />
      <div className="about-hero">
        <span className="about-icon">
          <Mark size={34} color="#FFFFFF" check="#BFEBD6" weight={12} />
        </span>
        <div>
          <b className="about-name">checkst</b>
          <span>{t("set.tagline")}</span>
          {version && <span className="mono muted">{t("set.version", { v: version })}</span>}
        </div>
      </div>
      <Section title={t("set.updates")}>
        <Row title={t("set.autoUpdate")} description={t("set.autoUpdateDesc")}>
          <Toggle on={settings.autoUpdate} onChange={(v) => update({ autoUpdate: v })} />
        </Row>
        <Row title={line ?? t("set.checkNow")}>{action}</Row>
      </Section>
      <Section title={t("set.links")}>
        <Row title={t("set.website")} description={<span className="mono">{WEBSITE.replace("https://", "")}</span>}>
          <Button variant="secondary" icon={Globe} onClick={() => openUrl(lang === "en" ? `${WEBSITE}/en/` : WEBSITE)}>
            {t("gen.open")}
          </Button>
        </Row>
        <Row title={t("set.github")} description={<span className="mono">{REPO.replace("https://", "")}</span>}>
          <Button variant="secondary" onClick={() => openUrl(REPO)}>
            <span className="btn-inline-icon">
              <GithubMark />
              GitHub
            </span>
          </Button>
        </Row>
        <Row title={t("set.reportBug")}>
          <Button variant="secondary" icon={Bug} onClick={() => openUrl(`${REPO}/issues/new`)}>
            {t("set.reportBug")}
          </Button>
        </Row>
        <Row title={t("set.license")} description={t("set.licenseText")} />
      </Section>
    </div>
  );
}
