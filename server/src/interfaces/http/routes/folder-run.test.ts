/**
 * Run (ADR 0226): a person's device asks their own Mac to run the room's project or stop it, and
 * `folder.run` goes down that person's sockets that said `folders`; the Mac says how the run
 * stands, and `folder.run_state` goes down that person's sockets that said `folder_runs`, and a
 * read gives it again. Nobody else's socket hears either.
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

async function call(
  method: "GET" | "POST" | "PUT",
  spaceId: string,
  body: unknown,
  person: TestPerson = ws.arjun,
): Promise<{ status: number; body: unknown }> {
  const path = `/v1/spaces/${spaceId}/project/run`;
  const raw = body === undefined ? "" : JSON.stringify(body);
  const response = await ws.gateway.app.fetch(
    new Request(`${BASE}${path}`, {
      method,
      headers: { "content-type": "application/json", ...person.sign(method, path, raw) },
      ...(method === "GET" ? {} : { body: raw }),
    }),
  );
  const text = await response.text();
  return { status: response.status, body: text === "" ? undefined : JSON.parse(text) };
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
  return { socket, of: (name: string) => frames.filter((f) => f["frame"] === name) };
}

async function until(done: () => boolean): Promise<void> {
  for (let i = 0; i < 200 && !done(); i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

const RUNNING = {
  state: "running",
  command: "python3 -m http.server 8000",
  since: "2026-10-24T09:05:02.000Z",
  opened: "http://localhost:8000",
};

describe("the project's Run (ADR 0226)", () => {
  it("asks the person's own Mac to run or stop, and no one else's socket", async () => {
    const mac = await socketOf(ws.arjun, ["folders"]);
    const phone = await socketOf(ws.arjun, ["events", "folder_runs"]);
    const danasMac = await socketOf(ws.dana, ["folders"]);

    expect(await call("POST", ws.spaceId, { op: "run", command: "make" })).toEqual({
      status: 200,
      body: { macs: 1 },
    });
    expect(await call("POST", ws.spaceId, { op: "stop" })).toEqual({
      status: 200,
      body: { macs: 1 },
    });
    await until(() => mac.of("folder.run").length > 1);
    expect(mac.of("folder.run")).toEqual([
      {
        frame: "folder.run",
        space_id: ws.spaceId,
        op: "run",
        command: "make",
        asked_from: expect.any(String),
        asked_at: expect.any(String),
      },
      expect.objectContaining({ op: "stop" }),
    ]);
    expect(phone.of("folder.run")).toHaveLength(0);
    expect(danasMac.of("folder.run")).toHaveLength(0);
    for (const each of [mac, phone, danasMac]) each.socket.close();
  });

  it("refuses an ask that is neither run nor stop, and says no Mac heard one when none is open", async () => {
    expect((await call("POST", ws.spaceId, { op: "rm -rf" })).status).toBe(422);
    expect((await call("POST", ws.spaceId, { op: "run" })).status).toBe(422);
    expect(await call("POST", ws.spaceId, { op: "run", command: "make" })).toEqual({
      status: 200,
      body: { macs: 0 },
    });
  });

  it("passes the Mac's word to the person's other devices, and reads it back", async () => {
    const mac = await socketOf(ws.arjun, ["folders"]);
    const phone = await socketOf(ws.arjun, ["folder_runs"]);
    const danasPhone = await socketOf(ws.dana, ["folder_runs"]);
    expect(await call("GET", ws.spaceId, undefined)).toEqual({ status: 200, body: { macs: 1 } });

    expect((await call("PUT", ws.spaceId, { run: RUNNING })).status).toBe(204);
    await until(() => phone.of("folder.run_state").length > 0);
    const held = { ...RUNNING, mac: expect.any(String), said_at: expect.any(String) };
    expect(phone.of("folder.run_state")).toEqual([
      { frame: "folder.run_state", space_id: ws.spaceId, run: held },
    ]);
    expect(danasPhone.of("folder.run_state")).toHaveLength(0);
    expect(await call("GET", ws.spaceId, undefined)).toEqual({
      status: 200,
      body: { run: held, macs: 1 },
    });
    // Dana's own read has nothing of Arjun's run.
    expect(await call("GET", ws.spaceId, undefined, ws.dana)).toEqual({
      status: 200,
      body: { macs: 0 },
    });
    for (const each of [mac, phone, danasPhone]) each.socket.close();
  });

  it("refuses a word that isn't how a run stands", async () => {
    const lines = Array.from({ length: 21 }, (_, at) => `line ${at}`);
    for (const run of [{ state: "exploded" }, { ...RUNNING, lines }, undefined]) {
      expect((await call("PUT", ws.spaceId, { run })).status).toBe(422);
    }
    expect(await call("GET", ws.spaceId, undefined)).toEqual({ status: 200, body: { macs: 0 } });
  });

  it("is an owner's alone: a member's run or stop is refused before any Mac hears it (ADR 0231)", async () => {
    for (const body of [{ op: "run", command: "make" }, { op: "stop" }]) {
      const refused = await call("POST", ws.spaceId, body, ws.dana);
      expect(refused.status).toBe(403);
      expect(JSON.stringify(refused.body)).toContain("Only the workspace's owner");
    }
  });

  it("is refused for a room the person isn't in", async () => {
    const elsewhere = ws.ids.next("space");
    for (const method of ["GET", "POST", "PUT"] as const) {
      const body =
        method === "POST"
          ? { op: "run", command: "make" }
          : method === "PUT"
            ? { run: RUNNING }
            : undefined;
      expect((await call(method, elsewhere, body)).status).toBe(404);
    }
  });
});
