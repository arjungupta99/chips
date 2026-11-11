/**
 * A room's job at its spend ceiling (ADR 0118): Chips warns the room's harnesses once at 80%, and
 * at the ceiling pauses the agents, once, saying why, until a person acts. Letting them carry on
 * is a person acting, so it starts a new job with the room's whole ceiling again. A room whose
 * runs report no cost is never held.
 */

import {
  budgetWarning,
  CEILING,
  eventSchema,
  exchangeSet,
  HARNESS_CAPABILITIES,
} from "@chipschat/protocol";
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
  return result.value;
}

async function say(principal: Principal, text: string) {
  return submit(principal, {
    type: "message.post",
    space_id: ws.spaceId,
    idempotency_key: `say-${ws.ids.next("event")}`,
    text,
  });
}

/** One run of Scout's in the room, ended by what it reported costing: nothing, when no cost. */
async function ran(usd: number | undefined): Promise<void> {
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
    ...(usd === undefined ? {} : { cost: { usd, estimated: true } }),
  });
}

async function allow(usd: number): Promise<void> {
  const done = await ws.gateway.deps.setSpendCeiling({
    principal: arjun(),
    spaceId: ws.spaceId,
    usd,
  });
  expect(done.ok).toBe(true);
}

/** What the log holds of a type in the room, oldest first. */
async function logged(type: string) {
  const page = await ws.gateway.deps.store.since(ws.workspaceId, 0, 10_000);
  return page.events.filter((event) => event.type === type && event.space_id === ws.spaceId);
}

/** Ledger, a second harness of Arjun's, in the room beside Scout, by its default agent. */
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
  const agent = await ws.gateway.deps.readModels.agentByKey(ws.workspaceId, id, id);
  if (agent === undefined) throw new Error("no agent");
  return { agent: agent.agent_id, principal: harness(id, "Ledger") };
}

describe("a room's job at its spend ceiling (ADR 0118)", () => {
  it("warns the room's harnesses once from 80%, and pauses the agents once at the ceiling, saying why", async () => {
    await allow(1);
    const asked = (await say(arjun(), "@Scout read the trials")).event;
    const scoutSide = await connect(scout());
    const arjunSide = await connect(arjun());

    await ran(0.5);
    await settled();
    expect(scoutSide.of("budget.warning"), "half of it spent").toEqual([]);

    await ran(0.35);
    await ran(0.05);
    await settled();
    const warned = scoutSide.of("budget.warning");
    expect(warned, "once, though two runs reported past 80%").toHaveLength(1);
    expect(warned[0]).toMatchObject({
      space_id: ws.spaceId,
      actor: { kind: "system", id: "system" },
      budget: { limit_usd: 1, spent_usd: 0.85 },
      threshold: 80,
      action: "warn",
      scope: "job",
      since_seq: asked.seq,
    });
    expect(eventSchema(budgetWarning).safeParse(warned[0]).success).toBe(true);
    expect(arjunSide.of("budget.warning"), "the space's people are told too").toHaveLength(1);
    expect(await logged("exchange.set")).toEqual([]);

    await ran(0.2);
    await ran(0.1);
    await settled();
    const paused = await logged("exchange.set");
    expect(paused, "once, though a run reported after it").toHaveLength(1);
    expect(paused[0]?.actor).toEqual({ kind: "system", id: "system" });
    expect(paused[0]?.payload).toMatchObject({
      state: "paused",
      why: "spend",
      spend: { ceiling_usd: 1, spent_usd: 1.1, since_seq: asked.seq, uncounted_runs: 0 },
    });
    expect(eventSchema(exchangeSet).safeParse(paused[0]?.payload).success).toBe(true);
    expect(scoutSide.of("budget.warning").slice(1)).toEqual([
      expect.objectContaining({
        budget: { limit_usd: 1, spent_usd: 1.1 },
        threshold: 100,
        action: "pause",
        scope: "job",
        since_seq: asked.seq,
      }),
    ]);
    expect(
      scoutSide.of("exchange.set"),
      "the harness hears the pause as the space does",
    ).toHaveLength(1);
    const exchange = await ws.gateway.deps.readModels.exchangeOf(ws.workspaceId, ws.spaceId);
    expect(exchange.paused).toBe(true);
  });

  it("goes straight to the pause when one run takes the job past the ceiling", async () => {
    await allow(1);
    await say(arjun(), "@Scout read the trials");
    const scoutSide = await connect(scout());
    await ran(1.4);
    await settled();
    expect(scoutSide.of("budget.warning").map((event) => event["threshold"])).toEqual([100]);
  });

  it("holds the agents' talk once paused, and letting them carry on hands it over and starts a new allowance", async () => {
    await allow(1);
    const other = await ledger();
    await say(arjun(), "@Scout read the trials, then hand them to Ledger");
    const ledgerSide = await connect(other.principal);
    await ran(1.05);
    const held = await say(scout(), "@Ledger the trials are in");
    expect(held.held).toMatchObject({ allowance: CEILING });

    const going = await ws.gateway.deps.setExchange({
      principal: arjun(),
      spaceId: ws.spaceId,
      state: "going",
    });
    expect(going.ok).toBe(true);
    await settled();
    expect(ledgerSide.of("message.new").filter((event) => event["handed"] === true)).toEqual([
      expect.objectContaining({ text: "@Ledger the trials are in" }),
    ]);
    const carried = (await logged("exchange.set")).at(-1);
    const fresh = await ws.gateway.deps.readModels.jobSpendOf(ws.workspaceId, ws.spaceId);
    expect(fresh).toEqual({ spent_usd: 0, since_seq: carried?.seq, uncounted_runs: 0 });

    await ran(0.5);
    await settled();
    expect(
      (await logged("budget.warning")).map((event) => event.payload["threshold"]),
      "half of the new allowance",
    ).toEqual([100]);

    await ran(0.6);
    await settled();
    const pauses = (await logged("exchange.set")).filter(
      (event) => event.payload["why"] === "spend",
    );
    expect(pauses, "the new job reached the ceiling in its turn").toHaveLength(2);
    expect(pauses[1]?.payload["spend"]).toMatchObject({ spent_usd: 1.1, since_seq: carried?.seq });
  });

  it("hands over words held at the ceiling with the new job's spend, not the spend they were said at", async () => {
    // 5 October 2026: words held at the ceiling went over saying Chips still held the agents —
    // "start nothing new" — and the agent answered "Budget hold" after a person let them carry on.
    await allow(1);
    const other = await ledger();
    await say(arjun(), "@Scout read the trials, then hand them to Ledger");
    const ledgerSide = await connect(other.principal);
    await ran(1.05);
    await say(scout(), "@Ledger the trials are in");
    await ws.gateway.deps.setExchange({ principal: arjun(), spaceId: ws.spaceId, state: "going" });
    await settled();
    const carried = (await logged("exchange.set")).at(-1);
    const handed = ledgerSide.of("message.new").find((event) => event["handed"] === true);
    expect((handed?.["context"] as Record<string, unknown> | undefined)?.["spend"]).toEqual({
      ceiling_usd: 1,
      spent_usd: 0,
      since_seq: carried?.seq,
      uncounted_runs: 0,
    });
    const note = (handed?.["room"] as { notes: Record<string, string> } | undefined)?.notes[
      other.agent
    ];
    expect(note).toMatch(/This job has spent \$0\.00 of the \$1\.00 this space allows a job;/);
    expect(note).not.toMatch(/start nothing new/);
  });

  it("never holds a room whose runs report no cost", async () => {
    await allow(0.25);
    await say(arjun(), "@Scout read the trials");
    for (let i = 0; i < 3; i += 1) await ran(undefined);
    await settled();
    expect(await logged("budget.warning")).toEqual([]);
    expect(await logged("exchange.set")).toEqual([]);
    const spend = await ws.gateway.deps.readModels.jobSpendOf(ws.workspaceId, ws.spaceId);
    expect(spend).toMatchObject({ spent_usd: 0, uncounted_runs: 3 });
  });

  it("never warns or holds a room with no cap, whatever its job spends (ADR 0292)", async () => {
    const lifted = await ws.gateway.deps.setSpendCeiling({
      principal: arjun(),
      spaceId: ws.spaceId,
      usd: "none",
    });
    expect(lifted.ok).toBe(true);
    await say(arjun(), "@Scout read the trials");
    await ran(40);
    await ran(1200);
    await settled();
    expect(await logged("budget.warning")).toEqual([]);
    expect(await logged("exchange.set")).toEqual([]);
    const spend = await ws.gateway.deps.readModels.jobSpendOf(ws.workspaceId, ws.spaceId);
    expect(spend).toMatchObject({ spent_usd: 1240 });
  });

  it("pauses no second time where a person paused the agents already, and still tells the harnesses", async () => {
    await allow(1);
    await say(arjun(), "@Scout read the trials");
    await ws.gateway.deps.setExchange({ principal: arjun(), spaceId: ws.spaceId, state: "paused" });
    const scoutSide = await connect(scout());
    await ran(1.2);
    await settled();
    expect((await logged("exchange.set")).map((event) => event.actor.kind)).toEqual(["person"]);
    expect(scoutSide.of("budget.warning")).toEqual([
      expect.objectContaining({ threshold: 100, action: "pause", scope: "job" }),
    ]);
  });
});
