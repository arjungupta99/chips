import { describe, expect, it } from "vitest";
import type { ProjectChange } from "./model/types.js";
import { newestChangeWords, projectZipName, projectZipWords } from "./projectPage.js";

describe("Download as zip (ADR 0224)", () => {
  it("names the zip for the room, without what a file name can't hold", () => {
    expect(projectZipName("Sudoku mini")).toBe("Sudoku mini.zip");
    expect(projectZipName("Q3: plans / notes")).toBe("Q3- plans - notes.zip");
    expect(projectZipName("..hidden")).toBe("hidden.zip");
    expect(projectZipName("  ")).toBe("Project.zip");
  });

  it("says how many files are in it", () => {
    expect(projectZipWords(5)).toBe("All 5 files as they are now");
    expect(projectZipWords(1)).toBe("The one file as it is now");
  });
});

describe("the room sheet's Changes tile (ADR 0222's addendum of 14 November 2026)", () => {
  const change = (by: string, at: string, byKind: "agent" | "person" = "agent"): ProjectChange => ({
    commit: "c".repeat(40),
    before: null,
    by,
    byKind,
    at,
    seq: 1,
    message: "Kept it",
    files: [{ path: "shot.png", added: null, removed: null }],
    moreFiles: 0,
  });
  const names: Record<string, string> = { agt_jacob: "Jacob" };
  const nameOf = (id: string) => names[id];
  const now = new Date(2026, 10, 13, 22, 0).getTime();

  it("says who made the newest change, and when on today's clock", () => {
    const today = new Date(2026, 10, 13, 21, 10).toISOString();
    const earlier = new Date(2026, 10, 13, 20, 31).toISOString();
    const project = {
      files: 3,
      changes: [change("agt_jacob", today), change("agt_wendel", earlier)],
    };
    expect(newestChangeWords(project, nameOf, now)).toBe("Jacob · 9:10 PM");
  });

  it("says the day for a change before today, and someone it no longer knows by their kind", () => {
    const before = new Date(2026, 10, 7, 0, 40).toISOString();
    expect(
      newestChangeWords({ files: 1, changes: [change("agt_gone", before)] }, nameOf, now),
    ).toBe("An agent · Nov 7");
    expect(
      newestChangeWords({ files: 1, changes: [change("per_gone", before, "person")] }, nameOf, now),
    ).toBe("Someone · Nov 7");
  });

  it("says None yet before the first change", () => {
    expect(newestChangeWords({ files: 0, changes: [] }, nameOf, now)).toBe("None yet");
  });
});
