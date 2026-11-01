/**
 * A room's lead (ADR 0104), end to end through the doors, the sweep and the socket. A person
 * chooses the lead, or a + room's claim does. Every agent's turn says who leads it, which agents
 * have a turn going, and what is news to the taker: that it has just joined, or who joined since
 * it last spoke. Once the room goes still on an agent's words that reached nobody, the sweep hands
 * them to the lead, once, as `message.new` with `handed` and `lead`.
 *
 * The fifth ASCII Art room, 3 October 2026, is the shape: J1 said "F–J done." to nobody, and the
 * room sat until Arjun noticed. Scout plays the lead here and Ledger the agent that finished.
 */

import { HARNESS_CAPABILITIES } from "@chipschat/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createLeadTurns, type Principal } from "../../application/index.js";
import { createTestWorkspace, type TestWorkspace } from "../../testing/workspace.js";
import { Session } from "./session.js";

let ws: TestWorkspace;

beforeEach(async () => {
  ws = await createTestWorkspace();
  await ws.gateway.deps.upgradeAgents.apply(ws.workspaceId);
  await declare(ws.scout.participantId);
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

const scout = () => harness(ws.scout.participantId, "Scout");

async function declare(harnessId: string): Promise<void> {
  const done = await ws.gateway.deps.declareCapabilities({
    principal: arjun(),
    harnessId,
    capabilities: [HARNESS_CAPABILITIES.agents],
  });
  if (!done.ok) throw new Error(done.error.message);
}

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
  return { of: (type: string) => events().filter((event) => event["type"] === type) };
}

/** Deliveries are queued per socket, one after another: let them land before reading. */
function settled(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 25));
}

async function submit(principal: Principal, event: Record<string, unknown>) {
  const result = await ws.gateway.deps.submitEvent({ event, principal });
  if (!result.ok) throw new Error(`refused: ${result.error.kind}: ${result.error.message}`);
  return result.value.event;
}

async function say(principal: Principal, text: string) {
  return submit(principal, {
    type: "message.post",
    space_id: ws.spaceId,
    idempotency_key: `say-${ws.ids.next("event")}`,
    text,
  });
}

async function agentOf(harnessId: string): Promise<string> {
  const agent = await ws.gateway.deps.readModels.agentByKey(ws.workspaceId, harnessId, harnessId);
  if (agent === undefined) throw new Error("no agent");
  return agent.agent_id;
}

/** A second harness of Arjun's, put in the room as a person puts it there: its default agent. */
async function ledger(): Promise<{ agent: string; principal: Principal }> {
  const added = await ws.gateway.deps.addHarness({
    principal: arjun(),
    displayName: "Ledger",
    openDirectSpace: false,
  });
  if (!added.ok) throw new Error("could not add Ledger");
  const id = added.value.harnessId;
  await declare(id);
  await submit(arjun(), {
    type: "membership.added",
    space_id: ws.spaceId,
    participant_id: id,
    participant_kind: "harness",
    role: "member",
    idempotency_key: `add-${id}`,
  });
  return { agent: await agentOf(id), principal: harness(id, "Ledger") };
}

async function lead(agentId: string | null) {
  return ws.gateway.deps.setLead({ principal: arjun(), spaceId: ws.spaceId, agentId });
}

/** The sweep's half, as the clock reads `ms` from now. */
function sweepIn(ms: number) {
  const at = () => Date.now() + ms;
  return createLeadTurns({
    store: ws.gateway.deps.store,
    readModels: ws.gateway.deps.readModels,
    ids: ws.ids,
    clock: { nowMs: at, now: () => new Date(at()), nowIso: () => new Date(at()).toISOString() },
  })();
}

/** The room's note for one agent, on the newest turn its harness was handed. */
function noteOf(turns: Record<string, unknown>[], agentId: string): string {
  const room = turns.at(-1)?.["room"] as { notes: Record<string, string> } | undefined;
  return room?.notes[agentId] ?? "";
}

describe("choosing the lead (ADR 0104)", () => {
  it("is a person's, one of the room's agents or nobody, and the same choice changes nothing", async () => {
    const scoutAgent = await agentOf(ws.scout.participantId);
    expect(await lead(scoutAgent)).toEqual({ ok: true, changed: true, lead: scoutAgent });
    expect(await lead(scoutAgent)).toEqual({ ok: true, changed: false, lead: scoutAgent });
    const { readModels } = ws.gateway.deps;
    expect(await readModels.leadOf(ws.workspaceId, ws.spaceId)).toBe(scoutAgent);

    expect(await lead("agt_01K4ZQPX0000000000000000ZZ")).toMatchObject({
      ok: false,
      error: { kind: "not_there" },
    });
    expect(
      await ws.gateway.deps.setLead({ principal: scout(), spaceId: ws.spaceId, agentId: null }),
    ).toMatchObject({ ok: false, error: { kind: "not_allowed" } });

    expect(await lead(null)).toEqual({ ok: true, changed: true, lead: null });
    expect(await readModels.leadOf(ws.workspaceId, ws.spaceId)).toBeUndefined();
  });

  it("goes with the agent when it leaves the room", async () => {
    const other = await ledger();
    await lead(other.agent);
    await submit(arjun(), {
      type: "membership.removed",
      space_id: ws.spaceId,
      participant_id: other.agent,
      idempotency_key: `out-${other.agent}`,
    });
    expect(await ws.gateway.deps.readModels.leadOf(ws.workspaceId, ws.spaceId)).toBeUndefined();
  });

  it("is the agent that claimed a room asked of its harness from the +", async () => {
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
      await submit(arjun(), { ...event, idempotency_key: `${event.type}-${room}` });
    }
    const { readModels } = ws.gateway.deps;
    expect(await readModels.leadOf(ws.workspaceId, room)).toBeUndefined();
    const claimed = await ws.gateway.deps.openSpace({
      principal: jacobian,
      key: "5b1c",
      title: "ASCII Art",
      spaceId: room,
    });
    expect(claimed.ok).toBe(true);
    const agent = await readModels.agentByKey(ws.workspaceId, jacobian.participantId, "5b1c");
    expect(await readModels.leadOf(ws.workspaceId, room)).toBe(agent?.agent_id);
  });
});

describe("a turn in a room with a lead (ADR 0104)", () => {
  it("says who leads, to the lead as you", async () => {
    const other = await ledger();
    const scoutAgent = await agentOf(ws.scout.participantId);
    await lead(scoutAgent);
    const scoutSide = await connect(scout());
    const ledgerSide = await connect(other.principal);
    await say(arjun(), "@Scout @Ledger the alphabet, five letters each");
    await settled();
    const scoutTurns = scoutSide.of("message.new");
    const ledgerTurns = ledgerSide.of("message.new");
    expect(noteOf(scoutTurns, scoutAgent)).toContain(
      "You lead here: you hand out the work, and what is nobody's turn comes to you.",
    );
    expect(noteOf(ledgerTurns, other.agent)).toContain(
      "Scout leads here: it hands out the work, and what is nobody's turn goes to it.",
    );
    const room = ledgerTurns.at(-1)?.["room"] as { members: Record<string, unknown>[] } | undefined;
    const marked = room?.members.find((member) => member["participant_id"] === scoutAgent);
    expect(marked?.["lead"]).toBe(true);
  });

  it("says who has a turn going, with its last step", async () => {
    const other = await ledger();
    const scoutAgent = await agentOf(ws.scout.participantId);
    const run = ws.ids.next("run");
    await submit(other.principal, {
      type: "run.started",
      space_id: ws.spaceId,
      run_id: run,
      idempotency_key: `${run}-started`,
      goal: "F–J",
      plan: [],
    });
    await submit(other.principal, {
      type: "step.log",
      space_id: ws.spaceId,
      run_id: run,
      idempotency_key: `${run}-step`,
      step_id: "edit",
      status: "started",
      summary: "Editing ascii-alphabet.html",
    });
    const scoutSide = await connect(scout());
    await say(arjun(), "@Scout how is it going?");
    await settled();
    expect(noteOf(scoutSide.of("message.new"), scoutAgent)).toContain(
      "Working now: Ledger, under a minute in (last step: Editing ascii-alphabet.html).",
    );
  });

  it("tells an agent that is not the lead that a message chosen for it with no @ is its, and one for all that all have it", async () => {
    const other = await ledger();
    await lead(await agentOf(ws.scout.participantId));
    const ledgerSide = await connect(other.principal);
    const send = (text: string, to: string[] | "all") =>
      submit(arjun(), {
        type: "message.post",
        space_id: ws.spaceId,
        idempotency_key: `say-${ws.ids.next("event")}`,
        text,
        to,
      });
    // 15 October 2026: Nova, chosen in the composer beside the lead Tomas, passed four turns.
    await send("Say hello", [other.agent]);
    await settled();
    expect(noteOf(ledgerSide.of("message.new"), other.agent)).toMatch(
      /^Arjun sent this message to you without an @: it is yours to answer\. In this space:/,
    );
    await send("@Ledger say hello", [other.agent]);
    await settled();
    expect(noteOf(ledgerSide.of("message.new"), other.agent)).toMatch(/^In this space:/);
    // 30 October 2026: a question for all four agents, passed on by the lead to the three who
    // had it, was answered twice by each (ADR 0249).
    await send("Say hello, both", "all");
    await settled();
    expect(noteOf(ledgerSide.of("message.new"), other.agent)).toMatch(
      /^Arjun sent this message to every agent here, so each of you has it: answer it yourself, and don't pass it on with an @\. In this space:/,
    );
    // The rules it ends with come apart too, for a session that holds them (ADR 0250).
    const room = ledgerSide.of("message.new").at(-1)?.["room"] as { rules: Record<string, string> };
    expect(room.rules[other.agent]).toMatch(/^Everyone here reads what you write; only those/);
    expect(noteOf(ledgerSide.of("message.new"), other.agent)).toMatch(
      / answer NO_REPLY .*waiting\.$/,
    );
  });

  it("tells a newcomer it has just joined, and the others who joined since they last spoke", async () => {
    const scoutAgent = await agentOf(ws.scout.participantId);
    await say(scout(), "Here first.");
    const other = await ledger();
    const ledgerSide = await connect(other.principal);
    const scoutSide = await connect(scout());
    await say(arjun(), "@Ledger @Scout welcome Ledger in");
    await settled();
    expect(noteOf(ledgerSide.of("message.new"), other.agent)).toMatch(
      /^You joined this space just now, added by Arjun\. In this space:/,
    );
    expect(noteOf(scoutSide.of("message.new"), scoutAgent)).toMatch(
      /^New since your last turn: Ledger \(agent, @Ledger\), added by Arjun\. In this space:/,
    );
  });
});

describe("what was nobody's turn, handed to the lead (ADR 0104)", () => {
  async function room() {
    const other = await ledger();
    const scoutAgent = await agentOf(ws.scout.participantId);
    await lead(scoutAgent);
    return { other, scoutAgent };
  }

  it("is handed once the room has been still a while, once, with a note that says why", async () => {
    const { other, scoutAgent } = await room();
    const scoutSide = await connect(scout());
    const done = await say(other.principal, "F–J done.");
    expect(await sweepIn(5000)).toEqual([]);
    const handed = await sweepIn(30_000);
    expect(handed).toHaveLength(1);
    await settled();
    const turn = scoutSide.of("message.new").at(-1) ?? {};
    expect(turn).toMatchObject({ handed: true, lead: true, for: [scoutAgent], text: "F–J done." });
    expect(turn["message_id"]).toBe(handed[0]);
    expect(noteOf([turn], scoutAgent)).toMatch(
      /^Nobody has this turn: Ledger said it with no @, and nobody in the space has worked since\. It comes to you as the lead: hand the next step on with an @, or, if the work is done or stuck, tell Arjun\. /,
    );
    expect(done.seq).toBeLessThan(Number(turn["seq"]));
    expect(await sweepIn(60_000)).toEqual([]);
  });

  it("is not handed what named somebody, the lead's own words, or an answer to a person", async () => {
    const { other } = await room();
    await say(other.principal, "@Scout F–J done, K–O is yours.");
    expect(await sweepIn(30_000)).toEqual([]);
    await say(other.principal, "@Arjun F–J done.");
    expect(await sweepIn(30_000)).toEqual([]);
    await say(scout(), "All done, Arjun.");
    expect(await sweepIn(30_000)).toEqual([]);
    await say(arjun(), "@Ledger how does the page look?");
    await say(other.principal, "Fine so far.");
    await say(other.principal, "The colours could be warmer.");
    expect(await sweepIn(30_000)).toEqual([]);
  });

  // Bro chat, 30 October 2026: Arjun noted something to himself while Paolo worked, and Paolo's
  // answer was handed to Nigel, the lead, who passed.
  it("is not handed an answer though a person said something for no agent while it worked", async () => {
    const { other } = await room();
    await say(arjun(), "@Ledger time three slow commands.");
    await say(arjun(), "@Arjun note to self: the demo moved to Friday.");
    await say(other.principal, "Ten seconds apart. You noted the demo moved to Friday.");
    expect(await sweepIn(30_000)).toEqual([]);

    await say(scout(), "@Ledger take F–J.");
    await say(arjun(), "@Arjun note to self: lunch at one.");
    await say(other.principal, "F–J done.");
    expect(await sweepIn(30_000)).toHaveLength(1);
  });

  it("is not handed while an agent is at work, nor in a room with no lead", async () => {
    const { other } = await room();
    const run = ws.ids.next("run");
    await submit(scout(), {
      type: "run.started",
      space_id: ws.spaceId,
      run_id: run,
      idempotency_key: `${run}-started`,
      goal: "K–O",
      plan: [],
    });
    await say(other.principal, "F–J done.");
    expect(await sweepIn(30_000)).toEqual([]);
    // Heard from ten minutes ago and not since: a run its harness never ended is not at work.
    expect(await sweepIn(11 * 60_000)).toHaveLength(1);

    await lead(null);
    await say(other.principal, "And the spacing.");
    expect(await sweepIn(30_000)).toEqual([]);
  });
});
