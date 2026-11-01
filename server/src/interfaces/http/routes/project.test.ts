/**
 * A room's project over git (ADR 0220), with real git against a listening server: an agent clones
 * the room's project, pushes, and the push is recorded as `project.changed`; another copy that
 * didn't fetch first is turned back, and so is a rewrite, a delete, another branch, a secrets file,
 * a key, a file over the workspace's cap and a push past the project's size. Who may: a harness for
 * its agent in the room, a person with a project token for this room, and nobody else. Pushes to
 * one room are taken one at a time, and an erase takes the project with it.
 *
 * git runs in a child process, never in this one: the server answering it is in this process too.
 */

import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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

async function setUp(limits: Partial<TestWorkspace["config"]["limits"]> = {}): Promise<void> {
  ws = await createTestWorkspace({
    config: { limits: limits as TestWorkspace["config"]["limits"] },
  });
  await ws.gateway.deps.upgradeAgents.apply(ws.workspaceId);
  const found = await ws.gateway.deps.readModels.agentByKey(
    ws.workspaceId,
    ws.scout.participantId,
    ws.scout.participantId,
  );
  if (found === undefined) throw new Error("Scout has no agent");
  agent = found.agent_id;
  ({ port } = await ws.gateway.listen());
  scratch = mkdtempSync(join(tmpdir(), "chips-project-test-"));
}

afterEach(async () => {
  await ws.close();
  rmSync(scratch, { recursive: true, force: true });
});

const remote = (spaceId = ws.spaceId) => `http://127.0.0.1:${port}${projectPath(spaceId)}`;

/** Headers git sends with every request, through its environment, as a bridge hands them. */
function asWho(headers: readonly string[]): Record<string, string> {
  const pairs: [string, string][] = [
    ...headers.map((header): [string, string] => ["http.extraHeader", header]),
    ["user.name", "Scout"],
    ["user.email", "scout@chips.invalid"],
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

const scoutFor = (agentId = agent) => [
  `Authorization: Bearer ${ws.scout.token}`,
  `chips-actor: ${agentId}`,
];

interface Ran {
  readonly code: number;
  readonly out: string;
}

function git(env: Record<string, string>, args: readonly string[], cwd = scratch): Promise<Ran> {
  return new Promise((resolve) => {
    execFile("git", [...args], { cwd, env }, (error, stdout, stderr) => {
      const code = error === null ? 0 : typeof error.code === "number" ? error.code : 1;
      resolve({ code, out: `${stdout}${stderr}` });
    });
  });
}

async function ok(env: Record<string, string>, args: readonly string[], cwd?: string) {
  const ran = await git(env, args, cwd);
  expect(ran.code, ran.out).toBe(0);
  return ran.out;
}

/** A clone of the room's project into `name`, as the headers say who. */
async function cloneAs(
  env: Record<string, string>,
  name: string,
  spaceId?: string,
): Promise<string> {
  await ok(env, ["clone", "--quiet", remote(spaceId), name]);
  return join(scratch, name);
}

/** A file written and committed in a copy. */
async function commit(
  env: Record<string, string>,
  copy: string,
  files: Readonly<Record<string, string | Buffer>>,
  message: string,
): Promise<void> {
  for (const [path, words] of Object.entries(files)) {
    const at = join(copy, path);
    mkdirSync(dirname(at), { recursive: true });
    writeFileSync(at, words);
  }
  await ok(env, ["-C", copy, "add", "--all"]);
  await ok(env, ["-C", copy, "commit", "--quiet", "-m", message]);
}

async function changes() {
  const page = await ws.gateway.deps.store.since(ws.workspaceId, 0, 5000);
  return page.events.filter((event) => event.type === "project.changed");
}

/** Pieces of a key, so that no scanner reads this file as holding one. */
const anthropicKey = () => ["sk-", "ant-", "api03-", "Q".repeat(40)].join("");

describe("an agent's push", () => {
  beforeEach(() => setUp());

  it("lands on main and is recorded as the agent's", async () => {
    const scout = asWho(scoutFor());
    const copy = await cloneAs(scout, "scout");
    await commit(
      scout,
      copy,
      { "src/store.js": "export const store = [];\n", "README.md": "# Todo\n" },
      "Start the store\n\nWith a README.",
    );
    await ok(scout, ["-C", copy, "push", "--quiet", "origin", "main"]);

    const [changed, ...more] = await changes();
    expect(more).toEqual([]);
    expect(changed?.space_id).toBe(ws.spaceId);
    expect(changed?.actor).toMatchObject({
      kind: "agent",
      id: agent,
      harness_id: ws.scout.participantId,
    });
    expect(changed?.payload).toMatchObject({
      by: agent,
      before: null,
      commits: 1,
      message: "Start the store",
      files: [
        { path: "README.md", added: 1, removed: 0 },
        { path: "src/store.js", added: 1, removed: 0 },
      ],
    });
    const head = (await ok(scout, ["-C", copy, "rev-parse", "HEAD"])).trim();
    expect(changed?.payload["after"]).toBe(head);
  });

  it("is turned back when the copy didn't fetch the push before it, and so is a rewrite", async () => {
    const scout = asWho(scoutFor());
    const first = await cloneAs(scout, "first");
    await commit(scout, first, { "a.txt": "one\n" }, "One");
    await ok(scout, ["-C", first, "push", "--quiet", "origin", "main"]);
    const second = await cloneAs(scout, "second");

    await commit(scout, first, { "a.txt": "one\ntwo\n" }, "Two");
    await ok(scout, ["-C", first, "push", "--quiet", "origin", "main"]);
    await commit(scout, second, { "b.txt": "three\n" }, "Three");
    const behind = await git(scout, ["-C", second, "push", "origin", "main"]);
    expect(behind.code).not.toBe(0);
    expect(behind.out).toMatch(/rejected|fetch first/);

    const rewrite = await git(scout, ["-C", second, "push", "--force", "origin", "main"]);
    expect(rewrite.code).not.toBe(0);
    expect(rewrite.out).toContain("non-fast-forward");
    expect(await changes()).toHaveLength(2);
  });

  it("may not delete main or push another branch", async () => {
    const scout = asWho(scoutFor());
    const copy = await cloneAs(scout, "scout");
    await commit(scout, copy, { "a.txt": "one\n" }, "One");
    await ok(scout, ["-C", copy, "push", "--quiet", "origin", "main"]);

    const gone = await git(scout, ["-C", copy, "push", "origin", ":main"]);
    expect(gone.code).not.toBe(0);
    expect(gone.out).toMatch(/deletion prohibited|denied/);

    const branch = await git(scout, ["-C", copy, "push", "origin", "HEAD:refs/heads/idea"]);
    expect(branch.code).not.toBe(0);
    expect(branch.out).toContain(
      "refs/heads/idea isn't main: a space's project has one branch, main.",
    );
    expect(await changes()).toHaveLength(1);
  });

  it("is refused whole for a secrets file or a key, even one taken out again before the push", async () => {
    const scout = asWho(scoutFor());
    const copy = await cloneAs(scout, "scout");
    await commit(scout, copy, { ".env": "PORT=1\n", ".env.example": "PORT=\n" }, "Settings");
    const named = await git(scout, ["-C", copy, "push", "origin", "main"]);
    expect(named.code).not.toBe(0);
    expect(named.out).toContain(".env holds secrets, by its name: keep it outside the project.");
    expect(named.out).not.toContain(".env.example holds");

    const clean = await cloneAs(scout, "clean");
    await commit(
      scout,
      clean,
      { "src/config.js": `export const key = "${anthropicKey()}";\n` },
      "Key",
    );
    await commit(
      scout,
      clean,
      { "src/config.js": "export const key = process.env.KEY;\n" },
      "No key",
    );
    const keyed = await git(scout, ["-C", clean, "push", "origin", "main"]);
    expect(keyed.code).not.toBe(0);
    expect(keyed.out).toContain(
      "src/config.js holds what looks like an Anthropic key: take it out, and keep keys outside the project.",
    );
    expect(await changes()).toEqual([]);
  });
});

describe("a push's size", () => {
  it("is held to the workspace's cap for one file", async () => {
    await setUp({ maxAttachmentBytes: 2048 });
    const scout = asWho(scoutFor());
    const copy = await cloneAs(scout, "scout");
    await commit(scout, copy, { "art/big.bin": Buffer.alloc(4096, 7) }, "Big");
    const ran = await git(scout, ["-C", copy, "push", "origin", "main"]);
    expect(ran.code).not.toBe(0);
    expect(ran.out).toContain(
      "art/big.bin is 4 KB, and files in a space's project are capped at 2 KB.",
    );
  });

  it("is held to what the project has left", async () => {
    await setUp({ maxProjectBytes: 8192 });
    const scout = asWho(scoutFor());
    const copy = await cloneAs(scout, "scout");
    const noise = randomBytes(64 * 1024);
    await commit(scout, copy, { "noise.bin": noise }, "Noise");
    const ran = await git(scout, ["-C", copy, "push", "origin", "main"]);
    expect(ran.code).not.toBe(0);
    expect(ran.out).toMatch(/maximum allowed size/);
    expect(await changes()).toEqual([]);
  });
});

describe("who may", () => {
  beforeEach(() => setUp());

  it("asks for a token when there is none", async () => {
    const answer = await fetch(`${remote()}/info/refs?service=git-upload-pack`);
    expect(answer.status).toBe(401);
    expect(answer.headers.get("www-authenticate")).toContain("Basic");
  });

  it("is a harness for its agent in the room, named", async () => {
    const unnamed = await git(asWho([`Authorization: Bearer ${ws.scout.token}`]), [
      "ls-remote",
      remote(),
    ]);
    expect(unnamed.code).not.toBe(0);
    expect(unnamed.out).toContain("Name the agent this is for in the chips-actor header");

    const elsewhere = ws.ids.next("space");
    await ws.gateway.deps.submitEvent({
      event: {
        type: "space.created",
        space_id: elsewhere,
        kind: "group",
        title: "Elsewhere",
        idempotency_key: "elsewhere",
      },
      principal: arjun(),
    });
    const notIn = await git(asWho(scoutFor()), ["ls-remote", remote(elsewhere)]);
    expect(notIn.code).not.toBe(0);
    expect(notIn.out).toContain("is in no space with that id.");

    const notMine = await git(asWho(scoutFor(ws.arjun.participantId)), ["ls-remote", remote()]);
    expect(notMine.code).not.toBe(0);
    expect(notMine.out).toContain("A harness works on a project only as one of its own agents.");
  });

  it("is a person in the room with a project token for it, and not for another room", async () => {
    const asked = await signedPost(`/v1/spaces/${ws.spaceId}/project/token`);
    expect(asked.status).toBe(201);
    const { token, path } = (await asked.json()) as { token: string; path: string };
    expect(path).toBe(projectPath(ws.spaceId));

    const arjunsGit = asWho([`Authorization: Bearer ${token}`]);
    const copy = await cloneAs(arjunsGit, "arjun");
    await commit(arjunsGit, copy, { "notes.md": "Ideas\n" }, "Notes");
    await ok(arjunsGit, ["-C", copy, "push", "--quiet", "origin", "main"]);
    const [changed] = await changes();
    expect(changed?.actor).toMatchObject({ kind: "person", id: ws.arjun.participantId });

    // Git's own credential helper sends it as a password.
    const basic = `Basic ${Buffer.from(`arjun:${token}`).toString("base64")}`;
    const refs = await fetch(`${remote()}/info/refs?service=git-upload-pack`, {
      headers: { authorization: basic },
    });
    expect(refs.status).toBe(200);

    const elsewhere = ws.ids.next("space");
    await ws.gateway.deps.submitEvent({
      event: {
        type: "space.created",
        space_id: elsewhere,
        kind: "group",
        title: "Elsewhere",
        idempotency_key: "elsewhere",
      },
      principal: arjun(),
    });
    const wrongRoom = await fetch(`${remote(elsewhere)}/info/refs?service=git-upload-pack`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(wrongRoom.status).toBe(401);
  });

  it("is a guest's to read and never to change, by either standing; a member pushes (SEC-40)", async () => {
    const danas = asWho([`Authorization: Bearer ${await projectTokenOf(ws.dana)}`]);
    const copy = await cloneAs(danas, "dana");
    await commit(danas, copy, { "notes.md": "Ideas\n" }, "Notes");
    await ok(danas, ["-C", copy, "push", "--quiet", "origin", "main"]);

    const guests = [
      ["vendor", await inTheRoom(await ws.addPerson("Vendor", "guest"), "guest")],
      // A member of the workspace who is a guest in this room.
      ["gus", await inTheRoom(await ws.addPerson("Gus", "member"), "guest")],
    ] as const;
    for (const [name, guest] of guests) {
      const theirs = asWho([`Authorization: Bearer ${await projectTokenOf(guest)}`]);
      const read = await cloneAs(theirs, name);
      expect(existsSync(join(read, "notes.md"))).toBe(true);
      await commit(theirs, read, { "app.py": "print('hi')\n" }, "Mine");
      const pushed = await git(theirs, ["-C", read, "push", "origin", "main"]);
      expect(pushed.code, name).not.toBe(0);
      expect(pushed.out, name).toContain(
        "A guest can read the project but can't change it. Ask an agent in the space.",
      );
      // Their push is turned away at git's first ask, before a pack is sent.
      const asked = await fetch(`${remote()}/git-receive-pack`, {
        method: "POST",
        headers: { authorization: `Bearer ${await projectTokenOf(guest)}` },
        body: "0000",
      });
      expect(asked.status, name).toBe(403);
    }
    expect(await changes()).toHaveLength(1);
  });

  it("gives no project token to a harness", async () => {
    const answer = await fetch(`http://127.0.0.1:${port}/v1/spaces/${ws.spaceId}/project/token`, {
      method: "POST",
      headers: ws.scout.headers,
    });
    expect(answer.status).toBe(403);
  });
});

describe("pushes into one room", () => {
  beforeEach(() => setUp());

  it("are taken one at a time: of two from the same place, one lands and one is turned back", async () => {
    const scout = asWho(scoutFor());
    const base = await cloneAs(scout, "base");
    await commit(scout, base, { "a.txt": "one\n" }, "One");
    await ok(scout, ["-C", base, "push", "--quiet", "origin", "main"]);
    const left = await cloneAs(scout, "left");
    const right = await cloneAs(scout, "right");
    await commit(scout, left, { "left.txt": "left\n" }, "Left");
    await commit(scout, right, { "right.txt": "right\n" }, "Right");

    const [l, r] = await Promise.all([
      git(scout, ["-C", left, "push", "origin", "main"]),
      git(scout, ["-C", right, "push", "origin", "main"]),
    ]);
    expect([l.code === 0, r.code === 0].filter(Boolean)).toHaveLength(1);
    const recorded = await changes();
    expect(recorded).toHaveLength(2);
    expect(recorded[1]?.payload["before"]).toBe(recorded[0]?.payload["after"]);
  });
});

describe("erasing the room", () => {
  beforeEach(() => setUp());

  it("takes its project with it", async () => {
    const scout = asWho(scoutFor());
    const copy = await cloneAs(scout, "scout");
    await commit(scout, copy, { "a.txt": "one\n" }, "One");
    await ok(scout, ["-C", copy, "push", "--quiet", "origin", "main"]);
    const kept = join(ws.config.data.dir, "projects", `${ws.spaceId}.git`);
    expect(existsSync(kept)).toBe(true);

    const room = ws.ids.next("space");
    await ws.gateway.deps.submitEvent({
      event: {
        type: "space.created",
        space_id: room,
        kind: "group",
        title: "Gone soon",
        idempotency_key: "gone",
      },
      principal: arjun(),
    });
    const arjunsToken = await signedPost(`/v1/spaces/${room}/project/token`);
    const { token } = (await arjunsToken.json()) as { token: string };
    const theirs = asWho([`Authorization: Bearer ${token}`]);
    const other = await cloneAs(theirs, "other", room);
    await commit(theirs, other, { "b.txt": "two\n" }, "Two");
    await ok(theirs, ["-C", other, "push", "--quiet", "origin", "main"]);

    const erased = await ws.gateway.deps.eraseSpace({ principal: arjun(), spaceId: room });
    expect(erased.ok).toBe(true);
    expect(existsSync(join(ws.config.data.dir, "projects", `${room}.git`))).toBe(false);
    expect(existsSync(kept)).toBe(true);
  });
});

function arjun(): Principal {
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

/** A request a person's device signs, Arjun's unless another is named, over the listening port. */
function signedPost(target: string, who: TestPerson = ws.arjun): Promise<Response> {
  return fetch(`http://127.0.0.1:${port}${target}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...who.sign("POST", target, "") },
  });
}

/** Somebody put in the room by Arjun, with the role the room gives them there. */
async function inTheRoom(who: TestPerson, role: "member" | "guest"): Promise<TestPerson> {
  const added = await ws.gateway.deps.submitEvent({
    event: {
      type: "membership.added",
      space_id: ws.spaceId,
      participant_id: who.participantId,
      participant_kind: "person",
      role,
      idempotency_key: `add-${who.participantId}`,
    },
    principal: arjun(),
  });
  if (!added.ok) throw new Error(`refused: ${added.error.message}`);
  return who;
}

/** A person's project token for the room, from their own device. */
async function projectTokenOf(who: TestPerson): Promise<string> {
  const asked = await signedPost(`/v1/spaces/${ws.spaceId}/project/token`, who);
  expect(asked.status).toBe(201);
  return ((await asked.json()) as { token: string }).token;
}
