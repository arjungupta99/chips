/**
 * When no Chips for Mac of the owner's is open (ADR 0227's second addendum): their ask to open a
 * room's folder or page, or run its program, opens the one on the server's machine at the room,
 * waits for it to say `folders`, and hands the ask over. Nobody else's ask opens it.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import {
  createTestWorkspace,
  type TestPerson,
  type TestWorkspace,
} from "../../../testing/workspace.js";

let ws: TestWorkspace;
let port: number;
const BASE = "http://chips.local";

/** What the server asked of Chips for Mac, and the Mac that came up when it did. */
let opened: string[];
let woken: Awaited<ReturnType<typeof socketOf>> | undefined;
/** Whether this machine has a Chips for Mac. */
let installed: boolean;

beforeEach(async () => {
  opened = [];
  woken = undefined;
  installed = true;
  ws = await createTestWorkspace({
    macApp: {
      open: async (spaceId) => {
        if (!installed) return false;
        opened.push(spaceId);
        // The app starts, its page loads, and its socket says `folders` a moment later.
        setTimeout(() => {
          void socketOf(ws.arjun, ["folders"]).then((mac) => {
            woken = mac;
          });
        }, 30);
        return true;
      },
    },
  });
  ({ port } = await ws.gateway.listen());
});
afterEach(async () => {
  woken?.socket.close();
  await ws.close();
});

async function post(
  path: string,
  person: TestPerson,
  asked: Record<string, unknown> = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const body = JSON.stringify(asked);
  const response = await ws.gateway.app.fetch(
    new Request(`${BASE}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...person.sign("POST", path, body) },
      body,
    }),
  );
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

const openFolder = (person: TestPerson = ws.arjun, asked?: Record<string, unknown>) =>
  post(`/v1/spaces/${ws.spaceId}/project/folder/open`, person, asked);
const run = (asked: Record<string, unknown>) =>
  post(`/v1/spaces/${ws.spaceId}/project/run`, ws.arjun, asked);

/** A socket of a person's, saying in its hello what it hears beyond the base set. */
async function socketOf(person: TestPerson, accepts: string[]) {
  const ticket = await person.socketTicket();
  const socket = new WebSocket(`ws://127.0.0.1:${port}/v1/ws?ticket=${ticket}`);
  const frames: Record<string, unknown>[] = [];
  socket.on("message", (data) => frames.push(JSON.parse(data.toString())));
  await new Promise<void>((resolve, reject) => {
    socket.once("open", () => resolve());
    socket.once("error", reject);
  });
  socket.send(
    JSON.stringify({
      frame: "hello",
      protocol: { min: 1, max: 1 },
      client: { name: "test", version: "0" },
      accepts,
    }),
  );
  await until(() => frames.length > 0);
  return {
    socket,
    frames,
    asked: (frame: string) => frames.filter((f) => f["frame"] === frame),
  };
}

async function until(done: () => boolean): Promise<void> {
  for (let i = 0; i < 200 && !done(); i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe("Chips for Mac opened by the server for the owner's ask (ADR 0227)", () => {
  it("opens it at the room, waits for it, and hands it the folder", async () => {
    expect(await openFolder()).toEqual({ status: 200, body: { macs: 1, opened_app: true } });
    expect(opened).toEqual([ws.spaceId]);
    await until(() => (woken?.asked("folder.open").length ?? 0) > 0);
    expect(woken?.asked("folder.open")).toEqual([
      expect.objectContaining({ frame: "folder.open", space_id: ws.spaceId }),
    ]);
  });

  it("hands it the page the same way", async () => {
    expect(await openFolder(ws.arjun, { what: "page" })).toEqual({
      status: 200,
      body: { macs: 1, opened_app: true },
    });
    await until(() => (woken?.asked("folder.open").length ?? 0) > 0);
    expect(woken?.asked("folder.open")).toEqual([expect.objectContaining({ what: "page" })]);
  });

  it("opens it to run the program, and not to stop one", async () => {
    expect(await run({ op: "stop" })).toEqual({ status: 200, body: { macs: 0 } });
    expect(opened).toEqual([]);
    expect(await run({ op: "run", command: "npm start" })).toEqual({
      status: 200,
      body: { macs: 1, opened_app: true },
    });
    await until(() => (woken?.asked("folder.run").length ?? 0) > 0);
    expect(woken?.asked("folder.run")).toEqual([
      expect.objectContaining({ op: "run", command: "npm start" }),
    ]);
  });

  it("leaves it alone when a Mac of the owner's is open already", async () => {
    const mac = await socketOf(ws.arjun, ["folders"]);
    expect(await openFolder()).toEqual({ status: 200, body: { macs: 1 } });
    expect(opened).toEqual([]);
    mac.socket.close();
  });

  it("is not opened for anyone else's ask, which is refused (ADR 0231)", async () => {
    expect((await openFolder(ws.dana)).status).toBe(403);
    expect(opened).toEqual([]);
  });

  it("says nothing of it where this machine has none", async () => {
    installed = false;
    expect(await openFolder()).toEqual({ status: 200, body: { macs: 0 } });
  });
});

describe("waiting for a Mac of a person's (ADR 0227)", () => {
  it("answers at once when one is open, when one comes, and nought when none does in time", async () => {
    const { workspaceId } = ws;
    const { participantId } = ws.arjun;
    const sessions = ws.gateway.deps.sessions;
    expect(await sessions.whenMac(workspaceId, participantId, 50)).toBe(0);
    const coming = sessions.whenMac(workspaceId, participantId, 5000);
    const mac = await socketOf(ws.arjun, ["folders"]);
    expect(await coming).toBe(1);
    expect(await sessions.whenMac(workspaceId, participantId, 50)).toBe(1);
    mac.socket.close();
  });

  it("is not answered by a socket that doesn't hear folders, or by someone else's Mac", async () => {
    const { workspaceId } = ws;
    const sessions = ws.gateway.deps.sessions;
    const coming = sessions.whenMac(workspaceId, ws.arjun.participantId, 300);
    const browser = await socketOf(ws.arjun, ["events"]);
    const danasMac = await socketOf(ws.dana, ["folders"]);
    expect(await coming).toBe(0);
    browser.socket.close();
    danasMac.socket.close();
  });
});
