/**
 * Universe (ADR 0227): what a space made, to read and to run, from the project's files and its
 * run file.
 */

import { describe, expect, it } from "vitest";
import type { ProjectChange, RoomProject } from "./model/types.js";
import type { WorkspaceModel } from "./model.js";
import {
  documentKind,
  fileOpensIn,
  filesInOrder,
  isNewSince,
  mayUseMac,
  mediaInOrder,
  pageOnMacWords,
  pageRowWords,
  readUniverse,
  shelvesOf,
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
      // Files has the run file at the top as Project › Files does; Pages leaves the program's page out.
      shelves: {
        media: [],
        pages: [],
        files: ["chips.json", "index.html"],
        sizes: { "chips.json": 38, "index.html": 15 },
      },
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

describe("Media, Pages and Files on the phone (ADR 0227's addenda of 13 and 14 November 2026)", () => {
  const health = [
    ".chips/index.html",
    ".chips/run.json",
    "app/server.py",
    "lab-results.md",
    "message-to-dr-gill.md",
    "web/home.html",
    "web/heart.html",
    "web/assets/icon-180.png",
    "web/assets/icon-512.png",
  ];
  const shots = [
    "claude-desktop-screenshot.png",
    "claude-desktop-screenshot-2.png",
    "claude-desktop-screenshot-3.png",
  ];

  it("puts the pictures in Media and nothing in Pages for a space of screenshots", () => {
    const sorted = [
      "claude-desktop-screenshot-2.png",
      "claude-desktop-screenshot-3.png",
      "claude-desktop-screenshot.png",
    ];
    expect(shelvesOf(shots, undefined)).toEqual({ media: sorted, pages: [], files: sorted });
    // One picture alone is Media too, not a document Pages draws.
    expect(shelvesOf(["chart.png"], undefined)).toEqual({
      media: ["chart.png"],
      pages: [],
      files: ["chart.png"],
    });
  });

  it("gives Health's Pages its start page and its notes, and leaves its app's pages and icons out", () => {
    expect(shelvesOf(health, { run: "python3 app/server.py" })).toEqual({
      media: [],
      pages: [".chips/index.html", "lab-results.md", "message-to-dr-gill.md"],
      // Everything but .chips, the app's pages and icons included.
      files: [
        "app/server.py",
        "lab-results.md",
        "message-to-dr-gill.md",
        "web/assets/icon-180.png",
        "web/assets/icon-512.png",
        "web/heart.html",
        "web/home.html",
      ],
      first: ".chips/index.html",
    });
  });

  it("keeps a program's notes beside it even with no start page", () => {
    const game = ["index.html", "notes.md", "shots/level-1.png", "screenshot.png"];
    expect(shelvesOf(game, { run: "python3 -m http.server" })).toEqual({
      // A page at the top claims no folder, so a screenshot an agent saved is still seen.
      media: ["screenshot.png", "shots/level-1.png"],
      pages: ["notes.md"],
      files: ["index.html", "notes.md", "screenshot.png", "shots/level-1.png"],
      first: "notes.md",
    });
    // A program's page in a folder claims what is under it; outside a program nothing is claimed.
    const site = ["web/index.html", "web/img/logo.png", "shot.png"];
    expect(shelvesOf(site, { run: "node serve.js" }).media).toEqual(["shot.png"]);
    expect(shelvesOf(site, undefined).media).toEqual(["shot.png", "web/img/logo.png"]);
  });

  it("lists several documents with no start page, HTML pages included, and draws one alone", () => {
    expect(shelvesOf(["report.html", "notes.md", "plot.png"], undefined)).toEqual({
      media: ["plot.png"],
      pages: ["notes.md", "report.html"],
      files: ["notes.md", "plot.png", "report.html"],
    });
    expect(shelvesOf(["report.html", "plot.png"], undefined)).toEqual({
      media: ["plot.png"],
      pages: ["report.html"],
      files: ["plot.png", "report.html"],
      first: "report.html",
    });
  });

  it("keeps a start page's own HTML pages to it, and the PDFs beside it in Pages", () => {
    expect(shelvesOf(terraFab, undefined)).toEqual({
      media: [],
      pages: [".chips/index.html", "reports/supply-chain.pdf"],
      files: ["reports/overview.html", "reports/supply-chain.pdf"],
      first: ".chips/index.html",
    });
  });

  const change = (commit: string, paths: readonly string[], by = "agt_jacob") =>
    ({
      commit,
      before: null,
      by,
      byKind: "agent",
      at: "2026-11-13T21:10:00Z",
      seq: 1,
      message: commit,
      files: paths.map((path) => ({ path, added: null, removed: null })),
      moreFiles: 0,
    }) as ProjectChange;

  it("orders Media newest first by the change that brought each, then by name", () => {
    const changes = [
      change("c3", ["claude-desktop-screenshot-3.png"]),
      change("c2", ["claude-desktop-screenshot-2.png"]),
      change("c1", ["claude-desktop-screenshot.png", "notes.md"]),
    ];
    const ordered = mediaInOrder([...shots, "unnamed.png"], changes);
    expect(ordered.map((item) => item.path)).toEqual([
      "claude-desktop-screenshot-3.png",
      "claude-desktop-screenshot-2.png",
      "claude-desktop-screenshot.png",
      "unnamed.png",
    ]);
    expect(ordered[0]?.change?.commit).toBe("c3");
    expect(ordered[3]?.change).toBeUndefined();
    // New: somebody else's change after the one Universe was last opened at.
    const [newest, middle] = ordered;
    if (newest === undefined || middle === undefined) throw new Error("no media");
    expect(isNewSince(newest, changes, "per_arjun", "c2")).toBe(true);
    expect(isNewSince(middle, changes, "per_arjun", "c2")).toBe(false);
    expect(isNewSince(newest, changes, "agt_jacob", "c2")).toBe(false);
    expect(isNewSince(newest, changes, "per_arjun", undefined)).toBe(false);
  });

  it("puts a space's only file, a script, in Files when Media and Pages have nothing", () => {
    // TV control, 14 November: one Python file, which Universe never showed before Files.
    expect(shelvesOf(["tv.py"], undefined)).toEqual({ media: [], pages: [], files: ["tv.py"] });
  });

  it("groups Files by folder, the top first, each with the change that last named it", () => {
    const changes = [change("c2", ["web/app.js", "tv.py"], "agt_pavel"), change("c1", ["tv.py"])];
    const grouped = filesInOrder(["web/app.js", "tv.py", "README.md", "web/a/b.css"], changes);
    expect(grouped.map(({ folder, items }) => [folder, items.map((item) => item.path)])).toEqual([
      ["", ["README.md", "tv.py"]],
      ["web", ["web/app.js"]],
      ["web/a", ["web/a/b.css"]],
    ]);
    const [top] = grouped;
    expect(top?.items[0]?.change).toBeUndefined();
    expect(top?.items[1]?.change?.commit).toBe("c2");
    expect(top?.items[1]?.change?.by).toBe("agt_pavel");
  });

  it("opens a tapped file where it belongs", () => {
    const shelves = shelvesOf(
      [...health, "shot.png", "data.json", "tv.py", "clip.mp4", "build.zip"],
      { run: "python3 app/server.py" },
    );
    expect(fileOpensIn("shot.png", shelves)).toBe("media");
    expect(fileOpensIn("lab-results.md", shelves)).toBe("pages");
    // The program's own page and icon: the page sheet, and the viewer alone.
    expect(fileOpensIn("web/home.html", shelves)).toBe("sheet");
    expect(fileOpensIn("web/assets/icon-180.png", shelves)).toBe("picture");
    // Code and data on the file's page; what the phone can't draw, in the system's preview.
    expect(fileOpensIn("tv.py", shelves)).toBe("words");
    expect(fileOpensIn("app/server.py", shelves)).toBe("words");
    expect(fileOpensIn("data.json", shelves)).toBe("words");
    expect(fileOpensIn("clip.mp4", shelves)).toBe("preview");
    expect(fileOpensIn("build.zip", shelves)).toBe("preview");
  });
});
