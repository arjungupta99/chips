/**
 * What each device and harness runs, as each says in its hello (everything in step, 13 November
 * 2026): kept by the server, and handed out at `GET /v1/software`.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import type { BridgeUpdateState } from "../../../application/ports/bridges.js";
import {
  createTestWorkspace,
  type TestPerson,
  type TestWorkspace,
} from "../../../testing/workspace.js";

let ws: TestWorkspace;
let port: number;
const BASE = "http://chips.local";
const sockets: WebSocket[] = [];

beforeEach(async () => {
  ws = await createTestWorkspace();
  ({ port } = await ws.gateway.listen());
});
afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.close();
  await ws.close();
});

async function read(as: TestPerson) {
  const path = "/v1/software";
  const response = await ws.gateway.app.fetch(
    new Request(`${BASE}${path}`, { method: "GET", headers: as.sign("GET", path, "") }),
  );
  return { status: response.status, body: (await response.json()) as Record<string, unknown[]> };
}

async function keep(as: TestPerson, harnessId: string, body: unknown) {
  const path = `/v1/harnesses/${harnessId}/bridge-updates`;
  const text = JSON.stringify(body);
  const response = await ws.gateway.app.fetch(
    new Request(`${BASE}${path}`, {
      method: "PUT",
      headers: { ...as.sign("PUT", path, text), "content-type": "application/json" },
      body: text,
    }),
  );
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

/** A socket opened with this ticket, saying hello as this client, once the server has answered. */
async function hello(ticket: string, client: { name: string; version: string }): Promise<void> {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/v1/ws?ticket=${ticket}`);
  sockets.push(socket);
  const answered = new Promise<void>((resolve) => socket.once("message", () => resolve()));
  await new Promise<void>((resolve, reject) => {
    socket.once("open", () => resolve());
    socket.once("error", reject);
  });
  socket.send(JSON.stringify({ frame: "hello", protocol: { min: 1, max: 1 }, client }));
  await answered;
}

async function harnessTicket(): Promise<string> {
  const response = await ws.gateway.app.fetch(
    new Request(`${BASE}/v1/socket-tickets`, { method: "POST", headers: ws.scout.headers }),
  );
  return String(((await response.json()) as { ticket: string }).ticket);
}

/** The server writes it as the hello arrives, a moment after it answers. */
async function until(done: () => Promise<boolean>): Promise<void> {
  for (let i = 0; i < 200 && !(await done()); i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe("GET /v1/software", () => {
  it("says what each harness and device said it runs in its hello", async () => {
    await hello(await ws.arjun.socketTicket(), { name: "chips-iphone", version: "1.2.5" });
    await hello(await harnessTicket(), { name: "chips-hermes", version: "1.0.30" });
    await until(async () => (await read(ws.arjun)).body["harnesses"]?.length === 1);

    const seen = await read(ws.arjun);
    expect(seen.status).toBe(200);
    expect(seen.body["harnesses"]).toEqual([
      expect.objectContaining({
        harness_id: ws.scout.participantId,
        name: "chips-hermes",
        version: "1.0.30",
      }),
    ]);
    expect(seen.body["devices"]).toEqual([
      expect.objectContaining({
        device_id: ws.arjun.deviceId,
        person_id: ws.arjun.participantId,
        name: "chips-iphone",
        version: "1.2.5",
      }),
    ]);
  });

  it("shows a member their own devices only, and an owner everyone's", async () => {
    await hello(await ws.arjun.socketTicket(), { name: "chips-mac", version: "1.2.5" });
    await hello(await ws.dana.socketTicket(), { name: "chips-web", version: "1.2.4" });
    await until(async () => (await read(ws.arjun)).body["devices"]?.length === 2);

    const dana = await read(ws.dana);
    expect(dana.body["devices"]).toEqual([
      expect.objectContaining({ device_id: ws.dana.deviceId, version: "1.2.4" }),
    ]);
    expect((await read(ws.arjun)).body["devices"]).toHaveLength(2);
  });

  it("shows an admin everyone's devices too", async () => {
    const admin = await ws.addPerson("Ada", "admin");
    await hello(await ws.arjun.socketTicket(), { name: "chips-mac", version: "1.2.5" });
    await hello(await ws.dana.socketTicket(), { name: "chips-web", version: "1.2.4" });
    await until(async () => (await read(ws.arjun)).body["devices"]?.length === 2);
    expect((await read(admin)).body["devices"]).toHaveLength(2);
  });

  it("leaves out a device unpaired since it last said hello", async () => {
    await hello(await ws.arjun.socketTicket(), { name: "chips-mac", version: "1.2.5" });
    await hello(await ws.dana.socketTicket(), { name: "chips-iphone", version: "1.2.4" });
    await until(async () => (await read(ws.arjun)).body["devices"]?.length === 2);
    await ws.db
      .updateTable("devices")
      .set({ revoked_at: "2026-11-20T10:00:00.000Z" })
      .where("id", "=", ws.dana.deviceId)
      .execute();
    expect((await read(ws.arjun)).body["devices"]).toEqual([
      expect.objectContaining({ device_id: ws.arjun.deviceId }),
    ]);
  });

  it("names a harness only to those the directory names it to", async () => {
    await hello(await harnessTicket(), { name: "chips-hermes", version: "1.0.30" });
    await until(async () => (await read(ws.arjun)).body["harnesses"]?.length === 1);
    // A guest who shares no room with it, and owns none, isn't told it is here at all.
    const guest = await ws.addPerson("Vendor", "guest");
    expect((await read(guest)).body["harnesses"]).toEqual([]);
    // An admin is told every harness.
    const admin = await ws.addPerson("Ada", "admin");
    expect((await read(admin)).body["harnesses"]).toHaveLength(1);
  });

  it("leaves out a harness removed since it last said hello", async () => {
    await hello(await harnessTicket(), { name: "chips-hermes", version: "1.0.30" });
    await until(async () => (await read(ws.arjun)).body["harnesses"]?.length === 1);
    await ws.db
      .updateTable("participants")
      .set({ removed_at: "2026-11-20T10:00:00.000Z" })
      .where("id", "=", ws.scout.participantId)
      .execute();
    expect((await read(ws.arjun)).body["harnesses"]).toEqual([]);
  });

  it("says how a bridge in this computer's data folder is being kept current", async () => {
    await hello(await harnessTicket(), { name: "chips-acp", version: "1.0.30" });
    await until(async () => (await read(ws.arjun)).body["harnesses"]?.length === 1);
    const state: BridgeUpdateState = {
      package: "@chipschat/acp",
      running: "1.0.30",
      phase: "waiting",
      target: "1.0.31",
      since: "2026-11-20T10:00:00.000Z",
      last: {
        outcome: "put-back",
        from: "1.0.29",
        to: "1.0.30",
        at: "2026-11-12T10:00:00.000Z",
        reason: "no-return",
      },
    };
    // The updater's states, as `chips serve` from a release would have it keep them.
    Object.assign(ws.gateway.deps, {
      bridgeUpdates: () => new Map([[ws.scout.participantId, state]]),
    });
    expect((await read(ws.arjun)).body["harnesses"]).toEqual([
      expect.objectContaining({
        harness_id: ws.scout.participantId,
        bridge_update: {
          package: "@chipschat/acp",
          running: "1.0.30",
          phase: "waiting",
          target: "1.0.31",
          since: "2026-11-20T10:00:00.000Z",
          last: {
            outcome: "put-back",
            from: "1.0.29",
            to: "1.0.30",
            at: "2026-11-12T10:00:00.000Z",
            reason: "no-return",
          },
        },
      }),
    ]);
  });

  it("keeps a bridge current until its owner turns that off on its harness page", async () => {
    await hello(await harnessTicket(), { name: "chips-acp", version: "1.0.30" });
    await until(async () => (await read(ws.arjun)).body["harnesses"]?.length === 1);
    expect((await read(ws.arjun)).body["harnesses"]).toEqual([
      expect.objectContaining({ keep_current: true }),
    ]);

    expect(await keep(ws.arjun, ws.scout.participantId, { keep_current: false })).toEqual({
      status: 200,
      body: { keep_current: false },
    });
    expect((await read(ws.arjun)).body["harnesses"]).toEqual([
      expect.objectContaining({ keep_current: false }),
    ]);
    expect((await keep(ws.arjun, ws.scout.participantId, { keep_current: "no" })).status).toBe(422);
    expect((await keep(ws.arjun, ws.arjun.participantId, { keep_current: true })).status).toBe(404);
    // And on again.
    expect(await keep(ws.arjun, ws.scout.participantId, { keep_current: true })).toEqual({
      status: 200,
      body: { keep_current: true },
    });
    expect((await read(ws.arjun)).body["harnesses"]).toEqual([
      expect.objectContaining({ keep_current: true }),
    ]);
  });

  it("is an owner's switch: not a member's, an admin's or a harness's, and takes only JSON", async () => {
    const admin = await ws.addPerson("Ada", "admin");
    const id = ws.scout.participantId;
    expect((await keep(ws.dana, id, { keep_current: false })).status).toBe(403);
    expect((await keep(admin, id, { keep_current: false })).status).toBe(403);
    const path = `/v1/harnesses/${id}/bridge-updates`;
    const asHarness = await ws.gateway.app.fetch(
      new Request(`${BASE}${path}`, {
        method: "PUT",
        headers: { ...ws.scout.headers, "content-type": "application/json" },
        body: JSON.stringify({ keep_current: false }),
      }),
    );
    expect(asHarness.status).toBe(403);
    const raw = "{ cut off";
    const cut = await ws.gateway.app.fetch(
      new Request(`${BASE}${path}`, {
        method: "PUT",
        headers: { ...ws.arjun.sign("PUT", path, raw), "content-type": "application/json" },
        body: raw,
      }),
    );
    expect(cut.status).toBe(422);
    expect(
      (await keep(ws.arjun, "hrn_01K4ZQPX0000000000000NOONE", { keep_current: false })).status,
    ).toBe(404);
  });

  it("puts a refused release's reason, and nothing it wasn't told, on the wire", async () => {
    await hello(await harnessTicket(), { name: "chips-acp", version: "1.0.30" });
    await until(async () => (await read(ws.arjun)).body["harnesses"]?.length === 1);
    const refused: BridgeUpdateState = {
      package: "@chipschat/acp",
      running: "1.0.30",
      phase: "refused",
      target: "1.0.31",
      reason: "room",
      since: "2026-11-20T10:00:00.000Z",
      last: { outcome: "updated", from: "1.0.29", to: "1.0.30", at: "2026-11-12T10:00:00.000Z" },
    };
    Object.assign(ws.gateway.deps, {
      bridgeUpdates: () => new Map([[ws.scout.participantId, refused]]),
    });
    expect((await read(ws.arjun)).body["harnesses"]).toEqual([
      expect.objectContaining({
        bridge_update: {
          package: "@chipschat/acp",
          running: "1.0.30",
          phase: "refused",
          target: "1.0.31",
          reason: "room",
          since: "2026-11-20T10:00:00.000Z",
          last: {
            outcome: "updated",
            from: "1.0.29",
            to: "1.0.30",
            at: "2026-11-12T10:00:00.000Z",
          },
        },
      }),
    ]);
    const plain: BridgeUpdateState = {
      package: "@chipschat/acp",
      running: "1.0.30",
      phase: "current",
      since: "2026-11-20T10:00:00.000Z",
      last: undefined,
    };
    Object.assign(ws.gateway.deps, {
      bridgeUpdates: () => new Map([[ws.scout.participantId, plain]]),
    });
    expect((await read(ws.arjun)).body["harnesses"]).toEqual([
      expect.objectContaining({
        bridge_update: {
          package: "@chipschat/acp",
          running: "1.0.30",
          phase: "current",
          since: "2026-11-20T10:00:00.000Z",
        },
      }),
    ]);
  });

  it("says the release out for a bridge kept elsewhere, by the name in its hello", async () => {
    Object.assign(ws.gateway.deps, {
      bridgeOut: (name: string, running: string) =>
        name === "chips-hermes" && running === "1.0.29" ? "1.0.31" : undefined,
    });
    await hello(await harnessTicket(), { name: "chips-hermes", version: "1.0.29" });
    await until(async () => (await read(ws.arjun)).body["harnesses"]?.length === 1);
    expect((await read(ws.arjun)).body["harnesses"]).toEqual([
      expect.objectContaining({ version: "1.0.29", release_out: "1.0.31" }),
    ]);
  });

  it("is for the people paired to Chips, not a harness", async () => {
    const response = await ws.gateway.app.fetch(
      new Request(`${BASE}/v1/software`, { method: "GET", headers: ws.scout.headers }),
    );
    expect(response.status).toBe(403);
  });
});

describe("the software registry", () => {
  const at = (minutes: number) => new Date(Date.UTC(2026, 10, 13, 8, minutes)).toISOString();
  const heard = (version: string, minutes: number) =>
    ws.gateway.deps.software?.heard({
      workspaceId: ws.workspaceId,
      subjectId: ws.scout.participantId,
      kind: "harness",
      participantId: ws.scout.participantId,
      name: "chips-acp",
      version,
      at: at(minutes),
    });
  const row = async () => (await ws.gateway.deps.software?.list(ws.workspaceId))?.[0];

  it("writes a hello with nothing new only once an hour, and says when the version changed", async () => {
    await heard("1.0.24", 0);
    await heard("1.0.24", 30);
    expect(await row()).toMatchObject({ version: "1.0.24", seenAt: at(0), changedAt: at(0) });

    await heard("1.0.24", 61);
    expect(await row()).toMatchObject({ seenAt: at(61), changedAt: at(0) });

    await heard("1.0.25", 62);
    expect(await row()).toMatchObject({ version: "1.0.25", seenAt: at(62), changedAt: at(62) });
  });
});
