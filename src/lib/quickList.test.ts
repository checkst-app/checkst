import { describe, expect, it } from "vitest";
import { quickListItems } from "./quickList";
import { completeLine, parseFile, splitFile } from "./todo";

const today = "2026-09-26";
const tasksOf = (content: string) => parseFile(splitFile(content));
const names = (items: ReturnType<typeof quickListItems>) => items.map((i) => `${i.section}:${i.task.title}${i.task.done ? " ✓" : ""}`);

describe("quickListItems", () => {
  it("fills recent with the newest open lines and lists due tasks separately", () => {
    const tasks = tasksOf("Alt\nMitte\nNeu\nSteuer due:2026-09-20\nHeute due:2026-09-26\nSpäter due:2026-10-10\n");
    expect(names(quickListItems(tasks, [], [], today))).toEqual([
      "recent:Später",
      "recent:Neu",
      "recent:Mitte",
      "due:Steuer",
      "due:Heute",
    ]);
  });

  it("keeps filled-up tasks visible after they are checked off in this session", () => {
    const tasks = tasksOf("Eins\nZwei\n");
    const zwei = tasks[1];
    const doneRaw = completeLine(zwei, today);
    const after = tasksOf(`Eins\n${doneRaw}\n`);
    // Without the session marker the done task disappears, with it it stays in place.
    expect(names(quickListItems(after, [], [], today))).toEqual(["recent:Eins"]);
    expect(names(quickListItems(after, [], [doneRaw], today))).toEqual(["recent:Zwei ✓", "recent:Eins"]);
  });

  it("keeps checked-off due tasks and history entries", () => {
    const tasks = tasksOf("x 2026-09-26 Frisch\nx 2026-09-26 Fällig due:2026-09-26\n");
    const touched = tasks.map((t) => t.raw);
    const history = [{ line: tasks[0].raw, at: 1 }];
    expect(names(quickListItems(tasks, history, touched, today))).toEqual(["recent:Frisch ✓", "due:Fällig ✓"]);
  });
});
