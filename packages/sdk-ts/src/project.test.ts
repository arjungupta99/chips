/**
 * A room's project for an agent (ADR 0221), with real git against a real chipsd: two agents of one
 * harness, Wren and Hale, each with a copy of their own. A first turn makes the copy and sends what
 * it wrote; the next turn hears what the other changed, and by whom; of two changes made at once,
 * the second is replayed on top of the first, and one that overlaps is marked in the copy, labelled,
 * held back until settled, and then sent. The leave-out list and a key are never committed; a turn
 * that stopped keeps its work for the next; an agent moved to another room keeps its old copy.
 */

import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { HARNESS_CAPABILITIES, type MessageNew, renderProjectNote } from "@chipschat/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkGit, heldNote, Project, pushedInWords, subjectOf } from "./project.js";
import { promptFor } from "./prompt.js";
import { startTestServer, type TestServer } from "./testing/gateway.js";

let server: TestServer;
let scratch: string;
let wrenId: string;
let haleId: string;

beforeEach(async () => {
  server = await startTestServer({ capabilities: [HARNESS_CAPABILITIES.agents] });
  await server.gateway.deps.upgradeAgents.apply(server.workspaceId);
  const scout = await server.gateway.deps.readModels.agentByKey(
    server.workspaceId,
    server.harnessId,
    server.harnessId,
  );
  if (scout === undefined) throw new Error("the harness has no agent");
  wrenId = scout.agent_id;
  haleId = await agentInRoom("hale", "Hale");
  scratch = mkdtempSync(join(tmpdir(), "chips-sdk-project-"));
});

afterEach(async () => {
  await server.close();
  rmSync(scratch, { recursive: true, force: true });
});

/** Another agent of the harness's, registered and put in the room. */
async function agentInRoom(key: string, name: string): Promise<string> {
  const made = await fetch(`${server.url}/v1/harnesses/${server.harnessId}/agents`, {
    method: "POST",
    headers: { authorization: `Bearer ${server.token}`, "content-type": "application/json" },
    body: JSON.stringify({ key, name }),
  });
  const agentId = String(((await made.json()) as Record<string, unknown>)["agent_id"]);
  await server.gateway.deps.store.append({
    v: 1,
    id: `evt_01K4ZQPX0000000000000${key.toUpperCase().padEnd(5, "0").slice(0, 5)}`,
    ts: "2026-09-03T09:05:00.000Z",
    workspace_id: server.workspaceId,
    space_id: server.spaceId,
    actor: { kind: "person", id: server.personId },
    type: "membership.added",
    idempotency_key: `agent-${key}`,
    participant_id: agentId,
    participant_kind: "agent",
    role: "member",
  } as unknown as Parameters<typeof server.gateway.deps.store.append>[0]);
  return agentId;
}

function project(agentId: string, name: string, spaceId = server.spaceId): Project {
  return new Project({
    url: server.url,
    token: server.token,
    spaceId,
    agentId,
    name,
    folder: join(scratch, name.toLowerCase()),
  });
}

function write(copy: Project, path: string, words: string): void {
  const at = join(copy.copy, path);
  mkdirSync(dirname(at), { recursive: true });
  writeFileSync(at, words);
}

const read = (copy: Project, path: string) => readFileSync(join(copy.copy, path), "utf8");

function git(copy: Project, args: readonly string[]): string {
  return execFileSync("git", [...args], {
    cwd: copy.copy,
    encoding: "utf8",
    env: { PATH: "/usr/bin:/bin:/opt/homebrew/bin", GIT_CONFIG_GLOBAL: "/dev/null" },
  });
}

async function changes() {
  const page = await server.gateway.deps.store.since(server.workspaceId, 0, 5000);
  return page.events.filter((event) => event.type === "project.changed");
}

/** Pieces of a key, so that no scanner reads this file as holding one. */
const anthropicKey = () => ["sk-", "ant-", "api03-", "Z".repeat(40)].join("");

describe("an agent's first turns", () => {
  it("make the copy, send what it wrote, and tell the next turn what the other changed", async () => {
    const wren = project(wrenId, "Wren");
    const hale = project(haleId, "Hale");
    const first = await wren.pull();
    expect(first).toMatchObject({ folder: wren.copy, files: 0, changed: [], clashes: [] });

    write(wren, "src/store.js", "export const store = [];\n");
    const sent = await wren.push({ words: "I started the store.\n\nIt holds the list." });
    expect(sent).toMatchObject({ state: "sent", files: ["src/store.js"], over: [] });
    const [changed] = await changes();
    expect(changed?.payload).toMatchObject({ by: wrenId, message: "I started the store." });
    if (sent.state === "sent") expect(changed?.payload["after"]).toBe(sent.commit);

    expect((await hale.pull()).files).toBe(1);
    expect(git(hale, ["log", "-1", "--format=%an <%ae>"]).trim()).toBe(
      `Wren <${wrenId}@agents.chips.invalid>`,
    );
    write(wren, "src/store.js", "export const store = [];\nexport const add = () => {};\n");
    expect((await wren.push({ words: "Added add." })).state).toBe("sent");
    const heard = await hale.pull();
    expect(heard).toMatchObject({ changed: ["src/store.js"], by: ["Wren"] });
    expect(read(hale, "src/store.js")).toContain("export const add");
  });

  it("tell an agent whose last turn found the project empty everything added since", async () => {
    const wren = project(wrenId, "Wren");
    const hale = project(haleId, "Hale");
    await hale.pull();
    await wren.pull();
    write(wren, "notes.md", "One sentence.\n");
    expect((await wren.push({ words: "Notes." })).state).toBe("sent");
    expect(await hale.pull()).toMatchObject({ files: 1, changed: ["notes.md"], by: ["Wren"] });
  });

  it("say whether the project has Markdown and a page, for the note's asks (ADR 0223)", async () => {
    const wren = project(wrenId, "Wren");
    await wren.pull();
    write(wren, "notes.md", "One sentence.\n");
    write(wren, "game/index.html", "<h1>Game</h1>\n");
    expect((await wren.push({ words: "A page." })).state).toBe("sent");
    expect(await wren.pull()).toMatchObject({ markdown: true, pages: true });
  });

  it("are nothing to send when nothing changed", async () => {
    const wren = project(wrenId, "Wren");
    await wren.pull();
    expect(await wren.push({ words: "Just looking." })).toEqual({ state: "nothing" });
  });
});

describe("two agents at once", () => {
  it("replay the second's change on top of the first's, with no merge in the history", async () => {
    const wren = project(wrenId, "Wren");
    const hale = project(haleId, "Hale");
    await wren.pull();
    write(wren, "README.md", "# Todo\n");
    await wren.push({ words: "Readme." });
    await hale.pull();
    await wren.pull();

    write(wren, "src/store.js", "export const store = [];\n");
    write(hale, "src/page.js", "export const page = 1;\n");
    expect((await wren.push({ words: "Store." })).state).toBe("sent");
    expect(await hale.push({ words: "Page." })).toMatchObject({ state: "sent", over: ["Wren"] });

    await wren.pull();
    expect(read(wren, "src/page.js")).toContain("page");
    expect(git(wren, ["log", "--merges", "--format=%h"]).trim()).toBe("");
  });

  it("mark an overlap in the second's copy, labelled, and hold it back until it's settled", async () => {
    const wren = project(wrenId, "Wren");
    const hale = project(haleId, "Hale");
    await wren.pull();
    write(wren, "src/store.js", "export const limit = 10;\n");
    await wren.push({ words: "A limit." });
    await hale.pull();
    await wren.pull();

    write(wren, "src/store.js", "export const limit = 20;\n");
    write(hale, "src/store.js", "export const limit = 50;\n");
    expect((await wren.push({ words: "Twenty." })).state).toBe("sent");
    expect(await hale.push({ words: "Fifty." })).toEqual({
      state: "clash",
      files: ["src/store.js"],
      with: ["Wren"],
    });
    const marked = read(hale, "src/store.js");
    expect(marked).toContain(
      "<<<<<<< yours\nexport const limit = 50;\n=======\nexport const limit = 20;\n>>>>>>> Wren",
    );

    expect((await hale.push({ words: "Again." })).state).toBe("clash");
    const told = await hale.pull();
    expect(told).toMatchObject({ clashes: ["src/store.js"], clashedWith: ["Wren"] });
    expect(renderProjectNote(told, { othersInRoom: true })).toContain(
      "Your last change to src/store.js clashed with Wren's, which reached the space first.",
    );

    write(hale, "src/store.js", "export const limit = 35;\n");
    expect((await hale.push({ words: "Settled on 35." })).state).toBe("sent");
    await wren.pull();
    expect(read(wren, "src/store.js")).toBe("export const limit = 35;\n");
    expect(await changes()).toHaveLength(3);
  });

  it("both starting in an empty project: the second's first change goes on top", async () => {
    const wren = project(wrenId, "Wren");
    const hale = project(haleId, "Hale");
    await wren.pull();
    await hale.pull();
    write(wren, "README.md", "# Todo\n");
    write(hale, "src/page.js", "export const page = 1;\n");
    expect((await wren.push({ words: "Readme." })).state).toBe("sent");
    expect(await hale.push({ words: "Page." })).toMatchObject({ state: "sent", over: ["Wren"] });
    expect(git(hale, ["log", "--format=%an"]).trim().split("\n")).toEqual(["Hale", "Wren"]);
  });

  it("both starting one file in an empty project: the second's is marked, not lost", async () => {
    const wren = project(wrenId, "Wren");
    const hale = project(haleId, "Hale");
    await wren.pull();
    await hale.pull();
    write(wren, "guide.md", "# Composting\n\n## Greens\n");
    write(hale, "guide.md", "# Composting\n\n## Browns\n");
    expect((await wren.push({ words: "Greens." })).state).toBe("sent");
    expect(await hale.push({ words: "Browns." })).toEqual({
      state: "clash",
      files: ["guide.md"],
      with: ["Wren"],
    });
    expect(read(hale, "guide.md")).toContain(
      "<<<<<<< yours\n## Browns\n=======\n## Greens\n>>>>>>> Wren",
    );

    write(hale, "guide.md", "# Composting\n\n## Greens\n\n## Browns\n");
    expect((await hale.push({ words: "Both." })).state).toBe("sent");
    expect(git(hale, ["log", "-1", "--format=%s"]).trim()).toBe("Both.");
    await wren.pull();
    expect(read(wren, "guide.md")).toBe("# Composting\n\n## Greens\n\n## Browns\n");
  });
});

describe("what is never committed", () => {
  it("is the leave-out list", async () => {
    const wren = project(wrenId, "Wren");
    await wren.pull();
    write(wren, "src/app.js", "export {};\n");
    write(wren, "node_modules/left/index.js", "module.exports = 1;\n");
    write(wren, ".env", "PORT=1\n");
    write(wren, ".env.example", "PORT=\n");
    write(wren, ".DS_Store", "x");
    const sent = await wren.push({ words: "App." });
    expect(sent).toMatchObject({ state: "sent", files: [".env.example", "src/app.js"] });
  });

  it("is a change with a key in it, whole, which the next turn is told of", async () => {
    const wren = project(wrenId, "Wren");
    await wren.pull();
    write(wren, "src/app.js", "export {};\n");
    write(wren, "src/config.js", `export const key = "${anthropicKey()}";\n`);
    expect(await wren.push({ words: "Config." })).toEqual({
      state: "keys",
      keys: [{ path: "src/config.js", what: "an Anthropic key" }],
    });
    expect(existsSync(join(wren.copy, ".git", "refs", "heads", "main"))).toBe(false);
    expect(await changes()).toEqual([]);

    const told = await wren.pull();
    expect(told.keys).toEqual([{ path: "src/config.js", what: "an Anthropic key" }]);
    expect(renderProjectNote(told, { othersInRoom: false })).toContain(
      "src/config.js holds what looks like an Anthropic key, so your last change wasn't sent",
    );

    write(wren, "src/config.js", "export const key = process.env.KEY;\n");
    expect((await wren.push({ words: "No key." })).state).toBe("sent");
  });
});

describe("a turn that stopped", () => {
  it("keeps its work in the copy, and it goes with the next turn", async () => {
    const wren = project(wrenId, "Wren");
    await wren.pull();
    write(wren, "half.js", "export const half = true;\n");
    // The turn failed here, with nothing sent. The next one starts:
    await wren.pull();
    expect((await wren.push({ words: "Finished it." })).state).toBe("sent");
    const hale = project(haleId, "Hale");
    await hale.pull();
    expect(read(hale, "half.js")).toContain("half");
  });
});

describe("an agent moved to another room", () => {
  it("keeps its old copy beside, named for that room, and starts a new one", async () => {
    const wren = project(wrenId, "Wren");
    await wren.pull();
    write(wren, "a.js", "1\n");
    await wren.push({ words: "One." });

    const elsewhere = "spc_01K4ZQPX0000000000000000ZZ";
    const moved = project(wrenId, "Wren", elsewhere);
    const told = await moved.pull();
    expect(existsSync(join(scratch, "wren", `room-${server.spaceId}`, "a.js"))).toBe(true);
    expect(told.files).toBe(0);
    expect(told.trouble).toContain("You are in no space with that id.");
  });
});

/** A server that keeps what every request it is sent says for `authorization`, as an agent's own would. */
async function listener(): Promise<{ url: string; heard: string[]; close: () => Promise<void> }> {
  const heard: string[] = [];
  const server = createServer((request, response) => {
    heard.push(String(request.headers.authorization));
    response.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  const close = () => new Promise<void>((resolve) => server.close(() => resolve()));
  return { url: `http://127.0.0.1:${port}`, heard, close };
}

describe("an agent that writes its copy's git config (SEC-52)", () => {
  it("sends the token only to the room's project, and leaves a copy alone while its config holds what Chips didn't put there", async () => {
    const elsewhere = await listener();
    try {
      // origin pointed elsewhere: the bridge fetches and sends by the project's URL all the same.
      const wren = project(wrenId, "Wren");
      await wren.pull();
      write(wren, "a.js", "1\n");
      git(wren, ["config", "remote.origin.url", `${elsewhere.url}/project.git`]);
      expect(await wren.push({ words: "One." })).toMatchObject({ state: "sent", files: ["a.js"] });

      // A rewrite of the project's URL to another server: nothing is fetched or sent.
      const hale = project(haleId, "Hale");
      expect((await hale.pull()).files).toBe(1);
      git(hale, ["config", `url.${elsewhere.url}/.insteadOf`, `${server.url}/`]);
      write(hale, "b.js", "2\n");
      const held = await hale.push({ words: "Two." });
      expect(held.state).toBe("failed");
      expect(heldNote(held, "Hale")).toBe(
        `(Not in the space's project: it couldn't be sent: the copy's .git/config has settings Chips didn't put there (url.${elsewhere.url}/.insteadof), so Chips won't fetch or send until they're taken out.)`,
      );
      git(hale, ["config", "--remove-section", `url.${elsewhere.url}/`]);

      // A proxy, which would be handed every request: the turn is told, and nothing is fetched.
      git(hale, ["config", "http.proxy", elsewhere.url]);
      expect((await hale.pull()).trouble).toBe(
        "the copy's .git/config has settings Chips didn't put there (http.proxy), so Chips won't fetch or send until they're taken out.",
      );
      expect(elsewhere.heard).toEqual([]);

      // Taken out, the copy works again; an upstream and a name for commits never stopped it.
      git(hale, ["config", "--unset", "http.proxy"]);
      git(hale, ["config", "branch.main.remote", "origin"]);
      git(hale, ["config", "branch.main.merge", "refs/heads/main"]);
      git(hale, ["config", "user.email", "hale@example.com"]);
      expect((await hale.push({ words: "Two." })).state).toBe("sent");
    } finally {
      await elsewhere.close();
    }
  });

  it("never runs the program core.fsmonitor names, even in a person's folder", async () => {
    const ran = join(scratch, "ran");
    const monitor = join(scratch, "monitor.sh");
    writeFileSync(monitor, `#!/bin/sh\nenv > '${ran}'\nexit 1\n`);
    chmodSync(monitor, 0o755);
    const folder = new Project({
      url: server.url,
      token: server.token,
      spaceId: server.spaceId,
      agentId: server.personId,
      name: "Arjun",
      folder: join(scratch, "arjun"),
      person: true,
    });
    await folder.look();
    git(folder, ["config", "core.fsmonitor", monitor]);
    write(folder, "c.js", "3\n");
    await folder.push({ words: "Three." });
    expect(existsSync(ran)).toBe(false);
  });
});

describe("the turn's text", () => {
  it("opens the project after the room's note, and asks agents who share a room to split by file", async () => {
    const wren = project(wrenId, "Wren");
    const facts = await wren.pull();
    const message = {
      text: "Build the list.",
      from: { participant_id: server.personId, display_name: "Arjun", kind: "person" },
      for: [wrenId],
      room: {
        members: [
          { participant_id: wrenId, kind: "agent", name: "Wren" },
          { participant_id: haleId, kind: "agent", name: "Hale" },
        ],
        notes: { [wrenId]: "You're Wren, in the Todo app." },
      },
      ts: "2026-10-23T09:00:00.000Z",
    } as unknown as MessageNew;
    const text = promptFor(message, { project: facts });
    expect(text.indexOf("You're Wren")).toBeLessThan(
      text.indexOf("The space's project is a git repository."),
    );
    expect(text).toContain(`Your copy is ${wren.copy} (0 files), brought up to date just now.`);
    expect(text).toContain("Split the work by file where you can.");
    expect(text.endsWith("Arjun: Build the list.")).toBe(true);
  });
});

describe("the small things", () => {
  it("takes a commit's subject from the first line of the words", () => {
    expect(subjectOf("\n  Fixed the filter.  \nMore words")).toBe("Fixed the filter.");
    expect(subjectOf("")).toBe("A change to the project");
    expect(subjectOf("x".repeat(100))).toHaveLength(72);
  });

  it("says what a push did in a few words, for a bridge's log", () => {
    expect(
      pushedInWords({ state: "sent", commit: "4b8e2a1f9c7d", files: ["a", "b"], over: ["Wren"] }),
    ).toBe("sent 4b8e2a1 (2 files, over Wren's)");
    expect(pushedInWords({ state: "clash", files: ["src/app.js"], with: ["Hale"] })).toBe(
      "held: src/app.js clashed with Hale",
    );
    expect(
      pushedInWords({ state: "keys", keys: [{ path: "k.js", what: "an AWS access key" }] }),
    ).toBe("held: k.js (an AWS access key)");
  });

  it("says after a reply's words when its change didn't reach the project (AP-6)", () => {
    expect(
      heldNote({ state: "sent", commit: "4b8e", files: ["a"], over: [] }, "Ash"),
    ).toBeUndefined();
    expect(heldNote({ state: "nothing" }, "Ash")).toBeUndefined();
    expect(heldNote({ state: "clash", files: ["src/config.js"], with: ["Birch"] }, "Ash")).toBe(
      "(Not in the space's project yet: src/config.js clashed with Birch's change. Ash is asked to settle it next turn.)",
    );
    expect(heldNote({ state: "clash", files: ["a.txt"], with: [] }, "Ash")).toContain(
      "clashed with another change.",
    );
    expect(
      heldNote({ state: "keys", keys: [{ path: "config.js", what: "an Anthropic key" }] }, "Ash"),
    ).toBe(
      "(Not in the space's project: config.js looks like it holds an Anthropic key, so nothing was sent.)",
    );
    expect(
      heldNote({ state: "keys", keys: [{ path: ".env", what: "secrets, by its name" }] }, "Ash"),
    ).toBe("(Not in the space's project: .env looks like it holds secrets, so nothing was sent.)");
    expect(heldNote({ state: "failed", why: "others kept sending first." }, "Ash")).toBe(
      "(Not in the space's project: it couldn't be sent: others kept sending first.)",
    );
    expect(
      heldNote({ state: "refused", why: "That token is not good for this project" }, "Ash"),
    ).toBe(
      "(Not in the space's project: it was turned back: That token is not good for this project.)",
    );
  });

  it("finds git new enough on this machine", async () => {
    expect(await checkGit("git", "/usr/bin:/bin:/opt/homebrew/bin")).toMatchObject({ ok: true });
    expect(await checkGit("/nowhere/git")).toEqual({
      ok: false,
      why: "git was not found on this machine",
    });
  });
});
