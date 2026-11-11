/**
 * What a room's job has spent (ADR 0117), handed to every harness with the message that gives a
 * turn: in numbers as `context.spend`, and in words at the end of the room's note. As of the
 * message, against what the room allows a job, which a person sets.
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

/** The room's note for one agent, on the newest turn its harness was handed. */
function noteOf(turns: Record<string, unknown>[], agentId: string): string {
  const room = turns.at(-1)?.["room"] as { notes: Record<string, string> } | undefined;
  return room?.notes[agentId] ?? "";
}

describe("a turn's spend (ADR 0117)", () => {
  it("comes with the message, from the person's act, in numbers and in the note", async () => {
    const scoutAgent = await agentOf(ws.scout.participantId);
    const scoutSide = await connect(scout());
    const asked = await say(arjun(), "@Scout read the trials");
    await settled();
    const turn = scoutSide.of("message.new").at(-1);
    expect((turn?.["context"] as Record<string, unknown> | undefined)?.["spend"]).toEqual({
      ceiling_usd: 3,
      spent_usd: 0,
      since_seq: asked.seq,
      uncounted_runs: 0,
    });
    // Before the rules the note ends with (ADR 0250).
    expect(noteOf(scoutSide.of("message.new"), scoutAgent)).toMatch(
      /This job has spent \$0\.00 of the \$3\.00 this space allows a job; at \$3\.00 Chips holds the agents until a person acts\. Everyone here reads what you write\. To get a file /,
    );
  });

  it("counts what a run reported since, against the ceiling a person set", async () => {
    const other = await ledger();
    const done = await ws.gateway.deps.setSpendCeiling({
      principal: arjun(),
      spaceId: ws.spaceId,
      usd: 10,
    });
    expect(done.ok).toBe(true);
    const asked = await say(arjun(), "@Scout read the trials, then hand them to Ledger");
    const run = ws.ids.next("run");
    await submit(scout(), {
      type: "run.started",
      space_id: ws.spaceId,
      run_id: run,
      idempotency_key: `${run}-started`,
      goal: "Read the trials",
      plan: [],
    });
    await submit(scout(), {
      type: "usage",
      space_id: ws.spaceId,
      run_id: run,
      idempotency_key: `${run}-usage`,
      scope: "run",
      model: "a-model-nobody-prices",
      output_tokens: 900,
      cost: { usd: 1.2, estimated: true },
    });
    const ledgerSide = await connect(other.principal);
    await submit(scout(), {
      type: "message.post",
      space_id: ws.spaceId,
      run_id: run,
      idempotency_key: `${run}-hand`,
      text: "@Ledger the trials are in",
    });
    await settled();
    const turn = ledgerSide.of("message.new").at(-1);
    expect((turn?.["context"] as Record<string, unknown> | undefined)?.["spend"]).toEqual({
      ceiling_usd: 10,
      spent_usd: 1.2,
      since_seq: asked.seq,
      uncounted_runs: 0,
    });
    expect(noteOf(ledgerSide.of("message.new"), other.agent)).toContain(
      "This job has spent $1.20 of the $10.00 this space allows a job; at $10.00 Chips holds the agents until a person acts.",
    );
  });

  it("comes with no turn, in numbers or words, in a room with no cap (ADR 0292)", async () => {
    const scoutAgent = await agentOf(ws.scout.participantId);
    const done = await ws.gateway.deps.setSpendCeiling({
      principal: arjun(),
      spaceId: ws.spaceId,
      usd: "none",
    });
    expect(done).toMatchObject({ ok: true, changed: true, usd: "none" });
    const scoutSide = await connect(scout());
    await say(arjun(), "@Scout read the trials");
    await settled();
    const turn = scoutSide.of("message.new").at(-1);
    expect(turn?.["context"]).toBeDefined();
    expect((turn?.["context"] as Record<string, unknown> | undefined)?.["spend"]).toBeUndefined();
    const note = noteOf(scoutSide.of("message.new"), scoutAgent);
    expect(note).toContain("Everyone here reads what you write.");
    expect(note).not.toMatch(/This job has spent|Chips holds the agents/);
  });
});
