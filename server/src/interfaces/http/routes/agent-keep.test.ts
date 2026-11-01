/**
 * A person archives, unarchives or deletes an agent (ADR 0095), through `PUT /v1/agents/:id/state`
 * and `DELETE /v1/agents/:id`: rule 9 done by a person, the room archived or erased with its one
 * agent, and a deleted agent that stays deleted — its key refused, its rooms closed to it, and
 * nothing more said as it — but for the agent Chips makes for a harness itself.
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
  await ws.gateway.deps.upgradeAgents.apply(ws.workspaceId);
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

const asPerson = (who: TestPerson, method: string, path: string, body?: unknown) =>
  call(method, path, who.sign(method, path, body === undefined ? "" : JSON.stringify(body)), body);

const archive = (who: TestPerson, agentId: string, state: "archived" | "active" = "archived") =>
  asPerson(who, "PUT", `/v1/agents/${agentId}/state`, { state });

const remove = (who: TestPerson, agentId: string, body?: { delete_room: true }) =>
  asPerson(who, "DELETE", `/v1/agents/${agentId}`, body);

/** Scout registers an agent by key, as a harness does: free until somebody adds it. */
async function register(key = "tree", name = "Tree") {
  return call("POST", `/v1/harnesses/${ws.scout.participantId}/agents`, ws.scout.headers, {
    key,
    name,
  });
}

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

async function ok(event: Record<string, unknown>) {
  const result = await ws.gateway.deps.submitEvent({
    event: { idempotency_key: `k-${ws.ids.next("event")}`, ...event },
    principal: arjun(),
  });
  if (!result.ok) throw new Error(`refused: ${result.error.kind}: ${result.error.message}`);
}

/** A room of Arjun's with the agent in it, alone. */
async function roomWith(agentId: string, title = "Tree's room"): Promise<string> {
  const spaceId = ws.ids.next("space");
  await ok({ type: "space.created", space_id: spaceId, kind: "group", title });
  await ok({
    type: "membership.added",
    space_id: spaceId,
    participant_id: agentId,
    participant_kind: "agent",
    role: "member",
  });
  return spaceId;
}

const space = (spaceId: string) => ws.gateway.deps.readModels.space(ws.workspaceId, spaceId);
const agent = (agentId: string) => ws.gateway.deps.readModels.participant(ws.workspaceId, agentId);
const roomOf = (agentId: string) => ws.gateway.deps.readModels.agentRoom(ws.workspaceId, agentId);
const head = () => ws.gateway.deps.store.head(ws.workspaceId);
const since = async (seq: number) =>
  (await ws.gateway.deps.store.since(ws.workspaceId, seq, 1000)).events;

async function tree(): Promise<string> {
  return String((await register()).json["agent_id"]);
}

describe("archiving an agent (points 1 and 2)", () => {
  it("is rule 9 done by a person: out of its room, which is archived with it, said as theirs", async () => {
    const id = await tree();
    const own = await roomWith(id);
    const before = await head();
    const answer = await archive(ws.arjun, id);
    expect(answer).toMatchObject({ status: 200, json: { agent_id: id, state: "archived" } });
    expect(await agent(id)).toMatchObject({ state: "archived" });
    expect(await roomOf(id)).toBeUndefined();
    expect((await space(own))?.state).toBe("closed");
    const events = await since(before);
    expect(events.find((event) => event.type === "agent.updated")?.actor).toMatchObject({
      kind: "person",
      id: ws.arjun.participantId,
    });
    expect(events.find((event) => event.type === "agent.released")).toMatchObject({
      space_id: own,
      payload: { agent_id: id, reason: "agent_archived", by: ws.arjun.participantId },
    });
    expect(events.find((event) => event.type === "space.updated")?.actor.id).toBe(
      ws.arjun.participantId,
    );
  });

  it("leaves a room it shares open; unarchived, it goes back in", async () => {
    const id = await tree();
    await ok({
      type: "membership.added",
      space_id: ws.spaceId,
      participant_id: id,
      participant_kind: "agent",
      role: "member",
    });
    await archive(ws.arjun, id);
    expect(await roomOf(id)).toBeUndefined();
    expect((await space(ws.spaceId))?.state).toBe("open");
    await archive(ws.arjun, id, "active");
    expect(await roomOf(id)).toBe(ws.spaceId);
  });

  it("unarchived, brings back the room its archive closed, with the agent in it", async () => {
    const id = await tree();
    const own = await roomWith(id);
    await archive(ws.arjun, id);
    const answer = await archive(ws.arjun, id, "active");
    expect(answer.json).toMatchObject({ state: "active" });
    expect((await space(own))?.state).toBe("open");
    expect(await roomOf(id)).toBe(own);
  });

  it("is the harness's owner's or an admin's, never a member's, a guest's or the Main agent's", async () => {
    const id = await tree();
    expect((await archive(ws.dana, id)).status).toBe(403);
    const guest = await ws.addPerson("Gus", "guest");
    expect((await archive(guest, id)).status).toBe(403);
    const admin = await ws.addPerson("Ada", "admin");
    expect((await archive(admin, id)).status).toBe(200);
    // The same state again changes nothing, and is no error.
    expect((await archive(admin, id)).status).toBe(200);
    const lead = await call(
      "POST",
      `/v1/harnesses/${ws.scout.participantId}/agents`,
      ws.scout.headers,
      { key: "lead", name: "Lead", lead: true },
    );
    const answer = await archive(ws.arjun, String(lead.json["agent_id"]));
    expect(answer.status).toBe(422);
  });
});

describe("deleting an agent (points 4 and 5)", () => {
  it("takes it out of a room it shares, which stays open, and says so as theirs", async () => {
    const id = await tree();
    await ok({
      type: "membership.added",
      space_id: ws.spaceId,
      participant_id: id,
      participant_kind: "agent",
      role: "member",
    });
    const before = await head();
    const answer = await remove(ws.arjun, id);
    expect(answer).toMatchObject({ status: 200, json: { agent_id: id, room: "open" } });
    expect((await space(ws.spaceId))?.state).toBe("open");
    const events = await since(before);
    expect(events.find((event) => event.type === "agent.released")).toMatchObject({
      space_id: ws.spaceId,
      payload: { agent_id: id, reason: "agent_deleted", by: ws.arjun.participantId },
    });
    expect(events.find((event) => event.type === "agent.deleted")).toMatchObject({
      actor: { kind: "person", id: ws.arjun.participantId },
      payload: {
        agent_id: id,
        harness_id: ws.scout.participantId,
        key: "tree",
        name: "Tree",
        by: ws.arjun.participantId,
      },
    });
    expect((await agent(id))?.removed_at).not.toBeNull();
    const listed = await ws.gateway.deps.readModels.agentsOf(
      ws.workspaceId,
      ws.scout.participantId,
    );
    expect(listed.map((each) => each.agent_id)).not.toContain(id);
  });

  it("archives the room it was the one agent in, or erases it when asked", async () => {
    const kept = await tree();
    const keptRoom = await roomWith(kept);
    expect((await remove(ws.arjun, kept)).json).toMatchObject({ room: "archived" });
    expect((await space(keptRoom))?.state).toBe("closed");

    const gone = String((await register("bush", "Bush")).json["agent_id"]);
    const goneRoom = await roomWith(gone, "Bush's room");
    const answer = await remove(ws.arjun, gone, { delete_room: true });
    expect(answer.json).toMatchObject({ room: "erased", erased: [goneRoom] });
    expect(await space(goneRoom)).toBeUndefined();
    expect((await agent(gone))?.removed_at).not.toBeNull();
  });

  it("erases a room only with its one agent, and only for somebody who may erase it", async () => {
    const id = await tree();
    await ok({
      type: "membership.added",
      space_id: ws.spaceId,
      participant_id: id,
      participant_kind: "agent",
      role: "member",
    });
    // The demo room holds Scout's agent too: not this agent's alone to take with it.
    expect((await remove(ws.arjun, id, { delete_room: true })).status).toBe(422);
    expect((await agent(id))?.removed_at).toBeNull();
    expect(await roomOf(id)).toBe(ws.spaceId);
  });

  it("is refused whole, before anything changes, when its room's changes are locked (ADR 0156)", async () => {
    const id = await tree();
    const own = await roomWith(id);
    const locked = await asPerson(ws.arjun, "POST", `/v1/spaces/${own}/lock`, { locked: true });
    expect(locked.json).toMatchObject({ locked: true, changed: true });
    const before = await head();
    const answer = await remove(ws.arjun, id, { delete_room: true });
    expect(answer.status).toBe(422);
    expect((answer.json["error"] as { message: string }).message).toMatch(/locked/);
    expect(await head()).toBe(before);
    expect((await agent(id))?.removed_at).toBeNull();
    expect(await roomOf(id)).toBe(own);
    expect(await space(own)).toMatchObject({ state: "open", locked: true });
  });

  it("leaves the room it was the one agent in open when its changes are locked, archived or deleted (ADR 0156)", async () => {
    const archived = await tree();
    const archivedRoom = await roomWith(archived);
    await asPerson(ws.arjun, "POST", `/v1/spaces/${archivedRoom}/lock`, { locked: true });
    expect((await archive(ws.arjun, archived)).status).toBe(200);
    expect(await roomOf(archived)).toBeUndefined();
    expect(await space(archivedRoom)).toMatchObject({ state: "open", locked: true });

    const deleted = String((await register("bush", "Bush")).json["agent_id"]);
    const deletedRoom = await roomWith(deleted, "Bush's room");
    await asPerson(ws.arjun, "POST", `/v1/spaces/${deletedRoom}/lock`, { locked: true });
    expect((await remove(ws.arjun, deleted)).json).toMatchObject({ room: "open" });
    expect(await space(deletedRoom)).toMatchObject({ state: "open", locked: true });
  });

  it("drops what it was holding for its next room", async () => {
    const id = await tree();
    const own = await roomWith(id);
    await ok({ type: "membership.removed", space_id: own, participant_id: id });
    // In no room, after one: what it says is held for the next (ADR 0087, rule 6).
    const said = await ws.gateway.deps.submitEvent({
      event: {
        type: "message.post",
        idempotency_key: "held-1",
        actor: { kind: "agent", id },
        text: "Done.",
      },
      principal: {
        kind: "harness",
        participantId: ws.scout.participantId,
        workspaceId: ws.workspaceId,
        displayName: "Scout",
        via: "harness_token",
        ownerId: ws.arjun.participantId,
      },
    });
    expect(said).toMatchObject({ ok: true, value: { event: { type: "message.held" } } });
    expect(await ws.gateway.deps.readModels.heldFor(ws.workspaceId, id)).toHaveLength(1);
    await remove(ws.arjun, id);
    expect(await ws.gateway.deps.readModels.heldFor(ws.workspaceId, id)).toEqual([]);
  });

  it("stays deleted: its key refused, no room takes it, nothing said as it, no new name", async () => {
    const id = await tree();
    await remove(ws.arjun, id);
    const again = await register();
    expect(again.status).toBe(403);
    expect(String((again.json["error"] as { message: string }).message)).toMatch(/deleted/);
    const added = await ws.gateway.deps.submitEvent({
      event: {
        type: "membership.added",
        idempotency_key: "add-deleted",
        space_id: ws.spaceId,
        participant_id: id,
        participant_kind: "agent",
        role: "member",
      },
      principal: arjun(),
    });
    expect(added).toMatchObject({ ok: false, error: { kind: "agent_deleted" } });
    const renamed = await asPerson(ws.arjun, "PUT", `/v1/agents/${id}/name`, { name: "Twig" });
    expect(renamed.status).toBe(404);
    expect((await archive(ws.arjun, id)).status).toBe(404);
    expect((await remove(ws.arjun, id)).status).toBe(404);
  });

  it("is made afresh, under a new id, when it was the one Chips made for the harness itself", async () => {
    const defaultAgent = () =>
      ws.gateway.deps.readModels.agentByKey(
        ws.workspaceId,
        ws.scout.participantId,
        ws.scout.participantId,
      );
    const before = await defaultAgent();
    if (before === undefined) throw new Error("Scout has no default agent");
    await remove(ws.arjun, before.agent_id);
    expect(await defaultAgent()).toBeUndefined();
    // A person adds Scout itself to a room: Chips puts its default agent there, a new one.
    const other = ws.ids.next("space");
    await ok({ type: "space.created", space_id: other, kind: "group", title: "Sofas" });
    await ok({
      type: "membership.added",
      space_id: other,
      participant_id: ws.scout.participantId,
      participant_kind: "harness",
      role: "member",
    });
    const after = await defaultAgent();
    expect(after?.agent_id).toBeDefined();
    expect(after?.agent_id).not.toBe(before.agent_id);
    expect(after?.room).toBe(other);
  });
});

describe("locking an agent's changes (ADR 0199)", () => {
  const lock = (who: TestPerson, agentId: string, locked = true) =>
    asPerson(who, "POST", `/v1/agents/${agentId}/lock`, { locked });
  const rename = (who: TestPerson, agentId: string, name: string) =>
    asPerson(who, "PUT", `/v1/agents/${agentId}/name`, { name });

  it("is said once by whoever may archive or delete it, kept in the directory, and let go again", async () => {
    const id = await tree();
    const before = await head();
    expect(await lock(ws.arjun, id)).toMatchObject({
      status: 200,
      json: { agent_id: id, locked: true, changed: true },
    });
    // The same again changes nothing, and is no error.
    expect((await lock(ws.arjun, id)).json).toMatchObject({ locked: true, changed: false });
    const said = (await since(before)).filter((event) => event.type === "agent.lock_set");
    expect(said).toHaveLength(1);
    expect(said[0]).toMatchObject({
      space_id: null,
      actor: { kind: "person", id: ws.arjun.participantId },
      payload: { agent_id: id, locked: true },
    });
    expect(await agent(id)).toMatchObject({ locked: true });
    const path = "/v1/participants";
    const rowFor = async (who: TestPerson) => {
      const read = await call("GET", path, who.sign("GET", path, ""));
      return (read.json["participants"] as Record<string, unknown>[]).find(
        (each) => each["id"] === id,
      );
    };
    expect(await rowFor(ws.arjun)).toMatchObject({ locked: true });
    // Dana, a member in no room with it, is not told of it at all (ADR 0034's addendum).
    expect(await rowFor(ws.dana)).toBeUndefined();
    // A rebuild puts it back from the log.
    await ws.gateway.deps.store.rebuild(ws.workspaceId);
    expect(await agent(id)).toMatchObject({ locked: true });
    expect((await lock(ws.arjun, id, false)).json).toMatchObject({ locked: false, changed: true });
    expect(await agent(id)).toMatchObject({ locked: false });
  });

  it("is the harness's owner's or an admin's, never a member's, a guest's, a harness's or the Main agent's", async () => {
    const id = await tree();
    expect((await lock(ws.dana, id)).status).toBe(403);
    const guest = await ws.addPerson("Gus", "guest");
    expect((await lock(guest, id)).status).toBe(403);
    const admin = await ws.addPerson("Ada", "admin");
    expect((await lock(admin, id)).status).toBe(200);
    const path = `/v1/agents/${id}/lock`;
    expect((await call("POST", path, ws.scout.headers, { locked: false })).status).toBe(403);
    const lead = await call(
      "POST",
      `/v1/harnesses/${ws.scout.participantId}/agents`,
      ws.scout.headers,
      { key: "lead", name: "Lead", lead: true },
    );
    expect((await lock(ws.arjun, String(lead.json["agent_id"]))).status).toBe(422);
    expect((await asPerson(ws.arjun, "POST", path, { locked: "yes" })).status).toBe(422);
  });

  it("holds a person's rename, archive and delete, before anything changes, but not an unarchive", async () => {
    const id = await tree();
    const own = await roomWith(id);
    await lock(ws.arjun, id);
    const before = await head();
    for (const answer of [
      await rename(ws.arjun, id, "Oak"),
      await archive(ws.arjun, id),
      await remove(ws.arjun, id),
      await remove(ws.arjun, id, { delete_room: true }),
    ]) {
      expect(answer.status).toBe(422);
      expect((answer.json["error"] as { message: string }).message).toBe(
        "Tree's changes are locked: unlock them on its card first.",
      );
    }
    expect(await head()).toBe(before);
    expect(await agent(id)).toMatchObject({
      display_name: "Tree",
      state: "active",
      removed_at: null,
    });
    expect(await roomOf(id)).toBe(own);
    // Let go, each lands again.
    await lock(ws.arjun, id, false);
    expect((await rename(ws.arjun, id, "Oak")).status).toBe(200);
    expect((await archive(ws.arjun, id)).status).toBe(200);
    // Locked while archived, it is still brought back: that only puts it back.
    await lock(ws.arjun, id);
    expect((await archive(ws.arjun, id, "active")).status).toBe(200);
    expect(await agent(id)).toMatchObject({ state: "active", locked: true });
  });

  it("is not deleted with its room: the erase that asks for it is refused whole", async () => {
    const id = await tree();
    const own = await roomWith(id);
    await lock(ws.arjun, id);
    const before = await head();
    const path = `/v1/spaces/${own}`;
    const asked = await asPerson(ws.arjun, "DELETE", path, { delete_agent: true });
    expect(asked.status).toBe(422);
    expect(await head()).toBe(before);
    expect(await space(own)).toMatchObject({ state: "open" });
    // Without it, the room goes and the agent is freed, as any agent is.
    expect((await asPerson(ws.arjun, "DELETE", path)).status).toBe(200);
    expect(await agent(id)).toMatchObject({ removed_at: null, locked: true });
    expect(await roomOf(id)).toBeUndefined();
  });

  it("is not sent to its harness when it reads the log", async () => {
    const id = await tree();
    await lock(ws.arjun, id);
    const events = "/v1/events?since=0";
    const read = await call("GET", events, ws.scout.headers);
    expect((read.json["events"] as { type: string }[]).map((each) => each.type)).not.toContain(
      "agent.lock_set",
    );
    const types = async (who: TestPerson) =>
      (
        (await call("GET", events, who.sign("GET", events, ""))).json["events"] as {
          type: string;
        }[]
      ).map((each) => each.type);
    expect(await types(ws.arjun)).toContain("agent.lock_set");
    // A member reads a lock the next time they read who is who (ADR 0034's addendum).
    expect(await types(ws.dana)).not.toContain("agent.lock_set");
  });
});
