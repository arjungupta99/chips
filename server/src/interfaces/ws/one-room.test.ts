/**
 * One room per agent (ADR 0087, Phase 4), end to end through the door and the socket: an agent
 * is in one room at a time, archiving a room stops its work and frees its agents, unarchiving
 * takes back the ones still free, an agent archived in its harness leaves its room, and what a
 * free agent says is held until it is in one again.
 */

import { HARNESS_CAPABILITIES } from "@chipschat/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type Principal, reacting } from "../../application/index.js";
import { createSqliteEventStore } from "../../infrastructure/store/sqlite-event-store.js";
import { createTestWorkspace, type TestWorkspace } from "../../testing/workspace.js";
import { Session } from "./session.js";

let ws: TestWorkspace;

beforeEach(async () => {
  ws = await createTestWorkspace();
  await ws.gateway.deps.upgradeAgents.apply(ws.workspaceId);
});

afterEach(async () => {
  await ws.close();
});

function harness(id: string, name: string): Principal {
  return {
    kind: "harness",
    participantId: id,
    workspaceId: ws.workspaceId,
    displayName: name,
    via: "harness_token",
    ownerId: ws.arjun.participantId,
  };
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

const scout = () => harness(ws.scout.participantId, "Scout");

async function submit(principal: Principal, event: Record<string, unknown>) {
  return ws.gateway.deps.submitEvent({
    event: { idempotency_key: `k-${ws.ids.next("event")}`, ...event },
    principal,
  });
}

async function ok(principal: Principal, event: Record<string, unknown>) {
  const result = await submit(principal, event);
  if (!result.ok) throw new Error(`refused: ${result.error.kind}: ${result.error.message}`);
  return result.value.event;
}

async function asHarness(
  headers: Readonly<Record<string, string>>,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const response = await ws.gateway.app.fetch(
    new Request(`http://chips.local${path}`, {
      method,
      headers: { "content-type": "application/json", ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  );
  return { status: response.status, json: (await response.json()) as Record<string, unknown> };
}

/** Scout's default agent, which the upgrade put in its place in the room. */
async function scoutsAgent(): Promise<string> {
  const agent = await ws.gateway.deps.readModels.agentByKey(
    ws.workspaceId,
    ws.scout.participantId,
    ws.scout.participantId,
  );
  if (agent === undefined) throw new Error("Scout has no agent");
  return agent.agent_id;
}

/** A group room of Arjun's, with nobody else in it. */
async function room(title = "Another space"): Promise<string> {
  const id = ws.ids.next("space");
  await ok(arjun(), { type: "space.created", space_id: id, kind: "group", title });
  return id;
}

function add(spaceId: string, participantId: string, kind: "agent" | "harness" | "person") {
  return submit(arjun(), {
    type: "membership.added",
    space_id: spaceId,
    participant_id: participantId,
    participant_kind: kind,
    role: "member",
  });
}

/** The log since a seq, as types, or the events of one type. */
async function since(seq: number) {
  const page = await ws.gateway.deps.store.since(ws.workspaceId, seq, 1000);
  return page.events;
}

const head = () => ws.gateway.deps.store.head(ws.workspaceId);

async function agentOf(agentId: string) {
  const agents = await ws.gateway.deps.readModels.agentsOf(ws.workspaceId, ws.scout.participantId);
  const found = agents.find((agent) => agent.agent_id === agentId);
  if (found === undefined) throw new Error("no such agent");
  return found;
}

/** A second agent of Scout's, registered by its own key: free until somebody adds it. */
async function second(key = "tree", name = "Tree"): Promise<string> {
  const made = await asHarness(
    ws.scout.headers,
    "POST",
    `/v1/harnesses/${ws.scout.participantId}/agents`,
    { key, name },
  );
  return String(made.json["agent_id"]);
}

describe("an agent is in one room at a time (rule 1)", () => {
  it("is refused a second room, with where it is", async () => {
    const other = await room();
    const refused = await add(other, await scoutsAgent(), "agent");
    expect(refused).toMatchObject({
      ok: false,
      error: { kind: "agent_elsewhere", space_id: ws.spaceId },
    });
    // Its harness added is its default agent, which is elsewhere too.
    expect(await add(other, ws.scout.participantId, "harness")).toMatchObject({
      ok: false,
      error: { kind: "agent_elsewhere" },
    });
  });

  it("says where an agent is, to everyone, when it joins a room and when it leaves", async () => {
    const agent = await second();
    const other = await room();
    const before = await head();
    await ok(arjun(), {
      type: "membership.added",
      space_id: other,
      participant_id: agent,
      participant_kind: "agent",
      role: "member",
    });
    await ok(arjun(), {
      type: "membership.removed",
      space_id: other,
      participant_id: agent,
      removed_by: ws.arjun.participantId,
    });
    const events = await since(before);
    const attached = events.find((event) => event.type === "agent.attached");
    const released = events.find((event) => event.type === "agent.released");
    expect(attached).toMatchObject({
      space_id: other,
      payload: { agent_id: agent, by: ws.arjun.participantId },
    });
    expect(released).toMatchObject({
      space_id: other,
      payload: { agent_id: agent, reason: "removed" },
    });
    // The agent's harness hears both, out of the room as it is by then; somebody in no room of
    // it hears neither.
    const heard = await ws.gateway.deps.store.since(ws.workspaceId, before, 1000, {
      spaces: [],
      participantId: ws.scout.participantId,
      alsoIs: [agent],
    });
    expect(heard.events.map((event) => event.type)).toEqual(
      expect.arrayContaining(["agent.attached", "agent.released"]),
    );
    const dana = await ws.gateway.deps.store.since(ws.workspaceId, before, 1000, {
      spaces: [],
      participantId: ws.dana.participantId,
    });
    expect(dana.events.map((event) => event.type)).not.toContain("agent.attached");
    expect((await agentOf(agent)).room).toBeNull();
  });

  it("keeps the Main agent in its Main room, and every other agent out of it", async () => {
    const lead = await asHarness(
      ws.scout.headers,
      "POST",
      `/v1/harnesses/${ws.scout.participantId}/agents`,
      { key: "lead", name: "Lead", lead: true },
    );
    const leadId = String(lead.json["agent_id"]);
    const other = await room();
    expect(await add(other, leadId, "agent")).toMatchObject({
      ok: false,
      error: { kind: "lead_room" },
    });
    // Scout names the room it is in its home: a Main room takes no other agent.
    const home = ws.ids.next("space");
    await ok(arjun(), { type: "space.created", space_id: home, kind: "direct" });
    await ok(arjun(), {
      type: "membership.added",
      space_id: home,
      participant_id: ws.scout.participantId,
      participant_kind: "harness",
      role: "member",
    }).catch(() => undefined);
    await ws.db.updateTable("spaces").set({ home: 1 }).where("id", "=", home).execute();
    expect(await add(home, await second("free"), "agent")).toMatchObject({
      ok: false,
      error: { kind: "lead_room" },
    });
  });

  it("does not add an agent archived in its harness", async () => {
    const agent = await second();
    await asHarness(ws.scout.headers, "POST", `/v1/harnesses/${ws.scout.participantId}/agents`, {
      key: "tree",
      name: "Tree",
      state: "archived",
    });
    expect(await add(await room(), agent, "agent")).toMatchObject({
      ok: false,
      error: { kind: "agent_archived" },
    });
  });
});

describe("archiving a room stops its work and frees its agents (rules 3 and 4)", () => {
  async function runGoing(): Promise<string> {
    const runId = ws.ids.next("run");
    await ok(scout(), {
      type: "run.started",
      space_id: ws.spaceId,
      run_id: runId,
      goal: "Check the PO.",
    });
    return runId;
  }

  const archive = (state: "open" | "closed") =>
    ok(arjun(), { type: "space.updated", space_id: ws.spaceId, state });

  it("cancels the run going, releases the agent, and takes it back when unarchived", async () => {
    const runId = await runGoing();
    const agent = await scoutsAgent();
    const before = await head();
    await archive("closed");
    const events = await since(before);
    const types = events.map((event) => event.type);
    expect(types.indexOf("run.cancel")).toBeLessThan(types.indexOf("membership.removed"));
    expect(events.find((event) => event.type === "run.cancel")).toMatchObject({
      run_id: runId,
      payload: { by: ws.arjun.participantId, reason: "The space was archived." },
    });
    expect(events.find((event) => event.type === "agent.released")?.payload).toMatchObject({
      agent_id: agent,
      space_id: ws.spaceId,
      reason: "archived",
    });
    expect(await agentOf(agent)).toMatchObject({ room: null, released_from: ws.spaceId });
    expect((await ws.gateway.deps.readModels.run(ws.workspaceId, runId))?.state).toBe("cancelled");

    await archive("open");
    expect(await agentOf(agent)).toMatchObject({ room: ws.spaceId, released_from: null });
  });

  it("leaves an agent that went elsewhere where it is", async () => {
    const agent = await scoutsAgent();
    await archive("closed");
    const other = await room();
    await ok(arjun(), {
      type: "membership.added",
      space_id: other,
      participant_id: agent,
      participant_kind: "agent",
      role: "member",
    });
    await archive("open");
    expect((await agentOf(agent)).room).toBe(other);
  });
});

describe("an agent archived in its harness (rule 9)", () => {
  const state = (value: "active" | "archived") =>
    asHarness(ws.scout.headers, "POST", `/v1/harnesses/${ws.scout.participantId}/agents`, {
      key: "tree",
      name: "Tree",
      state: value,
    });

  async function treeIn(spaceId: string): Promise<string> {
    const tree = await second();
    await ok(arjun(), {
      type: "membership.added",
      space_id: spaceId,
      participant_id: tree,
      participant_kind: "agent",
      role: "member",
    });
    return tree;
  }

  it("leaves its room, which is archived when it was the only agent; restored, both come back", async () => {
    const own = await room("Tree's space");
    const tree = await treeIn(own);
    const space = () => ws.gateway.deps.readModels.space(ws.workspaceId, own);
    await state("archived");
    expect(await agentOf(tree)).toMatchObject({ room: null, released_from: own });
    expect((await space())?.state).toBe("closed");
    await state("active");
    expect((await space())?.state).toBe("open");
    expect((await agentOf(tree)).room).toBe(own);
  });

  it("leaves a room it shares with another agent open", async () => {
    const tree = await treeIn(ws.spaceId);
    await state("archived");
    expect((await agentOf(tree)).room).toBeNull();
    expect((await ws.gateway.deps.readModels.space(ws.workspaceId, ws.spaceId))?.state).toBe(
      "open",
    );
    expect((await agentOf(await scoutsAgent())).room).toBe(ws.spaceId);
  });

  it("restored, leaves a room a person archived as they left it, and comes back at its unarchive (SEC-48)", async () => {
    const own = await room("Tree's space");
    const tree = await treeIn(own);
    const space = () => ws.gateway.deps.readModels.space(ws.workspaceId, own);
    await ok(arjun(), { type: "space.updated", space_id: own, state: "closed" });
    await state("archived");
    await state("active");
    expect((await space())?.state).toBe("closed");
    expect(await agentOf(tree)).toMatchObject({ room: null, released_from: own });
    await ok(arjun(), { type: "space.updated", space_id: own, state: "open" });
    expect((await agentOf(tree)).room).toBe(own);
  });

  it("restored, reopens a room its harness archived, as that harness may (SEC-48)", async () => {
    await declare(ws.scout.participantId, [HARNESS_CAPABILITIES.newSpaces]);
    const own = ws.ids.next("space");
    await ok(arjun(), {
      type: "space.created",
      space_id: own,
      kind: "direct",
      asked_of: ws.scout.participantId,
    });
    await add(own, ws.scout.participantId, "harness");
    const path = `/v1/harnesses/${ws.scout.participantId}/spaces`;
    await asHarness(ws.scout.headers, "POST", path, { key: "tree", space_id: own });
    const tree = await ws.gateway.deps.readModels.agentByKey(
      ws.workspaceId,
      ws.scout.participantId,
      "tree",
    );
    expect(tree?.room).toBe(own);
    // Before Phase 4 a harness archived the room of whatever it archived, as Jacobian did.
    await ok(scout(), { type: "space.updated", space_id: own, state: "closed" });
    await state("archived");
    await state("active");
    expect((await ws.gateway.deps.readModels.space(ws.workspaceId, own))?.state).toBe("open");
    expect((await agentOf(tree?.agent_id ?? "")).room).toBe(own);
  });

  it("restored, does not reopen its room while a guest of it is in another open room (SEC-48, JR-24)", async () => {
    const own = await room("Tree's space");
    const tree = await treeIn(own);
    const vendor = await ws.addPerson("Vendor", "guest");
    expect((await add(own, vendor.participantId, "person")).ok).toBe(true);
    await state("archived");
    // The trip ends with the room: the guest is in no open room, and is seated in another.
    const other = await room("Foodie");
    const seated = await add(other, vendor.participantId, "person");
    expect(seated.ok, JSON.stringify(seated)).toBe(true);
    await state("active");
    expect((await ws.gateway.deps.readModels.space(ws.workspaceId, own))?.state).toBe("closed");
    expect(
      await ws.gateway.deps.readModels.spaceCountFor(ws.workspaceId, vendor.participantId),
    ).toBe(1);
    expect(await agentOf(tree)).toMatchObject({ room: null, released_from: own });
  });
});

describe("what a free agent says is held (rule 6)", () => {
  it("is held, counted, and posted in the next room it joins, oldest first", async () => {
    const agent = await scoutsAgent();
    await ok(arjun(), {
      type: "membership.removed",
      space_id: ws.spaceId,
      participant_id: agent,
      removed_by: ws.arjun.participantId,
    });
    // Scout, not knowing agents, posts as itself into the room its agent left.
    const first = await ok(scout(), {
      type: "message.post",
      space_id: ws.spaceId,
      text: "The nightly check found the sofa on sale.",
    });
    expect(first).toMatchObject({ type: "message.held", space_id: null });
    expect(first.payload).toMatchObject({ agent_id: agent });
    await ok(scout(), {
      type: "message.post",
      space_id: ws.spaceId,
      text: "And the lamp.",
    });
    expect((await agentOf(agent)).held).toBe(2);

    const other = await room();
    const before = await head();
    await ok(arjun(), {
      type: "membership.added",
      space_id: other,
      participant_id: agent,
      participant_kind: "agent",
      role: "member",
    });
    const posted = (await since(before)).filter((event) => event.type === "message.post");
    expect(posted.map((event) => event.payload["text"])).toEqual([
      "The nightly check found the sofa on sale.",
      "And the lamp.",
    ]);
    expect(posted[0]).toMatchObject({
      space_id: other,
      actor: { kind: "agent", id: agent },
      payload: { from_held: first.id, held_since: first.ts, addressed_to: [] },
    });
    expect((await agentOf(agent)).held).toBe(0);
  });

  it("opens a room with its owner for an agent's first words", async () => {
    const agent = await second("new-space", "Garage door");
    await declare(ws.scout.participantId, [HARNESS_CAPABILITIES.agents]);
    const said = await ok(scout(), {
      type: "message.post",
      actor: { kind: "agent", id: agent },
      text: "Three quotes are in.",
    });
    expect(said.type).toBe("message.post");
    expect(said.space_id).not.toBeNull();
    const { readModels } = ws.gateway.deps;
    expect(await readModels.memberRole(ws.workspaceId, String(said.space_id), agent)).toBe(
      "member",
    );
    expect(
      await readModels.memberRole(ws.workspaceId, String(said.space_id), ws.arjun.participantId),
    ).toBe("owner");
  });
});

async function declare(harnessId: string, capabilities: readonly string[]): Promise<void> {
  const done = await ws.gateway.deps.declareCapabilities({
    principal: arjun(),
    harnessId,
    capabilities,
  });
  if (!done.ok) throw new Error(done.error.message);
}

describe("a room asked of several harnesses (the addendum's point 6)", () => {
  it("holds each asked harness until it answers, and refuses one that takes no new spaces", async () => {
    await declare(ws.scout.participantId, [HARNESS_CAPABILITIES.newSpaces]);
    const added = await ws.gateway.deps.addHarness({
      principal: arjun(),
      displayName: "Ledger",
      openDirectSpace: false,
    });
    if (!added.ok) throw new Error("could not add Ledger");
    const ledger = added.value.harnessId;
    const refused = await submit(arjun(), {
      type: "space.created",
      space_id: ws.ids.next("space"),
      kind: "group",
      asked_of: ws.scout.participantId,
      also_asked_of: [ledger],
    });
    expect(refused).toMatchObject({ ok: false, error: { kind: "invalid" } });

    await declare(ledger, [HARNESS_CAPABILITIES.newSpaces]);
    const asked = ws.ids.next("space");
    await ok(arjun(), {
      type: "space.created",
      space_id: asked,
      kind: "group",
      asked_of: ws.scout.participantId,
      also_asked_of: [ledger],
    });
    for (const id of [ws.scout.participantId, ledger]) {
      await ok(arjun(), {
        type: "membership.added",
        space_id: asked,
        participant_id: id,
        participant_kind: "harness",
        role: "member",
      });
    }
    const { readModels } = ws.gateway.deps;
    expect(await readModels.memberRole(ws.workspaceId, asked, ledger)).toBe("member");
    expect(await readModels.memberRole(ws.workspaceId, asked, ws.scout.participantId)).toBe(
      "member",
    );
    expect((await readModels.space(ws.workspaceId, asked))?.also_asked_of).toEqual([ledger]);
    // Both list it as asked of them, for a harness that was away when it was made.
    for (const id of [ws.scout.participantId, ledger]) {
      const listed = await readModels.spacesAskedOf(ws.workspaceId, id);
      expect(listed.map((each) => each.space_id)).toContain(asked);
    }
  });
});

describe("the harness hears where its agents are", () => {
  it("is sent agent.attached with the room's last lines, and a harness without agents is not", async () => {
    await ok(arjun(), {
      type: "message.post",
      space_id: ws.spaceId,
      text: "Before Tree joins.",
    });
    await declare(ws.scout.participantId, [HARNESS_CAPABILITIES.agents]);
    const sent: Record<string, unknown>[] = [];
    const session = new Session({
      socket: { send: (data) => sent.push(JSON.parse(data)), close: () => {} },
      principal: scout(),
      store: ws.gateway.deps.store,
      fanOut: ws.gateway.deps.fanOut,
      readModels: ws.gateway.deps.readModels,
      submitEvent: ws.gateway.deps.submitEvent,
      ids: ws.ids,
      serverVersion: "0.0.0-test",
      maxUnackedFrames: 10_000,
      now: () => Date.now(),
    });
    await session.receive(
      JSON.stringify({
        frame: "hello",
        protocol: { min: 1, max: 1 },
        client: { name: "adapter", version: "0.1.0" },
      }),
    );
    await session.receive(JSON.stringify({ frame: "subscribe", workspace_id: ws.workspaceId }));
    const tree = await second();
    await ok(arjun(), {
      type: "membership.added",
      space_id: ws.spaceId,
      participant_id: tree,
      participant_kind: "agent",
      role: "member",
    });
    await session.settled;
    const attached = sent
      .filter((frame) => frame["frame"] === "event")
      .map((frame) => frame["event"] as Record<string, unknown>)
      .find((event) => event["type"] === "agent.attached");
    expect(attached).toMatchObject({ agent_id: tree, space_id: ws.spaceId });
    const catchUp = attached?.["catch_up"] as { lines: { text?: string }[] } | undefined;
    const lines = catchUp?.lines ?? [];
    expect(lines.some((line) => line.text === "Before Tree joins.")).toBe(true);
  });
});

describe("moving an agent (point 4)", () => {
  it("stops its work where it was, takes it out saying where it went, and puts it here", async () => {
    const agent = await scoutsAgent();
    const runId = ws.ids.next("run");
    await ok(scout(), { type: "run.started", space_id: ws.spaceId, run_id: runId, goal: "Go." });
    const other = await room();
    const before = await head();
    const moved = await ws.gateway.deps.moveAgent({
      principal: arjun(),
      agentId: agent,
      spaceId: other,
    });
    expect(moved).toMatchObject({ ok: true, moved: true, from: ws.spaceId });
    const events = await since(before);
    expect(events.find((event) => event.type === "run.cancel")?.run_id).toBe(runId);
    expect(events.find((event) => event.type === "membership.removed")).toMatchObject({
      space_id: ws.spaceId,
      payload: { reason: "moved", moved_to: other },
    });
    expect(events.find((event) => event.type === "agent.attached")).toMatchObject({
      space_id: other,
      payload: { moved_from: ws.spaceId, by: ws.arjun.participantId },
    });
    expect((await agentOf(agent)).room).toBe(other);
    // Asked again, nothing moves.
    expect(
      await ws.gateway.deps.moveAgent({ principal: arjun(), agentId: agent, spaceId: other }),
    ).toMatchObject({ ok: true, moved: false });
  });

  it("is its harness owner's or an admin's to make, never a guest's", async () => {
    const other = await room();
    const member = await ws.addPerson("Maya", "member");
    await ok(arjun(), {
      type: "membership.added",
      space_id: other,
      participant_id: member.participantId,
      participant_kind: "person",
      role: "member",
    });
    const maya: Principal = {
      kind: "person",
      participantId: member.participantId,
      workspaceId: ws.workspaceId,
      displayName: "Maya",
      via: "device_key",
      deviceId: member.deviceId,
    };
    expect(
      await ws.gateway.deps.moveAgent({
        principal: maya,
        agentId: await scoutsAgent(),
        spaceId: other,
      }),
    ).toMatchObject({ ok: false, error: { kind: "not_allowed" } });
  });
});

describe("deleting a room (rule 5)", () => {
  async function treeAlone(): Promise<{ tree: string; own: string }> {
    const own = await room("Tree's space");
    const tree = await second();
    await ok(arjun(), {
      type: "membership.added",
      space_id: own,
      participant_id: tree,
      participant_kind: "agent",
      role: "member",
    });
    return { tree, own };
  }

  it("frees its agents, and deletes the one there when asked to delete it too (ADR 0095)", async () => {
    const { tree, own } = await treeAlone();
    const before = await head();
    const erased = await ws.gateway.deps.eraseSpace({
      principal: arjun(),
      spaceId: own,
      deleteAgent: true,
    });
    expect(erased.ok).toBe(true);
    const events = await since(before);
    const released = events.find((event) => event.type === "agent.released");
    expect(released).toMatchObject({
      space_id: own,
      payload: { agent_id: tree, reason: "deleted" },
    });
    expect(released?.payload).not.toHaveProperty("delete");
    expect(events.find((event) => event.type === "agent.deleted")).toMatchObject({
      actor: { kind: "person", id: ws.arjun.participantId },
      payload: { agent_id: tree, key: "tree", by: ws.arjun.participantId },
    });
    const gone = await ws.gateway.deps.readModels.participant(ws.workspaceId, tree);
    expect(gone?.removed_at).not.toBeNull();
  });

  it("deletes the agent in its harness only for its harness's owner or an admin (finding 4)", async () => {
    // Maya owns the room, and neither Scout nor the workspace.
    const member = await ws.addPerson("Maya", "member");
    const maya: Principal = {
      kind: "person",
      participantId: member.participantId,
      workspaceId: ws.workspaceId,
      displayName: "Maya",
      via: "device_key",
      deviceId: member.deviceId,
      role: "member",
    };
    // A member opens no space (ADR 0196): Maya's room is one an admin made for her.
    const own = await ws.roomOf(maya.participantId, "Maya's");
    const tree = await second();
    // Nor does she put Scout's agent in it (ADR 0034's addendum): it is put there for her.
    await ws.agentInto(own, tree);
    const refused = await ws.gateway.deps.eraseSpace({
      principal: maya,
      spaceId: own,
      deleteAgent: true,
    });
    expect(refused).toMatchObject({ ok: false, error: { kind: "not_allowed" } });
    expect(await agentOf(tree)).toMatchObject({ room: own, state: "active" });
    // She may still delete her room: the agent is freed, and stays in its harness.
    const erased = await ws.gateway.deps.eraseSpace({ principal: maya, spaceId: own });
    expect(erased.ok).toBe(true);
    expect(await agentOf(tree)).toMatchObject({ room: null, state: "active" });
  });

  it("leaves the agent in its harness otherwise, and asks nothing of a room with two", async () => {
    const { tree, own } = await treeAlone();
    await ws.gateway.deps.eraseSpace({ principal: arjun(), spaceId: own });
    expect(await agentOf(tree)).toMatchObject({ room: null, state: "active" });

    // Scout's room, with Tree beside Scout's agent: two agents, so neither is asked about.
    await ok(arjun(), {
      type: "membership.added",
      space_id: ws.spaceId,
      participant_id: tree,
      participant_kind: "agent",
      role: "member",
    });
    const refused = await ws.gateway.deps.eraseSpace({
      principal: arjun(),
      spaceId: ws.spaceId,
      deleteAgent: true,
    });
    expect(refused).toMatchObject({ ok: false });
  });
});

describe("a room asked from the + (point 6, and the addendum's points 2 and 6)", () => {
  async function asked(
    also: readonly string[] = [],
    proposed: Readonly<Record<string, string>> = {},
  ): Promise<string> {
    const id = ws.ids.next("space");
    await ok(arjun(), {
      type: "space.created",
      space_id: id,
      kind: also.length === 0 ? "direct" : "group",
      asked_of: ws.scout.participantId,
      ...(also.length === 0 ? {} : { also_asked_of: also }),
    });
    for (const harnessId of [ws.scout.participantId, ...also]) {
      await ok(arjun(), {
        type: "membership.added",
        space_id: id,
        participant_id: harnessId,
        participant_kind: "harness",
        role: "member",
        ...(proposed[harnessId] === undefined ? {} : { agent_name: proposed[harnessId] }),
      });
    }
    return id;
  }

  /** The first name a room holds for a harness's agent (ADR 0150). */
  async function held(spaceId: string, harnessId: string): Promise<string | undefined> {
    const all = await ws.gateway.deps.readModels.heldNames(ws.workspaceId);
    return all.find((each) => each.space_id === spaceId && each.harness_id === harnessId)?.name;
  }

  async function ledger(): Promise<{ id: string; headers: Record<string, string> }> {
    const added = await ws.gateway.deps.addHarness({
      principal: arjun(),
      displayName: "Ledger",
      openDirectSpace: false,
    });
    if (!added.ok) throw new Error("could not add Ledger");
    await declare(added.value.harnessId, [HARNESS_CAPABILITIES.newSpaces]);
    return {
      id: added.value.harnessId,
      headers: { authorization: `Bearer ${added.value.token}` },
    };
  }

  const claim = (
    headers: Readonly<Record<string, string>>,
    harnessId: string,
    body: Record<string, unknown>,
  ) => asHarness(headers, "POST", `/v1/harnesses/${harnessId}/spaces`, body);

  it("gives each room a harness claims an agent of its own, whatever it declares, by the name the room held (ADR 0150)", async () => {
    await declare(ws.scout.participantId, [HARNESS_CAPABILITIES.newSpaces]);
    const one = await asked();
    const two = await asked();
    const names = [
      await held(one, ws.scout.participantId),
      await held(two, ws.scout.participantId),
    ];
    await claim(ws.scout.headers, ws.scout.participantId, { key: "one", space_id: one });
    await claim(ws.scout.headers, ws.scout.participantId, { key: "two", space_id: two });
    const { readModels } = ws.gateway.deps;
    const first = await readModels.agentByKey(ws.workspaceId, ws.scout.participantId, "one");
    const second = await readModels.agentByKey(ws.workspaceId, ws.scout.participantId, "two");
    expect(first).toMatchObject({ room: one, name: names[0] });
    expect(second).toMatchObject({ room: two, name: names[1] });
    expect(second?.name).not.toBe(first?.name);
    // The agents hold the names now, so the rooms hold nothing.
    expect(await readModels.heldNames(ws.workspaceId)).toEqual([]);
  });

  it("lets each other harness asked answer with its own agent, leaving the room's name alone", async () => {
    await declare(ws.scout.participantId, [HARNESS_CAPABILITIES.newSpaces]);
    const { id: ledgerId, headers: ledgerHeaders } = await ledger();
    const both = await asked([ledgerId]);
    const ledgersName = await held(both, ledgerId);
    await claim(ws.scout.headers, ws.scout.participantId, {
      key: "plan",
      space_id: both,
      title: "Trip plan",
    });
    const answered = await claim(ledgerHeaders, ledgerId, {
      key: "books",
      space_id: both,
      title: "Books",
    });
    expect(answered).toMatchObject({ status: 200, json: { claimed: true } });
    const { readModels } = ws.gateway.deps;
    expect(await readModels.space(ws.workspaceId, both)).toMatchObject({ title: "Trip plan" });
    expect(await readModels.agentByKey(ws.workspaceId, ledgerId, "books")).toMatchObject({
      name: ledgersName,
      room: both,
    });
    expect(await readModels.memberRole(ws.workspaceId, both, ledgerId)).toBeUndefined();
    // Asked again, it has answered already.
    const again = await claim(ledgerHeaders, ledgerId, { key: "books", space_id: both });
    expect(again).toMatchObject({ status: 200, json: { claimed: false } });
  });

  describe("first names held for the agents (ADR 0150)", () => {
    it("holds one for each harness asked, a letter apart in the room, and none twice", async () => {
      await declare(ws.scout.participantId, [HARNESS_CAPABILITIES.newSpaces]);
      const { id: ledgerId } = await ledger();
      const one = await asked([ledgerId]);
      const two = await asked([ledgerId]);
      const names = [
        await held(one, ws.scout.participantId),
        await held(one, ledgerId),
        await held(two, ws.scout.participantId),
        await held(two, ledgerId),
      ];
      for (const name of names) expect(name).toMatch(/^[A-Z][a-z]{2,5}$/);
      expect(new Set(names).size).toBe(4);
      expect(names[0]?.charAt(0)).not.toBe(names[1]?.charAt(0));
      expect(names[2]?.charAt(0)).not.toBe(names[3]?.charAt(0));
    });

    it("keeps the one a person's device proposed while nobody has it, and picks another when somebody does", async () => {
      await declare(ws.scout.participantId, [HARNESS_CAPABILITIES.newSpaces]);
      const one = await asked([], { [ws.scout.participantId]: "Milo" });
      expect(await held(one, ws.scout.participantId)).toBe("Milo");
      const two = await asked([], { [ws.scout.participantId]: "milo" });
      expect(await held(two, ws.scout.participantId)).not.toMatch(/^milo$/i);
      // A harness not waiting in the room holds nothing, whatever was proposed.
      const plain = await room();
      await add(plain, ws.scout.participantId, "harness");
      expect(await ws.gateway.deps.readModels.heldNames(ws.workspaceId)).toHaveLength(2);
    });

    it("names the agent as the person who made the room, so its harness renaming it changes nothing", async () => {
      await declare(ws.scout.participantId, [
        HARNESS_CAPABILITIES.newSpaces,
        HARNESS_CAPABILITIES.followsRooms,
      ]);
      const one = await asked([], { [ws.scout.participantId]: "Milo" });
      await claim(ws.scout.headers, ws.scout.participantId, {
        key: "breakfast",
        space_id: one,
        title: "Breakfast Today",
      });
      const { readModels } = ws.gateway.deps;
      const agent = await readModels.agentByKey(
        ws.workspaceId,
        ws.scout.participantId,
        "breakfast",
      );
      expect(agent).toMatchObject({ name: "Milo", name_by: ws.arjun.participantId, room: one });
      // Its harness asks for the name of the thing it keeps for it, as Jacobian does.
      await asHarness(ws.scout.headers, "POST", `/v1/harnesses/${ws.scout.participantId}/agents`, {
        key: "breakfast",
        name: "Breakfast Today",
      });
      expect(
        await readModels.agentByKey(ws.workspaceId, ws.scout.participantId, "breakfast"),
      ).toMatchObject({ name: "Milo" });
    });

    it("gives an agent the harness made before it claimed the name held for it", async () => {
      await declare(ws.scout.participantId, [HARNESS_CAPABILITIES.newSpaces]);
      const made = await second("early", "Early Bird");
      const one = await asked([], { [ws.scout.participantId]: "Milo" });
      await claim(ws.scout.headers, ws.scout.participantId, { key: "early", space_id: one });
      expect(await agentOf(made)).toMatchObject({ name: "Milo", room: one });
    });

    it("reaches the waiting harness by its held name, and by its own", async () => {
      await declare(ws.scout.participantId, [HARNESS_CAPABILITIES.newSpaces]);
      const one = await asked([], { [ws.scout.participantId]: "Milo" });
      for (const text of ["@Milo where do we start?", "@Scout where do we start?"]) {
        const said = await ok(arjun(), { type: "message.post", space_id: one, text });
        expect(said.payload["mentions"]).toEqual([ws.scout.participantId]);
      }
    });

    it("counts a held name as taken, for an agent made anywhere else", async () => {
      await declare(ws.scout.participantId, [HARNESS_CAPABILITIES.newSpaces]);
      await asked([], { [ws.scout.participantId]: "Tree" });
      const other = await second("tree", "Tree");
      expect((await agentOf(other)).name).toBe("Tree 2");
    });
  });
});

describe("the upgrade to one room per agent (`chipsd upgrade one-room`)", () => {
  it("releases agents from archived rooms, keeps an agent's latest room, and runs once", async () => {
    const agent = await scoutsAgent();
    // What Phase 2 left behind, which the door refuses now and the store with it (agents review,
    // finding 6): written as history was, by a store with no gate, with its consequences.
    const past = reacting(createSqliteEventStore({ db: ws.db }), ws.gateway.deps.oneRoom.after);
    // Scout's one agent in a second room.
    const older = await room("Older");
    await past.append({
      v: 1,
      type: "membership.added",
      id: ws.ids.next("event"),
      ts: new Date().toISOString(),
      workspace_id: ws.workspaceId,
      space_id: older,
      actor: { kind: "system", id: "system" },
      idempotency_key: `phase-2-${older}`,
      participant_id: agent,
      participant_kind: "agent",
      role: "member",
    });
    await ok(arjun(), { type: "message.post", space_id: ws.spaceId, text: "Latest here." });
    // And an agent left in a room archived before rule 3.
    const tree = await second();
    const shut = await room("Shut");
    await past.append({
      v: 1,
      type: "membership.added",
      id: ws.ids.next("event"),
      ts: new Date().toISOString(),
      workspace_id: ws.workspaceId,
      space_id: shut,
      actor: { kind: "system", id: "system" },
      idempotency_key: `phase-2-${shut}`,
      participant_id: tree,
      participant_kind: "agent",
      role: "member",
    });
    await ws.db.updateTable("spaces").set({ state: "closed" }).where("id", "=", shut).execute();

    const { upgradeOneRoom } = ws.gateway.deps;
    const plan = await upgradeOneRoom.plan(ws.workspaceId);
    expect(plan.agents.map((each) => [each.agent_id, each.steps.map((step) => step.kind)])).toEqual(
      expect.arrayContaining([
        [agent, expect.arrayContaining(["keep", "release"])],
        [tree, ["release"]],
      ]),
    );
    await upgradeOneRoom.apply(ws.workspaceId);
    expect(await agentOf(agent)).toMatchObject({ room: ws.spaceId });
    expect(await agentOf(tree)).toMatchObject({ room: null, released_from: shut });
    expect((await upgradeOneRoom.plan(ws.workspaceId)).agents).toEqual([]);
    expect((await upgradeOneRoom.apply(ws.workspaceId)).appended).toBe(0);
  });
});

describe("a harness attaching its own agent (Phase 3's door)", () => {
  it("does not take an agent from another room into this one", async () => {
    const tree = await second();
    const other = await room();
    await ok(arjun(), {
      type: "membership.added",
      space_id: other,
      participant_id: tree,
      participant_kind: "agent",
      role: "member",
    });
    const refused = await asHarness(ws.scout.headers, "POST", `/v1/agents/${tree}/attach`, {
      space_id: ws.spaceId,
      replacing: await scoutsAgent(),
    });
    expect(refused.status).toBe(422);
    expect((await agentOf(tree)).room).toBe(other);
  });
});

/**
 * A bridge's Main agent came out "OpenCode 2" beside the "OpenCode" Chips made at the join, which
 * kept the name in no room (testing/findings.md ON-10). The harness names that default agent by its
 * own id, and as Main it is its Main (ADR 0183).
 */
describe("a harness's default agent as its Main (ADR 0183)", () => {
  const register = (body: Record<string, unknown>) =>
    asHarness(ws.scout.headers, "POST", `/v1/harnesses/${ws.scout.participantId}/agents`, body);

  it("is named by the harness's own id, and made Main, with no second agent", async () => {
    const before = await ws.gateway.deps.readModels.agentsOf(
      ws.workspaceId,
      ws.scout.participantId,
    );
    const main = await register({ key: ws.scout.participantId, name: "Scout", lead: true });
    expect(main.status).toBe(200);
    expect(main.json).toMatchObject({ agent_id: await scoutsAgent(), name: "Scout", lead: true });
    const after = await ws.gateway.deps.readModels.agentsOf(ws.workspaceId, ws.scout.participantId);
    expect(after.map((agent) => agent.name)).toEqual(before.map((agent) => agent.name));
    expect((await agentOf(await scoutsAgent())).lead).toBe(true);
  });

  it("takes Main from the one the harness made Main before, which can then be archived", async () => {
    const old = await register({ key: "main", name: "Scout's Main", lead: true });
    const oldId = String(old.json["agent_id"]);
    expect((await agentOf(oldId)).lead).toBe(true);
    const main = await register({ key: ws.scout.participantId, name: "Scout", lead: true });
    expect(main.status).toBe(200);
    expect((await agentOf(await scoutsAgent())).lead).toBe(true);
    expect((await agentOf(oldId)).lead).toBe(false);
    const events = (await since(0)).filter((event) => event.type === "agent.updated");
    expect(events.map((event) => [event.payload["agent_id"], event.payload["lead"]])).toEqual(
      expect.arrayContaining([
        [await scoutsAgent(), true],
        [oldId, false],
      ]),
    );
    const archived = await register({ key: "main", name: "Scout's Main", state: "archived" });
    expect(archived.status).toBe(200);
    expect((await agentOf(oldId)).state).toBe("archived");
  });

  it("is no other harness's id, and no other key takes Main from the one there", async () => {
    const theirs = await register({ key: "hrn_01M00000000000000000000000", name: "Theirs" });
    expect(theirs.status).toBe(422);
    await register({ key: ws.scout.participantId, name: "Scout", lead: true });
    const second = await register({ key: "other", name: "Other", lead: true });
    expect(second.status).toBe(422);
    expect((await agentOf(await scoutsAgent())).lead).toBe(true);
  });
});

/**
 * The agents review (docs/reviews/agents-review.md), findings 5 to 12. One room per agent was
 * checked on nine paths and enforced on none, and an agent's work stopped on some ways out of a
 * room and not on others. These are the probes that showed it, as tests of the two mechanisms
 * that replaced the nine checks: the store's gate, and the one step that stops an agent's work.
 */
describe("the one-room rule holds on every path (agents review)", () => {
  const added = (spaceId: string, agentId: string) =>
    ok(arjun(), {
      type: "membership.added",
      space_id: spaceId,
      participant_id: agentId,
      participant_kind: "agent",
      role: "member",
    });

  const archive = (spaceId: string, state: "open" | "closed") =>
    ok(arjun(), { type: "space.updated", space_id: spaceId, state });

  /** The rooms an agent is a member of, whatever their state: one at most, by the rule. */
  async function roomsOf(agentId: string): Promise<string[]> {
    const held = await ws.gateway.deps.readModels.roomsHolding(ws.workspaceId, agentId);
    return held.map((each) => each.space_id);
  }

  /** A room that is Scout's Main room, with Scout's Main agent in it. */
  async function leadRoom(): Promise<{ home: string; lead: string }> {
    const made = await asHarness(
      ws.scout.headers,
      "POST",
      `/v1/harnesses/${ws.scout.participantId}/agents`,
      { key: "lead", name: "Lead", lead: true },
    );
    const lead = String(made.json["agent_id"]);
    const home = await room("Main space");
    await ws.db.updateTable("spaces").set({ home: 1 }).where("id", "=", home).execute();
    await added(home, lead);
    return { home, lead };
  }

  it("takes no agent into an archived room, at the door or past it (finding 5)", async () => {
    const tree = await second();
    const shut = await room("Shut");
    await archive(shut, "closed");
    expect(await add(shut, tree, "agent")).toMatchObject({
      ok: false,
      error: { kind: "room_closed" },
    });
    // And a path that does not come through the door is refused by the store itself.
    await expect(
      ws.gateway.deps.store.append({
        v: 1,
        type: "membership.added",
        id: ws.ids.next("event"),
        ts: new Date().toISOString(),
        workspace_id: ws.workspaceId,
        space_id: shut,
        actor: { kind: "system", id: "system" },
        idempotency_key: "past-the-door",
        participant_id: tree,
        participant_kind: "agent",
        role: "member",
      }),
    ).rejects.toMatchObject({ name: "AppendRefused", refusal: { kind: "room_closed" } });
    expect(await roomsOf(tree)).toEqual([]);
    // So unarchiving the room does not find it in two.
    const open = await room("Open");
    await added(open, tree);
    await archive(shut, "open");
    expect(await roomsOf(tree)).toEqual([open]);
  });

  it("puts an agent in one room when two people add it to two at once (finding 6)", async () => {
    const tree = await second();
    const [a, b] = [await room("A"), await room("B")];
    const results = await Promise.all([add(a, tree, "agent"), add(b, tree, "agent")]);
    expect(results.filter((each) => each.ok)).toHaveLength(1);
    expect(results.find((each) => !each.ok)).toMatchObject({
      error: { kind: "agent_elsewhere" },
    });
    expect(await roomsOf(tree)).toHaveLength(1);
  });

  it("puts an agent in one room when it is moved to two at once (finding 6)", async () => {
    const tree = await second();
    const [from, a, b] = [await room("From"), await room("A"), await room("B")];
    await added(from, tree);
    const move = (spaceId: string) =>
      ws.gateway.deps
        .moveAgent({ principal: arjun(), agentId: tree, spaceId })
        .catch((error: unknown) => error);
    await Promise.all([move(a), move(b)]);
    const held = await roomsOf(tree);
    expect(held).toHaveLength(1);
    expect([a, b]).toContain(held[0]);
  });

  it("puts an agent in one room when it is added and moved at once (finding 6)", async () => {
    const tree = await second();
    const [a, b] = [await room("A"), await room("B")];
    await Promise.all([
      add(a, tree, "agent"),
      ws.gateway.deps
        .moveAgent({ principal: arjun(), agentId: tree, spaceId: b })
        .catch(() => undefined),
    ]);
    expect(await roomsOf(tree)).toHaveLength(1);
  });

  it("does not let a harness put a plain agent in its Main agent's place (finding 8)", async () => {
    const { home, lead } = await leadRoom();
    const tree = await second();
    const refused = await asHarness(ws.scout.headers, "POST", `/v1/agents/${tree}/attach`, {
      space_id: home,
      replacing: lead,
    });
    expect(refused.status).toBe(403);
    expect(await roomsOf(lead)).toEqual([home]);
    expect(await roomsOf(tree)).toEqual([]);
  });

  it("takes one harness's Main agent into no other harness's Main room (finding 8)", async () => {
    const { home } = await leadRoom();
    const ledger = await ws.gateway.deps.addHarness({
      principal: arjun(),
      displayName: "Ledger",
      openDirectSpace: false,
    });
    if (!ledger.ok) throw new Error("could not add Ledger");
    const theirs = await asHarness(
      { authorization: `Bearer ${ledger.value.token}` },
      "POST",
      `/v1/harnesses/${ledger.value.harnessId}/agents`,
      { key: "lead", name: "Their lead", lead: true },
    );
    expect(await add(home, String(theirs.json["agent_id"]), "agent")).toMatchObject({
      ok: false,
      error: { kind: "lead_room" },
    });
  });

  it("keeps the Main agent in its Main room when its harness archives it (finding 8)", async () => {
    const { home, lead } = await leadRoom();
    const archived = await asHarness(
      ws.scout.headers,
      "POST",
      `/v1/harnesses/${ws.scout.participantId}/agents`,
      { key: "lead", name: "Lead", lead: true, state: "archived" },
    );
    expect(archived.status).toBe(422);
    expect(await roomsOf(lead)).toEqual([home]);
    expect((await agentOf(lead)).state).toBe("active");
  });

  it("does not let a person take the Main agent out of its Main room (finding 9)", async () => {
    const { home, lead } = await leadRoom();
    const refused = await submit(arjun(), {
      type: "membership.removed",
      space_id: home,
      participant_id: lead,
    });
    expect(refused).toMatchObject({ ok: false, error: { kind: "lead_room" } });
    expect(await roomsOf(lead)).toEqual([home]);
  });

  it("stops an agent's run before a person takes it out, so its harness hears (finding 12)", async () => {
    const agent = await scoutsAgent();
    const runId = ws.ids.next("run");
    await ok(scout(), { type: "run.started", space_id: ws.spaceId, run_id: runId, goal: "Go." });
    const before = await head();
    await ok(arjun(), { type: "membership.removed", space_id: ws.spaceId, participant_id: agent });
    const events = await since(before);
    const types = events.map((event) => event.type);
    expect(types.indexOf("run.cancel")).toBeGreaterThanOrEqual(0);
    expect(types.indexOf("run.cancel")).toBeLessThan(types.indexOf("membership.removed"));
    expect(events.find((event) => event.type === "run.cancel")).toMatchObject({
      run_id: runId,
      payload: { by: ws.arjun.participantId, reason: "The agent was taken out of the space." },
    });
    expect((await ws.gateway.deps.readModels.run(ws.workspaceId, runId))?.state).toBe("cancelled");
  });

  it("stops the run of an agent archived in its harness in a room it shares (finding 12)", async () => {
    const tree = await second();
    await added(ws.spaceId, tree);
    const runId = ws.ids.next("run");
    await ok(scout(), {
      type: "run.started",
      space_id: ws.spaceId,
      run_id: runId,
      goal: "Go.",
      actor: { kind: "agent", id: tree },
    });
    const before = await head();
    await asHarness(ws.scout.headers, "POST", `/v1/harnesses/${ws.scout.participantId}/agents`, {
      key: "tree",
      name: "Tree",
      state: "archived",
    });
    const types = (await since(before)).map((event) => event.type);
    expect(types.indexOf("run.cancel")).toBeLessThan(types.indexOf("membership.removed"));
    expect((await ws.gateway.deps.readModels.run(ws.workspaceId, runId))?.state).toBe("cancelled");
    // The other agent's room stays open, and its own work is its own.
    expect((await ws.gateway.deps.readModels.space(ws.workspaceId, ws.spaceId))?.state).toBe(
      "open",
    );
  });

  it("stops a room's runs before it is deleted, and holds no late answer for it (finding 10)", async () => {
    const own = await room("Tree's space");
    const tree = await second();
    await added(own, tree);
    const runId = ws.ids.next("run");
    const asTree = { actor: { kind: "agent", id: tree } };
    await ok(scout(), {
      type: "run.started",
      space_id: own,
      run_id: runId,
      goal: "Go.",
      ...asTree,
    });
    const sent: string[] = [];
    const stop = ws.gateway.deps.fanOut.subscribe({ workspaceId: ws.workspaceId }, (event) => {
      if (event.run_id === runId) sent.push(event.type);
    });
    const erased = await ws.gateway.deps.eraseSpace({ principal: arjun(), spaceId: own });
    stop();
    expect(erased.ok).toBe(true);
    // The harness was told to stop while its agent was still in the room.
    expect(sent).toContain("run.cancel");
    // Its answer, sent to the room that is gone, is refused: not held for the next room.
    const late = await submit(scout(), {
      type: "message.post",
      space_id: own,
      text: "Here is what I found.",
      ...asTree,
    });
    expect(late.ok).toBe(false);
    expect(await ws.gateway.deps.readModels.heldFor(ws.workspaceId, tree)).toEqual([]);
  });
});

describe("what a restart cut is finished at the next start (agents review, finding 7)", () => {
  /** A store with no reactions and no gate: an event as a process that stopped right after it. */
  const cut = () => createSqliteEventStore({ db: ws.db });

  it("releases an agent left in a room that was archived around it", async () => {
    const own = await room("Tree's space");
    const tree = await second();
    await ok(arjun(), {
      type: "membership.added",
      space_id: own,
      participant_id: tree,
      participant_kind: "agent",
      role: "member",
    });
    // The archive lands; the process stops before its agents are released.
    await cut().append({
      v: 1,
      type: "space.updated",
      id: ws.ids.next("event"),
      ts: new Date().toISOString(),
      workspace_id: ws.workspaceId,
      space_id: own,
      actor: { kind: "person", id: ws.arjun.participantId },
      idempotency_key: "archived-then-stopped",
      state: "closed",
    });
    // Until it is settled the agent is put nowhere else: it is still in that room.
    const other = await room("Other");
    expect(await add(other, tree, "agent")).toMatchObject({
      ok: false,
      error: { kind: "agent_elsewhere", space_id: own },
    });

    const settled = await ws.gateway.deps.oneRoom.settle(ws.workspaceId);
    expect(settled.released).toEqual([{ agent_id: tree, space_id: own }]);
    expect(await agentOf(tree)).toMatchObject({ room: null, released_from: own });
    // A second start finds nothing left to do.
    expect(await ws.gateway.deps.oneRoom.settle(ws.workspaceId)).toEqual({
      released: [],
      ended: [],
      inSeveral: [],
    });
    // And the unarchive brings it back, as it would have.
    await ok(arjun(), { type: "space.updated", space_id: own, state: "open" });
    expect((await agentOf(tree)).room).toBe(own);
  });

  it("ends a run whose agent is no longer in the run's room", async () => {
    const agent = await scoutsAgent();
    const runId = ws.ids.next("run");
    await ok(scout(), { type: "run.started", space_id: ws.spaceId, run_id: runId, goal: "Go." });
    // Taken out with nothing stopping its work: what a removal did before the review.
    await cut().append({
      v: 1,
      type: "membership.removed",
      id: ws.ids.next("event"),
      ts: new Date().toISOString(),
      workspace_id: ws.workspaceId,
      space_id: ws.spaceId,
      actor: { kind: "person", id: ws.arjun.participantId },
      idempotency_key: "removed-then-stopped",
      participant_id: agent,
    });
    expect((await ws.gateway.deps.readModels.run(ws.workspaceId, runId))?.state).toBe("running");
    const settled = await ws.gateway.deps.oneRoom.settle(ws.workspaceId);
    expect(settled.ended).toEqual([{ run_id: runId, space_id: ws.spaceId, why: "left" }]);
    expect((await ws.gateway.deps.readModels.run(ws.workspaceId, runId))?.state).toBe("cancelled");
  });
});

describe("a run left going in a room archived before archives stopped runs", () => {
  it("is ended at the next start, as an archive would have ended it", async () => {
    // The live workspace had three: runs from mid-September, by the harness itself, in a room
    // archived before rule 3. Unarchived, the room's agent would have read as Working for good.
    const runId = ws.ids.next("run");
    await ok(scout(), { type: "run.started", space_id: ws.spaceId, run_id: runId, goal: "Go." });
    await ws.db.updateTable("runs").set({ agent_id: null }).where("id", "=", runId).execute();
    await createSqliteEventStore({ db: ws.db }).append({
      v: 1,
      type: "space.updated",
      id: ws.ids.next("event"),
      ts: new Date().toISOString(),
      workspace_id: ws.workspaceId,
      space_id: ws.spaceId,
      actor: { kind: "person", id: ws.arjun.participantId },
      idempotency_key: "archived-before-rule-3",
      state: "closed",
    });
    const before = await head();
    const settled = await ws.gateway.deps.oneRoom.settle(ws.workspaceId);
    expect(settled.ended).toEqual([{ run_id: runId, space_id: ws.spaceId, why: "archived" }]);
    expect((await ws.gateway.deps.readModels.run(ws.workspaceId, runId))?.state).toBe("cancelled");
    const cancel = (await since(before)).find((event) => event.type === "run.cancel");
    expect(cancel?.payload).toMatchObject({ by: "system", reason: "The space was archived." });
  });
});

describe("a hand-off to a free agent, twice after the same room (agents review, finding 14)", () => {
  it("puts the agent in the room each hand-off is worked in", async () => {
    const { readModels, moveAgent } = ws.gateway.deps;
    const tree = await second();
    const x = await room("X");
    await ok(arjun(), {
      type: "membership.added",
      space_id: x,
      participant_id: tree,
      participant_kind: "agent",
      role: "member",
    });
    const archive = (state: "open" | "closed") =>
      ok(arjun(), { type: "space.updated", space_id: x, state });
    const handOff = async (job: string) => {
      const runId = ws.ids.next("run");
      await ok(scout(), { type: "run.started", space_id: ws.spaceId, run_id: runId, goal: job });
      const laneId = ws.ids.next("lane");
      await ok(scout(), {
        type: "task",
        space_id: ws.spaceId,
        run_id: runId,
        task_id: laneId,
        to: tree,
        on_behalf_of: ws.arjun.participantId,
        goal: job,
      });
      return readModels.lane(ws.workspaceId, laneId);
    };

    await archive("closed");
    const first = await handOff("One");
    const r1 = first?.home_space_id ?? "";
    expect(await readModels.isMember(ws.workspaceId, r1, tree)).toBe(true);
    // Back to X, which is archived again: released from the same room a second time.
    await archive("open");
    await moveAgent({ principal: arjun(), agentId: tree, spaceId: x });
    await archive("closed");

    const again = await handOff("Two");
    const r2 = again?.home_space_id ?? "";
    expect(again?.state).toBe("running");
    expect(await readModels.isMember(ws.workspaceId, r2, tree)).toBe(true);
    expect(await readModels.agentRoom(ws.workspaceId, tree)).toBe(r2);
  });
});

describe("a deleted room leaves nothing that names it (agents review, finding 11)", () => {
  /** A live socket for somebody, and what it was sent. */
  async function connected(principal: Principal) {
    const sent: Record<string, unknown>[] = [];
    const session = new Session({
      socket: { send: (data) => sent.push(JSON.parse(data)), close: () => {} },
      principal,
      store: ws.gateway.deps.store,
      fanOut: ws.gateway.deps.fanOut,
      readModels: ws.gateway.deps.readModels,
      submitEvent: ws.gateway.deps.submitEvent,
      ids: ws.ids,
      serverVersion: "0.0.0-test",
      maxUnackedFrames: 10_000,
      now: () => Date.now(),
    });
    await session.receive(
      JSON.stringify({
        frame: "hello",
        protocol: { min: 1, max: 1 },
        client: { name: "test", version: "0.1.0" },
      }),
    );
    await session.receive(JSON.stringify({ frame: "subscribe", workspace_id: ws.workspaceId }));
    const events = () =>
      sent
        .filter((frame) => frame["frame"] === "event")
        .map((frame) => frame["event"] as Record<string, unknown>);
    return { session, events };
  }

  it("tells the agent's harness of the release, and not a person's device", async () => {
    await declare(ws.scout.participantId, [HARNESS_CAPABILITIES.agents]);
    const own = await room("Tree's space");
    const tree = await second();
    await ok(arjun(), {
      type: "membership.added",
      space_id: own,
      participant_id: tree,
      participant_kind: "agent",
      role: "member",
    });
    const person = await connected(arjun());
    const adapter = await connected(scout());
    const erased = await ws.gateway.deps.eraseSpace({ principal: arjun(), spaceId: own });
    expect(erased.ok).toBe(true);
    await person.session.settled;
    await adapter.session.settled;

    const types = (events: Record<string, unknown>[]) => events.map((event) => event["type"]);
    // The device hears the room go, and nothing after it that would bring the room back.
    expect(types(person.events())).toContain("space.erased");
    expect(person.events().filter((event) => event["space_id"] === own)).toEqual([]);
    // The harness hears its agent is free, which is how its adapter learns to let go.
    expect(adapter.events().find((event) => event["type"] === "agent.released")).toMatchObject({
      agent_id: tree,
      reason: "deleted",
    });
  });

  it("names no last room for the agent in the directory", async () => {
    const own = await room("Tree's space");
    const tree = await second();
    await ok(arjun(), {
      type: "membership.added",
      space_id: own,
      participant_id: tree,
      participant_kind: "agent",
      role: "member",
    });
    await ws.gateway.deps.eraseSpace({ principal: arjun(), spaceId: own });
    const response = await ws.gateway.app.fetch(
      new Request("http://chips.local/v1/participants", {
        headers: ws.arjun.sign("GET", "/v1/participants", ""),
      }),
    );
    const body = (await response.json()) as { participants: Record<string, unknown>[] };
    const listed = body.participants.find((each) => each["id"] === tree);
    expect(listed).toMatchObject({ last_space_id: null, released_from: null, room: null });
  });
});

/**
 * What `for` means (agents review, findings 15, 17 and 31): who of a connection takes the turn,
 * the harness itself among them, and one context from whichever of them has heard least. Both
 * adapters' tests fed their code `for: [the harness's id]`, which Chips never sent.
 */
describe("who takes a turn on a message, as its harness is told", () => {
  /** A live socket for a harness, and the events it was sent. */
  async function listening(principal: Principal) {
    const sent: Record<string, unknown>[] = [];
    const session = new Session({
      socket: { send: (data) => sent.push(JSON.parse(data)), close: () => {} },
      principal,
      store: ws.gateway.deps.store,
      fanOut: ws.gateway.deps.fanOut,
      readModels: ws.gateway.deps.readModels,
      submitEvent: ws.gateway.deps.submitEvent,
      ids: ws.ids,
      serverVersion: "0.0.0-test",
      maxUnackedFrames: 10_000,
      now: () => Date.now(),
    });
    await session.receive(
      JSON.stringify({
        frame: "hello",
        protocol: { min: 1, max: 1 },
        client: { name: "adapter", version: "0.1.0" },
      }),
    );
    await session.receive(JSON.stringify({ frame: "subscribe", workspace_id: ws.workspaceId }));
    const events = () =>
      sent
        .filter((frame) => frame["frame"] === "event")
        .map((frame) => frame["event"] as Record<string, unknown>);
    return { session, events };
  }

  const both = [HARNESS_CAPABILITIES.newSpaces, HARNESS_CAPABILITIES.agents];

  it("names the harness itself for the first words in a room asked of it (finding 31)", async () => {
    await declare(ws.scout.participantId, both);
    const adapter = await listening(scout());
    const asked = ws.ids.next("space");
    await ok(arjun(), {
      type: "space.created",
      space_id: asked,
      kind: "direct",
      asked_of: ws.scout.participantId,
    });
    await ok(arjun(), {
      type: "membership.added",
      space_id: asked,
      participant_id: ws.scout.participantId,
      participant_kind: "harness",
      role: "member",
    });
    await ok(arjun(), { type: "message.post", space_id: asked, text: "Plan a trip to Big Sur." });
    await adapter.session.settled;
    const heard = adapter.events().find((event) => event["type"] === "message.new");
    // Not an empty list: the harness is who the room holds, so the harness takes the turn.
    expect(heard).toMatchObject({ space_id: asked, for: [ws.scout.participantId] });
  });

  it("tells a harness asked beside another of the room as it is made (finding 17)", async () => {
    await declare(ws.scout.participantId, both);
    const added = await ws.gateway.deps.addHarness({
      principal: arjun(),
      displayName: "Ledger",
      openDirectSpace: false,
    });
    if (!added.ok) throw new Error("could not add Ledger");
    const ledger = added.value.harnessId;
    await declare(ledger, both);
    const second = await listening(harness(ledger, "Ledger"));
    const asked = ws.ids.next("space");
    await ok(arjun(), {
      type: "space.created",
      space_id: asked,
      kind: "group",
      asked_of: ws.scout.participantId,
      also_asked_of: [ledger],
    });
    await second.session.settled;
    expect(second.events().find((event) => event["type"] === "space.created")).toMatchObject({
      space_id: asked,
      also_asked_of: [ledger],
    });
  });

  it("hands a harness its own agent's words, with who said them, for another of its agents working there (ADR 0106)", async () => {
    // Run 4 of ASCII Art: ASCII Art and J1 are both Jacobian's; ASCII Art posted the room's file
    // while J1 worked, and J1's turn is to hear it.
    await declare(ws.scout.participantId, both);
    const alpha = await second("alpha", "Alpha");
    const beta = await second("beta", "Beta");
    const shared = await room("Shared");
    for (const agentId of [alpha, beta]) {
      await ok(arjun(), {
        type: "membership.added",
        space_id: shared,
        participant_id: agentId,
        participant_kind: "agent",
        role: "member",
      });
    }
    const run = ws.ids.next("run");
    await ok(scout(), {
      type: "run.started",
      space_id: shared,
      run_id: run,
      goal: "letters F–J",
      plan: [],
      actor: { kind: "agent", id: alpha },
    });
    const adapter = await listening(scout());
    await ok(scout(), {
      type: "message.post",
      space_id: shared,
      text: "The space's file is ascii-alphabet.html.",
      actor: { kind: "agent", id: beta },
    });
    await adapter.session.settled;
    const echo = adapter
      .events()
      .filter((event) => event["type"] === "message.post")
      .at(-1);
    expect(echo).toMatchObject({
      text: "The space's file is ascii-alphabet.html.",
      message_id: expect.stringMatching(/^msg_/),
      from: { participant_id: beta },
      working_turns: [{ agent_id: alpha, run_id: run }],
    });
  });

  it("hands two agents of one harness the lines the one that heard least is owed (finding 15)", async () => {
    await declare(ws.scout.participantId, both);
    const alpha = await second("alpha", "Alpha");
    const beta = await second("beta", "Beta");
    const shared = await room("Shared");
    for (const agentId of [alpha, beta]) {
      await ok(arjun(), {
        type: "membership.added",
        space_id: shared,
        participant_id: agentId,
        participant_kind: "agent",
        role: "member",
      });
    }
    const say = (text: string) => ok(arjun(), { type: "message.post", space_id: shared, text });
    await say("@Beta one");
    await ok(scout(), {
      type: "message.post",
      space_id: shared,
      text: "Beta here.",
      actor: { kind: "agent", id: beta },
    });
    await say("Two, for nobody.");
    await say("@Alpha three");
    await ok(scout(), {
      type: "message.post",
      space_id: shared,
      text: "Alpha here.",
      actor: { kind: "agent", id: alpha },
    });
    await say("Four, for nobody.");
    const adapter = await listening(scout());
    await say("@Alpha @Beta five");
    await adapter.session.settled;
    const heard = adapter.events().find((event) => event["type"] === "message.new");
    expect(heard?.["for"]).toEqual([alpha, beta]);
    const context = heard?.["context"] as { lines: { text?: string }[] };
    const texts = context.lines.map((line) => line.text);
    // Beta last spoke before "Two": everything since is owed to it, and Alpha sees some again.
    expect(texts).toEqual(
      expect.arrayContaining([
        "Two, for nobody.",
        "@Alpha three",
        "Alpha here.",
        "Four, for nobody.",
      ]),
    );
  });
});

/**
 * An event with no room needs a named audience (agents review, finding 3). `agent.registered`
 * and `agent.updated` name no room, and went to everybody in the workspace: a guest in no room
 * with the agent, and an unrelated harness, were sent its name and its harness's own key for it.
 */
describe("who is told of an agent made or renamed", () => {
  async function socketFor(principal: Principal) {
    const sent: Record<string, unknown>[] = [];
    const session = new Session({
      socket: { send: (data) => sent.push(JSON.parse(data)), close: () => {} },
      principal,
      store: ws.gateway.deps.store,
      fanOut: ws.gateway.deps.fanOut,
      readModels: ws.gateway.deps.readModels,
      submitEvent: ws.gateway.deps.submitEvent,
      ids: ws.ids,
      serverVersion: "0.0.0-test",
      maxUnackedFrames: 10_000,
      now: () => Date.now(),
    });
    await session.receive(
      JSON.stringify({
        frame: "hello",
        protocol: { min: 1, max: 1 },
        client: { name: "test", version: "0.1.0" },
      }),
    );
    await session.receive(JSON.stringify({ frame: "subscribe", workspace_id: ws.workspaceId }));
    const names = () =>
      sent
        .filter((frame) => frame["frame"] === "event")
        .map((frame) => frame["event"] as Record<string, unknown>)
        .filter(
          (event) => event["type"] === "agent.registered" || event["type"] === "agent.updated",
        )
        .map((event) => String(event["name"]));
    const events = () =>
      sent
        .filter((frame) => frame["frame"] === "event")
        .map((frame) => frame["event"] as Record<string, unknown>);
    return { session, names, events };
  }

  const person = (who: { participantId: string; deviceId: string }, name: string, role: string) =>
    ({
      kind: "person",
      participantId: who.participantId,
      workspaceId: ws.workspaceId,
      displayName: name,
      via: "device_key",
      deviceId: who.deviceId,
      role,
    }) as Principal;

  const rename = (name: string) =>
    asHarness(ws.scout.headers, "POST", `/v1/harnesses/${ws.scout.participantId}/agents`, {
      key: "notes",
      name,
    });

  it("is its harness, and people told every agent, and nobody else", async () => {
    await declare(ws.scout.participantId, [HARNESS_CAPABILITIES.agents]);
    const gus = await ws.addPerson("Gus", "guest");
    const ledger = await ws.gateway.deps.addHarness({
      principal: arjun(),
      displayName: "Ledger",
      openDirectSpace: false,
    });
    if (!ledger.ok) throw new Error("could not add Ledger");
    await declare(ledger.value.harnessId, [HARNESS_CAPABILITIES.agents]);

    const owner = await socketFor(person(ws.arjun, "Arjun", "owner"));
    const member = await socketFor(person(ws.dana, "Dana", "member"));
    const guest = await socketFor(person(gus, "Gus", "guest"));
    const own = await socketFor(scout());
    const other = await socketFor(harness(ledger.value.harnessId, "Ledger"));
    const before = await head();

    await rename("Divorce lawyer notes");
    await rename("Custody plan");
    for (const each of [owner, member, guest, own, other]) await each.session.settled;

    const both = ["Divorce lawyer notes", "Custody plan"];
    expect(owner.names()).toEqual(both);
    expect(own.names()).toEqual(both);
    // A member is told who every person is, not every agent: one in no room of theirs is the
    // owner's to know about (his call of 19 October 2026, ADR 0034's addendum).
    expect(member.names()).toEqual([]);
    expect(guest.names()).toEqual([]);
    expect(other.names()).toEqual([]);

    // The same on a replay: a device that was away is sent what it would have been sent live.
    const { store } = ws.gateway.deps;
    const replayed = async (scope: Parameters<typeof store.since>[3]) =>
      (await store.since(ws.workspaceId, before, 100, scope)).events
        .filter((event) => event.type.startsWith("agent."))
        .map((event) => String(event.payload["name"]));
    expect(await replayed({ spaces: [], participantId: gus.participantId })).toEqual([]);
    expect(
      await replayed({ spaces: [], participantId: ledger.value.harnessId, alsoIs: [] }),
    ).toEqual([]);
    expect(
      await replayed({ spaces: [], participantId: ws.dana.participantId, seesDirectory: true }),
    ).toEqual([]);
    expect(
      await replayed({
        spaces: [],
        participantId: ws.arjun.participantId,
        seesDirectory: true,
        seesAgents: true,
      }),
    ).toEqual(both);
    // Its own harness, which answers to its agents: the scope a harness's connection reads with.
    const notes = await ws.gateway.deps.readModels.agentByKey(
      ws.workspaceId,
      ws.scout.participantId,
      "notes",
    );
    expect(
      await replayed({
        spaces: [],
        participantId: ws.scout.participantId,
        alsoIs: [notes?.agent_id ?? ""],
      }),
    ).toEqual(both);
  });

  it("is whoever shares a room with it too, and their directory names its harness", async () => {
    const gus = await ws.addPerson("Gus", "guest");
    const shared = await room("Shared");
    await ok(arjun(), {
      type: "membership.added",
      space_id: shared,
      participant_id: gus.participantId,
      participant_kind: "person",
      role: "guest",
    });
    await rename("Notes");
    const notes = (
      await ws.gateway.deps.readModels.agentByKey(ws.workspaceId, ws.scout.participantId, "notes")
    )?.agent_id as string;
    await ok(arjun(), {
      type: "membership.added",
      space_id: shared,
      participant_id: notes,
      participant_kind: "agent",
      role: "member",
    });
    const guest = await socketFor(person(gus, "Gus", "guest"));
    const before = await head();
    await rename("Field notes");
    await guest.session.settled;
    expect(guest.names()).toEqual(["Field notes"]);
    const { store } = ws.gateway.deps;
    const page = await store.since(ws.workspaceId, before, 100, {
      spaces: [shared],
      participantId: gus.participantId,
    });
    expect(page.events.map((event) => event.type)).toContain("agent.updated");

    // The guest's directory holds the agent, and the harness it belongs to by name.
    const response = await ws.gateway.app.fetch(
      new Request("http://chips.local/v1/participants", {
        headers: gus.sign("GET", "/v1/participants", ""),
      }),
    );
    const directory = (await response.json()) as { participants: { display_name: string }[] };
    expect(directory.participants.map((each) => each.display_name)).toEqual(
      expect.arrayContaining(["Gus", "Arjun", "Field notes", "Scout"]),
    );
  });

  it("is a member's in a room of theirs or of a harness they own, as is their directory (ADR 0034's addendum)", async () => {
    await declare(ws.scout.participantId, [HARNESS_CAPABILITIES.agents]);
    const mia = await ws.addPerson("Mia", "member");
    const asMia = person(mia, "Mia", "member");
    const shared = await room("Shared");
    const apart = await room("Apart");
    await ok(arjun(), {
      type: "membership.added",
      space_id: shared,
      participant_id: mia.participantId,
      participant_kind: "person",
      role: "member",
    });
    const scouts = (key: string, name: string) =>
      asHarness(ws.scout.headers, "POST", `/v1/harnesses/${ws.scout.participantId}/agents`, {
        key,
        name,
      });
    const notes = String((await scouts("notes", "Notes")).json["agent_id"]);
    const lawyer = String((await scouts("lawyer", "Divorce lawyer")).json["agent_id"]);
    expect((await add(shared, notes, "agent")).ok).toBe(true);
    expect((await add(apart, lawyer, "agent")).ok).toBe(true);
    // A harness of her own, on Arjun's workspace: its agents are hers, in a room or not.
    const box = await ws.gateway.deps.addHarness({
      principal: asMia,
      displayName: "Mia's box",
      openDirectSpace: false,
    });
    if (!box.ok) throw new Error("could not add Mia's box");
    await declare(box.value.harnessId, [HARNESS_CAPABILITIES.agents]);
    const hers = (name: string) =>
      asHarness(
        { authorization: `Bearer ${box.value.token}` },
        "POST",
        `/v1/harnesses/${box.value.harnessId}/agents`,
        { key: "helper", name },
      );
    await hers("Helper");

    const socket = await socketFor(asMia);
    const before = await head();
    await scouts("notes", "Field notes");
    await scouts("lawyer", "Custody plan");
    await hers("Mia's helper");
    await socket.session.settled;
    expect(socket.names()).toEqual(["Field notes", "Mia's helper"]);
    const { store } = ws.gateway.deps;
    const replayed = await store.since(ws.workspaceId, before, 100, {
      spaces: [shared],
      participantId: mia.participantId,
      seesDirectory: true,
    });
    expect(
      replayed.events
        .filter((event) => event.type === "agent.updated" || event.type === "agent.registered")
        .map((event) => String(event.payload["name"])),
    ).toEqual(["Field notes", "Mia's helper"]);

    // Taken out of her room, an agent keeps its name for what it said there, and nothing new
    // is told her of it.
    const moved = await ws.gateway.deps.moveAgent({
      principal: arjun(),
      agentId: notes,
      spaceId: apart,
    });
    expect(moved.ok).toBe(true);
    const read = async () => {
      const response = await ws.gateway.app.fetch(
        new Request("http://chips.local/v1/participants", {
          headers: mia.sign("GET", "/v1/participants", ""),
        }),
      );
      const body = (await response.json()) as { participants: { display_name: string }[] };
      return body.participants.map((each) => each.display_name);
    };
    const names = await read();
    // Every person, as before; of the agents, the one she met and her own, with their harnesses.
    expect(names).toEqual(
      expect.arrayContaining(["Arjun", "Dana", "Mia", "Field notes", "Scout", "Mia's helper"]),
    );
    expect(names).toContain("Mia's box");
    expect(names).not.toContain("Custody plan");
    const stays = await ws.gateway.app.fetch(
      new Request(`http://chips.local/v1/agents/${lawyer}/stays`, {
        headers: mia.sign("GET", `/v1/agents/${lawyer}/stays`, ""),
      }),
    );
    expect(stays.status).toBe(404);

    // Nor may she put a free agent of the owner's in her room by its id, which no list of hers
    // offers; only her own (rule 16, his call of the same evening).
    const spare = String((await scouts("spare", "Spare")).json["agent_id"]);
    const putIn = (participantId: string) =>
      submit(asMia, {
        type: "membership.added",
        space_id: shared,
        participant_id: participantId,
        participant_kind: "agent",
        role: "member",
      });
    expect(await putIn(spare)).toMatchObject({ ok: false, error: { kind: "wrong_role" } });
    const helper = await ws.gateway.deps.readModels.agentByKey(
      ws.workspaceId,
      box.value.harnessId,
      "helper",
    );
    expect((await putIn(helper?.agent_id ?? "")).ok).toBe(true);
  });

  it("tells a person's archive and delete (ADR 0095) to the agent's harness, not another's", async () => {
    await declare(ws.scout.participantId, [HARNESS_CAPABILITIES.agents]);
    const ledger = await ws.gateway.deps.addHarness({
      principal: arjun(),
      displayName: "Ledger",
      openDirectSpace: false,
    });
    if (!ledger.ok) throw new Error("could not add Ledger");
    await declare(ledger.value.harnessId, [HARNESS_CAPABILITIES.agents]);
    const notes = String((await rename("Field notes")).json["agent_id"]);
    const own = await socketFor(scout());
    const other = await socketFor(harness(ledger.value.harnessId, "Ledger"));
    const kept = await ws.gateway.deps.archiveAgent({
      principal: arjun(),
      agentId: notes,
      state: "archived",
    });
    expect(kept.ok).toBe(true);
    const deleted = await ws.gateway.deps.deleteAgent({ principal: arjun(), agentId: notes });
    expect(deleted.ok).toBe(true);
    for (const each of [own, other]) await each.session.settled;
    const types = (socket: Awaited<ReturnType<typeof socketFor>>) =>
      socket
        .events()
        .filter((event) => event["agent_id"] === notes)
        .map((event) => event["type"]);
    expect(types(own)).toEqual(["agent.updated", "agent.deleted"]);
    expect(types(other)).toEqual([]);
  });

  it("refuses a harness's post that names no room, which would have gone to everybody", async () => {
    const refused = await submit(scout(), {
      type: "message.post",
      text: "To the whole workspace.",
    });
    expect(refused).toMatchObject({ ok: false, error: { kind: "invalid" } });
    const everywhere = await ws.db
      .selectFrom("events")
      .select("id")
      .where("type", "=", "message.post")
      .where("space_id", "is", null)
      .execute();
    expect(everywhere).toEqual([]);
  });
});
