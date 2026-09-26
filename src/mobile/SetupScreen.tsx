import { FilePlus, FolderOpen, Languages } from "lucide-react";
import { useState } from "react";
import { Mark } from "../components/ui";
import { backend, joinPath } from "../lib/backend";
import { useLang } from "../App";
import { useT } from "../lib/i18n";
import { useSettings } from "../lib/settings";
import { Segments, useSnack, useSystemBars } from "./common";

export function SetupScreen() {
  const { t } = useT();
  const { settings, update } = useSettings();
  const lang = useLang(settings);
  const snack = useSnack();
  const [choice, setChoice] = useState<"open" | "new">("open");
  const [busy, setBusy] = useState(false);
  useSystemBars("--bg");

  const finish = async () => {
    setBusy(true);
    try {
      if (choice === "open") {
        const r = await backend.pickFile(false, "todo.txt");
        if (!r.uri) return;
        update({ setupDone: true, todoPath: r.uri, todoLabel: r.label ?? "", donePath: "", doneLabel: "" });
      } else {
        const dir = await backend.documentsDir();
        const todoPath = joinPath(dir, "todo.txt");
        const donePath = joinPath(dir, "done.txt");
        const info = await backend.fileInfo(todoPath);
        if (!info.exists) await backend.writeTextFile(todoPath, "", false);
        update({ setupDone: true, todoPath, donePath, todoLabel: "", doneLabel: "" });
      }
    } catch (e) {
      snack(t("m.fileError", { e: String(e) }));
    } finally {
      setBusy(false);
    }
  };

  const option = (key: "open" | "new", Icon: typeof FolderOpen, title: string, desc: string) => (
    <button type="button" role="radio" aria-checked={choice === key} className={`m-option ${choice === key ? "selected" : ""}`} onClick={() => setChoice(key)}>
      <span className="m-option-icon">
        <Icon size={19} />
      </span>
      <span className="m-option-text">
        <b>{title}</b>
        <span>{desc}</span>
      </span>
      <span className="m-radio" />
    </button>
  );

  return (
    <div className="m-setup">
      <div className="m-setup-top">
        <div className="m-setup-head">
          <span className="m-setup-mark">
            <Mark size={40} color="var(--text-primary)" check="var(--accent)" />
          </span>
          <h1>{t("m.welcome")}</h1>
          <p>{t("m.welcomeText")}</p>
        </div>
        <div className="m-options" role="radiogroup">
          {option("open", FolderOpen, t("m.optOpen"), t("m.optOpenDesc"))}
          {option("new", FilePlus, t("m.optNew"), t("m.optNewDesc"))}
        </div>
      </div>
      <div className="m-setup-bottom">
        <div className="m-field">
          <span className="m-field-label with-icon">
            <Languages size={15} />
            {t("m.language")}
          </span>
          <Segments
            value={lang}
            onChange={(v) => update({ language: v })}
            options={[
              { value: "de", label: "Deutsch" },
              { value: "en", label: "English" },
            ]}
          />
        </div>
        <button type="button" className="m-primary big" disabled={busy} onClick={finish}>
          {choice === "open" ? <FolderOpen size={18} /> : <FilePlus size={18} />}
          {choice === "open" ? t("m.chooseFile") : t("m.createList")}
        </button>
        <p className="m-hint">{t("m.laterHint")}</p>
      </div>
    </div>
  );
}
