import { describe, expect, it } from "vitest";
import { projectZipName, projectZipWords } from "./projectPage.js";

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
