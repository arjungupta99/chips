/**
 * Open folder on Mac (ADR 0225): a person's device asks, and `folder.open` goes down that person's
 * own sockets that said `folders` in their hello, the Mac's, and nobody else's.
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

beforeEach(async () => {
  ws = await createTestWorkspace();
  ({ port } = await ws.gateway.listen());
});
afterEach(async () => {
  await ws.close();
});

async function openOnMac(
  spaceId: string,
  person: TestPerson = ws.arjun,
  asked?: Record<string, unknown>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const path = `/v1/spaces/${spaceId}/project/folder/open`;
  const body = asked === undefined ? "" : JSON.stringify(asked);
  const response = await ws.gateway.app.fetch(
    new Request(`${BASE}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...person.sign("POST", path, body) },
      ...(asked === undefined ? {} : { body }),
    }),
  );
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

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
  return { socket, frames, asked: () => frames.filter((f) => f["frame"] === "folder.open") };
}

async function until(done: () => boolean): Promise<void> {
  for (let i = 0; i < 200 && !done(); i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe("POST /v1/spaces/:id/project/folder/open (ADR 0225)", () => {
  it("sends folder.open to the person's own Mac, and to no one else's socket", async () => {
    const mac = await socketOf(ws.arjun, ["folders"]);
    const browser = await socketOf(ws.arjun, ["events"]);
    const danasMac = await socketOf(ws.dana, ["folders"]);

    const asked = await openOnMac(ws.spaceId);
    expect(asked).toEqual({ status: 200, body: { macs: 1 } });
    await until(() => mac.asked().length > 0);
    expect(mac.asked()).toEqual([
      {
        frame: "folder.open",
        space_id: ws.spaceId,
        asked_from: expect.any(String),
        asked_at: expect.any(String),
      },
    ]);
    expect(browser.asked()).toHaveLength(0);
    expect(danasMac.asked()).toHaveLength(0);
    for (const each of [mac, browser, danasMac]) each.socket.close();
  });

  it("asks for the room's page in Chips for Mac, not the folder, with what: page (ADR 0227)", async () => {
    const mac = await socketOf(ws.arjun, ["folders"]);
    expect(await openOnMac(ws.spaceId, ws.arjun, { what: "page" })).toEqual({
      status: 200,
      body: { macs: 1 },
    });
    await until(() => mac.asked().length > 0);
    expect(mac.asked()).toEqual([expect.objectContaining({ space_id: ws.spaceId, what: "page" })]);
    const refused = await openOnMac(ws.spaceId, ws.arjun, { what: "files" });
    expect(refused.status).toBe(422);
    mac.socket.close();
  });

  it("is an owner's alone: a member in the room is refused, and her Mac hears nothing (ADR 0231)", async () => {
    const danasMac = await socketOf(ws.dana, ["folders"]);
    for (const what of [undefined, { what: "page" }]) {
      const refused = await openOnMac(ws.spaceId, ws.dana, what);
      expect(refused.status).toBe(403);
      expect(JSON.stringify(refused.body)).toContain("Only the workspace's owner");
    }
    await until(() => danasMac.asked().length > 0);
    expect(danasMac.asked()).toHaveLength(0);
    danasMac.socket.close();
  });

  it("says no Mac heard it when Chips for Mac isn't open", async () => {
    expect(await openOnMac(ws.spaceId)).toEqual({ status: 200, body: { macs: 0 } });
  });

  it("is refused for a room the person isn't in", async () => {
    const elsewhere = ws.ids.next("space");
    const mac = await socketOf(ws.arjun, ["folders"]);
    const refused = await openOnMac(elsewhere);
    expect(refused.status).toBe(404);
    expect(mac.asked()).toHaveLength(0);
    mac.socket.close();
  });
});
