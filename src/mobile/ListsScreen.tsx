import { AtSign, ChevronRight, CircleCheck, Flag, Folder, Plus, Search, Settings } from "lucide-react";
import { useMemo } from "react";
import { todayIso } from "../lib/dates";
import { useT } from "../lib/i18n";
import { useTodos } from "../lib/store";
import { countTasks, type View } from "../lib/views";
import { AppBar, IconButton, ListRow, Section, useSnack } from "./common";

const chevron = <ChevronRight size={16} className="m-chevron" />;

export function ListsScreen({ onOpen, onSearch, onSettings, updateDot }: { onOpen: (v: View) => void; onSearch: () => void; onSettings: () => void; updateDot?: boolean }) {
  const { t } = useT();
  const store = useTodos();
  const snack = useSnack();
  const counts = useMemo(() => countTasks(store.tasks, store.archived, todayIso()), [store.tasks, store.archived]);
  const addHint = (text: string) => (
    <button type="button" className="m-section-add" aria-label={t("m.add")} onClick={() => snack(text)}>
      <Plus size={15} />
    </button>
  );

  return (
    <>
      <AppBar
        title={t("m.lists")}
        summary={
          <>
            <span>{t("m.nProjects", { n: counts.projects.length })}</span>
            <i />
            <span>{t("m.nContexts", { n: counts.contexts.length })}</span>
          </>
        }
        actions={
          <>
            <IconButton icon={Search} label={t("nav.search")} onClick={onSearch} />
            <IconButton icon={Settings} label={t("nav.settings")} onClick={onSettings} dot={updateDot} />
          </>
        }
      />
      <div className="m-scroll m-content">
        <Section title={t("m.views")}>
          <ListRow icon={Flag} tone="prio-a" label={t("nav.priorityA")} count={counts.prioA} right={chevron} onClick={() => onOpen({ kind: "prioA" })} />
          <ListRow icon={CircleCheck} tone="accent" label={t("nav.done")} count={counts.done} right={chevron} onClick={() => onOpen({ kind: "done" })} />
        </Section>
        <Section title={t("nav.projects")} aside={addHint(t("nav.newProjectHint"))}>
          {counts.projects.length === 0 && <p className="m-card-empty">{t("nav.newProjectHint")}</p>}
          {counts.projects.map(([name, n]) => (
            <ListRow key={name} icon={Folder} tone="project" label={`+${name}`} labelTone="project" count={n} right={chevron} onClick={() => onOpen({ kind: "project", name })} />
          ))}
        </Section>
        <Section title={t("nav.contexts")} aside={addHint(t("nav.newContextHint"))}>
          {counts.contexts.length === 0 && <p className="m-card-empty">{t("nav.newContextHint")}</p>}
          {counts.contexts.map(([name, n]) => (
            <ListRow key={name} icon={AtSign} tone="context" label={`@${name}`} labelTone="context" count={n} right={chevron} onClick={() => onOpen({ kind: "context", name })} />
          ))}
        </Section>
      </div>
    </>
  );
}
