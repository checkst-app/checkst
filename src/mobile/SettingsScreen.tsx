import { openUrl } from "@tauri-apps/plugin-opener";
import { Archive, CalendarPlus, Check, ExternalLink, FilePlus, FileText, FolderOpen, Info, Moon, PackageCheck, RefreshCw, Smartphone, Sun } from "lucide-react";
import { useState } from "react";
import { backend } from "../lib/backend";
import { useT } from "../lib/i18n";
import { ACCENTS, type AccentName, useSettings } from "../lib/settings";
import { useTodos } from "../lib/store";
import { joinFile } from "../lib/todo";
import { useBack } from "./back";
import { ActionSheet, AppBar, GithubIcon, ListRow, Section, Segments, Switch, useSnack, useSystemBars } from "./common";
import { REPO_URL } from "./updates";

export type MobileUpdate =
  | { phase: "idle" }
  | { phase: "checking" }
  | { phase: "uptodate" }
  | { phase: "available"; version: string; url: string }
  | { phase: "error" };

function fileLabel(path: string, label: string, t: ReturnType<typeof useT>["t"]) {
  if (!path) return t("m.notChosen");
  if (label) return label;
  return path.startsWith("content://") ? path : `${t("m.appStorage")} · ${path.split(/[\\/]/).pop()}`;
}

export function SettingsScreen({ onBack, version, update, onCheckUpdate }: { onBack: () => void; version: string; update: MobileUpdate; onCheckUpdate: () => void }) {
  const { t, lang } = useT();
  const { settings, update: set } = useSettings();
  const store = useTodos();
  const snack = useSnack();
  const [sheet, setSheet] = useState<"todo" | "done" | null>(null);
  useSystemBars(sheet ? "--surface" : "--bg", sheet !== null);
  useBack(sheet !== null, () => setSheet(null));

  const pick = async (which: "todo" | "done", create: boolean) => {
    try {
      const r = await backend.pickFile(create, which === "todo" ? "todo.txt" : "done.txt");
      if (!r.uri) return;
      if (which === "todo") {
        // Moving: the current list goes into the new file first.
        if (create) await backend.writeTextFile(r.uri, joinFile(store.file), store.file.bom);
        set({ todoPath: r.uri, todoLabel: r.label ?? "" });
        if (create) snack(t("m.moved"));
      } else {
        if (create) await backend.writeTextFile(r.uri, "", false);
        set({ donePath: r.uri, doneLabel: r.label ?? "" });
      }
    } catch (e) {
      snack(t("m.fileError", { e: String(e) }));
    }
  };

  const change = (which: "todo" | "done") => (
    <button type="button" className="m-change" onClick={() => setSheet(which)}>
      {(which === "todo" ? settings.todoPath : settings.donePath) ? t("m.change") : t("m.choose")}
    </button>
  );

  const updateSub =
    update.phase === "checking"
      ? t("m.checking")
      : update.phase === "uptodate"
        ? t("m.upToDate")
        : update.phase === "available"
          ? t("m.updateAvailable", { v: update.version })
          : update.phase === "error"
            ? t("m.updateError")
            : t("m.checkUpdatesDesc");

  return (
    <>
      <AppBar title={t("nav.settings")} onBack={onBack} />
      <div className="m-scroll m-content">
        <section className="m-section">
          <div className="m-section-head">
            <span>{t("m.files")}</span>
          </div>
          <div className="m-card">
            <ListRow icon={FileText} label="todo.txt" sub={fileLabel(settings.todoPath, settings.todoLabel, t)} mono={!!settings.todoPath} right={change("todo")} />
            <ListRow icon={Archive} label="done.txt" sub={fileLabel(settings.donePath, settings.doneLabel, t)} mono={!!settings.donePath} right={change("done")} />
            <ListRow
              icon={PackageCheck}
              label={t("m.archive")}
              sub={t("m.archiveDesc")}
              right={<Switch on={settings.autoArchive} onChange={(v) => set({ autoArchive: v })} label={t("m.archive")} />}
            />
            <ListRow
              icon={CalendarPlus}
              label={t("m.created")}
              sub={t("m.createdDesc")}
              right={<Switch on={settings.addCreationDate} onChange={(v) => set({ addCreationDate: v })} label={t("m.created")} />}
            />
          </div>
          <p className="m-note">{t("m.fileNote")}</p>
        </section>

        <Section title={t("m.appearance")}>
          <div className="m-row-block">
            <span className="m-row-label">{t("m.scheme")}</span>
            <Segments
              value={settings.theme}
              onChange={(v) => set({ theme: v })}
              options={[
                { value: "system", label: t("m.system"), icon: Smartphone },
                { value: "light", label: t("m.light"), icon: Sun },
                { value: "dark", label: t("m.dark"), icon: Moon },
              ]}
            />
          </div>
          <div className="m-row-block">
            <span className="m-row-label">{t("m.accent")}</span>
            <div className="m-swatches">
              {(Object.keys(ACCENTS) as AccentName[]).map((name) => (
                <button
                  key={name}
                  type="button"
                  aria-label={name}
                  className={`m-swatch ${settings.accent === name ? "active" : ""}`}
                  style={{ ["--swatch" as string]: ACCENTS[name].light[0] }}
                  onClick={() => set({ accent: name })}
                >
                  <span>{settings.accent === name && <Check size={14} strokeWidth={3} />}</span>
                </button>
              ))}
            </div>
          </div>
        </Section>

        <Section title={t("m.language")}>
          <div className="m-row-block">
            <Segments
              value={lang}
              onChange={(v) => set({ language: v })}
              options={[
                { value: "de", label: "Deutsch" },
                { value: "en", label: "English" },
              ]}
            />
          </div>
        </Section>

        <Section title={t("m.about")}>
          <ListRow icon={Info} label={t("m.version")} right={<span className="m-row-value">{version}</span>} />
          <ListRow
            icon={RefreshCw}
            tone="accent"
            label={t("m.checkUpdates")}
            sub={updateSub}
            onClick={() => (update.phase === "available" ? openUrl(update.url).catch(() => {}) : onCheckUpdate())}
            right={update.phase === "available" ? <span className="m-dot static" /> : undefined}
          />
          <ListRow icon={GithubIcon} label={t("m.source")} right={<ExternalLink size={16} className="m-chevron" />} onClick={() => openUrl(REPO_URL).catch(() => {})} />
        </Section>
      </div>

      <ActionSheet
        open={sheet !== null}
        onClose={() => setSheet(null)}
        cancel={t("m.cancel")}
        actions={
          sheet === "todo"
            ? [
                { label: t("m.openOther"), icon: FolderOpen, run: () => pick("todo", false) },
                { label: t("m.moveToNew"), icon: FilePlus, run: () => pick("todo", true) },
              ]
            : [
                { label: t("m.openOther"), icon: FolderOpen, run: () => pick("done", false) },
                { label: t("m.optNew"), icon: FilePlus, run: () => pick("done", true) },
              ]
        }
      />
    </>
  );
}
