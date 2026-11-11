/**
 * What an agent sent another agent that the other did not pick up (ADR 0291), end to end through
 * the doors, the sweep and the socket. The message is handed to the room's lead, or back to the
 * agent that said it, with a note that says who did not pick it up and why. A room's second agent
 * gives it a lead, every turn's note says which agents can't answer, and a message that reaches
 * its agent long after it was said says so.
 *
 * The Health space, 8 November 2026, is the shape: Luis and Builder handed each other work twenty
 * times, and nothing would have told either had the other's harness been down. Scout plays the
 * lead here, Ledger and Quill the agents it works with.
 */

import { type AgentState, HARNESS_CAPABILITIES } from "@chipschat/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createUnpickedTurns, type Principal } from "../../application/index.js";
import { createTestWorkspace, type TestWorkspace } from "../../testing/workspace.js";
import { Session, type SessionOptions } from "./session.js";

let ws: TestWorkspace;
/** The harnesses that are down, or say something is wrong, as the tests set them. */
let states: Map<string, AgentState>;

beforeEach(async () => {
  ws = await createTestWorkspace();
  await ws.gateway.deps.upgradeAgents.apply(ws.workspaceId);
  await declare(ws.scout.participantId);
  states = new Map();
});

afterEach(async () => {
  await ws.close();
});

const HELLO = JSON.stringify({
  frame: "hello",
  protocol: { min: 1, max: 1 },
  client: { name: "adapter", version: "0.1.0" },
});

const CONNECTED: AgentState = { connected: true, since: new Date().toISOString() };
const stateOf = (_workspace: string, harnessId: string): AgentState =>
  states.get(harnessId) ?? CONNECTED;
const offline = (harnessId: string, minutesAgo = 5): void => {
  const since = new Date(Date.now() - minutesAgo * 60_000).toISOString();
  states.set(harnessId, { connected: false, since });
};

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

async function connect(principal: Principal, options: Partial<SessionOptions> = {}) {
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
    stateOf,
    ...options,
  });
  await session.receive(HELLO);
  await session.receive(
    JSON.stringify({ frame: "subscribe", workspace_id: ws.workspaceId, since: 0 }),
  );
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

/** One more harness of Arjun's, put in the room as a person puts it there: its default agent. */
async function another(name: string): Promise<{ agent: string; principal: Principal }> {
  const added = await ws.gateway.deps.addHarness({
    principal: arjun(),
    displayName: name,
    openDirectSpace: false,
  });
  if (!added.ok) throw new Error(`could not add ${name}`);
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
  return { agent: await agentOf(id), principal: harness(id, name) };
}

const leadNow = () => ws.gateway.deps.readModels.leadOf(ws.workspaceId, ws.spaceId);

/** The sweep's half, as the clock reads `ms` from now. */
function sweepIn(ms: number) {
  const at = () => Date.now() + ms;
  return createUnpickedTurns({
    store: ws.gateway.deps.store,
    readModels: ws.gateway.deps.readModels,
    presence: { stateOf },
    ids: ws.ids,
    clock: { nowMs: at, now: () => new Date(at()), nowIso: () => new Date(at()).toISOString() },
  })();
}

/** The room's note for one agent, on a turn its harness was handed. */
function noteOf(turn: Record<string, unknown> | undefined, agentId: string): string {
  const room = turn?.["room"] as { notes: Record<string, string> } | undefined;
  return room?.notes[agentId] ?? "";
}

describe("a room with two or more agents has a lead (ADR 0291)", () => {
  it("is the agent there longest, from the second agent's joining", async () => {
    expect(await leadNow()).toBeUndefined();
    await another("Ledger");
    expect(await leadNow()).toBe(await agentOf(ws.scout.participantId));
  });

  it("leaves a person's choice alone: a lead they picked, or nobody", async () => {
    const ledger = await another("Ledger");
    const set = (agentId: string | null) =>
      ws.gateway.deps.setLead({ principal: arjun(), spaceId: ws.spaceId, agentId });
    await set(ledger.agent);
    await another("Quill");
    expect(await leadNow()).toBe(ledger.agent);
    await set(null);
    await another("Wren");
    expect(await leadNow()).toBeUndefined();
  });

  it("passes to the next there longest when the lead goes", async () => {
    const ledger = await another("Ledger");
    await another("Quill");
    const scoutAgent = await agentOf(ws.scout.participantId);
    expect(await leadNow()).toBe(scoutAgent);
    await submit(arjun(), {
      type: "membership.removed",
      space_id: ws.spaceId,
      participant_id: scoutAgent,
      idempotency_key: `out-${scoutAgent}`,
    });
    expect(await leadNow()).toBe(ledger.agent);
  });
});

describe("what an agent sent another that the other did not pick up (ADR 0291)", () => {
  it("comes back to the lead that said it, a minute on, once, with who did not pick it up and why", async () => {
    const ledger = await another("Ledger");
    const scoutAgent = await agentOf(ws.scout.participantId);
    offline(ledger.principal.participantId);
    const scoutSide = await connect(scout());
    const asked = await say(scout(), "@Ledger reconcile March, please.");
    expect(await sweepIn(30_000)).toEqual([]);
    const handed = await sweepIn(61_000);
    expect(handed).toMatchObject([
      { agent_id: scoutAgent, unanswered_by: ledger.agent, why: "offline" },
    ]);
    await settled();
    const turn = scoutSide.of("message.new").at(-1);
    expect(turn).toMatchObject({
      handed: true,
      lead: true,
      for: [scoutAgent],
      text: "@Ledger reconcile March, please.",
      from: { participant_id: scoutAgent },
    });
    expect(asked.id).toContain(String(turn?.["message_id"]).slice(4));
    expect(noteOf(turn, scoutAgent)).toMatch(
      /^Ledger hasn't picked up this message of yours, sent 1 minute ago: its harness is offline\. Do the work yourself, hand it to another agent with an @, or tell Arjun it is waiting on Ledger\. .*In this space:/,
    );
    // Once: the same message is not handed for the same agent again.
    expect(await sweepIn(120_000)).toEqual([]);
  });

  // The first live run, 10 November 2026: told Lionel was offline, Jens answered "@Lionel is
  // offline, so I'll answer for the test", which was one more message for Lionel.
  it("says once that an agent is away, however often it is named meanwhile", async () => {
    const ledger = await another("Ledger");
    offline(ledger.principal.participantId);
    await say(scout(), "@Ledger reconcile March, please.");
    expect(await sweepIn(61_000)).toHaveLength(1);
    await say(scout(), "@Ledger is offline, so I'll reconcile March myself.");
    expect(await sweepIn(61_000)).toEqual([]);
    expect(await sweepIn(10 * 60_000)).toEqual([]);

    // Back, and away again: that is said again, once.
    await say(ledger.principal, "Back now.");
    await say(scout(), "@Ledger then April is yours.");
    const again = await sweepIn(61_000);
    expect(again).toMatchObject([{ unanswered_by: ledger.agent, why: "offline" }]);
    expect(await sweepIn(61_000)).toEqual([]);
  });

  it("goes to the lead when another agent said it, as the lead's to sort out", async () => {
    const ledger = await another("Ledger");
    const quill = await another("Quill");
    const scoutAgent = await agentOf(ws.scout.participantId);
    states.set(quill.principal.participantId, {
      connected: true,
      since: new Date().toISOString(),
      trouble: { reason: "Can't reach its gateway.", since: new Date().toISOString() },
    });
    const scoutSide = await connect(scout());
    await say(ledger.principal, "@Quill the totals are in, write them up.");
    const handed = await sweepIn(61_000);
    expect(handed).toMatchObject([
      { agent_id: scoutAgent, unanswered_by: quill.agent, why: "trouble" },
    ]);
    await settled();
    const turn = scoutSide.of("message.new").at(-1);
    expect(turn).toMatchObject({ handed: true, lead: true, for: [scoutAgent] });
    expect(noteOf(turn, scoutAgent)).toMatch(
      /^Quill hasn't picked up this message from Ledger, sent 1 minute ago: its harness says: Can't reach its gateway\. It comes to you as the lead: do the work yourself, hand it to another agent with an @, or tell Arjun it is waiting on Quill\. .*In this space:/,
    );
  });

  it("goes back to the agent that said it when the lead is the one that did not pick it up", async () => {
    const ledger = await another("Ledger");
    offline(ws.scout.participantId);
    const ledgerSide = await connect(ledger.principal);
    await say(ledger.principal, "@Scout March is reconciled, over to you.");
    const handed = await sweepIn(61_000);
    expect(handed).toMatchObject([{ agent_id: ledger.agent, why: "offline" }]);
    await settled();
    const turn = ledgerSide.of("message.new").at(-1);
    expect(turn).toMatchObject({ handed: true, for: [ledger.agent] });
    expect(turn?.["lead"]).toBeUndefined();
    expect(noteOf(turn, ledger.agent)).toMatch(
      /^Scout hasn't picked up this message of yours, sent 1 minute ago: its harness is offline\. Do the work yourself,/,
    );
  });

  it("is handed when the agent's turn on it failed, with the run's error", async () => {
    const ledger = await another("Ledger");
    const scoutSide = await connect(scout());
    await say(scout(), "@Ledger reconcile March, please.");
    const run = ws.ids.next("run");
    await submit(ledger.principal, {
      type: "run.started",
      space_id: ws.spaceId,
      run_id: run,
      idempotency_key: `${run}-started`,
      goal: "Reconcile March",
    });
    // Its turn is going: nothing is handed while it works.
    expect(await sweepIn(61_000)).toEqual([]);
    await submit(ledger.principal, {
      type: "run.failed",
      space_id: ws.spaceId,
      run_id: run,
      idempotency_key: `${run}-failed`,
      error: "The harness restarted before this run ended.",
      retryable: true,
    });
    const handed = await sweepIn(61_000);
    expect(handed).toMatchObject([{ unanswered_by: ledger.agent, why: "failed" }]);
    await settled();
    expect(
      noteOf(scoutSide.of("message.new").at(-1), await agentOf(ws.scout.participantId)),
    ).toContain(
      "its turn failed: The harness restarted before this run ended. Do the work yourself",
    );
  });

  it("is left alone once its agent has answered, passed, or had its turn", async () => {
    const ledger = await another("Ledger");
    offline(ledger.principal.participantId);
    await say(scout(), "@Ledger one.");
    await say(ledger.principal, "Done with one.");
    expect(await sweepIn(61_000)).toEqual([]);

    await say(scout(), "@Ledger two, when you are ready.");
    await say(ledger.principal, "NO_REPLY");
    expect(await sweepIn(61_000)).toEqual([]);

    await say(scout(), "@Ledger three.");
    const run = ws.ids.next("run");
    for (const [type, more] of [
      ["run.started", { goal: "Three" }],
      ["run.completed", { summary: "Done." }],
    ] as const) {
      await submit(ledger.principal, {
        type,
        space_id: ws.spaceId,
        run_id: run,
        idempotency_key: `${run}-${type}`,
        ...more,
      });
    }
    expect(await sweepIn(61_000)).toEqual([]);
  });

  it("leaves a person's message to the room, which shows them it waits", async () => {
    const ledger = await another("Ledger");
    offline(ledger.principal.participantId);
    await say(arjun(), "@Ledger reconcile March, please.");
    expect(await sweepIn(61_000)).toEqual([]);
  });

  it("hands nothing on while a person has paused the agents", async () => {
    const ledger = await another("Ledger");
    offline(ledger.principal.participantId);
    await say(scout(), "@Ledger reconcile March, please.");
    await ws.gateway.deps.setExchange({ principal: arjun(), spaceId: ws.spaceId, state: "paused" });
    expect(await sweepIn(61_000)).toEqual([]);
  });
});

describe("what a turn is told of who can't answer, and of a message that comes late (ADR 0291)", () => {
  it("names the agents that can't answer, and why", async () => {
    const ledger = await another("Ledger");
    const scoutAgent = await agentOf(ws.scout.participantId);
    offline(ledger.principal.participantId, 12);
    const scoutSide = await connect(scout());
    await say(arjun(), "@Scout where are we?");
    await settled();
    expect(noteOf(scoutSide.of("message.new").at(-1), scoutAgent)).toContain(
      "Can't answer now: Ledger (offline for 12 minutes). Work you hand it waits until it is back.",
    );
    const room = scoutSide.of("message.new").at(-1)?.["room"] as { away?: unknown };
    expect(room.away).toMatchObject([
      { participant_id: ledger.agent, why: "offline", minutes: 12 },
    ]);
  });

  it("says a message reaches its agent long after it was said", async () => {
    const scoutAgent = await agentOf(ws.scout.participantId);
    await say(arjun(), "Are you there?");
    // The harness comes back seven minutes on, and is sent what it missed.
    const late = await connect(scout(), { now: () => Date.now() + 7 * 60_000 });
    await settled();
    expect(noteOf(late.of("message.new").at(-1), scoutAgent)).toMatch(
      /^This was said 7 minutes ago and reaches you only now: read what was said since before you act on it\. In this space:/,
    );
    // Sent at once, it says nothing of the kind.
    const prompt = await connect(scout());
    await settled();
    expect(noteOf(prompt.of("message.new").at(-1), scoutAgent)).toMatch(/^In this space:/);
  });
});
