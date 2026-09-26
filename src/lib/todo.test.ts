import { describe, expect, it } from "vitest";
import {
  addToken,
  bodyParts,
  completeLine,
  formatLine,
  joinFile,
  lineFromInput,
  parseLine,
  removeToken,
  setTag,
  splitFile,
  uncompleteLine,
} from "./todo";

describe("parseLine", () => {
  it("parses priority, creation date, projects, contexts and due", () => {
    const t = parseLine("(A) 2026-09-21 Neue Texte übernehmen +Website @büro due:2026-09-25", 3)!;
    expect(t.line).toBe(3);
    expect(t.done).toBe(false);
    expect(t.priority).toBe("A");
    expect(t.creationDate).toBe("2026-09-21");
    expect(t.title).toBe("Neue Texte übernehmen");
    expect(t.projects).toEqual(["Website"]);
    expect(t.contexts).toEqual(["büro"]);
    expect(t.due).toBe("2026-09-25");
  });

  it("parses completed tasks with both dates", () => {
    const t = parseLine("x 2026-09-24 2026-09-20 Zahnarzt anrufen @telefon", 0)!;
    expect(t.done).toBe(true);
    expect(t.completionDate).toBe("2026-09-24");
    expect(t.creationDate).toBe("2026-09-20");
    expect(t.title).toBe("Zahnarzt anrufen");
  });

  it("does not treat URLs, times or lowercase priorities as tokens", () => {
    const t = parseLine("(a) Meeting 10:30 https://example.com lesen", 0)!;
    expect(t.priority).toBeUndefined();
    expect(t.tags).toEqual({});
    expect(t.title).toBe("(a) Meeting 10:30 https://example.com lesen");
  });

  it("ignores blank lines", () => {
    expect(parseLine("   ", 0)).toBeUndefined();
  });

  it("reads pri: from completed tasks", () => {
    expect(parseLine("x 2026-09-24 Test pri:B", 0)!.priority).toBe("B");
  });
});

describe("bodyParts", () => {
  it("keeps projects and contexts where they were typed", () => {
    expect(bodyParts("abc +test jrftji")).toEqual([
      { kind: "text", text: "abc" },
      { kind: "project", name: "test" },
      { kind: "text", text: "jrftji" },
    ]);
  });

  it("merges words, skips tags and keeps token order", () => {
    expect(bodyParts("Kartons @einkauf für +Umzug besorgen due:2026-10-02")).toEqual([
      { kind: "text", text: "Kartons" },
      { kind: "context", name: "einkauf" },
      { kind: "text", text: "für" },
      { kind: "project", name: "Umzug" },
      { kind: "text", text: "besorgen" },
    ]);
  });
});

describe("complete / uncomplete", () => {
  it("round-trips priority via pri:", () => {
    const t = parseLine("(A) 2026-09-21 Angebot senden +Website", 0)!;
    const done = completeLine(t, "2026-09-26");
    expect(done).toBe("x 2026-09-26 2026-09-21 Angebot senden +Website pri:A");
    expect(uncompleteLine(parseLine(done, 0)!)).toBe("(A) 2026-09-21 Angebot senden +Website");
  });
});

describe("tokens and tags", () => {
  it("sets, replaces and removes tags", () => {
    expect(setTag("Test", "due", "2026-10-02")).toBe("Test due:2026-10-02");
    expect(setTag("Test due:2026-10-02", "due", "2026-10-03")).toBe("Test due:2026-10-03");
    expect(setTag("Test due:2026-10-02 +A", "due", undefined)).toBe("Test +A");
  });

  it("adds tokens before tags and removes them", () => {
    expect(addToken("Test due:2026-10-02", "@büro")).toBe("Test @büro due:2026-10-02");
    expect(addToken("Test @büro", "@büro")).toBe("Test @büro");
    expect(removeToken("Test @büro +X", "@büro")).toBe("Test +X");
  });
});

describe("lineFromInput", () => {
  it("adds creation date after a typed priority", () => {
    expect(lineFromInput("(b) Kartons besorgen +Umzug", { creationDate: "2026-09-25" })).toBe(
      "(B) 2026-09-25 Kartons besorgen +Umzug",
    );
  });

  it("applies the default priority only when none is typed", () => {
    expect(lineFromInput("Test", { defaultPriority: "C" })).toBe("(C) Test");
    expect(lineFromInput("(A) Test", { defaultPriority: "C" })).toBe("(A) Test");
  });
});

describe("files", () => {
  it("preserves CRLF and trailing newline", () => {
    const f = splitFile("a\r\nb\r\n");
    expect(f.lines).toEqual(["a", "b"]);
    expect(f.eol).toBe("\r\n");
    expect(joinFile(f)).toBe("a\r\nb\r\n");
  });

  it("preserves LF without trailing newline", () => {
    const f = splitFile("a\nb");
    expect(f.eol).toBe("\n");
    expect(joinFile(f)).toBe("a\nb");
  });

  it("formats lines", () => {
    expect(formatLine({ done: false, priority: "A", creationDate: "2026-09-25", body: "X" })).toBe("(A) 2026-09-25 X");
  });
});
