/**
 * Your folder (ADR 0224), with real git against a listening server: the folder is made at
 * `~/Chips/Projects/<room name>` and found again by its room; it is brought up to `main` while
 * nothing in it is the person's, and holds still once something is; Send sends what they changed
 * on top of what an agent sent first, under their name and words; a change that overlaps an
 * agent's is marked and held until it is settled; and a key is never sent.
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Project } from "@chipschat/harness";
import {
  commandOf,
  type ProjectToken,
  pressCommand,
  type RunFile,
  runPrograms,
} from "@chipschat/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestWorkspace, type TestWorkspace } from "../../../server/src/testing/workspace.js";
import { type CliDevice, call, pairDevice } from "../device.js";
import {
  editorOf,
  type FolderAnswer,
  type FolderAsked,
  type FolderOp,
  folderAsked,
  folderName,
  newFolder,
  runFolder,
} from "./folder.js";

let ws: TestWorkspace;
let scratch: string;
let device: CliDevice;
let port: number;
let scout: Project;
let opened: string[][];

beforeEach(async () => {
  ws = await createTestWorkspace({ config: { devMode: true } as never });
  ({ port } = await ws.gateway.listen());
  scratch = mkdtempSync(join(tmpdir(), "chips-your-folder-"));
  const code = ws.gateway.deps.pairingCodes?.issue({
    workspaceId: ws.workspaceId,
    participantId: ws.arjun.participantId,
  });
  device = await pairDevice({
    serverUrl: `http://127.0.0.1:${port}`,
    code: code?.code ?? "",
    name: "Mac",
    path: join(scratch, "device.json"),
  });
  await ws.gateway.deps.upgradeAgents.apply(ws.workspaceId);
  const agent = await ws.gateway.deps.readModels.agentByKey(
    ws.workspaceId,
    ws.scout.participantId,
    ws.scout.participantId,
  );
  if (agent === undefined) throw new Error("Scout has no agent");
  scout = new Project({
    url: `http://127.0.0.1:${port}`,
    token: ws.scout.token,
    spaceId: ws.spaceId,
    agentId: agent.agent_id,
    name: "Scout",
    folder: join(scratch, "scout"),
  });
  opened = [];
});

afterEach(async () => {
  await ws.close();
  rmSync(scratch, { recursive: true, force: true });
});

const folder = () => join(scratch, "Chips", "Projects", "Sudoku mini");

/** What the Mac app asks with: a fresh token from the paired device, as its page asks for one. */
async function asked(over: Partial<FolderAsked> = {}): Promise<FolderAsked> {
  const { token } = await call<ProjectToken>(
    device,
    "POST",
    `/v1/spaces/${ws.spaceId}/project/token`,
  );
  return {
    spaceId: ws.spaceId,
    title: "Sudoku mini",
    server: `http://127.0.0.1:${port}`,
    personId: ws.arjun.participantId,
    name: "Arjun",
    token,
    ...over,
  };
}

async function run(op: FolderOp, over: Partial<FolderAsked> = {}) {
  const answer: FolderAnswer = await runFolder(op, await asked(over), {
    home: scratch,
    open: async (args) => void opened.push([...args]),
    has: () => false,
  });
  if (!answer.ok) throw new Error(answer.why);
  return answer;
}

function write(at: string, words: string): void {
  mkdirSync(dirname(at), { recursive: true });
  writeFileSync(at, words);
}

/** Scout's agent writes these and sends them, as its bridge does after a turn. */
async function agentSends(files: Readonly<Record<string, string>>, words: string) {
  await scout.pull();
  for (const [path, said] of Object.entries(files)) write(join(scout.copy, path), said);
  expect(await scout.push({ words })).toMatchObject({ state: "sent" });
}

async function lastChange() {
  const page = await ws.gateway.deps.store.since(ws.workspaceId, 0, 5000);
  return page.events.filter((event) => event.type === "project.changed").at(-1);
}

describe("Your folder", () => {
  it("is made at ~/Chips/Projects/<room name>, kept up to date while untouched, and found again by its room", async () => {
    expect(await run("look")).toEqual({
      ok: true,
      folder: folder(),
      shown: "~/Chips/Projects/Sudoku mini",
      made: false,
      run: { state: "never" },
    });
    await agentSends({ "index.html": "<h1>Sudoku</h1>\n" }, "The page");

    const made = await run("open");
    expect(made).toMatchObject({
      made: true,
      came: ["index.html"],
      cameBy: ["Scout"],
      changed: [],
    });
    expect(opened).toEqual([[folder()]]);
    expect(readFileSync(join(folder(), "index.html"), "utf8")).toBe("<h1>Sudoku</h1>\n");

    await agentSends({ "src/game.js": "export const size = 9;\n" }, "The game");
    const kept = await run("look", { title: "Sudoku, renamed" });
    expect(kept).toMatchObject({ folder: folder(), came: ["src/game.js"], cameBy: ["Scout"] });
    expect(readFileSync(join(folder(), "src/game.js"), "utf8")).toBe("export const size = 9;\n");
    expect(readFileSync(join(folder(), ".git", "config"), "utf8")).not.toContain("chips_pt_");
  });

  it("holds still once the person has changed something, and Send sends it on top of the room's", async () => {
    await agentSends({ "index.html": "<h1>Sudoku</h1>\n" }, "The page");
    await run("open");
    write(join(folder(), "index.html"), "<h1>Sudoku mini</h1>\n");
    write(join(folder(), "style.css"), ".cell {\n  width: 44px;\n}\n");
    await agentSends({ "src/board.js": "export const board = [];\n" }, "The board");

    const held = await run("look");
    expect(held).toMatchObject({
      changed: [
        { path: "index.html", added: 1, removed: 1 },
        { path: "style.css", added: 3, removed: 0 },
      ],
      since: ["src/board.js"],
      by: ["Scout"],
      came: [],
      clashes: [],
    });
    expect(() => readFileSync(join(folder(), "src/board.js"))).toThrow();

    const sent = await run("send", { words: "Bigger cells on small screens" });
    expect(sent).toMatchObject({ sent: { over: ["Scout"] }, changed: [], since: [] });
    if (sent.made)
      expect([...(sent.sent?.files ?? [])].sort()).toEqual(["index.html", "style.css"]);
    expect(readFileSync(join(folder(), "src/board.js"), "utf8")).toBe("export const board = [];\n");
    const change = await lastChange();
    expect(change?.actor).toMatchObject({ kind: "person", id: ws.arjun.participantId });
    expect(change?.payload).toMatchObject({ message: "Bigger cells on small screens" });
  });

  it("marks a change that overlaps an agent's, holds it until the marks are out, then sends it", async () => {
    await agentSends({ "style.css": ".cell {\n  width: 40px;\n}\n" }, "Cells");
    await run("open");
    write(join(folder(), "style.css"), ".cell {\n  width: 44px;\n}\n");
    await agentSends({ "style.css": ".cell {\n  width: 38px;\n}\n" }, "Smaller cells");

    const clash = await run("send", { words: "Bigger cells" });
    expect(clash).toMatchObject({ clashes: ["style.css"], clashedWith: ["Scout"] });
    expect(clash.made && clash.sent).toBeFalsy();
    expect(clash.made ? clash.marked : "").toBe(
      ".cell {\n<<<<<<< yours\n  width: 44px;\n=======\n  width: 38px;\n>>>>>>> Scout\n}",
    );
    expect(await run("look")).toMatchObject({ clashes: ["style.css"] });

    write(join(folder(), "style.css"), ".cell {\n  width: 42px;\n}\n");
    expect(await run("look")).toMatchObject({ clashes: [] });
    expect(await run("send", { words: "Both" })).toMatchObject({ sent: { files: ["style.css"] } });
    const files = await call<{ files: { path: string }[] }>(
      device,
      "GET",
      `/v1/spaces/${ws.spaceId}/project/files`,
    );
    expect(files.files.map((file) => file.path)).toEqual(["style.css"]);
    expect((await lastChange())?.payload).toMatchObject({ message: "Both" });
  });

  it("counts a clash settled back to where both began as the person's change, and one settled as the agent's as none", async () => {
    await agentSends({ "style.css": ".cell {\n  width: 40px;\n}\n" }, "Cells");
    await run("open");
    write(join(folder(), "style.css"), ".cell {\n  width: 44px;\n}\n");
    await agentSends({ "style.css": ".cell {\n  width: 38px;\n}\n" }, "Smaller cells");
    expect(await run("send")).toMatchObject({ clashes: ["style.css"] });

    // Back to 40px: not the agent's 38px, so it is the person's to send.
    write(join(folder(), "style.css"), ".cell {\n  width: 40px;\n}\n");
    expect(await run("look")).toMatchObject({
      clashes: [],
      changed: [{ path: "style.css", added: 1, removed: 1 }],
    });

    // The agent's 38px whole: nothing left of the person's, and the folder is kept up to date again.
    write(join(folder(), "style.css"), ".cell {\n  width: 38px;\n}\n");
    expect(await run("look")).toMatchObject({ clashes: [], changed: [] });
    await agentSends({ "index.html": "<h1>Again</h1>\n" }, "Again");
    expect(await run("look")).toMatchObject({ came: ["index.html"] });
    expect(readFileSync(join(folder(), "index.html"), "utf8")).toBe("<h1>Again</h1>\n");
  });

  it("never sends a file that looks like it holds a key", async () => {
    await run("open");
    const key = ["sk-", "ant-", "api03-", "Z".repeat(40)].join("");
    write(join(folder(), "config.js"), `export const key = "${key}";\n`);
    const held = await run("send");
    expect(held).toMatchObject({ keys: [{ path: "config.js" }] });
    expect(await lastChange()).toBeUndefined();
  });

  it("opens the folder in the first editor the Mac has, and a clashed file in it", async () => {
    await agentSends({ "style.css": "a\n" }, "A");
    await run("open");
    const answer = await runFolder("file", await asked({ file: "style.css" }), {
      home: scratch,
      open: async (args) => void opened.push([...args]),
      has: (path) => path === "/Applications/Zed.app",
    });
    expect(answer).toMatchObject({ editor: "Zed" });
    expect(opened.at(-1)).toEqual(["-a", "/Applications/Zed.app", join(folder(), "style.css")]);
    const outside = await runFolder("file", await asked({ file: "../../device.json" }), {
      home: scratch,
      open: async () => undefined,
    });
    expect(outside).toEqual({ ok: false, why: "That file isn't in your folder." });
  });

  it("opens a page of the folder as Finder would, making the folder and bringing it up first (ADR 0227)", async () => {
    await agentSends({ "synchrotron.html": "<h1>Light</h1>\n" }, "A page");
    // Never opened before: Open in browser makes the folder, with the agents' page in it.
    const answer = await run("view", { file: "synchrotron.html" });
    expect(answer).toMatchObject({ made: true });
    expect(opened.at(-1)).toEqual([join(folder(), "synchrotron.html")]);
    expect(readFileSync(join(folder(), "synchrotron.html"), "utf8")).toBe("<h1>Light</h1>\n");
    await expect(run("view", { file: "../../device.json" })).rejects.toThrow(
      "That file isn't in your folder.",
    );
    await expect(run("view", { file: "gone.html" })).rejects.toThrow(
      "That file isn't in your folder.",
    );
  });

  it("follows a link before it opens a file, and opens none that leads out of the folder (SEC-55)", async () => {
    await scout.pull();
    write(join(scout.copy, "synchrotron.html"), "<h1>Light</h1>\n");
    write(join(scout.copy, "play.command"), "#!/bin/sh\necho ran\n");
    symlinkSync("synchrotron.html", join(scout.copy, "latest.html"));
    write(join(scratch, "elsewhere", "notes.txt"), "Somewhere else on the Mac.\n");
    symlinkSync(join(scratch, "elsewhere", "notes.txt"), join(scout.copy, "notes.html"));
    symlinkSync("play.command", join(scout.copy, "game.html"));
    expect(await scout.push({ words: "Links" })).toMatchObject({ state: "sent" });
    // A link that stays in the folder opens as the file it names would.
    await run("view", { file: "latest.html" });
    expect(opened.at(-1)).toEqual([join(folder(), "latest.html")]);
    opened = [];
    await expect(run("view", { file: "notes.html" })).rejects.toThrow(
      "That file isn't in your folder.",
    );
    await expect(run("file", { file: "notes.html" })).rejects.toThrow(
      "That file isn't in your folder.",
    );
    await expect(run("view", { file: "game.html" })).rejects.toThrow(
      "That file would run as a program, so Chips didn't open it.",
    );
    expect(opened).toEqual([]);
  });
});

describe("Run (ADR 0226)", () => {
  /** The ops of Run, with a plain shell and an address that answers once it is asked twice. */
  async function ran(op: FolderOp, over: Partial<FolderAsked> = {}) {
    let asks = 0;
    const answers = async () => {
      asks += 1;
      return asks > 1;
    };
    const answer = await runFolder(op, await asked(over), {
      home: scratch,
      open: async (args) => void opened.push([...args]),
      has: () => false,
      env: { HOME: scratch, CHIPS_FOLDER_TOKEN: "chips_pt_secret" },
      run: { shell: "/bin/sh", answers, readyMs: 5000 },
    });
    return answer;
  }
  const until = async (done: () => Promise<boolean>) => {
    for (let i = 0; i < 100 && !(await done()); i += 1) await new Promise((r) => setTimeout(r, 50));
  };

  it("runs only what chips.json says and the person saw, opens it once it answers, and stops it", async () => {
    expect(await ran("status")).toMatchObject({ made: false, run: { state: "never" } });
    expect(await ran("run", { command: "sleep 30" })).toEqual({
      ok: false,
      why: "The project has no run file yet, so there's nothing to run.",
    });
    const recipe = { run: "echo up; sleep 30", opens: "http://localhost:8000" };
    await agentSends({ "chips.json": JSON.stringify(recipe) }, "Runnable");

    // What the person saw isn't what it says now: nothing runs.
    expect(await ran("run", { command: "sleep 30" })).toMatchObject({ ok: false });
    // Nor where they saw the run and not what it opens (SEC-46).
    expect(await ran("run", { command: recipe.run })).toMatchObject({ ok: false });
    expect(await ran("status")).toMatchObject({ run: { state: "never" } });

    const running = await ran("run", { command: commandOf(recipe) });
    // It says which of the room's commits it ran, so the bar can name who changed it since (SEC-40).
    const head = ((await lastChange())?.payload as { after?: string } | undefined)?.after;
    expect(running).toMatchObject({
      ok: true,
      made: true,
      run: {
        state: "running",
        command: commandOf(recipe),
        opened: "http://localhost:8000",
        commit: head,
      },
    });
    expect(opened).toEqual([["http://localhost:8000"]]);
    expect(await ran("status")).toMatchObject({ run: { state: "running" } });

    // A login shell can take its time on a busy machine, and the run counts as started before it prints.
    const log = join(scratch, "Library", "Caches", "chat.chips", "runs", ws.spaceId, "log");
    await until(async () => readFileSync(log, "utf8").includes("up"));
    const stopped = await ran("stop");
    expect(stopped).toMatchObject({ run: { state: "stopped", lines: ["up"] } });
    expect(await ran("status")).toMatchObject({ run: { state: "stopped" } });
  });

  /** Run's ops with a shell, an address that answers as told, and whoever holds a port. */
  function runDeps(over: {
    readonly answers: (url: string) => Promise<boolean>;
    readonly open?: (args: readonly string[]) => Promise<void>;
    readonly readyMs?: number;
  }) {
    return {
      home: scratch,
      open: over.open ?? (async (args: readonly string[]) => void opened.push([...args])),
      has: () => false,
      env: { HOME: scratch },
      run: {
        shell: "/bin/sh",
        answers: over.answers,
        readyMs: over.readyMs ?? 5000,
        holder: async (port: number) => (port === 4173 ? "python3" : undefined),
      },
    };
  }
  async function runs(recipe: { run: string; opens?: string }, deps: ReturnType<typeof runDeps>) {
    await agentSends({ ".chips/run.json": JSON.stringify(recipe) }, "Runnable");
    return await runFolder("run", await asked({ command: commandOf(recipe) }), deps);
  }
  const settled = async (deps: ReturnType<typeof runDeps>) => {
    let status = await runFolder("status", await asked(), deps);
    await until(async () => {
      status = await runFolder("status", await asked(), deps);
      return status.ok && status.run?.state !== "running";
    });
    return status;
  };

  it("opens the address the program printed, where it picked its own port (ADR 0230)", async () => {
    const recipe = {
      run: "echo 'Listening on http://0.0.0.0:4174/.'; sleep 30",
      opens: "http://localhost:4173",
    };
    const deps = runDeps({ answers: async (url) => url.includes("4174") });
    expect(await runs(recipe, deps)).toMatchObject({
      ok: true,
      run: { state: "running", opened: "http://127.0.0.1:4174/" },
    });
    expect(opened.at(-1)).toEqual(["http://127.0.0.1:4174/"]);
    await runFolder("stop", await asked(), deps);
  });

  it("lets Python print as it goes, so the address it listens on reaches Run at once", async () => {
    const recipe = { run: 'echo "unbuffered=$PYTHONUNBUFFERED"' };
    const deps = runDeps({ answers: async () => false });
    await runs(recipe, deps);
    expect(await settled(deps)).toMatchObject({ run: { state: "ended", lines: ["unbuffered=1"] } });
  });

  it("gives up on an address in seconds where only a printed one could open", async () => {
    const recipe = { run: "sleep 30", opens: "http://localhost:8000" };
    const deps = runDeps({ answers: async () => true, readyMs: 30_000 });
    const began = Date.now();
    expect(await runs(recipe, deps)).toMatchObject({ run: { state: "running" } });
    expect(Date.now() - began).toBeLessThan(15_000);
    await runFolder("stop", await asked(), deps);
  });

  it("starts the program over what already answered, and says its port is taken and by whom", async () => {
    // Another of Arjun's programs holds Sudoku's port: Run used to open it as Sudoku.
    const recipe = {
      run: "echo 'Error: listen EADDRINUSE: address already in use :::4173' >&2; exit 1",
      opens: "http://localhost:4173",
    };
    const deps = runDeps({ answers: async () => true });
    await runs(recipe, deps);
    expect(await settled(deps)).toMatchObject({
      run: {
        state: "failed",
        code: 1,
        trouble:
          "Port 4173 is already in use by python3, so the program couldn't start. Quit that program, or ask the agents to have it pick a free port.",
      },
    });
    expect(opened).toEqual([]);
  });

  it("names a program the Mac doesn't have, and what to install", async () => {
    const recipe = { run: "chipsnosuchtool --serve", opens: "http://localhost:4173" };
    const deps = runDeps({ answers: async () => false });
    await runs(recipe, deps);
    expect(await settled(deps)).toMatchObject({
      run: {
        state: "failed",
        code: 127,
        trouble:
          "Chips couldn't find chipsnosuchtool on your Mac, so the program couldn't start. Install chipsnosuchtool, or ask the agents for a version that needs nothing installed.",
      },
    });
  });

  it("says when a running program never answered, with its last lines and Stop", async () => {
    const recipe = { run: "echo warming up; sleep 30", opens: "http://localhost:4173" };
    const deps = runDeps({ answers: async () => false, readyMs: 600 });
    expect(await runs(recipe, deps)).toMatchObject({
      ok: true,
      run: {
        state: "running",
        trouble: "It's running, but nothing answered at localhost:4173 after 1 second.",
        lines: ["warming up"],
      },
    });
    expect(await runFolder("stop", await asked(), deps)).toMatchObject({
      run: { state: "stopped" },
    });
  });

  /** Where the room's runs keep their files on this Mac. */
  const runsAt = () => join(scratch, "Library", "Caches", "chat.chips", "runs", ws.spaceId);
  /** The process group the last run's shell led, by its id. */
  const groupOf = () => Number(readFileSync(join(runsAt(), "pid"), "utf8").split("\n")[0]);
  /** Whether anything of that group still goes. */
  const lives = (group: number) => {
    try {
      process.kill(-group, 0);
      return true;
    } catch {
      return false;
    }
  };

  it("keeps a run going, with Stop, when its shell ends and leaves what it started running (ADR 0230's addendum)", async () => {
    // Two servers, both sent to the background: the shell ends at once, and Run used to say
    // "It ran and finished" with no Stop while both went on.
    const recipe = {
      run: "(echo 'Web on http://127.0.0.1:4174/'; sleep 30) & sleep 30 &",
      opens: "http://localhost:4174",
    };
    const deps = runDeps({ answers: async (url) => url.includes("4174") });
    expect(await runs(recipe, deps)).toMatchObject({
      ok: true,
      run: { state: "running", opened: "http://127.0.0.1:4174/" },
    });
    const group = groupOf();
    expect(lives(group)).toBe(true);
    expect(await runFolder("status", await asked(), deps)).toMatchObject({
      run: { state: "running" },
    });
    expect(await runFolder("stop", await asked(), deps)).toMatchObject({
      run: { state: "stopped" },
    });
    await until(async () => !lives(group));
    expect(lives(group)).toBe(false);
  });

  it("stops what the last run left running before it runs again, and says how it ended once all of it has", async () => {
    // `a & b` once b ended: a went on holding its port, and no Stop or Run again reached it.
    const recipe = { run: "sleep 30 & exit 3" };
    const deps = runDeps({ answers: async () => false, readyMs: 600 });
    expect(await runs(recipe, deps)).toMatchObject({ run: { state: "running" } });
    const first = groupOf();
    await runFolder("run", await asked({ command: commandOf(recipe) }), deps);
    await until(async () => !lives(first));
    expect(lives(first)).toBe(false);
    expect(groupOf()).not.toBe(first);
    await runFolder("stop", await asked(), deps);

    // What it left behind ends by itself: the run ended as its shell said.
    const brief = { run: "sleep 1 & exit 3" };
    await runs(brief, deps);
    expect(await settled(deps)).toMatchObject({ run: { state: "failed", code: 3 } });
  });

  it("opens the address printed on the run file's port, where the program printed another first", async () => {
    // An API that starts before the page to open: Run used to open the API.
    const recipe = {
      run: "echo 'API on http://127.0.0.1:8000/'; sleep 1; echo 'Web on http://localhost:5173/'; sleep 30",
      opens: "http://localhost:5173",
    };
    let began: number | undefined;
    const answers = async (url: string) => {
      if (url.includes("8000")) return true;
      // Asked once before the run starts, when nothing answers there yet.
      if (began === undefined) {
        began = Date.now();
        return false;
      }
      return Date.now() - began > 1200;
    };
    const running = await runs(recipe, runDeps({ answers }));
    expect(running).toMatchObject({ ok: true, run: { state: "running" } });
    expect(opened).toHaveLength(1);
    expect(opened[0]?.[0]).toContain("localhost:5173");
    await runFolder("stop", await asked(), runDeps({ answers }));
  });

  it("runs setup again when a manifest in a folder one down changes", async () => {
    const recipe = { setup: "echo set up", run: "echo ran; sleep 30" };
    await agentSends(
      { ".chips/run.json": JSON.stringify(recipe), "web/package.json": '{"name": "web"}\n' },
      "Two apps",
    );
    const deps = runDeps({ answers: async () => false, readyMs: 600 });
    const log = () => readFileSync(join(runsAt(), "log"), "utf8");
    const press = async () =>
      await runFolder("run", await asked({ command: commandOf(recipe) }), deps);

    await press();
    expect(log()).toContain("set up");
    await press();
    expect(log()).not.toContain("set up");
    await agentSends(
      { "web/package.json": '{"name": "web", "dependencies": {"left-pad": "1.3.0"}}\n' },
      "A dependency for the page",
    );
    await press();
    expect(log()).toContain("set up");
    await runFolder("stop", await asked(), deps);
  });

  it("opens the address the program printed where the run file opens nothing, as the agents are told", async () => {
    // "opens" is for a program that prints none: Run used to open nothing for one that printed.
    const recipe = { run: "echo 'Serving on http://0.0.0.0:4175/'; sleep 30" };
    const deps = runDeps({ answers: async (url) => url.includes("4175") });
    expect(await runs(recipe, deps)).toMatchObject({
      ok: true,
      run: { state: "running", opened: "http://127.0.0.1:4175/" },
    });
    expect(opened).toEqual([["http://127.0.0.1:4175/"]]);
    await runFolder("stop", await asked(), deps);
  });

  it("leaves a run that opens nothing and prints no address to run, in seconds and with nothing said", async () => {
    // A bot, a window, a script: nothing to open, and no reason to read as starting for long.
    const recipe = { run: "echo 'Logged in as Sudoku bot'; sleep 30" };
    const deps = runDeps({ answers: async () => true, readyMs: 30_000 });
    const began = Date.now();
    const running = await runs(recipe, deps);
    expect(Date.now() - began).toBeLessThan(15_000);
    expect(running).toMatchObject({ ok: true, run: { state: "running" } });
    expect(running.ok && running.run).not.toHaveProperty("trouble");
    expect(running.ok && running.run).not.toHaveProperty("opened");
    expect(opened).toEqual([]);
    await runFolder("stop", await asked(), deps);
  });

  it("opens nothing where the program printed no address and its address was somebody else's", async () => {
    const recipe = { run: "sleep 30", opens: "http://localhost:8000" };
    const deps = runDeps({ answers: async () => true, readyMs: 600 });
    expect(await runs(recipe, deps)).toMatchObject({
      run: {
        state: "running",
        trouble:
          "It's running, but it didn't print an address, and another program already answers at localhost:8000, so Run opened nothing. Ask the agents to have it pick a free port and print its address.",
      },
    });
    expect(opened).toEqual([]);
    await runFolder("stop", await asked(), deps);
  });

  it("keeps a run going when the browser won't take its address, says so, and still stops it", async () => {
    // Safari on Arjun's Mac refused every address, from Terminal too (25 October 2026).
    const refused = "_LSOpenURLsWithCompletionHandler() failed with error -1712 for the URL";
    let asks = 0;
    const deps = runDeps({
      answers: async () => {
        asks += 1;
        return asks > 1;
      },
      open: async () => {
        throw new Error(refused);
      },
    });
    const running = await runs({ run: "echo up; sleep 30", opens: "http://localhost:4173" }, deps);
    expect(running).toMatchObject({
      ok: true,
      run: {
        state: "running",
        trouble: "Your browser didn't open localhost:4173. Open that address in your browser.",
      },
    });
    expect(running.ok && running.run !== undefined && "opened" in running.run).toBe(false);
    const stopped = await runFolder("stop", await asked(), deps);
    expect(stopped).toMatchObject({ run: { state: "stopped" } });
    expect(stopped.ok && stopped.run?.lines?.join("\n")).toContain(`Chips couldn't open`);
  });

  it("refuses a run file that runs something outside the project's folder", async () => {
    const run = "cd /Users/someone/workspace/game && node serve.js";
    await agentSends({ ".chips/run.json": JSON.stringify({ run }) }, "Elsewhere");
    expect(await ran("run", { command: run })).toEqual({
      ok: false,
      why: ".chips/run.json uses /Users/someone/workspace/game, outside the project's folder. Ask the agents to put what it runs in the project.",
    });
    expect(await ran("status")).toMatchObject({ run: { state: "never" } });
  });

  it("reads .chips/run.json before a chips.json at the top (ADR 0227)", async () => {
    await agentSends(
      {
        ".chips/run.json": JSON.stringify({ run: "echo here; sleep 30" }),
        "chips.json": JSON.stringify({ run: "echo before; sleep 30" }),
      },
      "Both run files",
    );
    expect(await ran("run", { command: "echo before; sleep 30" })).toMatchObject({ ok: false });
    expect(await ran("run", { command: "echo here; sleep 30" })).toMatchObject({
      ok: true,
      run: { state: "running", command: "echo here; sleep 30" },
    });
    expect(await ran("stop")).toMatchObject({ run: { state: "stopped" } });
  });

  it("opens pages that need no starting, and says a missing page is missing", async () => {
    await agentSends(
      { "chips.json": '{"opens": "index.html"}', "index.html": "<a href=report.html>Report</a>\n" },
      "A start page",
    );
    expect(await ran("run", { command: "open index.html" })).toMatchObject({
      ok: true,
      run: { state: "opened", command: "open index.html", opened: "index.html" },
    });
    expect(opened).toEqual([[join(folder(), "index.html")]]);
    expect(await ran("status")).toMatchObject({ run: { state: "opened" } });

    await agentSends({ "chips.json": '{"opens": "gone.html"}' }, "A page that isn't there");
    expect(await ran("run", { command: "open gone.html" })).toMatchObject({
      run: { state: "failed", code: 1, lines: ["gone.html isn't in your folder."] },
    });
    expect(opened).toHaveLength(1);
  });

  it("asks again of the file it opens, so a page that links to a program isn't run (SEC-46)", async () => {
    await scout.pull();
    write(join(scout.copy, "play.command"), "#!/bin/sh\necho ran\n");
    symlinkSync("play.command", join(scout.copy, "index.html"));
    write(join(scout.copy, "chips.json"), '{"opens": "index.html"}');
    expect(await scout.push({ words: "A page" })).toMatchObject({ state: "sent" });
    expect(await ran("run", { command: "open index.html" })).toMatchObject({
      run: {
        state: "failed",
        lines: ["index.html would run as a program, so Chips didn't open it."],
      },
    });
    expect(opened).toEqual([]);
  });

  it("says how a run that ended by itself ended, with its last lines", async () => {
    const recipe = { run: "echo one; echo two >&2; exit 3" };
    await agentSends({ "chips.json": JSON.stringify(recipe) }, "Fails");
    await ran("run", { command: recipe.run });
    await until(async () => {
      const answer = await ran("status");
      return answer.ok && answer.run?.state !== "running";
    });
    expect(await ran("status")).toMatchObject({
      run: { state: "failed", code: 3, lines: ["one", "two"] },
    });

    const fine = { run: "echo done" };
    await agentSends({ "chips.json": JSON.stringify(fine) }, "Fine");
    await ran("run", { command: fine.run });
    await until(async () => {
      const answer = await ran("status");
      return answer.ok && answer.run?.state !== "running";
    });
    expect(await ran("status")).toMatchObject({
      run: { state: "ended", code: 0, lines: ["done"] },
    });
  });

  it("runs setup first, and again only when it or the project's packages changed", async () => {
    const recipe = {
      setup: "echo set >> ../setups.txt",
      run: "echo up",
    };
    const command = `${recipe.setup}\n${recipe.run}`;
    await agentSends({ "chips.json": JSON.stringify(recipe), "package.json": "{}\n" }, "Setup");
    const setups = () => readFileSync(join(folder(), "..", "setups.txt"), "utf8");
    await ran("run", { command });
    await ran("run", { command });
    expect(setups()).toBe("set\n");
    await agentSends({ "package.json": '{"dependencies":{"vite":"7"}}\n' }, "A package");
    await ran("run", { command });
    expect(setups()).toBe("set\nset\n");
  });

  it("keeps what a run prints beside the person's other caches, never in the folder, and never hands it the token", async () => {
    const recipe = { run: 'echo hello "${CHIPS_FOLDER_TOKEN:-}"' };
    await agentSends({ "chips.json": JSON.stringify(recipe) }, "Hello");
    expect(await ran("run", { command: recipe.run })).toMatchObject({
      changed: [],
    });
    expect(await ran("look")).toMatchObject({ changed: [] });
    const log = join(scratch, "Library", "Caches", "chat.chips", "runs", ws.spaceId, "log");
    await until(async () => readFileSync(log, "utf8").includes("hello"));
    expect(readFileSync(log, "utf8")).toBe("hello \n");
  });
});

describe("Several programs (ADR 0303)", () => {
  /** A program that prints the address it listens on, and keeps going. */
  const server = (port: number) => `echo 'Listening on http://127.0.0.1:${port}/'; sleep 30`;
  const API = { name: "API", in: "api", run: server(4191) };
  const SHOP = {
    name: "Shop",
    in: "shop",
    run: server(4192),
    opens: "http://localhost:4192",
    needs: ["API"],
  };
  const ADMIN = { name: "Admin", in: "admin", run: server(4193), needs: ["API"] };
  const deps = (answers: (url: string) => Promise<boolean> = async () => true) => ({
    home: scratch,
    open: async (args: readonly string[]) => void opened.push([...args]),
    has: () => false,
    env: { HOME: scratch },
    run: { shell: "/bin/sh", answers, readyMs: 3000 },
  });
  /** The run file sent to the room with a file in each program's folder, and read as the Mac reads it. */
  async function listed(...programs: object[]): Promise<RunFile> {
    const text = JSON.stringify({ programs });
    await agentSends(
      { ".chips/run.json": text, "api/main.py": "", "shop/index.html": "", "admin/index.html": "" },
      "Programs",
    );
    const file = runPrograms(text);
    if ("why" in file) throw new Error(file.why);
    return file;
  }
  const press = async (op: FolderOp, file: RunFile | undefined, program?: string, with_ = deps()) =>
    await runFolder(
      op,
      await asked({
        ...(program === undefined ? {} : { program }),
        ...(op === "run" && file !== undefined ? { command: pressCommand(file, program) } : {}),
      }),
      with_,
    );
  const states = (answer: Awaited<ReturnType<typeof press>>) =>
    Object.fromEntries(
      Object.entries((answer.ok && answer.programs) || {}).map(([name, run]) => [
        name,
        run.runs_for === undefined ? run.state : `${run.state} for ${run.runs_for.join(", ")}`,
      ]),
    );

  it("runs a program after what it needs, opens only its own page, and stops the need with it", async () => {
    const file = await listed(API, SHOP);
    const ran = await press("run", file, "Shop");
    expect(states(ran)).toEqual({ API: "running for Shop", Shop: "running" });
    expect(ran).toMatchObject({
      programs: {
        API: { listens: "http://127.0.0.1:4191/", command: "program API in api\n" + API.run },
        Shop: { opened: "http://127.0.0.1:4192/" },
      },
    });
    // The API others need is only looked at: its page is Shop's.
    expect(opened).toEqual([["http://127.0.0.1:4192/"]]);
    expect(states(await press("stop", file, "Shop"))).toEqual({ API: "stopped", Shop: "stopped" });
  });

  it("keeps a need running while another program needs it, or the person ran it", async () => {
    const file = await listed(API, SHOP, ADMIN);
    await press("run", file, "Shop");
    expect(states(await press("run", file, "Admin"))).toEqual({
      API: "running for Shop, Admin",
      Shop: "running",
      Admin: "running",
    });
    expect(states(await press("stop", file, "Shop"))).toMatchObject({ API: "running for Admin" });
    expect(states(await press("stop", file, "Admin"))).toMatchObject({ API: "stopped" });

    // Run on the API itself makes it the person's: stopping Shop leaves it.
    await press("run", file, "API");
    expect(states(await press("run", file, "Shop"))).toMatchObject({ API: "running" });
    expect(states(await press("stop", file, "Shop"))).toMatchObject({ API: "running" });
    await press("stop", undefined);
  });

  it("runs every program with Run all, the needed first, and Stop all stops them and an older run file's", async () => {
    const one = { run: server(4190) };
    await agentSends({ ".chips/run.json": JSON.stringify(one) }, "One program");
    expect(await press("run", { programs: [one] })).toMatchObject({ run: { state: "running" } });

    const file = await listed(SHOP, ADMIN, API);
    const all = await press("run", file);
    // The one program of the run file before is stopped, so it holds no port with no Stop.
    expect(all).toMatchObject({ run: { state: "stopped" } });
    expect(states(all)).toEqual({ API: "running", Shop: "running", Admin: "running" });
    expect(states(await press("stop", file))).toEqual({
      API: "stopped",
      Shop: "stopped",
      Admin: "stopped",
    });
  });

  it("says which need didn't start, and runs nothing that needs it", async () => {
    const file = await listed({ ...API, run: "echo 'no uvicorn' >&2; exit 3" }, SHOP);
    const ran = await press("run", file, "Shop");
    expect(ran).toMatchObject({
      programs: {
        API: { state: "failed", code: 3 },
        Shop: {
          state: "failed",
          trouble: "API didn't start, so Chips didn't run Shop. API's row says why.",
        },
      },
    });
  });

  it("runs nothing the person wasn't shown, or in a folder the project doesn't have", async () => {
    const file = await listed(API, SHOP);
    expect(
      await runFolder("run", await asked({ program: "Shop", command: commandOf(SHOP) }), deps()),
    ).toMatchObject({ ok: false, why: expect.stringContaining("says to run something else") });
    expect(await press("run", file, "Docs")).toEqual({
      ok: false,
      why: "The run file in your folder has no program called Docs now.",
    });
    const away = await listed({ ...API, in: "server" });
    expect(await press("run", away, "API")).toEqual({
      ok: false,
      why: "server isn't a folder of your project yet, so Chips didn't run API.",
    });
  });
});

describe("Your folder's names and asks", () => {
  it("makes a folder's name from the room's, and another when it is taken", () => {
    expect(folderName("Sudoku mini")).toBe("Sudoku mini");
    expect(folderName("Q3/Q4: plans")).toBe("Q3-Q4- plans");
    expect(folderName("..hidden")).toBe("hidden");
    expect(folderName("  ")).toBe("Space project");
    mkdirSync(join(scratch, "Chips", "Projects", "Sudoku mini"), { recursive: true });
    expect(newFolder(scratch, "Sudoku mini")).toBe(
      join(scratch, "Chips", "Projects", "Sudoku mini 2"),
    );
  });

  it("finds Cursor before Visual Studio Code, in the person's own Applications too", () => {
    const has = (path: string) =>
      path === join(scratch, "Applications", "Cursor.app") ||
      path === "/Applications/Visual Studio Code.app";
    expect(editorOf(scratch, has)).toEqual({
      name: "Cursor",
      path: join(scratch, "Applications", "Cursor.app"),
    });
    expect(editorOf(scratch, () => false)).toBeUndefined();
  });

  it("takes only a room, a server, a person and a project token Chips made", () => {
    const env = {
      CHIPS_FOLDER_SPACE: "spc_01K4ZQPX000000000000000001",
      CHIPS_FOLDER_SERVER: "http://127.0.0.1:4431",
      CHIPS_FOLDER_TOKEN: "chips_pt_dev.1.abc",
      CHIPS_FOLDER_PERSON: "usr_01K4ZQPX000000000000000002",
      CHIPS_FOLDER_TITLE: "Sudoku mini",
    };
    expect(folderAsked(env)).toMatchObject({ spaceId: env.CHIPS_FOLDER_SPACE, name: "You" });
    expect(folderAsked({ ...env, CHIPS_FOLDER_SPACE: "../etc" })).toEqual({
      why: "That isn't a space Chips made.",
    });
    expect(folderAsked({ ...env, CHIPS_FOLDER_TOKEN: "Bearer x" })).toEqual({
      why: "That isn't a project token.",
    });
    expect(folderAsked({ ...env, CHIPS_FOLDER_SERVER: "file:///etc" })).toEqual({
      why: "That isn't a server's address.",
    });
  });
});
