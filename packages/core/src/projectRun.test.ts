/**
 * Run's bar (ADR 0226): what it says and offers on the Mac, the web and the phone, from the
 * recipe at `main` and the last word of the person's Mac.
 */

import { describe, expect, it } from "vitest";
import type { Directory } from "./events.js";
import { changedSince, commandOf, readRunRecipe, runBar } from "./projectRun.js";

const NOW = Date.parse("2026-10-24T09:10:00.000Z");
const recipe = { run: "python3 -m http.server 8000", opens: "http://localhost:8000" };
const words = (bar: ReturnType<typeof runBar>) =>
  bar.said.map((piece) => ("code" in piece ? `\`${piece.code}\`` : piece.text)).join("");

describe("Run's bar", () => {
  it("is held, saying so, until the agents keep a chips.json, and says what is wrong with one", () => {
    expect(runBar({ recipe: undefined, now: NOW })).toMatchObject({
      kind: "held",
      title: "Run program",
    });
    expect(runBar({ recipe: undefined, now: NOW }).press).toBeUndefined();
    expect(words(runBar({ recipe: undefined, now: NOW }))).toBe(
      "The agents haven't said how to run this yet.",
    );
    const bad = runBar({ recipe: { why: "chips.json isn't JSON." }, now: NOW });
    expect(bad).toMatchObject({ kind: "held", tone: "bad" });
    expect(words(bad)).toBe("chips.json isn't JSON.");
  });

  it("says what a press runs, where, and what it opens", () => {
    const mac = runBar({ recipe, where: "~/Chips/Projects/Sudoku mini", now: NOW });
    expect(mac).toMatchObject({ kind: "ready", press: "Run program", stop: false });
    expect(words(mac)).toBe(
      "Runs `python3 -m http.server 8000` in ~/Chips/Projects/Sudoku mini, then opens localhost:8000.",
    );
    const node = { setup: "npm install", run: "npm run dev" };
    expect(words(runBar({ recipe: node, now: NOW }))).toBe(
      "Runs `npm install`, then `npm run dev` on your Mac.",
    );
    expect(commandOf(node)).toBe("npm install\nnpm run dev");
  });

  it("opens pages that need no starting, and says when it last did", () => {
    const pages = { opens: "index.html" };
    expect(
      words(runBar({ recipe: pages, where: "~/Chips/Projects/Terra Fab Research", now: NOW })),
    ).toBe("Opens `index.html` from ~/Chips/Projects/Terra Fab Research.");
    const opened = runBar({
      recipe: pages,
      run: { state: "opened", command: "open index.html", since: "2026-10-24T09:09:30.000Z" },
      now: NOW,
    });
    expect(opened).toMatchObject({ kind: "ready", press: "Run program", stop: false });
    expect(words(opened)).toBe("Opens `index.html` on your Mac. Opened just now.");
    expect(opened.changed).toBeUndefined();
  });

  it("says plainly when its address already answered, so Run opened that and started nothing", () => {
    const recipe = { run: "node scripts/serve.js", opens: "http://localhost:4173" };
    const why =
      "Something on your Mac already answers at localhost:4173, so Run opened it and started nothing. Chips didn't start it, so Stop can't close it.";
    const bar = runBar({
      recipe,
      run: {
        state: "opened",
        command: "node scripts/serve.js",
        since: "2026-10-24T09:09:30.000Z",
        opened: "http://localhost:4173",
        why,
      },
      now: NOW,
    });
    expect(bar).toMatchObject({ kind: "ready", tone: "plain", press: "Run program", stop: false });
    expect(words(bar)).toBe(why);
  });

  it("says in amber when the recipe changed since the person last ran it", () => {
    const bar = runBar({
      recipe,
      run: { state: "stopped", command: "python3 -m http.server 3000" },
      now: NOW,
    });
    expect(bar.changed).toBe("Changed since you last ran it.");
    expect(
      runBar({ recipe, run: { state: "stopped", command: commandOf(recipe) } }).changed,
    ).toBeUndefined();
  });

  it("says a Mac isn't open, or why it didn't run", () => {
    const none = runBar({ recipe, macs: 0, now: NOW });
    expect(none).toMatchObject({ kind: "ready", tone: "bad" });
    expect(words(none)).toBe(
      "Chips for Mac isn't open, so nothing ran. Open Chips on your Mac and press again.",
    );
    // The server opened Chips for Mac, and it hadn't connected in time (ADR 0227).
    expect(words(runBar({ recipe, macs: 0, openedApp: true, now: NOW }))).toBe(
      "Chips for Mac is starting on your Mac but hasn't connected yet, so nothing ran. Press again in a moment.",
    );
    const refused = runBar({
      recipe,
      run: { state: "never", why: "chips.json in your folder says to run something else now." },
      now: NOW,
    });
    expect(words(refused)).toBe("chips.json in your folder says to run something else now.");
  });

  it("shows a run going, how long, what it opened, with Stop and Run again", () => {
    const bar = runBar({
      recipe,
      run: {
        state: "running",
        command: commandOf(recipe),
        since: "2026-10-24T09:08:00.000Z",
        opened: "http://localhost:8000",
      },
      now: NOW,
    });
    expect(bar).toMatchObject({
      kind: "running",
      title: "Running on your Mac",
      aside: "2 min",
      tone: "good",
      press: "Run again",
      stop: true,
    });
    expect(words(bar)).toBe("Opened localhost:8000 in your browser.");
    // Running, but the Mac's browser wouldn't take the address: still running, with Stop.
    const unopened = runBar({
      recipe,
      run: {
        state: "running",
        command: commandOf(recipe),
        why: "Your browser didn't open localhost:8000. Open that address in your browser.",
      },
      now: NOW,
    });
    expect(unopened).toMatchObject({ kind: "running", tone: "plain", stop: true });
    expect(words(unopened)).toBe(
      "Your browser didn't open localhost:8000. Open that address in your browser.",
    );
    // What went wrong while it runs (ADR 0230), with its last lines over Stop.
    const unanswered = runBar({
      recipe,
      run: {
        state: "running",
        command: commandOf(recipe),
        trouble: "It's running, but nothing answered at localhost:8000 after 30 seconds.",
        lines: ["warming up"],
      },
      now: NOW,
    });
    expect(unanswered).toMatchObject({
      kind: "running",
      tone: "plain",
      lines: ["warming up"],
      stop: true,
    });
    expect(words(unanswered)).toBe(
      "It's running, but nothing answered at localhost:8000 after 30 seconds.",
    );
    expect(runBar({ recipe, run: { state: "starting" } })).toMatchObject({
      kind: "starting",
      stop: true,
    });
  });

  it("says how a run ended, with its last lines, and offers it again", () => {
    const failed = runBar({
      recipe,
      run: {
        state: "failed",
        command: commandOf(recipe),
        since: "2026-10-24T09:00:00.000Z",
        ended: "2026-10-24T09:00:03.000Z",
        code: 1,
        lines: ["Error: Cannot find module 'vite'"],
      },
      now: NOW,
    });
    expect(failed).toMatchObject({
      kind: "ended",
      title: "It stopped after 3 seconds.",
      tone: "bad",
      press: "Run again",
      lines: ["Error: Cannot find module 'vite'"],
    });
    expect(words(failed)).toBe("It ended with code 1.");
    // A taken port, in plain words in place of its code (ADR 0230); its lines stay under it.
    const taken =
      "Port 8000 is already in use by python3, so the program couldn't start. Quit that program, or ask the agents to have it pick a free port.";
    const refused = runBar({
      recipe,
      run: {
        state: "failed",
        command: commandOf(recipe),
        code: 1,
        trouble: taken,
        lines: ["OSError"],
      },
      now: NOW,
    });
    expect(refused).toMatchObject({ kind: "ended", tone: "bad", lines: ["OSError"] });
    expect(words(refused)).toBe(taken);
    // A page that wouldn't open says so in place of when it opened.
    const page = "Your Mac didn't open index.html. Open it from your folder.";
    expect(
      words(
        runBar({ recipe, run: { state: "opened", command: commandOf(recipe), trouble: page } }),
      ),
    ).toBe(page);
    const ended = runBar({
      recipe,
      run: { state: "ended", code: 0, ended: "2026-10-24T09:05:00.000Z" },
      now: NOW,
    });
    expect(ended).toMatchObject({ title: "It ran and finished 5 min ago.", tone: "plain" });
  });
});

describe("the run file at main", () => {
  it("is read as the Mac reads it, from .chips/run.json or chips.json, and nothing when the project has neither", async () => {
    const said = (files: Record<string, string>) => ({
      projectFile: async (_spaceId: string, path: string) => {
        const text = files[path];
        if (text === undefined) throw new Error("not found");
        return { bytes: new TextEncoder().encode(text), type: "application/json" };
      },
    });
    expect(
      await readRunRecipe(said({ ".chips/run.json": JSON.stringify(recipe) }), "spc_1"),
    ).toEqual(recipe);
    // Where it was kept before ADR 0227, and its words name that file.
    expect(await readRunRecipe(said({ "chips.json": '{"run": ""}' }), "spc_1")).toEqual({
      why: "chips.json doesn't say what to run or open.",
    });
    // Both: .chips/run.json is the one.
    expect(
      await readRunRecipe(
        said({ ".chips/run.json": JSON.stringify(recipe), "chips.json": '{"run": "old"}' }),
        "spc_1",
      ),
    ).toEqual(recipe);
    expect(await readRunRecipe(said({}), "spc_1")).toBeUndefined();
  });
});

describe("who changed it since the last run (SEC-40)", () => {
  const directory: Directory = {
    per_arjun: { id: "per_arjun", kind: "person", displayName: "Arjun" },
    per_dana: { id: "per_dana", kind: "person", displayName: "Dana" },
    hrn_jacobian: {
      id: "hrn_jacobian",
      kind: "harness",
      displayName: "Jacobian",
      ownerId: "per_arjun",
    },
    hrn_danas: { id: "hrn_danas", kind: "harness", displayName: "Codex", ownerId: "per_dana" },
    hrn_old: { id: "hrn_old", kind: "harness", displayName: "Old" },
    agt_wynn: { id: "agt_wynn", kind: "agent", displayName: "Wynn", harnessId: "hrn_jacobian" },
    agt_kit: { id: "agt_kit", kind: "agent", displayName: "Kit", harnessId: "hrn_danas" },
    agt_moss: { id: "agt_moss", kind: "agent", displayName: "Moss", harnessId: "hrn_old" },
  } as unknown as Directory;
  const change = (commit: string, by: string) => ({
    commit,
    by,
    byKind: by.startsWith("per_") ? ("person" as const) : ("agent" as const),
  });
  // Newest first, as the room keeps them.
  const changes = [
    change("c6", "agt_moss"),
    change("c5", "per_dana"),
    change("c4", "agt_kit"),
    change("c3", "agt_wynn"),
    change("c2", "per_arjun"),
    change("c1", "agt_kit"),
  ];
  const project = { changes } as never;

  it("names everybody but the person and their own agents, the first of them first", () => {
    expect(changedSince(project, "c3", directory, "per_arjun")).toEqual([
      "Dana's agent",
      "Dana",
      "Moss",
    ]);
    expect(changedSince(project, "c1", directory, "per_arjun")).toEqual([
      "Dana's agent",
      "Dana",
      "Moss",
    ]);
    // Only Arjun and his own agent since: nobody to name.
    expect(
      changedSince({ changes: changes.slice(3) } as never, "c1", directory, "per_arjun"),
    ).toEqual([]);
    // Dana's own agent is hers; Arjun's is somebody else's to her.
    expect(changedSince(project, "c2", directory, "per_dana")).toEqual(["Arjun's agent", "Moss"]);
  });

  it("says nothing without the run's commit, or for one the room's changes don't reach", () => {
    expect(changedSince(project, undefined, directory, "per_arjun")).toEqual([]);
    expect(changedSince(project, "c0", directory, "per_arjun")).toEqual([]);
    expect(changedSince(undefined, "c3", directory, "per_arjun")).toEqual([]);
    expect(changedSince(project, "c6", directory, "per_arjun")).toEqual([]);
  });

  it("says so in amber over Run, Run again and a run going on, and runs it all the same", () => {
    const ready = runBar({
      recipe,
      run: { state: "stopped", command: commandOf(recipe) },
      changedBy: ["Dana", "Dana's agent"],
      now: NOW,
    });
    expect(ready).toMatchObject({
      changed: "Changed by Dana and Dana's agent since you last ran it.",
      press: "Run program",
    });
    // Over a changed recipe too: who changed it is the news.
    expect(
      runBar({
        recipe,
        run: { state: "stopped", command: "python3 -m http.server 3000" },
        changedBy: ["Dana"],
      }).changed,
    ).toBe("Changed by Dana since you last ran it.");
    const ended = runBar({
      recipe,
      run: { state: "ended", command: commandOf(recipe), code: 0 },
      changedBy: ["Dana"],
      now: NOW,
    });
    expect(ended).toMatchObject({
      kind: "ended",
      press: "Run again",
      changed: "Changed by Dana since you last ran it.",
    });
    const running = runBar({
      recipe,
      run: {
        state: "running",
        command: commandOf(recipe),
        since: new Date(NOW - 60_000).toISOString(),
      },
      changedBy: ["Dana"],
      now: NOW,
    });
    expect(running).toMatchObject({ kind: "running", press: "Run again" });
    expect(running.changed).toBe("Changed by Dana since you last ran it.");
    expect(
      runBar({ recipe, run: { state: "stopped", command: commandOf(recipe) }, changedBy: [] })
        .changed,
    ).toBeUndefined();
  });
});
