/**
 * A person locks a room's changes, or lets them go (ADR 0156), through
 * `POST /v1/spaces/:id/lock`: in the log as `space.lock_set`, said once, kept by a rebuild, and
 * refused to a harness, a guest, somebody not in the room and a body that does not say. While it
 * holds, no person renames, archives or erases the room, though one archived comes back; and a
 * harness's own rename or close of a room it opened still lands.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Principal } from "../../../application/index.js";
import {
  createTestWorkspace,
  type TestPerson,
  type TestWorkspace,
} from "../../../testing/workspace.js";

let ws: TestWorkspace;

beforeEach(async () => {
  ws = await createTestWorkspace();
});

afterEach(async () => {
  await ws.close();
});

async function call(
  method: string,
  path: string,
  headers: Readonly<Record<string, string>>,
  body?: unknown,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const raw = body === undefined ? undefined : JSON.stringify(body);
  const response = await ws.gateway.app.fetch(
    new Request(`http://chips.local${path}`, {
      method,
      headers: { "content-type": "application/json", ...headers },
      ...(raw === undefined ? {} : { body: raw }),
    }),
  );
  const text = await response.text();
  return { status: response.status, json: text === "" ? {} : JSON.parse(text) };
}

const lock = (who: TestPerson, body: unknown, space = ws.spaceId) => {
  const path = `/v1/spaces/${space}/lock`;
  return call("POST", path, who.sign("POST", path, JSON.stringify(body)), body);
};

const erase = (who: TestPerson, spaceId: string) => {
  const path = `/v1/spaces/${spaceId}`;
  return call("DELETE", path, who.sign("DELETE", path, ""));
};

const space = (spaceId = ws.spaceId) => ws.gateway.deps.readModels.space(ws.workspaceId, spaceId);

async function logged(): Promise<Record<string, unknown>[]> {
  const page = await ws.gateway.deps.store.since(ws.workspaceId, 0, 1000);
  return page.events
    .filter((event) => event.type === "space.lock_set")
    .map((event) => ({ locked: event.payload["locked"], by: event.actor.id }));
}

function person(who: TestPerson, name: string): Principal {
  return {
    kind: "person",
    participantId: who.participantId,
    workspaceId: ws.workspaceId,
    displayName: name,
    via: "device_key",
    deviceId: who.deviceId,
    // Their standing, as the authenticator reads it: Arjun owns the workspace, Dana is a member.
    role: who.participantId === ws.arjun.participantId ? "owner" : "member",
  };
}

/** A change to the room, sent as Arjun sends one from his phone. */
function change(fields: Record<string, unknown>, spaceId = ws.spaceId) {
  return ws.gateway.deps.submitEvent({
    event: {
      type: "space.updated",
      space_id: spaceId,
      idempotency_key: `change-${ws.ids.next("event")}`,
      ...fields,
    },
    principal: person(ws.arjun, "Arjun"),
  });
}

/** Somebody in the room as its guest, though a member of the workspace. */
async function roomGuest(): Promise<TestPerson> {
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
    principal: person(ws.arjun, "Arjun"),
  });
  if (!added.ok) throw new Error(`refused: ${added.error.message}`);
  return gus;
}

describe("POST /v1/spaces/:id/lock", () => {
  it("locks a room's changes once, and lets them go, each in the log as the person's", async () => {
    expect(await lock(ws.dana, { locked: true })).toEqual({
      status: 200,
      json: { space_id: ws.spaceId, locked: true, changed: true },
    });
    expect((await space())?.locked).toBe(true);
    expect((await lock(ws.arjun, { locked: true })).json["changed"]).toBe(false);
    expect((await lock(ws.arjun, { locked: false })).json).toEqual({
      space_id: ws.spaceId,
      locked: false,
      changed: true,
    });
    expect((await space())?.locked).toBe(false);
    expect((await lock(ws.arjun, { locked: false })).json["changed"]).toBe(false);
    expect(await logged()).toEqual([
      { locked: true, by: ws.dana.participantId },
      { locked: false, by: ws.arjun.participantId },
    ]);
  });

  it("is kept by a rebuild of the projections", async () => {
    await lock(ws.arjun, { locked: true });
    await ws.gateway.deps.store.rebuild(ws.workspaceId);
    expect((await space())?.locked).toBe(true);
  });

  it("is refused to a harness, a guest, a room the person is not in, and a body that does not say", async () => {
    const path = `/v1/spaces/${ws.spaceId}/lock`;
    expect((await call("POST", path, ws.scout.headers, { locked: true })).status).toBe(403);
    const vendor = await ws.addPerson("Vendor", "guest");
    expect((await lock(vendor, { locked: true })).status).toBe(403);
    expect((await lock(await roomGuest(), { locked: true })).status).toBe(403);
    expect((await lock(ws.arjun, { locked: true }, ws.ids.next("space"))).status).toBe(404);
    expect((await lock(ws.arjun, { locked: "yes" })).status).toBe(422);
    expect((await lock(ws.arjun, {})).status).toBe(422);
    expect(await logged()).toEqual([]);
    expect((await space())?.locked).toBe(false);
  });
});

describe("what a lock holds (ADR 0156)", () => {
  it("refuses a person's rename, archive and erase, and lets them through once it is let go", async () => {
    await lock(ws.arjun, { locked: true });
    expect(await change({ title: "Something else" })).toMatchObject({
      ok: false,
      error: { kind: "invalid", message: expect.stringContaining("locked") },
    });
    expect(await change({ state: "closed" })).toMatchObject({
      ok: false,
      error: { kind: "invalid" },
    });
    const erased = await erase(ws.arjun, ws.spaceId);
    expect(erased.status).toBe(422);
    expect((erased.json["error"] as { message: string }).message).toMatch(/locked/);
    expect(await space()).toMatchObject({ title: "PO-4471", state: "open", locked: true });

    await lock(ws.arjun, { locked: false });
    expect(await change({ title: "Something else" })).toMatchObject({ ok: true });
    expect(await change({ state: "closed" })).toMatchObject({ ok: true });
    expect(await space()).toMatchObject({ title: "Something else", state: "closed" });
  });

  it("still brings an archived room back", async () => {
    expect(await change({ state: "closed" })).toMatchObject({ ok: true });
    await lock(ws.arjun, { locked: true });
    expect(await change({ state: "open" })).toMatchObject({ ok: true });
    expect(await space()).toMatchObject({ state: "open", locked: true });
  });

  it("leaves a harness's own rename and close of a room it opened to land", async () => {
    const harness = (path: string, body: Record<string, unknown>, key: string) =>
      call(
        "POST",
        `/v1/harnesses/${ws.scout.participantId}/${path}`,
        { ...ws.scout.headers, "idempotency-key": key },
        body,
      );
    const opened = (await harness("spaces", { key: "po-4472", title: "PO-4472" }, "open")).json;
    const spaceId = String(opened["space_id"]);
    expect((await lock(ws.arjun, { locked: true }, spaceId)).json).toMatchObject({ changed: true });

    expect(await change({ title: "Mine now" }, spaceId)).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining("locked") },
    });
    const renamed = await harness(
      "events",
      { type: "space.updated", space_id: spaceId, title: "PO-4472 · Northwind" },
      "rename",
    );
    expect(renamed.status).toBeLessThan(300);
    const closed = await harness(
      "events",
      { type: "space.updated", space_id: spaceId, state: "closed" },
      "close",
    );
    expect(closed.status).toBeLessThan(300);
    expect(await space(spaceId)).toMatchObject({
      title: "PO-4472 · Northwind",
      state: "closed",
      locked: true,
    });
  });
});
