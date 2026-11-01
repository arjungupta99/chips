/**
 * `chips project clone`, against a listening server and real git: the CLI's paired device finds
 * the room by its name, asks for a project token, and clones; the person's commit and push land on
 * the room's `main` as theirs and are recorded as a change of theirs; and git's credential helper
 * is answered with a fresh token for the room's project and nothing for anything else.
 */

import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { processEnvironment } from "@chipschat/platform";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestWorkspace, type TestWorkspace } from "../../../server/src/testing/workspace.js";
import { type CliDevice, pairDevice } from "../device.js";
import {
  cloneProject,
  credentialAsked,
  credentialFor,
  findRoom,
  folderFor,
  helperCommand,
} from "./project.js";

let ws: TestWorkspace;
let scratch: string;
let device: CliDevice;
let port: number;

beforeEach(async () => {
  ws = await createTestWorkspace({ config: { devMode: true } as never });
  ({ port } = await ws.gateway.listen());
  scratch = mkdtempSync(join(tmpdir(), "chips-project-clone-"));
  const code = ws.gateway.deps.pairingCodes?.issue({
    workspaceId: ws.workspaceId,
    participantId: ws.arjun.participantId,
  });
  device = await pairDevice({
    serverUrl: `http://127.0.0.1:${port}`,
    code: code?.code ?? "",
    name: "chips CLI",
    path: join(scratch, "device.json"),
  });
});

afterEach(async () => {
  await ws.close();
  rmSync(scratch, { recursive: true, force: true });
});

/** git as a person runs it here: none of this machine's own config. */
function git(args: readonly string[], cwd: string): Promise<string> {
  return new Promise((done, failed) => {
    execFile(
      "git",
      [...args],
      {
        cwd,
        env: {
          PATH: processEnvironment()["PATH"] ?? "/usr/bin:/bin",
          HOME: scratch,
          GIT_CONFIG_NOSYSTEM: "1",
          GIT_CONFIG_GLOBAL: "/dev/null",
          GIT_TERMINAL_PROMPT: "0",
        },
      },
      (error, stdout, stderr) =>
        error === null ? done(stdout) : failed(new Error(stderr || error.message)),
    );
  });
}

/** A helper git can run in a test: the token the CLI's own answer gives, for every `get`. */
async function testHelper(): Promise<string> {
  const answer = await credentialFor(device, {
    protocol: "http",
    host: `127.0.0.1:${port}`,
    path: `v1/spaces/${ws.spaceId}/project.git`,
  });
  const file = join(scratch, "helper.sh");
  writeFileSync(
    file,
    `#!/bin/sh\n[ "$1" = get ] || exit 0\ncat >/dev/null\nprintf '%s' '${answer}'\n`,
    { mode: 0o755 },
  );
  return file;
}

describe("chips project clone", () => {
  it("finds the room by its name, clones its project, and a push shows as the person's change", async () => {
    const room = await findRoom(device, "PO-4471");
    expect(room).toEqual({ spaceId: ws.spaceId, title: "PO-4471" });
    expect(await findRoom(device, `https://chips.example/spaces/${ws.spaceId}`)).toMatchObject({
      spaceId: ws.spaceId,
    });
    await expect(findRoom(device, "No such space")).rejects.toThrow(
      "No space here is called No such space.",
    );

    const into = await cloneProject({
      device,
      room,
      folder: folderFor(room.title),
      cwd: scratch,
      helper: await testHelper(),
      git: async (args, cwd) => void (await git(args, cwd)),
    });
    expect(into).toBe(join(scratch, "po-4471"));
    const config = readFileSync(join(into, ".git", "config"), "utf8");
    expect(config).toContain("usehttppath = true");
    expect(config).toContain(`email = ${ws.arjun.participantId}@people.chips.invalid`);
    expect(config).not.toContain("chips_pt_");

    writeFileSync(join(into, "notes.md"), "One sentence.\n");
    await git(["add", "notes.md"], into);
    await git(["commit", "--quiet", "-m", "Notes"], into);
    await git(["push", "--quiet", "origin", "HEAD:main"], into);
    const page = await ws.gateway.deps.store.since(ws.workspaceId, 0, 5000);
    const changed = page.events.filter((event) => event.type === "project.changed").at(-1);
    expect(changed?.actor).toMatchObject({ kind: "person", id: ws.arjun.participantId });
    expect(changed?.payload).toMatchObject({
      by: ws.arjun.participantId,
      files: [{ path: "notes.md" }],
    });
  });

  it("won't clone over a folder that is there", async () => {
    const room = await findRoom(device, ws.spaceId);
    await expect(
      cloneProject({
        device,
        room,
        folder: ".",
        cwd: scratch,
        helper: "",
        git: async () => undefined,
      }),
    ).rejects.toThrow("is there already");
  });
});

describe("the clone's credential helper", () => {
  it("answers a fresh project token for the room's project, and nothing for anything else", async () => {
    const asked = credentialAsked(
      `protocol=http\nhost=127.0.0.1:${port}\npath=v1/spaces/${ws.spaceId}/project.git\n`,
    );
    expect(asked).toEqual({
      protocol: "http",
      host: `127.0.0.1:${port}`,
      path: `v1/spaces/${ws.spaceId}/project.git`,
    });
    expect(await credentialFor(device, asked)).toMatch(/^username=chips\npassword=chips_pt_\S+\n$/);
    expect(await credentialFor(device, { ...asked, host: "github.com" })).toBe("");
    expect(await credentialFor(device, { ...asked, path: "someone/else.git" })).toBe("");
  });

  it("is this CLI, run as it was started, quoted for git's shell", () => {
    expect(
      helperCommand({
        execPath: "/opt/node",
        execArgv: ["--import", "tsx"],
        argv: ["/opt/node", "/my dir/chips.ts"],
      }),
    ).toBe("!'/opt/node' '--import' 'tsx' '/my dir/chips.ts' project credential");
  });

  it("makes a folder name of a room's name", () => {
    expect(folderFor("Sudoku night")).toBe("sudoku-night");
    expect(folderFor("Café — plans!")).toBe("cafe-plans");
    expect(folderFor("…")).toBe("room-project");
  });
});
