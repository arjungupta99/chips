/**
 * Universe (ADR 0227): what a space made, to read and to run, from the project's files and its
 * run file.
 */

import { describe, expect, it } from "vitest";
import type { ProjectChange, RoomProject } from "./model/types.js";
import type { WorkspaceModel } from "./model.js";
import {
  documentKind,
  mayUseMac,
  pageOnMacWords,
  pageRowWords,
  readUniverse,
  shownFiles,
  startOf,
  universeCalling,
  universeOf,
  universeSeenAt,
} from "./universe.js";

const terraFab = [".chips/index.html", "reports/overview.html", "reports/supply-chain.pdf"];

describe("Universe", () => {
  it("opens the start page the agents keep in .chips, whatever else there is", () => {
    expect(universeOf(terraFab, undefined)).toEqual({
      documents: { start: ".chips/index.html" },
    });
    // A program's room with a start page has both.
    const both = universeOf([...terraFab, "server.js"], { run: "node server.js" });
    expect(both).toEqual({
      documents: { start: ".chips/index.html" },
      program: { run: "node server.js" },
    });
  });

  it("opens the file an opens-only run file names, as before ADR 0227", () => {
    const paths = ["index.html", "a.html", "b.html", "chips.json"];
    expect(universeOf(paths, { opens: "index.html" })).toEqual({
      documents: { start: "index.html" },
    });
    expect(universeOf(paths, { opens: "./index.html" })).toEqual({
      documents: { start: "index.html" },
    });
  });

  it("opens the one document, or lists several, and never counts the run file or .chips", () => {
    expect(universeOf(["lease-notes.pdf", "chips.json", ".chips/run.json"], undefined)).toEqual({
      documents: { start: "lease-notes.pdf" },
    });
    expect(universeOf(["index.html", "style.css"], undefined)).toEqual({
      documents: { start: "index.html" },
    });
    expect(universeOf(["b.md", "a.pdf", "notes.txt", "data.json"], undefined)).toEqual({
      documents: { list: ["a.pdf", "b.md", "notes.txt"] },
    });
    expect(universeOf(["main.py", "data.json"], undefined)).toEqual({});
  });

  it("keeps a program's own pages to itself: Sudoku mini is a program, not a document", () => {
    const sudoku = ["index.html", "game.js", "style.css", "chips.json"];
    const recipe = { run: "python3 -m http.server 8000", opens: "http://localhost:8000" };
    expect(universeOf(sudoku, recipe)).toEqual({ program: recipe });
    expect(startOf(universeOf(sudoku, recipe))).toBeUndefined();
  });

  it("says what is wrong with a run file it can't use, and still opens the documents", () => {
    expect(universeOf(["report.pdf"], { why: ".chips/run.json isn't JSON." })).toEqual({
      documents: { start: "report.pdf" },
      why: ".chips/run.json isn't JSON.",
    });
  });

  it("knows each document's kind by its name", () => {
    expect(documentKind("a/b/Report.HTML")).toBe("page");
    expect(documentKind("notes.md")).toBe("markdown");
    expect(documentKind("risks.pdf")).toBe("pdf");
    expect(documentKind("chart.png")).toBe("picture");
    expect(documentKind("sheet.xlsx")).toBe("other");
    expect(documentKind("game.js")).toBeUndefined();
  });

  it("leaves .chips out of Files", () => {
    expect(
      shownFiles([{ path: ".chips/index.html" }, { path: ".chips" }, { path: "reports/a.pdf" }]),
    ).toEqual([{ path: "reports/a.pdf" }]);
  });

  it("is read through the store: the files at main, and the run file that is there", async () => {
    const files: Record<string, string> = {
      "index.html": "<h1>Sudoku</h1>",
      "chips.json": '{"run": "python3 -m http.server 8000"}',
    };
    const store = {
      projectFiles: async () => ({
        files: Object.keys(files).map((path) => ({ path, bytes: files[path]?.length ?? 0 })),
      }),
      projectFile: async (_spaceId: string, path: string) => ({
        bytes: new TextEncoder().encode(files[path] ?? ""),
        type: "application/json",
      }),
    };
    expect(await readUniverse(store as never, "spc_1")).toEqual({
      program: { run: "python3 -m http.server 8000" },
    });
  });

  it("says what the page's row opens on the Mac, and whether a Mac heard it", () => {
    expect(pageRowWords(".chips/index.html")).toEqual({
      title: "Page",
      body: "The space's page, in Chips on your Mac",
    });
    expect(pageRowWords("docs/lease-notes.pdf")).toEqual({
      title: "lease-notes.pdf",
      body: "In Chips on your Mac",
    });
    expect(pageOnMacWords({ macs: 1 })).toBe("Sent to your Mac. Chips opens it there.");
    expect(pageOnMacWords({ macs: 1, opened_app: true })).toBe(
      "Chips for Mac wasn't open, so Chips opened it. The page opens there.",
    );
    expect(pageOnMacWords({ macs: 0 })).toBe(
      "Chips for Mac isn't open, so nothing opened. Open Chips on your Mac and press again.",
    );
  });
});

describe("who Run and Open on the Mac are for (ADR 0231)", () => {
  const model = {
    people: {
      per_arjun: { participantId: "per_arjun", role: "owner" },
      per_ana: { participantId: "per_ana", role: "admin" },
      per_dana: { participantId: "per_dana", role: "member" },
      per_priya: { participantId: "per_priya", role: "guest" },
    },
  } as unknown as WorkspaceModel;

  it("is an owner, and nobody else", () => {
    expect(mayUseMac(model, "per_arjun")).toBe(true);
    for (const somebody of ["per_ana", "per_dana", "per_priya", "per_nobody"]) {
      expect(mayUseMac(model, somebody)).toBe(false);
    }
  });
});

describe("Universe calling the reader (ADR 0227's addendum)", () => {
  const change = (commit: string, by: string): ProjectChange => ({
    commit,
    before: null,
    by,
    byKind: by.startsWith("per_") ? "person" : "agent",
    at: "2026-11-01T09:00:00.000Z",
    seq: 1,
    message: "The report",
    files: [{ path: "report.html", added: 10, removed: 0 }],
    moreFiles: 0,
  });
  const project = (...changes: ProjectChange[]): RoomProject => ({ files: 1, changes });

  it("calls about another's newest change until this device opens Universe at it", () => {
    const made = project(change("b".repeat(40), "agt_miro"), change("a".repeat(40), "agt_miro"));
    expect(universeCalling(made, "per_arjun", undefined)).toBe("b".repeat(40));
    expect(universeCalling(made, "per_arjun", "a".repeat(40))).toBe("b".repeat(40));
    expect(universeCalling(made, "per_arjun", universeSeenAt(made))).toBeUndefined();
  });

  it("is quiet for the reader's own change, and for a space with no project", () => {
    expect(
      universeCalling(project(change("c".repeat(40), "per_arjun")), "per_arjun", undefined),
    ).toBeUndefined();
    expect(universeCalling(undefined, "per_arjun", undefined)).toBeUndefined();
    expect(universeSeenAt(undefined)).toBeUndefined();
  });
});
