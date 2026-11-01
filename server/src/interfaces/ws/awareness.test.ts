/**
 * What an agent knows of its room between its turns (ADR 0105), end to end through the door and
 * the socket. A turn is handed what was said while the agent's last turn worked, which used to
 * fall before its answer and so out of every turn after; its own words are left out. When older
 * lines were left out to fit its harness's budget, its note says so. And an agent that has
 * nothing to say answers `NO_REPLY`, which Chips records as its turn passed: nobody is shown it.
 *
 * Run 4 of ASCII Art, 3 October 2026, is the shape: J1 worked on a file of its own while ASCII Art
 * posted the room's, and never heard it. Scout plays the one working, Ledger the one who speaks.
 */

import { HARNESS_CAPABILITIES } from "@chipschat/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Principal } from "../../application/index.js";
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

function hello(context?: { lines: number }): string {
  return JSON.stringify({
    frame: "hello",
    protocol: { min: 1, max: 1 },
    client: { name: "adapter", version: "0.1.0" },
    ...(context === undefined ? {} : { context }),
  });
}

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

async function connect(principal: Principal, context?: { lines: number }) {
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
  await session.receive(hello(context));
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

async function say(principal: Principal, text: string, more: Record<string, unknown> = {}) {
  return submit(principal, {
    type: "message.post",
    space_id: ws.spaceId,
    idempotency_key: `say-${ws.ids.next("event")}`,
    text,
    ...more,
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

/** A turn of Scout's that starts, and the run it is. */
async function scoutStarts(goal: string): Promise<string> {
  const run = ws.ids.next("run");
  await submit(scout(), {
    type: "run.started",
    space_id: ws.spaceId,
    run_id: run,
    idempotency_key: `${run}-started`,
    goal,
    plan: [],
  });
  return run;
}

/** The words a turn was handed of its room, one `Name: words` each. */
function linesOf(turn: Record<string, unknown> | undefined): string[] {
  const context = turn?.["context"] as
    | { lines: { from: { name: string }; text?: string; kind: string }[] }
    | undefined;
  return (context?.lines ?? [])
    .filter((line) => line.kind === "said")
    .map((line) => `${line.from.name}: ${line.text ?? ""}`);
}

/** The room's note for one agent, on the newest turn its harness was handed. */
function noteOf(turns: Record<string, unknown>[], agentId: string): string {
  const room = turns.at(-1)?.["room"] as { notes: Record<string, string> } | undefined;
  return room?.notes[agentId] ?? "";
}

describe("what was said while an agent worked (ADR 0105)", () => {
  it("is handed to its next turn, without its own words", async () => {
    const other = await ledger();
    const scoutSide = await connect(scout());
    await say(arjun(), "@Scout letters A–E, please");
    const run = await scoutStarts("letters A–E");
    await say(other.principal, "The space's file is ascii-alphabet.html: work from it.");
    await say(scout(), "A–E done.", { run_id: run });
    await say(arjun(), "@Scout and F–J?");
    await settled();
    expect(linesOf(scoutSide.of("message.new").at(-1))).toEqual([
      "Ledger: The space's file is ascii-alphabet.html: work from it.",
    ]);
  });

  it("starts after its own words when they were said on no run, as before", async () => {
    const other = await ledger();
    const scoutSide = await connect(scout());
    await say(other.principal, "Before.");
    await say(scout(), "Said on no run.");
    await say(other.principal, "After.");
    await say(arjun(), "@Scout go on");
    await settled();
    expect(linesOf(scoutSide.of("message.new").at(-1))).toEqual(["Ledger: After."]);
  });

  it("says in the note when older lines were left out to fit the budget", async () => {
    const other = await ledger();
    const scoutAgent = await agentOf(ws.scout.participantId);
    const scoutSide = await connect(scout(), { lines: 2 });
    for (const text of ["One.", "Two.", "Three."]) await say(other.principal, text);
    await say(arjun(), "@Scout where are we?");
    await settled();
    const turn = scoutSide.of("message.new").at(-1);
    expect(linesOf(turn)).toEqual(["Ledger: Two.", "Ledger: Three."]);
    expect(noteOf([turn ?? {}], scoutAgent)).toMatch(
      /^New since your last turn: Ledger \(agent, @Ledger\), added by Arjun\. Only the newest 2 lines of what was said here since your last turn come with this one: older lines were left out\. In this space:/,
    );
    await say(scout(), "Five letters each.");
    await say(arjun(), "@Scout and now?");
    await settled();
    expect(noteOf(scoutSide.of("message.new"), scoutAgent)).not.toContain("left out");
  });
});

describe("NO_REPLY (ADR 0105)", () => {
  it("is an agent's turn passed: logged, shown to nobody, handed to no agent", async () => {
    const other = await ledger();
    const ledgerSide = await connect(other.principal);
    const arjunSide = await connect(arjun());
    const before = await ws.gateway.deps.readModels.lastPost(ws.workspaceId, ws.spaceId);
    const run = await scoutStarts("nothing much");
    const passed = await say(scout(), "`NO_REPLY`", { run_id: run, to: [other.agent] });
    await settled();
    expect(passed.type).toBe("turn.passed");
    expect(passed.payload).not.toHaveProperty("text");
    expect(passed.run_id).toBe(run);
    expect(passed.actor).toMatchObject({
      kind: "agent",
      id: await agentOf(ws.scout.participantId),
    });
    const after = await ws.gateway.deps.readModels.lastPost(ws.workspaceId, ws.spaceId);
    expect(after?.event_id).toBe(before?.event_id);
    expect([...ledgerSide.of("message.new"), ...ledgerSide.of("message.overheard")]).toEqual([]);
    expect(arjunSide.of("message.post")).toEqual([]);
  });

  it("is a person's to say like any words, and a post with more says something", async () => {
    expect((await say(arjun(), "NO_REPLY")).type).toBe("message.post");
    expect((await say(scout(), "NO_REPLY, but here is why")).type).toBe("message.post");
  });
});

describe("the turns that hear what is said while they work (ADR 0106)", () => {
  it("are named to their harness with what was said for somebody else, and only those", async () => {
    const other = await ledger();
    const scoutAgent = await agentOf(ws.scout.participantId);
    const scoutSide = await connect(scout());
    const run = await scoutStarts("letters A–E");
    const ledgerSide = await connect(other.principal);
    const said = await say(other.principal, "The space's file is ascii-alphabet.html.");
    await settled();
    const heard = scoutSide.of("message.overheard").at(-1);
    expect(heard?.["message_id"]).toBe(`msg_${said.id.slice(4)}`);
    expect(heard?.["working_turns"]).toEqual([{ agent_id: scoutAgent, run_id: run }]);
    // Its own words are no news to a turn of its own.
    await say(scout(), "Working on A–E.", { run_id: run });
    await settled();
    expect(ledgerSide.of("message.overheard").at(-1)).not.toHaveProperty("working_turns");
    // A turn the message is for takes it as its turn, not as words in passing.
    await say(arjun(), "@Scout use the space's file");
    await settled();
    expect(scoutSide.of("message.new").at(-1)).not.toHaveProperty("working_turns");
    // A turn that has ended hears nothing more.
    await submit(scout(), {
      type: "run.completed",
      space_id: ws.spaceId,
      run_id: run,
      idempotency_key: `${run}-done`,
      summary: "A–E done.",
    });
    await say(other.principal, "F–J next.");
    await settled();
    expect(scoutSide.of("message.overheard").at(-1)).not.toHaveProperty("working_turns");
  });

  it("say so on the run when one heard it, and the people in the room are told", async () => {
    const other = await ledger();
    const scoutAgent = await agentOf(ws.scout.participantId);
    const run = await scoutStarts("letters A–E");
    const arjunSide = await connect(arjun());
    const said = await say(other.principal, "Here is the file.");
    const heard = await submit(scout(), {
      type: "message.heard",
      space_id: ws.spaceId,
      run_id: run,
      actor: { kind: "agent", id: scoutAgent },
      idempotency_key: `${run}-heard`,
      message_id: `msg_${said.id.slice(4)}`,
    });
    await settled();
    expect(heard.type).toBe("message.heard");
    expect(arjunSide.of("message.heard")).toHaveLength(1);
  });
});
