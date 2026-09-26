import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { Archive, ArrowLeft, Check, CircleAlert, CircleCheck, FileText, FolderOpen, Info, Languages, Lock, RefreshCw, Settings2, TextCursorInput } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { TitleBar } from "../components/TitleBar";
import { Button, Checkbox, ContextChip, PriorityBadge, ProjectChip, Segmented } from "../components/ui";
import { backend, dirName, joinPath } from "../lib/backend";
import { todayIso } from "../lib/dates";
import { useT } from "../lib/i18n";
import { type ThemeSetting, useSettings } from "../lib/settings";
import { parseFile, splitFile } from "../lib/todo";
import { ThemePreview } from "./SettingsView";

type Validation =
  | { kind: "found"; tasks: number; due: number }
  | { kind: "new" }
  | { kind: "dirMissing" }
  | { kind: "none" };

export function Setup({ onDone }: { onDone: () => Promise<void> }) {
  const { t, lang } = useT();
  const { settings, update } = useSettings();
  const [step, setStep] = useState(1);
  const [todoPath, setTodoPath] = useState(settings.todoPath);
  const [donePath, setDonePath] = useState(settings.donePath);
  const [doneTouched, setDoneTouched] = useState(false);
  const [autoArchive, setAutoArchive] = useState(settings.autoArchive);
  const [addCreated, setAddCreated] = useState(settings.addCreationDate);
  const [backup, setBackup] = useState(settings.backupDays > 0);
  const [theme, setTheme] = useState<ThemeSetting>(settings.theme);
  const [validation, setValidation] = useState<Validation>({ kind: "none" });

  // Default location: Documents\todo.txt (follows OneDrive folder redirection).
  useEffect(() => {
    if (todoPath) return;
    backend.documentsDir().then((dir) => {
      if (!dir) return;
      setTodoPath(joinPath(dir, "todo.txt"));
      setDonePath(joinPath(dir, "done.txt"));
    });
  }, []);

  useEffect(() => {
    if (!doneTouched && todoPath) setDonePath(joinPath(dirName(todoPath), "done.txt"));
  }, [todoPath, doneTouched]);

  useEffect(() => {
    let cancelled = false;
    if (!todoPath) return setValidation({ kind: "none" });
    (async () => {
      const info = await backend.fileInfo(todoPath);
      if (cancelled) return;
      if (info.isFile) {
        const f = await backend.readTextFile(todoPath);
        const tasks = parseFile(splitFile(f.content)).filter((x) => !x.done);
        if (!cancelled) setValidation({ kind: "found", tasks: tasks.length, due: tasks.filter((x) => x.due).length });
      } else setValidation(info.dirExists ? { kind: "new" } : { kind: "dirMissing" });
    })().catch(() => setValidation({ kind: "none" }));
    return () => {
      cancelled = true;
    };
  }, [todoPath]);

  // Theme choice previews live.
  useEffect(() => update({ theme }), [theme]);

  const browse = async (which: "todo" | "done") => {
    const current = which === "todo" ? todoPath : donePath;
    const res = await openDialog({ defaultPath: current || undefined, multiple: false, filters: [{ name: t("gen.fileFilter"), extensions: ["txt"] }] });
    if (typeof res !== "string") return;
    if (which === "todo") setTodoPath(res);
    else {
      setDonePath(res);
      setDoneTouched(true);
    }
  };

  const finish = async () => {
    if (validation.kind === "new") await backend.writeTextFile(todoPath, "", false).catch(() => {});
    update({
      setupDone: true,
      todoPath,
      donePath,
      autoArchive,
      addCreationDate: addCreated,
      backupDays: backup ? 7 : 0,
      theme,
    });
    await onDone();
  };

  const canNext = step !== 3 || (!!todoPath && validation.kind !== "dirMissing");
  const steps = [
    { title: t("setup.s1"), sub: t("setup.s1sub") },
    { title: t("setup.s2"), sub: t("setup.s2sub") },
    { title: t("setup.s3"), sub: t("setup.s3sub") },
    { title: t("setup.s4"), sub: t("setup.s4sub") },
  ];

  return (
    <>
      <TitleBar title={t("app.setupTitle")} onClose={() => backend.quitApp()} />
      <div className="setup">
        <div className="setup-body">
          <aside className="step-rail">
            <div className="rail-header">
              <b>{t("setup.title")}</b>
              <span>{t("setup.subtitle")}</span>
            </div>
            {steps.map((s, i) => {
              const n = i + 1;
              const state = n < step ? "done" : n === step ? "current" : "todo";
              return (
                <button key={n} type="button" className={`rail-step ${state}`} onClick={() => n < step && setStep(n)}>
                  <span className="marker">{state === "done" ? <Check size={13} strokeWidth={3} /> : n}</span>
                  <span className="rail-step-text">
                    <b>{s.title}</b>
                    <span>{s.sub}</span>
                  </span>
                </button>
              );
            })}
            <span className="spacer-v" />
            <div className="rail-language">
              <span className="rail-language-label">
                <Languages size={13} />
                {t("setup.language")}
              </span>
              <Segmented
                className="seg-rail"
                value={lang}
                onChange={(v) => update({ language: v })}
                options={[
                  { value: "de", label: "Deutsch" },
                  { value: "en", label: "English" },
                ]}
              />
            </div>
            <div className="rail-note">
              <Settings2 size={14} />
              <span>{t("setup.note")}</span>
            </div>
          </aside>
          <main className="setup-main">
            {step === 1 && <StepWelcome />}
            {step === 2 && <StepFeatures />}
            {step === 3 && (
              <StepLocation
                todoPath={todoPath}
                donePath={donePath}
                setTodoPath={setTodoPath}
                setDonePath={(p) => {
                  setDonePath(p);
                  setDoneTouched(true);
                }}
                browse={browse}
                validation={validation}
                options={[
                  { title: t("setup.optArchive"), desc: t("setup.optArchiveT"), on: autoArchive, set: setAutoArchive },
                  { title: t("setup.optCreated"), desc: t("setup.optCreatedT", { date: todayIso() }), on: addCreated, set: setAddCreated },
                  { title: t("setup.optBackup"), desc: t("setup.optBackupT"), on: backup, set: setBackup },
                ]}
              />
            )}
            {step === 4 && (
              <StepAppearance
                theme={theme}
                setTheme={setTheme}
                summary={[
                  [t("setup.sumTodo"), todoPath, validation.kind === "found" ? t("setup.sumTasks", { n: validation.tasks }) : t("setup.sumNew")],
                  [t("setup.sumDone"), donePath],
                  [
                    t("setup.sumOptions"),
                    [autoArchive && t("setup.optArchiveShort"), addCreated && t("setup.optCreatedShort"), backup && t("setup.optBackupShort")]
                      .filter(Boolean)
                      .join(", ") || t("setup.sumNone"),
                  ],
                  [t("setup.sumTheme"), theme === "system" ? t("setup.themeSystem") : theme === "dark" ? t("setup.themeDark") : t("setup.themeLight")],
                ]}
              />
            )}
          </main>
        </div>
        <footer className="setup-footer">
          <div className="step-indicator">
            <span>{t("setup.step", { n: step })}</span>
            <span className="progress">
              {[1, 2, 3, 4].map((n) => (
                <span key={n} className={n <= step ? "on" : ""} />
              ))}
            </span>
          </div>
          <div className="actions">
            <Button variant="ghost" icon={ArrowLeft} disabled={step === 1} onClick={() => setStep(step - 1)} className={step === 1 ? "dim" : ""}>
              {t("setup.back")}
            </Button>
            {step < 4 ? (
              <Button variant="primary" disabled={!canNext} onClick={() => setStep(step + 1)}>
                {t("setup.next")}
              </Button>
            ) : (
              <Button variant="primary" icon={Check} onClick={finish}>
                {t("setup.finish")}
              </Button>
            )}
          </div>
        </footer>
      </div>
    </>
  );
}

function StepHeader({ title, text }: { title: string; text: string }) {
  return (
    <header className="step-header">
      <h1>{title}</h1>
      <p>{text}</p>
    </header>
  );
}

function StepWelcome() {
  const { t } = useT();
  const lines = [t("setup.ex1"), t("setup.ex2"), t("setup.ex3"), t("setup.ex4")];
  const benefits: [typeof FileText, string, string][] = [
    [FileText, t("setup.b1"), t("setup.b1t")],
    [RefreshCw, t("setup.b2"), t("setup.b2t")],
    [Lock, t("setup.b3"), t("setup.b3t")],
  ];
  return (
    <>
      <StepHeader title={t("setup.welcomeTitle")} text={t("setup.welcomeText")} />
      <div className="file-preview">
        <div className="file-preview-header">
          <FileText size={14} />
          <span className="mono">todo.txt</span>
          <span className="spacer" />
          <span className="meta">{t("setup.fileMeta")}</span>
        </div>
        <div className="file-preview-lines">
          {lines.map((l, i) => (
            <div key={i} className={`file-line ${l.startsWith("x ") ? "done" : ""}`}>
              <span className="line-no">{i + 1}</span>
              <span className="mono">{l}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="benefits">
        {benefits.map(([Icon, title, text]) => (
          <div key={title} className="benefit">
            <Icon size={18} />
            <b>{title}</b>
            <span>{text}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function StepFeatures() {
  const { t } = useT();
  const tokens: { n?: number; text: string; cls: string }[] = [
    { n: 1, text: "(A)", cls: "prio-a" },
    { text: t("setup.exampleText"), cls: "plain" },
    { n: 2, text: "+Website", cls: "project" },
    { n: 3, text: t("setup.exampleContext"), cls: "context" },
    { n: 4, text: "due:2026-10-02", cls: "accent" },
  ];
  const feature = (marker: ReactNode, markerCls: string, title: string, chip: ReactNode, desc: string) => (
    <div className="feature">
      <span className={`feature-marker ${markerCls}`}>{marker}</span>
      <div className="feature-text">
        <span className="feature-title">
          <b>{title}</b>
          {chip}
        </span>
        <span className="feature-desc">{desc}</span>
      </div>
    </div>
  );
  return (
    <>
      <StepHeader title={t("setup.featTitle")} text={t("setup.featText")} />
      <div className="example-line">
        <span className="example-label">{t("setup.exampleLabel")}</span>
        <div className="example-tokens">
          {tokens.map((tok, i) => (
            <span key={i} className={`example-token tok-${tok.cls}`}>
              {tok.n ? <span className="token-marker">{tok.n}</span> : <span className="token-marker invisible" />}
              <span className="token-text">{tok.text}</span>
            </span>
          ))}
        </div>
      </div>
      <div className="feature-grid">
        {feature(1, "m-prio-a", t("setup.f1"), <PriorityBadge priority="A" />, t("setup.f1t"))}
        {feature(2, "m-project", t("setup.f2"), <ProjectChip name="Website" />, t("setup.f2t"))}
        {feature(3, "m-context", t("setup.f3"), <ContextChip name={t("setup.exampleContext").slice(1)} />, t("setup.f3t"))}
        {feature(4, "m-accent", t("setup.f4"), <code className="code-pill">due:</code>, t("setup.f4t"))}
        {feature(<TextCursorInput size={13} />, "m-muted", t("setup.f5"), null, t("setup.f5t"))}
        {feature(<Archive size={13} />, "m-muted", t("setup.f6"), <code className="code-pill">done.txt</code>, t("setup.f6t"))}
      </div>
    </>
  );
}

function StepLocation({
  todoPath,
  donePath,
  setTodoPath,
  setDonePath,
  browse,
  validation,
  options,
}: {
  todoPath: string;
  donePath: string;
  setTodoPath: (p: string) => void;
  setDonePath: (p: string) => void;
  browse: (w: "todo" | "done") => void;
  validation: Validation;
  options: { title: string; desc: string; on: boolean; set: (v: boolean) => void }[];
}) {
  const { t } = useT();
  return (
    <>
      <StepHeader title={t("setup.locTitle")} text={t("setup.locText")} />
      <div className="files">
        <div className="todo-group">
          <div className="path-row">
            <label className="field grow">
              <span className="field-label">{t("setup.todoFile")}</span>
              <div className="text-field">
                <input className="mono" value={todoPath} onChange={(e) => setTodoPath(e.target.value)} spellCheck={false} />
              </div>
            </label>
            <Button variant="secondary" icon={FolderOpen} onClick={() => browse("todo")}>
              {t("setup.browse")}
            </Button>
          </div>
          {validation.kind === "found" && (
            <div className="validation ok">
              <CircleCheck size={16} />
              <span>{validation.tasks ? t("setup.found", { n: validation.tasks, d: validation.due }) : t("setup.foundEmpty")}</span>
            </div>
          )}
          {validation.kind === "new" && (
            <div className="validation info">
              <Info size={16} />
              <span>{t("setup.willCreate")}</span>
            </div>
          )}
          {validation.kind === "dirMissing" && (
            <div className="validation error">
              <CircleAlert size={16} />
              <span>{t("setup.dirMissing")}</span>
            </div>
          )}
        </div>
        <div className="path-row">
          <label className="field grow">
            <span className="field-label">{t("setup.doneFile")}</span>
            <div className="text-field">
              <input className="mono" value={donePath} onChange={(e) => setDonePath(e.target.value)} spellCheck={false} />
            </div>
          </label>
          <Button variant="secondary" icon={FolderOpen} onClick={() => browse("done")}>
            {t("setup.browse")}
          </Button>
        </div>
      </div>
      <div className="setup-options">
        {options.map((o) => (
          <div key={o.title} className="setup-option" onClick={() => o.set(!o.on)}>
            <span className="checkbox-wrap">
              <Checkbox checked={o.on} onChange={() => o.set(!o.on)} />
            </span>
            <span className="setup-option-text">
              <b>{o.title}</b>
              <span>{o.desc}</span>
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

function StepAppearance({ theme, setTheme, summary }: { theme: ThemeSetting; setTheme: (t: ThemeSetting) => void; summary: [string, string, string?][] }) {
  const { t } = useT();
  const cards: { key: ThemeSetting; label: string }[] = [
    { key: "light", label: t("theme.light") },
    { key: "dark", label: t("theme.dark") },
    { key: "system", label: t("theme.system") },
  ];
  return (
    <>
      <StepHeader title={t("setup.lookTitle")} text={t("setup.lookText")} />
      <div className="setup-theme-cards">
        {cards.map((c) => (
          <button key={c.key} type="button" className={`setup-theme-card ${theme === c.key ? "active" : ""}`} onClick={() => setTheme(c.key)}>
            <ThemePreview theme={c.key} />
            <span className="label-row">
              <span className={`radio-dot ${theme === c.key ? "on" : ""}`}>{theme === c.key && <span />}</span>
              <b>{c.label}</b>
              {c.key === "system" && (
                <>
                  <span className="spacer" />
                  <span className="hint">{t("setup.followsWindows")}</span>
                </>
              )}
            </span>
          </button>
        ))}
      </div>
      <div className="summary">
        <b className="summary-title">{t("setup.summary")}</b>
        <div className="summary-panel">
          {summary.map(([k, v, extra], i) => (
            <div key={k} className="summary-row">
              <span className="key">{k}</span>
              <span className={`value ${i < 2 ? "mono" : ""}`}>{v}</span>
              {extra && <span className="extra">{extra}</span>}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
