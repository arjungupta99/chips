/**
 * Several programs in Universe (ADR 0303): each program's row, Run all, the banner over the start
 * page, the program a link needs by its port, and what Universe and Desktop make of a run file
 * that lists programs.
 */

import { type ProjectRun, type RunFile, runPrograms } from "@chipschat/protocol";
import { describe, expect, it } from "vitest";
import { linkAsk } from "./programBanner.js";
import {
  linkKind,
  listsPrograms,
  PROGRAMS_NEED_UPDATE,
  programOfLink,
  programRow,
  programsBanner,
  programsHeading,
  runFileHere,
  runOf,
} from "./programRows.js";
import type { RunSaid } from "./projectRun.js";
import { desktopNews, desktopRowsOf, shelvesOf, universeOf } from "./universe.js";

const NOW = Date.parse("2026-11-25T20:00:00.000Z");
const read = (programs: object[]): RunFile => {
  const file = runPrograms(JSON.stringify({ programs }));
  if ("why" in file) throw new Error(file.why);
  return file;
};
const FILE = read([
  {
    name: "Shop",
    in: "shop",
    run: "npm run dev",
    opens: "http://localhost:5173",
    setup: "npm install",
    needs: ["API"],
  },
  {
    name: "Admin",
    in: "admin",
    run: "npm run dev",
    opens: "http://localhost:5174",
    needs: ["API"],
  },
  { name: "API", in: "api", run: "uvicorn main:app" },
]);
const [SHOP, ADMIN, API] = FILE.programs.map((program) => ({
  ...program,
  name: program.name ?? "",
}));
const words = (said: readonly RunSaid[]) =>
  said.map((piece) => ("code" in piece ? `\`${piece.code}\`` : piece.text)).join("");
const since = "2026-11-25T19:58:00.000Z";
const running = (over: Partial<ProjectRun> = {}): ProjectRun => ({
  state: "running",
  since,
  ...over,
});

describe("a program's row", () => {
  it("says what Run runs and where, short, until it runs", () => {
    const row = programRow({ program: SHOP as never, now: NOW });
    expect(row).toMatchObject({
      name: "Shop",
      kind: "ready",
      tone: "plain",
      run: true,
      stop: false,
    });
    expect(words(row.said)).toBe("`npm install`, then `npm run dev` in shop/");
  });

  it("says who a need starts for, and runs for", () => {
    const starting = programRow({
      program: API as never,
      run: { state: "starting", runs_for: ["Shop"] },
    });
    expect(words(starting.said)).toBe("Starting · Shop needs it");
    expect(starting).toMatchObject({ run: false, stop: true });
    const forTwo = programRow({
      program: API as never,
      run: running({ runs_for: ["Shop", "Admin"] }),
    });
    expect(forTwo.state).toBe("Running");
    expect(words(forTwo.said)).toBe(" for Shop and Admin");
  });

  it("says where it runs: the address it opened, with Open, else its port", () => {
    const shop = programRow({
      program: SHOP as never,
      run: running({ opened: "http://127.0.0.1:5173/" }),
    });
    expect(words(shop.said)).toBe(" at localhost:5173");
    expect(shop).toMatchObject({
      tone: "good",
      open: "http://127.0.0.1:5173/",
      stop: true,
      run: false,
    });
    const api = programRow({
      program: API as never,
      run: running({ listens: "http://127.0.0.1:8000/" }),
    });
    expect(words(api.said)).toBe(" on port 8000");
    expect(api.open).toBeUndefined();
  });

  it("says what went wrong, how it ended, why a press did nothing, and when it changed", () => {
    const quiet = programRow({
      program: SHOP as never,
      run: running({
        trouble: "Nothing answered at localhost:5173 after 30 seconds.",
        lines: ["vite"],
      }),
    });
    expect(quiet).toMatchObject({ tone: "plain", lines: ["vite"] });
    const failed = programRow({
      program: API as never,
      run: {
        state: "failed",
        since,
        ended: "2026-11-25T19:59:00.000Z",
        code: 3,
        lines: ["no uvicorn"],
      },
      now: NOW,
    });
    expect(words(failed.said)).toBe("It stopped after 1 min. It ended with code 3.");
    expect(failed).toMatchObject({ kind: "ended", tone: "bad", run: true, lines: ["no uvicorn"] });
    // One that never started, since what it needs didn't, says only that.
    const never = programRow({
      program: SHOP as never,
      run: { state: "failed", trouble: "API didn't start, so Chips didn't run Shop." },
      now: NOW,
    });
    expect(words(never.said)).toBe("API didn't start, so Chips didn't run Shop.");
    expect(never).toMatchObject({ neverRan: true, tone: "bad", run: true });
    const banner = programsBanner([never, failed]);
    expect(banner.body).toBe("API: It stopped after 1 min. It ended with code 3.");
    const unheard = programRow({ program: SHOP as never, macs: 0 });
    expect(unheard.tone).toBe("bad");
    const changed = programRow({
      program: SHOP as never,
      run: { state: "stopped", command: "old" },
    });
    expect(changed.changed).toBe("Changed since you last ran it.");
  });
});

describe("Run all and the banner", () => {
  const rows = (runs: Record<string, ProjectRun | undefined>) =>
    [SHOP, ADMIN, API].map((program) =>
      programRow({ program: program as never, run: runs[program?.name ?? ""], now: NOW }),
    );

  it("offers Run all until every program runs, then Stop all", () => {
    expect(programsHeading(rows({}))).toBe("run");
    expect(programsHeading(rows({ Shop: running(), API: running() }))).toBe("run");
    expect(programsHeading(rows({ Shop: running(), Admin: running(), API: running() }))).toBe(
      "stop",
    );
  });

  it("says which programs are off, and runs the one that is", () => {
    expect(programsBanner(rows({}))).toMatchObject({
      kind: "off",
      title: "Programs aren’t running",
      body: "Some links here open only while they run on your Mac.",
      press: "run",
      label: "Run all",
    });
    expect(programsBanner(rows({ Shop: running(), API: running() }))).toMatchObject({
      kind: "off",
      title: "Admin isn’t running",
      body: "Shop and API are. Links to Admin open once it runs.",
      press: "run",
      program: "Admin",
      label: "Run Admin",
    });
    expect(programsBanner(rows({ API: running() }))).toMatchObject({
      title: "Shop and Admin aren’t running",
      body: "API is. Links to them open once they run.",
      label: "Run all",
    });
    expect(
      programsBanner(rows({ Shop: running(), Admin: running(), API: running() })),
    ).toMatchObject({
      kind: "running",
      press: "stop",
      label: "Stop all",
    });
    expect(programsBanner(rows({ Shop: { state: "starting" } }))).toMatchObject({
      kind: "starting",
    });
    // One listed program alone is named, as the one program's banner would be.
    const alone = [programRow({ program: SHOP as never, now: NOW })];
    expect(programsBanner(alone)).toMatchObject({
      title: "Shop isn’t running",
      program: "Shop",
      label: "Run Shop",
    });
  });
});

describe("the program a link needs", () => {
  it("is the one on the link's port: where it opens, or where it was heard to listen", () => {
    const runs = { programs: { api: running({ listens: "http://127.0.0.1:8000/" }) } };
    expect(programOfLink("http://localhost:5174/orders", FILE, runs)?.name).toBe("Admin");
    expect(programOfLink("http://localhost:8000/docs", FILE, runs)?.name).toBe("API");
    expect(programOfLink("http://localhost:9999/", FILE, runs)).toBeUndefined();
    expect(programOfLink("mailto:a@b.c", FILE, runs)).toBeUndefined();
    expect(runOf(runs, { name: "API" })?.listens).toBe("http://127.0.0.1:8000/");
  });

  it("asks to run that program by name, or all of them for a port none has", () => {
    expect(linkAsk("ask", { needs: { program: "Admin" } })).toMatchObject({
      title: "This link needs Admin running",
      go: "Run Admin and open",
      anyway: true,
    });
    expect(linkAsk("ask", { needs: { every: true } })).toMatchObject({
      title: "This link needs the programs running",
      go: "Run all and open",
    });
    expect(linkAsk("stopped", { needs: { program: "Admin" }, said: "It ended." })).toMatchObject({
      title: "Admin stopped",
      go: "Run Admin and open",
    });
    // The one program's sheet is as it was.
    expect(linkAsk("ask").title).toBe("This link needs the program running");
  });

  it("stands as its program's row, or as every program for a port none has", () => {
    const all = [SHOP, ADMIN, API].map((program) =>
      programRow({
        program: program as never,
        run: program?.name === "API" ? running() : undefined,
      }),
    );
    expect(linkKind(all[2], all)).toBe("running");
    expect(linkKind(all[1], all)).toBe("off");
    expect(linkKind(undefined, all)).toBe("off");
  });
});

describe("a run file of programs in Universe", () => {
  it("draws rows for a list, and the one program as before", () => {
    expect(listsPrograms(FILE)).toBe(true);
    expect(listsPrograms({ programs: [{ run: "make" }] })).toBe(false);
    expect(listsPrograms({ programs: [{ name: "Site", run: "make" }] })).toBe(true);
    expect(listsPrograms({ why: "no" })).toBe(false);
    expect(runFileHere(FILE, false)).toEqual({ why: PROGRAMS_NEED_UPDATE });
    expect(runFileHere(FILE, true)).toBe(FILE);
    expect(runFileHere(FILE, undefined)).toBe(FILE);
  });

  it("hides only the pages and pictures in a program's own folder, so a site beside it shows", () => {
    const paths = [
      "shop/index.html",
      "shop/img/logo.png",
      "admin/index.html",
      "api/main.py",
      "site/index.html",
      "site/about.html",
      "notes.md",
    ];
    expect(shelvesOf(paths, FILE)).toMatchObject({
      media: [],
      pages: ["notes.md", "site/about.html", "site/index.html"],
    });
    expect(universeOf(paths, FILE).programs?.programs.map((each) => each.name)).toEqual([
      "Shop",
      "Admin",
      "API",
    ]);
  });

  it("makes each program a Desktop row of its own, lit once when it is new", () => {
    const universe = universeOf([".chips/run.json"], FILE);
    expect(desktopRowsOf(universe).map((each) => each.row)).toEqual([
      "program:shop",
      "program:admin",
      "program:api",
    ]);
    const change = (commit: string, at: string, by = "agt_pavel") => ({
      commit,
      by,
      byKind: "agent" as const,
      at,
      words: "",
      files: [{ path: ".chips/run.json", change: "modified" as const }],
    });
    const changes = [
      change("b", "2026-11-25T19:00:00.000Z"),
      change("a", "2026-11-01T10:00:00.000Z"),
    ];
    const seen = {
      since: "2026-11-20T00:00:00.000Z",
      rows: ["program:shop", "program:api"] as const,
    };
    // Admin came with the newest change to the run file, after this device began keeping.
    expect(
      desktopNews(universe, changes as never, "per_arjun", { ...seen, rows: [...seen.rows] }),
    ).toEqual(["program:admin"]);
  });
});
