/**
 * A person asks a harness to restart (ADR 0094): the `restart` frame down the harness's own
 * socket, to the sockets that said they hear it, and restarting in its state until its next word.
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
  method: string,
  path: string,
  options: { person?: TestPerson; headers?: Record<string, string>; body?: unknown } = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const raw = options.body === undefined ? "" : JSON.stringify(options.body);
  const signed = options.headers ?? (options.person ?? ws.arjun).sign(method, path, raw);
  const response = await ws.gateway.app.fetch(
    new Request(`${BASE}${path}`, {
      method,
      headers: { "content-type": "application/json", ...signed },
      ...(raw === "" ? {} : { body: raw }),
    }),
  );
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

const restart = (person?: TestPerson) =>
  call("POST", `/v1/harnesses/${ws.scout.participantId}/restart`, person ? { person } : {});

/** Scout says it takes restarts, as its owner would declare it. */
async function takesRestarts(): Promise<void> {
  const declared = await call("PATCH", `/v1/harnesses/${ws.scout.participantId}`, {
    body: { capabilities: ["drive.read", "restarts"] },
  });
  expect(declared.status).toBe(200);
}

/** A socket of Scout's, saying in its hello what it hears beyond the base set. */
async function scoutSocket(accepts: string[]) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/v1/ws`, { headers: ws.scout.headers });
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
      client: { name: "scout", version: "0" },
      accepts,
    }),
  );
  await until(() => frames.length > 0);
  return { socket, frames };
}

async function until(done: () => boolean): Promise<void> {
  for (let i = 0; i < 200 && !done(); i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe("POST /v1/harnesses/:id/restart (ADR 0094)", () => {
  it("sends restart down the harness's socket that hears it, and holds it restarting until it speaks", async () => {
    await takesRestarts();
    const hears = await scoutSocket(["restart"]);
    const deaf = await scoutSocket([]);

    const asked = await restart();
    expect(asked.status).toBe(202);
    expect(asked.body).toMatchObject({
      asked: true,
      sockets: 1,
      state: { connected: true, restarting: { by: ws.arjun.participantId } },
    });
    await until(() => hears.frames.some((f) => f["frame"] === "restart"));
    const frame = hears.frames.find((f) => f["frame"] === "restart");
    expect(frame).toEqual({
      frame: "restart",
      asked_by: ws.arjun.participantId,
      asked_at: expect.any(String),
    });
    expect(deaf.frames.some((f) => f["frame"] === "restart")).toBe(false);

    // Asked again while it stands, it is the same restart, and nothing more is sent.
    const again = await restart();
    expect(again.status).toBe(200);
    expect(again.body).toMatchObject({ asked: false, sockets: 0 });
    expect(hears.frames.filter((f) => f["frame"] === "restart")).toHaveLength(1);

    // Its next word ends it: the bridge's case, a status reported.
    const fine = await call("PUT", `/v1/harnesses/${ws.scout.participantId}/status`, {
      headers: ws.scout.headers,
      body: { state: "ok" },
    });
    expect((fine.body["state"] as Record<string, unknown>)["restarting"]).toBeUndefined();
    hears.socket.close();
    deaf.socket.close();
  });

  it("ends when a socket of it opens again: the harness that restarts its own process", async () => {
    await takesRestarts();
    const before = await scoutSocket(["restart"]);
    expect((await restart()).status).toBe(202);
    before.socket.close();
    const after = await scoutSocket(["restart"]);
    const people = await call("GET", "/v1/participants");
    const scout = (people.body["participants"] as Record<string, unknown>[]).find(
      (each) => each["id"] === ws.scout.participantId,
    );
    expect(scout?.["state"]).not.toHaveProperty("restarting");
    after.socket.close();
  });

  it("says in words why it can't: no restarts declared, nobody to hear, a removed harness", async () => {
    const hears = await scoutSocket(["restart"]);
    const undeclared = await restart();
    expect(undeclared.status).toBe(422);
    expect(JSON.stringify(undeclared.body)).toContain("doesn't take restarts from Chips");

    await takesRestarts();
    hears.socket.close();
    const deaf = await scoutSocket([]);
    const nobody = await restart();
    expect(nobody.status).toBe(422);
    expect(JSON.stringify(nobody.body)).toContain("Chips can't reach Scout to restart it");
    deaf.socket.close();
  });

  it("is the owner's, or a workspace owner's or admin's: not a member's or a guest's", async () => {
    await takesRestarts();
    const socket = await scoutSocket(["restart"]);
    const dana = await ws.addPerson("Dana", "member");
    const vendor = await ws.addPerson("Vendor", "guest");
    expect((await restart(dana)).status).toBe(403);
    expect((await restart(vendor)).status).toBe(403);
    const priya = await ws.addPerson("Priya", "admin");
    expect((await restart(priya)).status).toBe(202);
    socket.socket.close();
  });
});
