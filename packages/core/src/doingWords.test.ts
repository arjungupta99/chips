import { describe, expect, it } from "vitest";
import { stepParts, stepWords, THINKING, verbWords } from "./doingWords.js";

/**
 * What the harness sends and what the room reads are not the same string. These are the two
 * places they differ: a call named by its runtime, and a word wearing an ellipsis the dots
 * beside it already say.
 */
describe("the step, as English", () => {
  it("drops the server a tool came from and spaces out its name", () => {
    expect(stepWords("local-dev__coding_job_status")).toBe("coding job status");
  });

  it("keeps what the call was given, underscores and all", () => {
    // The tool half is a name to read; the other half may be a path, and a path is literal.
    expect(stepWords("local-dev__read_file · src/spatial_index.ts")).toBe(
      "read file · src/spatial_index.ts",
    );
  });

  it("leaves a step a harness wrote as a sentence exactly as it wrote it", () => {
    expect(stepWords("Counting the organisms still alive")).toBe(
      "Counting the organisms still alive",
    );
  });

  it("takes the last prefix, however many a runtime stacks on", () => {
    expect(stepWords("mcp__local-dev__web_search · Tamar hours")).toBe("web search · Tamar hours");
  });

  it("says nothing for a step that is nothing", () => {
    expect(stepWords(undefined)).toBeUndefined();
    expect(stepWords("")).toBeUndefined();
    expect(stepWords("   ")).toBeUndefined();
  });
});

describe("the word", () => {
  it("drops the ellipsis the dots already say", () => {
    expect(verbWords("Writing…")).toBe("Writing");
    expect(verbWords("Writing...")).toBe("Writing");
  });

  it("keeps a full stop, which belongs to a sentence", () => {
    expect(verbWords("The index is rebuilt every tick.")).toBe("The index is rebuilt every tick.");
  });

  it("is Thinking when the harness has not said one", () => {
    expect(verbWords(undefined)).toBe(THINKING);
    expect(verbWords("")).toBe(THINKING);
    expect(verbWords("…")).toBe(THINKING);
  });
});

describe("the step, as the bubble draws it (ADR 0126)", () => {
  it("knows a shell, a browser, a search and a file by the tool's name", () => {
    expect(stepParts("shell · python3 - <<'PY'")).toEqual({
      kind: "shell",
      tool: "shell",
      target: "python3 - <<'PY'",
    });
    expect(stepParts("browser · https://www.naturemade.com/products/cholestoff-plus")).toEqual({
      kind: "web",
      tool: "browser",
      target: "naturemade.com/products/cholestoff-plus",
    });
    expect(stepParts("web_search · Tamar hours")?.kind).toBe("search");
    expect(stepParts("local-dev__write_file · chinatown-walking-tour.html")).toEqual({
      kind: "file",
      tool: "write file",
      target: "chinatown-walking-tour.html",
    });
  });

  it("tidies an address to what a person reads, and leaves anything else as it was given", () => {
    expect(stepParts("browser · https://www.chinatownsf.com/visit/")?.target).toBe(
      "chinatownsf.com/visit",
    );
    expect(stepParts("browser · http://example.org")?.target).toBe("example.org");
    expect(stepParts("shell · ls /")?.target).toBe("ls /");
    expect(stepParts("read · notes/")?.target).toBe("notes");
  });

  it("gives no kind to a tool nobody named, so it keeps its words", () => {
    expect(stepParts("memory_recall · LEGO Technic tipping")).toEqual({
      kind: undefined,
      tool: "memory recall",
      target: "LEGO Technic tipping",
    });
  });

  it("has a tool and no target for a call given nothing, and nothing for no step", () => {
    expect(stepParts("browser")).toEqual({ kind: "web", tool: "browser", target: undefined });
    expect(stepParts(undefined)).toBeUndefined();
    expect(stepParts("")).toBeUndefined();
  });
});
