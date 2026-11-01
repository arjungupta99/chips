/**
 * Agents on one connection (ADR 0087, Phase 2), end to end through the door and the socket: a
 * harness speaks as its agents, is told which of them a message is for, and — until it declares
 * `agents` — is shown everything as it knew it, so a harness written before agents goes on
 * answering unchanged (the addendum of 29 September).
 *
 * The unchanged adapters' own rules are the checks here: Jacobian's `readInbound` reads
 * `from.kind === "harness"` as another agent and anything else as a person, its `onAgent` and the
 * bridge look for their own id in `addressed_to`, and both leave a context line addressed to them
 * out of what they are told (`heardIn`).
 */

import { HARNESS_CAPABILITIES, messageIdOf } from "@chipschat/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Principal } from "../../application/index.js";
import { createTestWorkspace, type TestWorkspace } from "../../testing/workspace.js";
import { Session } from "./session.js";

let ws: TestWorkspace;

beforeEach(async () => {
  ws = await createTestWorkspace();
});

afterEach(async () => {
  await ws.close();
});

const HELLO = JSON.stringify({
  frame: "hello",
  protocol: { min: 1, max: 1 },
  client: { name: "adapter", version: "0.1.0" },
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

/** A connected, subscribed socket for a principal, and what it was sent. */
async function connect(principal: Principal) {
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
  await session.receive(HELLO);
  await session.receive(JSON.stringify({ frame: "subscribe", workspace_id: ws.workspaceId }));
  const events = () =>
    sent
      .filter((frame) => frame["frame"] === "event")
      .map((frame) => frame["event"] as Record<string, unknown>);
  return {
    sent,
    events,
    of: (type: string) => events().filter((event) => event["type"] === type),
    hello: () => events().find((event) => event["type"] === "hello"),
  };
}

/** Deliveries are queued per socket, one after another: let them land before reading. */
function settled(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 25));
}

async function submit(principal: Principal, event: Record<string, unknown>) {
  return ws.gateway.deps.submitEvent({ event, principal });
}

async function say(principal: Principal, text: string, extra: Record<string, unknown> = {}) {
  const result = await submit(principal, {
    type: "message.post",
    space_id: ws.spaceId,
    idempotency_key: `say-${ws.ids.next("event")}`,
    text,
    ...extra,
  });
  if (!result.ok) throw new Error(`refused: ${result.error.kind}: ${result.error.message}`);
  return result.value.event;
}

/** Scout's default agent, which the upgrade puts in its place in the room. */
async function scoutsAgent(): Promise<string> {
  const agent = await ws.gateway.deps.readModels.agentByKey(
    ws.workspaceId,
    ws.scout.participantId,
    ws.scout.participantId,
  );
  if (agent === undefined) throw new Error("Scout has no agent");
  return agent.agent_id;
}

/** A second harness of Arjun's, added to the room as a person adds it: its default agent. */
async function ledger(): Promise<{ id: string; agent: string; principal: Principal }> {
  const added = await ws.gateway.deps.addHarness({
    principal: arjun(),
    displayName: "Ledger",
    openDirectSpace: false,
  });
  if (!added.ok) throw new Error("could not add Ledger");
  const id = added.value.harnessId;
  const joined = await submit(arjun(), {
    type: "membership.added",
    space_id: ws.spaceId,
    participant_id: id,
    participant_kind: "harness",
    role: "member",
    idempotency_key: `add-${id}`,
  });
  if (!joined.ok) throw new Error(joined.error.message);
  const agent = await ws.gateway.deps.readModels.agentByKey(ws.workspaceId, id, id);
  return { id, agent: agent?.agent_id ?? "", principal: harness(id, "Ledger") };
}

async function declare(harnessId: string, capabilities: readonly string[]): Promise<void> {
  const done = await ws.gateway.deps.declareCapabilities({
    principal: arjun(),
    harnessId,
    capabilities,
  });
  if (!done.ok) throw new Error(done.error.message);
}

const scout = () => harness(ws.scout.participantId, "Scout");

describe("the upgrade, in the room", () => {
  it("puts Scout's agent in its place, and a rebuild comes out the same", async () => {
    const { appended } = await ws.gateway.deps.upgradeAgents.apply(ws.workspaceId);
    // The agent, its place in the room, and Chips saying where it is (Phase 4).
    expect(appended).toBe(3);
    const agent = await scoutsAgent();
    const { readModels } = ws.gateway.deps;
    expect(await readModels.memberRole(ws.workspaceId, ws.spaceId, agent)).toBe("member");
    expect(
      await readModels.memberRole(ws.workspaceId, ws.spaceId, ws.scout.participantId),
    ).toBeUndefined();
    expect(await readModels.replacedIn(ws.workspaceId, ws.spaceId)).toEqual([
      { from: ws.scout.participantId, to: agent },
    ]);
    // Run twice, it adds nothing.
    expect((await ws.gateway.deps.upgradeAgents.apply(ws.workspaceId)).appended).toBe(0);
    const before = await readModels.membersOf(ws.workspaceId, ws.spaceId);
    await ws.gateway.deps.store.rebuild(ws.workspaceId);
    expect(await readModels.membersOf(ws.workspaceId, ws.spaceId)).toEqual(before);
    expect(await readModels.agentsOf(ws.workspaceId, ws.scout.participantId)).toMatchObject([
      { agent_id: agent, name: "Scout", key: ws.scout.participantId, spaces: [ws.spaceId] },
    ]);
  });

  it("keeps each harness's agents with its budget and its runs", async () => {
    await ws.gateway.deps.upgradeAgents.apply(ws.workspaceId);
    const runId = ws.ids.next("run");
    const started = await submit(scout(), {
      type: "run.started",
      space_id: ws.spaceId,
      run_id: runId,
      idempotency_key: "run",
      goal: "Confirm the order",
      plan: [],
    });
    expect(started.ok).toBe(true);
    const run = await ws.gateway.deps.readModels.run(ws.workspaceId, runId);
    expect(run).toMatchObject({
      harness_id: ws.scout.participantId,
      agent_id: await scoutsAgent(),
    });
  });
});

describe("a harness speaking as itself (ADR 0087, point 2)", () => {
  beforeEach(async () => {
    await ws.gateway.deps.upgradeAgents.apply(ws.workspaceId);
  });

  it("is read as its one agent in the room, with its harness beside it", async () => {
    const said = await say(scout(), "The order is confirmed.");
    expect(said.actor).toEqual({
      kind: "agent",
      id: await scoutsAgent(),
      harness_id: ws.scout.participantId,
    });
  });

  it("may name its own agent, and not anybody else's", async () => {
    const other = await ledger();
    const own = await submit(scout(), {
      type: "message.post",
      space_id: ws.spaceId,
      idempotency_key: "own",
      text: "mine",
      actor: { kind: "agent", id: await scoutsAgent() },
    });
    expect(own.ok).toBe(true);
    const forged = await submit(scout(), {
      type: "message.post",
      space_id: ws.spaceId,
      idempotency_key: "forged",
      text: "not mine",
      actor: { kind: "agent", id: other.agent },
    });
    expect(forged.ok).toBe(false);
    if (!forged.ok) expect(forged.error.kind).toBe("wrong_actor");
  });

  it("is asked which, in a room where it has two", async () => {
    const second = await ws.gateway.deps.readModels.agentByKey(
      ws.workspaceId,
      ws.scout.participantId,
      ws.scout.participantId,
    );
    // A second agent of Scout's, registered by Scout and added by a person.
    const response = await ws.gateway.app.fetch(
      new Request(`http://chips.local/v1/harnesses/${ws.scout.participantId}/agents`, {
        method: "POST",
        headers: { "content-type": "application/json", ...ws.scout.headers },
        body: JSON.stringify({ key: "tree", name: "Tree" }),
      }),
    );
    expect(response.status).toBe(201);
    const tree = (await response.json()) as { agent_id: string };
    const added = await submit(arjun(), {
      type: "membership.added",
      space_id: ws.spaceId,
      participant_id: tree.agent_id,
      participant_kind: "agent",
      role: "member",
      idempotency_key: "add-tree",
    });
    expect(added.ok).toBe(true);
    const refused = await submit(scout(), {
      type: "message.post",
      space_id: ws.spaceId,
      idempotency_key: "which",
      text: "Which of us?",
    });
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error.kind).toBe("which_agent");
    // Named, it is either of them.
    const named = await submit(scout(), {
      type: "message.post",
      space_id: ws.spaceId,
      idempotency_key: "named",
      text: "Tree here.",
      actor: { kind: "agent", id: tree.agent_id },
    });
    expect(named.ok).toBe(true);
    expect(second?.agent_id).not.toBe(tree.agent_id);
  });
});

describe("what a harness that has not declared agents is shown", () => {
  beforeEach(async () => {
    await ws.gateway.deps.upgradeAgents.apply(ws.workspaceId);
  });

  it("sees a message for its agent as one for itself, as Jacobian's adapter reads it", async () => {
    const wire = await connect(scout());
    const said = await say(arjun(), "Is the order in?");
    await settled();
    const heard = wire.of("message.new").find((event) => event["id"] === said.id);
    expect(heard).toBeDefined();
    // `readInbound`: a person is anything but `harness`; `onMessage` takes it.
    expect(heard?.["from"]).toMatchObject({
      participant_id: ws.arjun.participantId,
      kind: "person",
    });
    // `onAgent` and the bridge's `heard` look for their own id.
    expect(heard?.["addressed_to"]).toEqual([ws.scout.participantId]);
    expect(heard).not.toHaveProperty("for");
    expect(wire.hello()).not.toHaveProperty("agents");
  });

  it("sees another harness's agent as a harness, and an @ of itself as its own", async () => {
    const other = await ledger();
    const wire = await connect(scout());
    const said = await say(other.principal, "@Scout are the three quotes in?");
    await settled();
    const heard = wire.of("message.new").find((event) => event["id"] === said.id);
    // Another agent: `from.kind` is `harness`, under the agent's own id.
    expect(heard?.["from"]).toMatchObject({ participant_id: other.agent, kind: "harness" });
    expect(heard?.["addressed_to"]).toEqual([ws.scout.participantId]);
    expect(heard?.["mentions"]).toEqual([ws.scout.participantId]);
    // And whose agent that is, from the directory, as `ownerOf` reads it.
    const directory = await ws.gateway.app.fetch(
      new Request("http://chips.local/v1/participants", { headers: ws.scout.headers }),
    );
    const { participants } = (await directory.json()) as {
      participants: { id: string; kind: string; owner_id: string | null }[];
    };
    expect(participants.find((each) => each.id === other.agent)).toMatchObject({
      kind: "harness",
      owner_id: ws.arjun.participantId,
    });
    // Its own agent is itself there, once.
    expect(participants.filter((each) => each.id === ws.scout.participantId)).toHaveLength(1);
    expect(participants.some((each) => each.kind === "agent")).toBe(false);
  });

  it("is told its own words were its own, and leaves out a line that was for it", async () => {
    const other = await ledger();
    const wire = await connect(scout());
    await say(arjun(), "@Scout what did Ledger find?");
    await say(scout(), "Asking Ledger.");
    const asked = await say(other.principal, "@Scout all three are within 2%.");
    await settled();
    const heard = wire.of("message.new").find((event) => event["id"] === asked.id);
    const lines = (heard?.["context"] as { lines: Record<string, unknown>[] } | undefined)?.lines;
    // Since Scout last spoke: nothing but the question itself, which is not in its own context.
    expect(lines ?? []).toEqual([]);
    // Its own message came back as it sent it, under its own id.
    const own = wire.events().find((event) => event["text"] === "Asking Ledger.");
    expect((own?.["actor"] as { id: string } | undefined)?.id).toBe(ws.scout.participantId);
  });

  it("is never handed the events it has no words for", async () => {
    const wire = await connect(scout());
    await ledger();
    await settled();
    const types = new Set(wire.events().map((event) => event["type"]));
    expect(types.has("agent.registered")).toBe(false);
    expect(types.has("membership.replaced")).toBe(false);
    // Over HTTP neither.
    const page = await ws.gateway.app.fetch(
      new Request("http://chips.local/v1/events?since=0&limit=1000", { headers: ws.scout.headers }),
    );
    const { events } = (await page.json()) as { events: { type: string }[] };
    expect(events.some((event) => event.type === "membership.replaced")).toBe(false);
    expect(events.length).toBeGreaterThan(0);
  });
});

describe("a harness that has declared agents", () => {
  beforeEach(async () => {
    await ws.gateway.deps.upgradeAgents.apply(ws.workspaceId);
    await declare(ws.scout.participantId, [HARNESS_CAPABILITIES.agents]);
  });

  it("is told its agents at hello, and which of them a message is for", async () => {
    const agent = await scoutsAgent();
    const wire = await connect(scout());
    expect(wire.hello()?.["agents"]).toEqual([
      expect.objectContaining({ agent_id: agent, name: "Scout", spaces: [ws.spaceId] }),
    ]);
    const said = await say(arjun(), "Is the order in?");
    await settled();
    const heard = wire.of("message.new").find((event) => event["id"] === said.id);
    expect(heard?.["addressed_to"]).toEqual([agent]);
    expect(heard?.["for"]).toEqual([agent]);
  });

  it("is sent one delivery for a message two of its agents are for", async () => {
    const response = await ws.gateway.app.fetch(
      new Request(`http://chips.local/v1/harnesses/${ws.scout.participantId}/agents`, {
        method: "POST",
        headers: { "content-type": "application/json", ...ws.scout.headers },
        body: JSON.stringify({ key: "tree", name: "Tree" }),
      }),
    );
    const tree = (await response.json()) as { agent_id: string };
    await submit(arjun(), {
      type: "membership.added",
      space_id: ws.spaceId,
      participant_id: tree.agent_id,
      participant_kind: "agent",
      role: "member",
      idempotency_key: "add-tree",
    });
    const wire = await connect(scout());
    const said = await say(arjun(), "@all what do you two think?");
    await settled();
    const heard = wire.of("message.new").filter((event) => event["id"] === said.id);
    expect(heard).toHaveLength(1);
    expect(heard[0]?.["for"]).toEqual([await scoutsAgent(), tree.agent_id]);
  });

  it("hands one of its agents' words to another of them as that one's turn, never the sayer's (ADR 0101)", async () => {
    // O1 handing the page to O2 in the ASCII Art room, 3 October 2026: both OpenClaw's, and the
    // hand-over was nobody's turn.
    const response = await ws.gateway.app.fetch(
      new Request(`http://chips.local/v1/harnesses/${ws.scout.participantId}/agents`, {
        method: "POST",
        headers: { "content-type": "application/json", ...ws.scout.headers },
        body: JSON.stringify({ key: "tree", name: "Tree" }),
      }),
    );
    const tree = (await response.json()) as { agent_id: string };
    await submit(arjun(), {
      type: "membership.added",
      space_id: ws.spaceId,
      participant_id: tree.agent_id,
      participant_kind: "agent",
      role: "member",
      idempotency_key: "add-tree",
    });
    const agent = await scoutsAgent();
    const wire = await connect(scout());
    const handed = await say(scout(), "@Tree add K–O to the page.", {
      actor: { kind: "agent", id: agent },
    });
    const mused = await say(scout(), "Done with A–E.", { actor: { kind: "agent", id: agent } });
    await settled();
    const heard = wire.of("message.new").find((event) => event["id"] === handed.id);
    expect(heard?.["for"]).toEqual([tree.agent_id]);
    expect((heard?.["from"] as { participant_id: string } | undefined)?.participant_id).toBe(agent);
    expect(Object.keys((heard?.["room"] as { notes: object } | undefined)?.notes ?? {})).toEqual([
      tree.agent_id,
    ]);
    // Words for nobody else of its own come back as it said them.
    expect(wire.of("message.new").some((event) => event["id"] === mused.id)).toBe(false);
    expect(wire.events().find((event) => event["id"] === mused.id)?.["type"]).toBe("message.post");
  });

  it("hears Not right? on what one of its agents said (ADR 0200, PM-3)", async () => {
    // The live check of 18 October 2026: every reply is an agent's, and the door took a
    // correction only on a harness's, so not one reached a harness.
    const agent = await scoutsAgent();
    const wire = await connect(scout());
    const said = await say(scout(), "Delivery is on the 12th.", {
      actor: { kind: "agent", id: agent },
    });
    const sent = await submit(arjun(), {
      type: "feedback",
      space_id: ws.spaceId,
      message_id: messageIdOf(said.id),
      kind: "correction",
      text: "Wrong facts. The 19th, not the 12th.",
      idempotency_key: "not-right",
    });
    expect(sent.ok, JSON.stringify(sent)).toBe(true);
    await settled();
    expect(wire.of("feedback")).toEqual([
      expect.objectContaining({
        message_id: messageIdOf(said.id),
        kind: "correction",
        text: "Wrong facts. The 19th, not the 12th.",
      }),
    ]);
  });
});

describe("the room note (ADR 0092)", () => {
  beforeEach(async () => {
    await ws.gateway.deps.upgradeAgents.apply(ws.workspaceId);
    await declare(ws.scout.participantId, [HARNESS_CAPABILITIES.agents]);
  });

  async function tree(): Promise<string> {
    const made = await asHarness(
      ws.scout.headers,
      "POST",
      `/v1/harnesses/${ws.scout.participantId}/agents`,
      { key: "tree", name: "Tree" },
    );
    const id = String(made.json["agent_id"]);
    await submit(arjun(), {
      type: "membership.added",
      space_id: ws.spaceId,
      participant_id: id,
      participant_kind: "agent",
      role: "member",
      idempotency_key: "add-tree",
    });
    return id;
  }

  it("lists the room with handles, and gives each who takes the turn a note", async () => {
    const scoutAgent = await scoutsAgent();
    const treeAgent = await tree();
    const wire = await connect(scout());
    const said = await say(arjun(), "@all what do you two think?");
    await settled();
    const heard = wire.of("message.new").find((event) => event["id"] === said.id);
    const room = heard?.["room"] as {
      members: { participant_id: string; kind: string; name: string; handle?: string }[];
      notes: Record<string, string>;
    };
    expect(room.members.map((member) => [member.kind, member.name, member.handle])).toEqual(
      expect.arrayContaining([
        ["person", "Arjun", "@Arjun"],
        ["agent", "Scout", "@Scout"],
        ["agent", "Tree", "@Tree"],
      ]),
    );
    expect(Object.keys(room.notes).sort()).toEqual([scoutAgent, treeAgent].sort());
    // Scout's agent is named as its harness; Tree is listed as Scout's (ADR 0101).
    expect(room.notes[treeAgent]).toMatch(
      /Scout \(agent, @Scout\).*and you, Tree \(Scout agent, @Tree\)\./,
    );
    expect(room.notes[scoutAgent]).toMatch(
      /Tree \(Scout agent, @Tree\).*and you, Scout \(@Scout\)\./,
    );
    expect(room.notes[treeAgent]).toContain("only those you @-mention act on it");
  });

  it("is sent with nothing overheard", async () => {
    const other = await ledger();
    const wire = await connect(scout());
    const said = await say(arjun(), "@Ledger is the invoice paid?");
    await settled();
    expect(said.payload["addressed_to"]).toEqual([other.agent]);
    const overheard = wire.of("message.overheard").find((event) => event["id"] === said.id);
    expect(overheard).toBeDefined();
    expect(overheard?.["room"]).toBeUndefined();
  });

  it("names a harness that holds a room it was asked for, as the one who takes the turn, by the name held for its agent", async () => {
    await declare(ws.scout.participantId, [
      HARNESS_CAPABILITIES.agents,
      HARNESS_CAPABILITIES.newSpaces,
    ]);
    const room = ws.ids.next("space");
    for (const event of [
      { type: "space.created", space_id: room, kind: "group", asked_of: ws.scout.participantId },
      {
        type: "membership.added",
        space_id: room,
        participant_id: ws.scout.participantId,
        participant_kind: "harness",
        role: "member",
      },
    ]) {
      const done = await submit(arjun(), { ...event, idempotency_key: `${event.type}-${room}` });
      if (!done.ok) throw new Error(done.error.message);
    }
    const wire = await connect(scout());
    const said = await say(arjun(), "Plan the week", { space_id: room });
    await settled();
    const heard = wire.of("message.new").find((event) => event["id"] === said.id);
    const note = heard?.["room"] as { notes: Record<string, string> };
    expect(Object.keys(note.notes)).toEqual([ws.scout.participantId]);
    // The first name the room holds for its agent, its own beside it (ADR 0150).
    const [held] = await ws.gateway.deps.readModels.heldNames(ws.workspaceId);
    expect(note.notes[ws.scout.participantId]).toContain(
      `and you, ${held?.name} (Scout agent, @${held?.name}).`,
    );
  });
});

describe("a harness's name, for its one agent in a room (the addendum, point 2)", () => {
  it("names a room's agent named after the room", async () => {
    const added = await ws.gateway.deps.addHarness({
      principal: arjun(),
      displayName: "Jacobian",
      openDirectSpace: false,
      capabilities: [HARNESS_CAPABILITIES.followsRooms],
    });
    if (!added.ok) throw new Error("could not add");
    const jacobian = harness(added.value.harnessId, "Jacobian");
    const opened = await ws.gateway.deps.openSpace({
      principal: jacobian,
      key: "e0d0f115",
      title: "Chess Game",
    });
    if (!opened.ok) throw new Error(opened.error.message);
    const room = opened.value.spaceId;
    // The room holds the key's agent, named after the room (the addendum, point 4 and 5).
    const agent = await ws.gateway.deps.readModels.agentByKey(
      ws.workspaceId,
      jacobian.participantId,
      "e0d0f115",
    );
    expect(agent).toMatchObject({ name: "Chess Game", spaces: [room] });
    const said = await submit(arjun(), {
      type: "message.post",
      space_id: room,
      idempotency_key: "at",
      text: "@Jacobian which opening?",
    });
    if (!said.ok) throw new Error(said.error.message);
    expect(said.value.event.payload["mentions"]).toEqual([agent?.agent_id]);
    expect(said.value.event.payload["addressed_to"]).toEqual([agent?.agent_id]);
    // A retitle by the harness renames the agent with the room.
    await ws.gateway.deps.openSpace({ principal: jacobian, key: "e0d0f115", title: "Openings" });
    expect(
      (
        await ws.gateway.deps.readModels.agentByKey(
          ws.workspaceId,
          jacobian.participantId,
          "e0d0f115",
        )
      )?.name,
    ).toBe("Openings");
  });
});

describe("a room asked from the + (the addendum, point 5)", () => {
  it("holds the harness until it claims the room, then the key's agent in its place", async () => {
    const added = await ws.gateway.deps.addHarness({
      principal: arjun(),
      displayName: "Jacobian",
      openDirectSpace: false,
      capabilities: [HARNESS_CAPABILITIES.newSpaces, HARNESS_CAPABILITIES.followsRooms],
    });
    if (!added.ok) throw new Error("could not add");
    const jacobian = harness(added.value.harnessId, "Jacobian");
    const room = ws.ids.next("space");
    for (const event of [
      { type: "space.created", space_id: room, kind: "group", asked_of: jacobian.participantId },
      {
        type: "membership.added",
        space_id: room,
        participant_id: jacobian.participantId,
        participant_kind: "harness",
        role: "member",
      },
    ]) {
      const done = await submit(arjun(), { ...event, idempotency_key: `${event.type}-${room}` });
      if (!done.ok) throw new Error(done.error.message);
    }
    const { readModels } = ws.gateway.deps;
    // Asked, and not claimed: the harness itself, as its adapter lists it.
    expect(await readModels.memberRole(ws.workspaceId, room, jacobian.participantId)).toBe(
      "member",
    );
    expect(await readModels.spacesAskedOf(ws.workspaceId, jacobian.participantId)).toHaveLength(1);
    // Holding a first name for its agent (ADR 0150).
    const [held] = await readModels.heldNames(ws.workspaceId);

    // It begins its turn on the first words as itself, and claims the room seconds into it.
    const run = ws.ids.next("run");
    const started = await submit(jacobian, {
      type: "run.started",
      space_id: room,
      run_id: run,
      idempotency_key: `${run}-started`,
      goal: "What models are you on?",
      plan: [],
    });
    if (!started.ok) throw new Error(started.error.message);

    const claimed = await ws.gateway.deps.openSpace({
      principal: jacobian,
      key: "5b1c",
      title: "Kitchen remodel",
      spaceId: room,
    });
    expect(claimed.ok).toBe(true);
    const agent = await readModels.agentByKey(ws.workspaceId, jacobian.participantId, "5b1c");
    // Named by the hold, not after the room it claimed (ADR 0150).
    expect(agent).toMatchObject({ name: held?.name, spaces: [room] });
    expect(
      await readModels.memberRole(ws.workspaceId, room, jacobian.participantId),
    ).toBeUndefined();
    expect(await readModels.replacedIn(ws.workspaceId, room)).toEqual([
      { from: jacobian.participantId, to: agent?.agent_id },
    ]);
    // The turn going is its agent's, so the room counts it as working.
    expect(await readModels.turnsIn(ws.workspaceId, room)).toEqual([
      expect.objectContaining({ run_id: run, agent_id: agent?.agent_id, going: true }),
    ]);
  });
});

/** A harness's HTTP call, signed with its token. */
async function asHarness(
  headers: Readonly<Record<string, string>>,
  method: string,
  path: string,
  body: unknown,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const response = await ws.gateway.app.fetch(
    new Request(`http://chips.local${path}`, {
      method,
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    }),
  );
  return { status: response.status, json: (await response.json()) as Record<string, unknown> };
}

describe("an agent attached in another's place (Phase 3)", () => {
  beforeEach(async () => {
    await ws.gateway.deps.upgradeAgents.apply(ws.workspaceId);
  });

  async function tree(): Promise<string> {
    const made = await asHarness(
      ws.scout.headers,
      "POST",
      `/v1/harnesses/${ws.scout.participantId}/agents`,
      { key: "tree", name: "Tree" },
    );
    return String(made.json["agent_id"]);
  }

  it("takes the default agent's place, once, and what was said there is its", async () => {
    const before = await say(scout(), "Before the swap.");
    const agent = await tree();
    const attach = (replacing: string) =>
      asHarness(ws.scout.headers, "POST", `/v1/agents/${agent}/attach`, {
        space_id: ws.spaceId,
        replacing,
      });
    const first = await attach(await scoutsAgent());
    expect(first).toMatchObject({ status: 200, json: { attached: true } });
    expect((await attach(await scoutsAgent())).json["attached"]).toBe(false);

    const { readModels } = ws.gateway.deps;
    expect(await readModels.memberRole(ws.workspaceId, ws.spaceId, agent)).toBe("member");
    expect(
      await readModels.memberRole(ws.workspaceId, ws.spaceId, await scoutsAgent()),
    ).toBeUndefined();
    // Whoever holds the place last: the harness's words before the upgrade, and its default
    // agent's after, are Tree's now.
    expect(await readModels.replacedIn(ws.workspaceId, ws.spaceId)).toEqual([
      { from: ws.scout.participantId, to: agent },
      { from: await scoutsAgent(), to: agent },
    ]);
    expect(before.actor).toMatchObject({ kind: "agent", id: await scoutsAgent() });
    // What Scout says as itself there now is Tree's.
    const after = await say(scout(), "After the swap.");
    expect(after.actor).toMatchObject({ kind: "agent", id: agent });

    // And back again, and over once more: each is a change of its own.
    const back = await asHarness(
      ws.scout.headers,
      "POST",
      `/v1/agents/${await scoutsAgent()}/attach`,
      {
        space_id: ws.spaceId,
        replacing: agent,
      },
    );
    expect(back.json["attached"]).toBe(true);
    expect((await attach(await scoutsAgent())).json["attached"]).toBe(true);
    const rebuiltBefore = await readModels.membersOf(ws.workspaceId, ws.spaceId);
    await ws.gateway.deps.store.rebuild(ws.workspaceId);
    expect(await readModels.membersOf(ws.workspaceId, ws.spaceId)).toEqual(rebuiltBefore);
  });

  it("is refused for anybody's agent or room but the harness's own", async () => {
    const other = await ledger();
    const agent = await tree();
    // A room of Arjun's, which Scout is not in. (Ledger's agent is in Scout's room already, and an
    // agent is in one room at a time.)
    const room = ws.ids.next("space");
    const made = await submit(arjun(), {
      type: "space.created",
      space_id: room,
      kind: "group",
      idempotency_key: `space.created-${room}`,
    });
    if (!made.ok) throw new Error(made.error.message);
    const attach = (id: string, body: Record<string, unknown>) =>
      asHarness(ws.scout.headers, "POST", `/v1/agents/${id}/attach`, body);
    // Another harness's agent, in its place or anywhere.
    expect(
      (await attach(other.agent, { space_id: ws.spaceId, replacing: await scoutsAgent() })).status,
    ).toBe(403);
    expect((await attach(agent, { space_id: ws.spaceId, replacing: other.agent })).status).toBe(
      403,
    );
    // A room Scout is not in: nothing of its own there to take the place of.
    expect(
      (await attach(agent, { space_id: room, replacing: ws.scout.participantId })).status,
    ).toBe(422);
    expect(
      (await attach(agent, { space_id: "spc_nowhere", replacing: ws.scout.participantId })).status,
    ).toBe(404);
    expect(
      (await attach("agt_nobody", { space_id: ws.spaceId, replacing: ws.scout.participantId }))
        .status,
    ).toBe(404);
    expect((await attach(agent, { space_id: ws.spaceId })).status).toBe(422);
  });

  it("archives an agent, brings it back, and a name comes back too", async () => {
    const path = `/v1/harnesses/${ws.scout.participantId}/agents`;
    const register = (body: Record<string, unknown>) =>
      asHarness(ws.scout.headers, "POST", path, body);
    const made = await register({ key: "tax", name: "Tax", state: "archived" });
    expect(made).toMatchObject({ status: 201, json: { state: "archived", created: true } });
    expect((await register({ key: "tax", name: "Tax", state: "archived" })).json).toMatchObject({
      state: "archived",
      renamed: false,
    });
    expect((await register({ key: "tax", name: "Tax", state: "active" })).json["state"]).toBe(
      "active",
    );
    await register({ key: "tax", name: "Taxes" });
    await register({ key: "tax", name: "Tax" });
    expect((await register({ key: "tax", name: "Taxes" })).json["renamed"]).toBe(true);
    const listed = await ws.gateway.deps.readModels.agentByKey(
      ws.workspaceId,
      ws.scout.participantId,
      "tax",
    );
    expect(listed).toMatchObject({ name: "Taxes", state: "active" });
    expect((await register({ key: "tax", name: "Tax", state: "gone" })).status).toBe(422);
  });
});
