/**
 * A room's project in the fake (ADR 0220), with real git: an agent of the harness in the room
 * clones it and pushes, and the push is in the log as `project.changed` once git's answer ends; a
 * copy that didn't fetch first and a rewrite are turned back; no token, no agent named, and an
 * agent in no such room are refused in words, as the server refuses them.
 */

import { execFile } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Project } from "@chipschat/harness";
import { HARNESS_CAPABILITIES, projectPath } from "@chipschat/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type FakeChips, startFakeChips } from "./fake-chips.js";

let chips: FakeChips;
let scratch: string;
let agent: string;

beforeEach(async () => {
  chips = await startFakeChips({
    harnessName: "Scout",
    capabilities: [HARNESS_CAPABILITIES.agents],
  });
  scratch = mkdtempSync(join(tmpdir(), "chips-fake-project-test-"));
  const { harnessId, spaceId, url, token } = chips.address;
  const made = await fetch(`${url}/v1/harnesses/${harnessId}/agents`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ key: "wren", name: "Wren" }),
  });
  agent = String(((await made.json()) as Record<string, unknown>)["agent_id"]);
  chips.asOwner({
    type: "membership.added",
    space_id: spaceId,
    participant_id: agent,
    participant_kind: "agent",
    role: "member",
  });
});

afterEach(async () => {
  await chips.close();
  rmSync(scratch, { recursive: true, force: true });
});

const remote = () => `${chips.address.url}${projectPath(chips.address.spaceId)}`;

function asWho(headers: readonly string[]): Record<string, string> {
  const pairs: [string, string][] = [
    ...headers.map((header): [string, string] => ["http.extraHeader", header]),
    ["user.name", "Wren"],
    ["user.email", "wren@chips.invalid"],
  ];
  const env: Record<string, string> = {
    PATH: "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin",
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

const wren = () => asWho([`Authorization: Bearer ${chips.address.token}`, `chips-actor: ${agent}`]);

function git(env: Record<string, string>, args: readonly string[]) {
  return new Promise<{ code: number; out: string }>((resolve) => {
    execFile("git", [...args], { cwd: scratch, env }, (error, stdout, stderr) => {
      const code = error === null ? 0 : typeof error.code === "number" ? error.code : 1;
      resolve({ code, out: `${stdout}${stderr}` });
    });
  });
}

async function ok(env: Record<string, string>, args: readonly string[]) {
  const ran = await git(env, args);
  expect(ran.code, ran.out).toBe(0);
}

async function commit(copy: string, file: string, words: string, message: string) {
  writeFileSync(join(copy, file), words);
  await ok(wren(), ["-C", copy, "add", "--all"]);
  await ok(wren(), ["-C", copy, "commit", "--quiet", "-m", message]);
}

const changes = () => chips.workspace.log.filter((event) => event.type === "project.changed");

describe("a room's project in the fake", () => {
  it("takes an agent's push and records it, as the server does", async () => {
    await ok(wren(), ["clone", "--quiet", remote(), "wren"]);
    const copy = join(scratch, "wren");
    await commit(copy, "store.js", "export const store = [];\n", "Start the store");
    await ok(wren(), ["-C", copy, "push", "--quiet", "origin", "main"]);

    const [changed, ...more] = changes();
    expect(more).toEqual([]);
    expect(changed?.space_id).toBe(chips.address.spaceId);
    expect(changed?.actor).toMatchObject({ kind: "agent", id: agent });
    expect(changed?.payload).toMatchObject({
      by: agent,
      before: null,
      commits: 1,
      message: "Start the store",
      files: [{ path: "store.js", added: 1, removed: 0 }],
    });
  });

  it("turns back a copy that didn't fetch first, and a rewrite", async () => {
    await ok(wren(), ["clone", "--quiet", remote(), "first"]);
    await commit(join(scratch, "first"), "a.txt", "one\n", "One");
    await ok(wren(), ["-C", join(scratch, "first"), "push", "--quiet", "origin", "main"]);
    await ok(wren(), ["clone", "--quiet", remote(), "second"]);
    await commit(join(scratch, "first"), "a.txt", "one\ntwo\n", "Two");
    await ok(wren(), ["-C", join(scratch, "first"), "push", "--quiet", "origin", "main"]);
    await commit(join(scratch, "second"), "b.txt", "three\n", "Three");

    const behind = await git(wren(), ["-C", join(scratch, "second"), "push", "origin", "main"]);
    expect(behind.code).not.toBe(0);
    const rewrite = await git(wren(), [
      "-C",
      join(scratch, "second"),
      "push",
      "--force",
      "origin",
      "main",
    ]);
    expect(rewrite.code).not.toBe(0);
    expect(rewrite.out).toContain("non-fast-forward");
    expect(changes()).toHaveLength(2);
  });

  it("refuses in words: no token, no agent named, an agent in no such room", async () => {
    const answer = await fetch(`${remote()}/info/refs?service=git-upload-pack`);
    expect(answer.status).toBe(401);

    const unnamed = await git(asWho([`Authorization: Bearer ${chips.address.token}`]), [
      "ls-remote",
      remote(),
    ]);
    expect(unnamed.code).not.toBe(0);
    expect(unnamed.out).toContain("Name the agent this is for in the chips-actor header");

    const room = await chips.openRoom("Elsewhere");
    const elsewhere = `${chips.address.url}${projectPath(room)}`;
    const notIn = await git(wren(), ["ls-remote", elsewhere]);
    expect(notIn.code).not.toBe(0);
    expect(notIn.out).toContain("Wren is in no space with that id.");
  });

  it("is what the SDK's project pulls and pushes, as a bridge does", async () => {
    const { url, token, spaceId } = chips.address;
    const copy = new Project({
      url,
      token,
      spaceId,
      agentId: agent,
      name: "Wren",
      folder: join(scratch, "sdk"),
    });
    expect((await copy.pull()).files).toBe(0);
    writeFileSync(join(copy.copy, "notes.md"), "One sentence.\n");
    const sent = await copy.push({ words: "Notes to start." });
    expect(sent).toMatchObject({ state: "sent", files: ["notes.md"] });
    expect(changes()[0]?.payload).toMatchObject({ message: "Notes to start." });
    expect((await copy.pull()).markdown).toBe(true);
  });
});
