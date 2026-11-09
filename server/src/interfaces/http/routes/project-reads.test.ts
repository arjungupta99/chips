/**
 * What a person reads of a room's project, and their Undo (ADR 0222), with real git against a
 * listening server: an agent pushes; a person reads the files, one file, its history and the change
 * with its diff; Undo takes one change back as a new commit of theirs, recorded as undoing it, and
 * Put it back is the Undo of the Undo; an Undo that later changes build on is refused in words, and
 * a guest's is refused. A reply keeps its `change` only when it is its own agent's commit.
 */

import { execFile } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { processEnvironment } from "@chipschat/platform";
import { projectPath } from "@chipschat/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Principal } from "../../../application/index.js";
import {
  createTestWorkspace,
  type TestPerson,
  type TestWorkspace,
} from "../../../testing/workspace.js";

let ws: TestWorkspace;
let port: number;
let agent: string;
let scratch: string;
let copy: string;

beforeEach(async () => {
  ws = await createTestWorkspace();
  await ws.gateway.deps.upgradeAgents.apply(ws.workspaceId);
  const found = await ws.gateway.deps.readModels.agentByKey(
    ws.workspaceId,
    ws.scout.participantId,
    ws.scout.participantId,
  );
  if (found === undefined) throw new Error("Scout has no agent");
  agent = found.agent_id;
  ({ port } = await ws.gateway.listen());
  scratch = mkdtempSync(join(tmpdir(), "chips-project-reads-"));
  copy = join(scratch, "scout");
  await ok(
    ["clone", "--quiet", `http://127.0.0.1:${port}${projectPath(ws.spaceId)}`, copy],
    scratch,
  );
});

afterEach(async () => {
  await ws.close();
  rmSync(scratch, { recursive: true, force: true });
});

/** Scout's agent's git, as a bridge runs it: its token and the agent through the environment. */
function scoutGit(): Record<string, string> {
  const pairs: [string, string][] = [
    ["http.extraHeader", `Authorization: Bearer ${ws.scout.token}`],
    ["http.extraHeader", `chips-actor: ${agent}`],
    ["user.name", "Scout"],
    ["user.email", `${agent}@agents.chips.invalid`],
    ["init.defaultBranch", "main"],
  ];
  const env: Record<string, string> = {
    PATH: processEnvironment()["PATH"] ?? "/usr/bin:/bin",
    HOME: scratch,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_TERMINAL_PROMPT: "0",
    GIT_CONFIG_COUNT: String(pairs.length),
  };
  pairs.forEach(([key, value], at) => {
    env[`GIT_CONFIG_KEY_${at}`] = key;
    env[`GIT_CONFIG_VALUE_${at}`] = value;
  });
  return env;
}

function ok(args: readonly string[], cwd = copy): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("git", [...args], { cwd, env: scoutGit() }, (error, stdout, stderr) =>
      error === null ? resolve(stdout) : reject(new Error(`${args.join(" ")}: ${stderr}`)),
    );
  });
}

/** Files written, committed as Scout's agent and pushed: the commit `main` is at now. */
async function push(files: Readonly<Record<string, string>>, message: string): Promise<string> {
  for (const [path, words] of Object.entries(files)) {
    mkdirSync(dirname(join(copy, path)), { recursive: true });
    writeFileSync(join(copy, path), words);
  }
  await ok(["add", "--all"]);
  await ok(["commit", "--quiet", "-m", message]);
  await ok(["push", "--quiet", "origin", "main"]);
  return (await ok(["rev-parse", "HEAD"])).trim();
}

/** A request a person's device signs. */
async function signed(
  who: TestPerson,
  method: string,
  target: string,
  body = "",
): Promise<Response> {
  return fetch(`http://127.0.0.1:${port}${target}`, {
    method,
    headers: { "content-type": "application/json", ...who.sign(method, target, body) },
    ...(body === "" ? {} : { body }),
  });
}

const room = () => `/v1/spaces/${ws.spaceId}/project`;

async function changes() {
  const page = await ws.gateway.deps.store.since(ws.workspaceId, 0, 5000);
  return page.events.filter((event) => event.type === "project.changed");
}

describe("a person reading the room's project", () => {
  it("reads its files, one file, a file's history and a change with its diff", async () => {
    const first = await push(
      { "index.html": "<h1>One</h1>\n", "src/game.js": "export const a = 1;\n" },
      "The page",
    );
    const second = await push({ "src/game.js": "export const a = 2;\n" }, "Two, not one");
    const [, recorded] = await changes();
    expect(recorded?.payload).toMatchObject({ file_count: 2 });

    const files = (await (await signed(ws.arjun, "GET", `${room()}/files`)).json()) as Record<
      string,
      unknown
    >;
    expect(files).toEqual({
      at: second,
      files: [
        { path: "index.html", bytes: 13, type: "text/html" },
        { path: "src/game.js", bytes: 20, type: "text/javascript" },
      ],
    });
    const older = (await (await signed(ws.arjun, "GET", `${room()}/files?at=${first}`)).json()) as {
      at: string;
    };
    expect(older.at).toBe(first);

    const file = await signed(ws.arjun, "GET", `${room()}/file?path=src%2Fgame.js`);
    expect(file.status).toBe(200);
    expect(file.headers.get("content-type")).toBe("text/javascript");
    expect(await file.text()).toBe("export const a = 2;\n");
    const then = await signed(ws.arjun, "GET", `${room()}/file?path=src%2Fgame.js&at=${first}`);
    expect(await then.text()).toBe("export const a = 1;\n");
    expect((await signed(ws.arjun, "GET", `${room()}/file?path=..%2Fsecret`)).status).toBe(404);

    const history = (await (
      await signed(ws.arjun, "GET", `${room()}/history?path=src%2Fgame.js`)
    ).json()) as {
      versions: { commit: string; by: unknown; message: string }[];
    };
    expect(history.versions.map((version) => [version.commit, version.message])).toEqual([
      [second, "Two, not one"],
      [first, "The page"],
    ]);
    expect(history.versions[0]?.by).toEqual({ name: "Scout", id: agent });

    const change = (await (
      await signed(ws.arjun, "GET", `${room()}/changes/${second}`)
    ).json()) as {
      parent: string;
      files: { path: string; added: number; removed: number; patch: string }[];
    };
    expect(change.parent).toBe(first);
    expect(change.files).toMatchObject([{ path: "src/game.js", added: 1, removed: 1, cut: false }]);
    expect(change.files[0]?.patch).toContain("-export const a = 1;\n+export const a = 2;");
  });

  it("names a file it hands over the way an attachment is named", async () => {
    await push({ "日本語.txt": "words\n", "plain.txt": "plain\n" }, "Two files");

    const named = await signed(
      ws.arjun,
      "GET",
      `${room()}/file?path=${encodeURIComponent("日本語.txt")}`,
    );
    expect(named.status).toBe(200);
    expect(named.headers.get("content-disposition")).toBe(
      `attachment; filename="___.txt"; filename*=UTF-8''%E6%97%A5%E6%9C%AC%E8%AA%9E.txt`,
    );
    expect(await named.text()).toBe("words\n");

    const plain = await signed(ws.arjun, "GET", `${room()}/file?path=plain.txt`);
    expect(plain.headers.get("content-disposition")).toBe('attachment; filename="plain.txt"');
  });

  it("hands the files over as one zip, at main or at a change, and none before anything is pushed", async () => {
    const none = await signed(ws.arjun, "GET", `${room()}/archive`);
    expect(none.status).toBe(404);
    const first = await push(
      { "index.html": "<h1>One</h1>\n", "src/game.js": "export const a = 1;\n" },
      "The page",
    );
    await push({ "src/board.js": "export const b = 2;\n" }, "A board");

    const zip = await signed(ws.arjun, "GET", `${room()}/archive`);
    expect(zip.status).toBe(200);
    expect(zip.headers.get("content-type")).toBe("application/zip");
    const bytes = Buffer.from(await zip.arrayBuffer());
    expect(bytes.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    const names = bytes.toString("latin1");
    for (const name of ["index.html", "src/game.js", "src/board.js"]) expect(names).toContain(name);

    const then = Buffer.from(
      await (await signed(ws.arjun, "GET", `${room()}/archive?at=${first}`)).arrayBuffer(),
    ).toString("latin1");
    expect(then).toContain("src/game.js");
    expect(then).not.toContain("src/board.js");
    expect((await signed(ws.arjun, "GET", `${room()}/archive?at=nope`)).status).toBe(404);
  });

  it("is a person's in the room, and never a harness's, which reads it with git", async () => {
    await push({ "a.txt": "a\n" }, "A");
    const scout = await fetch(`http://127.0.0.1:${port}${room()}/files`, {
      headers: ws.scout.headers,
    });
    expect(scout.status).toBe(403);
    const elsewhere = await signed(
      ws.arjun,
      "GET",
      `/v1/spaces/spc_01K4ZQPX000000000000000001/project/files`,
    );
    expect(elsewhere.status).toBe(404);
  });
});

describe("Undo", () => {
  it("takes one change back as the person's own commit, every later change kept, and Put it back undoes the Undo", async () => {
    await push({ "a.txt": "one\n", "b.txt": "bee\n" }, "Start");
    const wrong = await push({ "a.txt": "one\ntwo\n" }, "Add two");
    await push({ "b.txt": "bee\nsee\n" }, "Add see");

    const undone = await signed(
      ws.arjun,
      "POST",
      `${room()}/undo`,
      JSON.stringify({ commit: wrong }),
    );
    expect(undone.status).toBe(201);
    const { after } = (await undone.json()) as { after: string };
    await ok(["pull", "--quiet", "origin", "main"]);
    expect((await ok(["show", "main:a.txt"])).trim()).toBe("one");
    expect((await ok(["show", "main:b.txt"])).trim()).toBe("bee\nsee");
    expect((await ok(["log", "-1", "--format=%an <%ae> %s", after])).trim()).toBe(
      `Arjun <${ws.arjun.participantId}@people.chips.invalid> Undid "Add two"`,
    );
    const recorded = (await changes()).at(-1);
    expect(recorded?.actor).toMatchObject({ kind: "person", id: ws.arjun.participantId });
    expect(recorded?.payload).toMatchObject({
      by: ws.arjun.participantId,
      after,
      undoes: wrong,
      files: [{ path: "a.txt", added: 0, removed: 1 }],
      file_count: 2,
    });

    const back = await signed(
      ws.arjun,
      "POST",
      `${room()}/undo`,
      JSON.stringify({ commit: after }),
    );
    expect(back.status).toBe(201);
    await ok(["pull", "--quiet", "origin", "main"]);
    expect((await ok(["show", "main:a.txt"])).trim()).toBe("one\ntwo");
    expect((await ok(["log", "-1", "--format=%s"])).trim()).toBe('Put back "Add two"');
    expect((await changes()).at(-1)?.payload).toMatchObject({ undoes: after });
  });

  it("is refused in words when a later change built on the same lines, and for a guest", async () => {
    await push({ "a.txt": "one\n" }, "Start");
    const wrong = await push({ "a.txt": "one\ntwo\n" }, "Add two");
    await push({ "a.txt": "one\ntwo\nthree\n" }, "Add three");
    const refused = await signed(
      ws.arjun,
      "POST",
      `${room()}/undo`,
      JSON.stringify({ commit: wrong }),
    );
    expect(refused.status).toBe(409);
    expect(((await refused.json()) as { error: { message: string } }).error.message).toBe(
      "a.txt changed again after this, on the same lines, so it can't be undone by itself. Ask the agents to take it out.",
    );
    expect(await changes()).toHaveLength(3);

    const guest = await ws.addPerson("Vendor", "guest");
    const theirs = await signed(guest, "POST", `${room()}/undo`, JSON.stringify({ commit: wrong }));
    expect(theirs.status).toBe(403);

    // A member of the workspace who is a guest in this room is refused in the same words (SEC-40).
    const gus = await ws.addPerson("Gus", "member");
    const added = await ws.gateway.deps.submitEvent({
      event: {
        type: "membership.added",
        space_id: ws.spaceId,
        participant_id: gus.participantId,
        participant_kind: "person",
        role: "guest",
        idempotency_key: `add-${gus.participantId}`,
      },
      principal: arjunOwner(),
    });
    expect(added.ok).toBe(true);
    const his = await signed(gus, "POST", `${room()}/undo`, JSON.stringify({ commit: wrong }));
    expect(his.status).toBe(403);
    expect(((await his.json()) as { error: { message: string } }).error.message).toBe(
      "A guest can't undo a change. Ask the space's owner.",
    );
  });
});

describe("a reply's change", () => {
  const scout = (): Principal => ({
    kind: "harness",
    participantId: ws.scout.participantId,
    workspaceId: ws.workspaceId,
    displayName: "Scout",
    via: "harness_token",
  });
  async function post(change: string): Promise<Record<string, unknown>> {
    const result = await ws.gateway.deps.submitEvent({
      event: {
        type: "message.post",
        idempotency_key: `k-${ws.ids.next("event")}`,
        space_id: ws.spaceId,
        actor: { kind: "agent", id: agent },
        text: "Done.",
        change,
      },
      principal: scout(),
    });
    if (!result.ok) throw new Error(result.error.message);
    return result.value.event.payload as Record<string, unknown>;
  }

  it("is kept when it is the agent's own commit on main, and left off otherwise", async () => {
    const mine = await push({ "a.txt": "a\n" }, "A");
    expect((await post(mine))["change"]).toBe(mine);
    expect(await post("b".repeat(40))).not.toHaveProperty("change");

    // Arjun's Undo is on main, but it is no commit of the agent's.
    const undone = await signed(
      ws.arjun,
      "POST",
      `${room()}/undo`,
      JSON.stringify({ commit: mine }),
    );
    const { after } = (await undone.json()) as { after: string };
    expect(await post(after)).not.toHaveProperty("change");
  });
});

describe("a page of the project (ADR 0223)", () => {
  const FILES = {
    "index.html":
      '<!doctype html><html><head><link rel="stylesheet" href="style.css"></head><body><div id="board"></div><script type="module" src="src/game.js"></script></body></html>',
    "style.css": "#board { color: green; }",
    "src/game.js":
      'import { size } from "./board.js";\ndocument.getElementById("board").textContent = String(size);',
    "src/board.js": "export const size = 9;",
  };

  it("is built into one document for the phone, at main or at a change", async () => {
    const first = await push(FILES, "The game");
    await push({ "src/board.js": "export const size = 16;" }, "Bigger");
    const page = await signed(ws.arjun, "GET", `${room()}/page?path=index.html`);
    expect(page.status).toBe(200);
    expect(page.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(page.headers.get("content-security-policy")).toBe("sandbox");
    const words = await page.text();
    expect(words).toContain("<style>#board { color: green; }</style>");
    expect(words).toContain("var size = 16;");
    expect(words).not.toContain('src="src/game.js"');
    const then = await (
      await signed(ws.arjun, "GET", `${room()}/page?path=index.html&at=${first}`)
    ).text();
    expect(then).toContain("var size = 9;");
  });

  it("opens from the page door by a ticket, under the page's own policy, once", async () => {
    await push(FILES, "The game");
    const asked = await signed(
      ws.arjun,
      "POST",
      `${room()}/page`,
      JSON.stringify({ path: "index.html" }),
    );
    expect(asked.status).toBe(201);
    const { url } = (await asked.json()) as { url: string };
    const page = await fetch(`http://127.0.0.1:${port}${url}`);
    expect(page.status).toBe(200);
    expect(page.headers.get("content-security-policy")).toContain("sandbox allow-scripts");
    expect(await page.text()).toContain("var size = 9;");
    expect((await fetch(`http://127.0.0.1:${port}${url}`)).status).toBe(401);
  });

  it("is refused in words: no such page, a file that isn't HTML, and a harness", async () => {
    await push(FILES, "The game");
    const missing = await signed(ws.arjun, "GET", `${room()}/page?path=nope.html`);
    expect(missing.status).toBe(404);
    const css = await signed(ws.arjun, "GET", `${room()}/page?path=style.css`);
    expect(css.status).toBe(422);
    expect(((await css.json()) as { error: { message: string } }).error.message).toBe(
      "Only an HTML file opens as a page here.",
    );
    const scout = await fetch(`http://127.0.0.1:${port}${room()}/page?path=index.html`, {
      headers: ws.scout.headers,
    });
    expect(scout.status).toBe(403);
    // Nor a ticket for it, which would hold the built page (SEC-53).
    const ticket = await fetch(`http://127.0.0.1:${port}${room()}/page`, {
      method: "POST",
      headers: { ...ws.scout.headers, "content-type": "application/json", "chips-actor": agent },
      body: JSON.stringify({ path: "index.html" }),
    });
    expect(ticket.status).toBe(403);
  });
});

/** Arjun as the workspace's owner, for what he does past the door. */
function arjunOwner(): Principal {
  return {
    kind: "person",
    participantId: ws.arjun.participantId,
    workspaceId: ws.workspaceId,
    displayName: "Arjun",
    via: "device_key",
    deviceId: ws.arjun.deviceId,
    role: "owner",
  };
}
