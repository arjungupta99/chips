/**
 * The referee (ADR 0097), end to end through the door and the socket: two harnesses in a room
 * trading @s. Below eight messages between them nothing is said; from eight the facts ride each
 * `message.new`; past forty-eight their messages to each other are held, the sender's ack says
 * so, and the next thing a person does hands each the newest held message as `message.new` with
 * `handed`. A person can pause them, and let them carry on.
 */

import { CEILING, WARN_AT } from "@chipschat/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Principal } from "../../application/index.js";
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
    session,
    sent,
    of: (type: string) => events().filter((event) => event["type"] === type),
  };
}

function settled(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 25));
}

async function say(principal: Principal, text: string) {
  const result = await ws.gateway.deps.submitEvent({
    event: {
      type: "message.post",
      space_id: ws.spaceId,
      idempotency_key: `say-${ws.ids.next("event")}`,
      text,
    },
    principal,
  });
  if (!result.ok) throw new Error(`refused: ${result.error.kind}: ${result.error.message}`);
  return result.value;
}

/** Ledger, a second harness of Arjun's, in the room beside Scout. */
async function ledger(): Promise<Principal> {
  const added = await ws.gateway.deps.addHarness({
    principal: arjun(),
    displayName: "Ledger",
    openDirectSpace: false,
  });
  if (!added.ok) throw new Error("could not add Ledger");
  const id = added.value.harnessId;
  const joined = await ws.gateway.deps.submitEvent({
    event: {
      type: "membership.added",
      space_id: ws.spaceId,
      participant_id: id,
      participant_kind: "harness",
      role: "member",
      idempotency_key: `add-${id}`,
    },
    principal: arjun(),
  });
  if (!joined.ok) throw new Error(joined.error.message);
  return harness(id, "Ledger");
}

const scout = () => harness(ws.scout.participantId, "Scout");

/** Scout and Ledger trading @s, `n` messages in all, Scout first. */
async function trade(other: Principal, n: number) {
  const said = [];
  for (let i = 0; i < n; i += 1) {
    said.push(
      i % 2 === 0
        ? await say(scout(), `@Ledger here is step ${i} of the plan, with its own numbers`)
        : await say(other, `@Scout step ${i} checks out against the ledger, carry on`),
    );
  }
  return said;
}

describe("the referee on the wire (ADR 0097)", () => {
  it("says nothing at first, the facts from eight, and warns two agents trading with something new each time only at sixteen", async () => {
    const other = await ledger();
    const wire = await connect(other);
    const said = await trade(other, WARN_AT + 1);
    await settled();
    // What Ledger is sent of Scout's words.
    const toLedger = (index: number) =>
      wire.of("message.new").find((event) => event["id"] === said[index]?.event.id)?.["exchange"] as
        | Record<string, unknown>
        | undefined;
    // The seventh (Scout's fourth): three rounds of the two of them, each with its own words. Back
    // and forth is not round (ADR 0097's addendum of 17 October 2026): nothing, under eight.
    expect(toLedger(4)).toBeUndefined();
    expect(toLedger(6)).toBeUndefined();
    // The ninth: the facts, and no way out.
    expect(toLedger(8)).toMatchObject({ count: 9, stage: "nudge", circling: false });
    expect(String(toLedger(8)?.["note"])).not.toContain("Stop");
    expect(toLedger(14)).toMatchObject({ count: 15, stage: "nudge", circling: false });
    // The seventeenth, past the warning: the way out, and still no circle.
    const warned = toLedger(16);
    expect(warned).toMatchObject({
      count: 17,
      stage: "warning",
      circling: false,
      allowance: CEILING,
    });
    expect(String(warned?.["note"])).not.toContain("This looks like a circle");
    expect(String(warned?.["note"])).toContain(
      "Stop, and tell Arjun what is done and what is blocked.",
    );
    const room =
      (
        wire.of("message.new").find((event) => event["id"] === said[16]?.event.id)?.["room"] as
          | { notes: Record<string, string> }
          | undefined
      )?.notes ?? {};
    // The room note leaves the numbers to the warning (ADR 0187).
    expect(Object.values(room)[0]).not.toContain("messages between agents");
  });

  it("warns two agents at the fourth when one of them asks the same again: a circle", async () => {
    const other = await ledger();
    const wire = await connect(scout());
    const ask = "@Ledger please send the ledger lines for PO 4471 as one table";
    await say(scout(), ask);
    await say(other, "@Scout I sent them to the shared sheet an hour ago");
    await say(scout(), ask);
    const fourth = await say(other, "@Scout they are in the shared sheet, tab two, rows 4 to 19");
    await settled();
    const circled = wire.of("message.new").find((event) => event["id"] === fourth.event.id)?.[
      "exchange"
    ] as Record<string, unknown> | undefined;
    expect(circled).toMatchObject({ count: 4, stage: "warning", circling: true });
    expect(circled?.["repeats"]).toEqual([
      expect.objectContaining({ by: ws.scout.participantId, kind: "words" }),
    ]);
    expect(String(circled?.["note"])).toContain("This looks like a circle");
    expect(String(circled?.["note"])).toContain("Scout has said much the same before.");
  });

  it("holds past the ceiling, says so in the sender's ack, and hands the newest over when a person speaks", async () => {
    const other = await ledger();
    await trade(other, CEILING);
    const ledgerWire = await connect(other);
    const scoutWire = await connect(scout());

    // Past the ceiling, through the socket, as an adapter posts.
    await scoutWire.session.receive(
      JSON.stringify({
        frame: "event",
        event: {
          type: "message.post",
          space_id: ws.spaceId,
          text: "@Ledger one more thing before you go",
          idempotency_key: "scout-past-the-ceiling",
        },
      }),
    );
    const ack = scoutWire.sent.find(
      (frame) => frame["frame"] === "ack" && frame["idempotency_key"] === "scout-past-the-ceiling",
    );
    expect(ack).toMatchObject({ held: true, exchange: { count: CEILING + 1, allowance: CEILING } });
    const last = await say(scout(), "@Ledger and the very last thing");
    expect(last.held).toEqual({ count: CEILING + 2, allowance: CEILING });
    await settled();
    expect(ledgerWire.of("message.new").some((event) => event["id"] === last.event.id)).toBe(false);

    // A person speaks: Ledger is handed the newest held message, once, numbered as the hand-over.
    await say(arjun(), "How are we doing?");
    await settled();
    const handed = ledgerWire.of("message.new").filter((event) => event["handed"] === true);
    expect(handed).toHaveLength(1);
    expect(handed[0]).toMatchObject({ text: "@Ledger and the very last thing", handed: true });
    expect(Number(handed[0]?.["seq"])).toBeGreaterThan(last.event.seq);
    expect(handed[0]?.["exchange"]).toBeUndefined();
    // Speaking again hands nothing over again.
    await say(arjun(), "Thanks.");
    await settled();
    expect(ledgerWire.of("message.new").filter((event) => event["handed"] === true)).toHaveLength(
      1,
    );
  });

  it("holds from the first while a person has paused the agents, until they let them carry on", async () => {
    const other = await ledger();
    const paused = await ws.gateway.deps.setExchange({
      principal: arjun(),
      spaceId: ws.spaceId,
      state: "paused",
    });
    expect(paused).toEqual({ ok: true, changed: true, state: "paused" });
    expect(
      await ws.gateway.deps.setExchange({
        principal: arjun(),
        spaceId: ws.spaceId,
        state: "paused",
      }),
    ).toEqual({
      ok: true,
      changed: false,
      state: "paused",
    });
    const ledgerWire = await connect(other);
    const held = await say(scout(), "@Ledger can you check the invoice?");
    expect(held.held).toEqual({ count: 1, allowance: CEILING });

    const going = await ws.gateway.deps.setExchange({
      principal: arjun(),
      spaceId: ws.spaceId,
      state: "going",
    });
    expect(going.ok).toBe(true);
    await settled();
    expect(ledgerWire.of("message.new").filter((event) => event["handed"] === true)).toEqual([
      expect.objectContaining({ text: "@Ledger can you check the invoice?" }),
    ]);
    expect((await say(scout(), "@Ledger and the receipt?")).held).toBeUndefined();
  });

  it("lets no guest, and no harness, pause the agents", async () => {
    const refused = await ws.gateway.deps.setExchange({
      principal: scout(),
      spaceId: ws.spaceId,
      state: "paused",
    });
    expect(refused).toMatchObject({ ok: false, error: { kind: "not_allowed" } });
  });
});

/** The workspace's numbers, set by Arjun on You (ADR 0187). */
async function setLimits(stop: number | null, hold: number | null, circles = true) {
  const result = await ws.gateway.deps.submitEvent({
    event: {
      type: "exchange.limits_set",
      idempotency_key: `limits-${ws.ids.next("event")}`,
      stop,
      hold,
      circles,
    },
    // The principal says the role a device's key carries: the workspace's owner.
    principal: { ...arjun(), role: "owner" },
  });
  if (!result.ok) throw new Error(`refused: ${result.error.kind}: ${result.error.message}`);
}

describe("the referee at the workspace's numbers (ADR 0187)", () => {
  /** What Ledger was sent of one of the messages, as the facts ride it. */
  const factsOf = (wire: Awaited<ReturnType<typeof connect>>, id: string | undefined) =>
    wire.of("message.new").find((event) => event["id"] === id)?.["exchange"] as
      | Record<string, unknown>
      | undefined;

  it("counts from half the stop, warns at it, and holds at the hold, saying it in the ack", async () => {
    await setLimits(4, 10);
    const other = await ledger();
    const wire = await connect(other);
    const said = await trade(other, 10);
    await settled();
    expect(factsOf(wire, said[0]?.event.id)).toBeUndefined();
    expect(factsOf(wire, said[2]?.event.id)).toMatchObject({ count: 3, stage: "nudge" });
    const warned = factsOf(wire, said[4]?.event.id);
    expect(warned).toMatchObject({ count: 5, stage: "warning", circling: false, allowance: 10 });
    expect(String(warned?.["note"])).toContain(
      "Stop, and tell Arjun what is done and what is blocked. Messages between the agents are held after 10.",
    );
    expect(said.every((each) => each.held === undefined)).toBe(true);
    const past = await say(scout(), "@Ledger one more thing before you go");
    expect(past.held).toEqual({ count: 11, allowance: 10 });
  });

  it("never holds with the hold at Never, and the warning leaves the hold out", async () => {
    await setLimits(16, null);
    const other = await ledger();
    const wire = await connect(other);
    const said = await trade(other, CEILING + 2);
    await settled();
    expect(said.every((each) => each.held === undefined)).toBe(true);
    const late = factsOf(wire, said[CEILING]?.event.id);
    expect(late).toMatchObject({ count: CEILING + 1, stage: "warning" });
    expect(late?.["allowance"]).toBeUndefined();
    expect(String(late?.["note"])).toContain("Stop, and tell Arjun");
    expect(String(late?.["note"])).not.toContain("held");
  });

  it("with the stop at Never, tells agents trading something new only the count", async () => {
    await setLimits(null, 100);
    const other = await ledger();
    const wire = await connect(other);
    const said = await trade(other, 30);
    await settled();
    expect(factsOf(wire, said[8]?.event.id)).toMatchObject({ count: 9, stage: "nudge" });
    // Scout's last, which Ledger is sent.
    const late = factsOf(wire, said[28]?.event.id);
    expect(late).toMatchObject({ count: 29, stage: "nudge", allowance: 100 });
    expect(String(late?.["note"])).not.toContain("Stop");
  });

  it("with circles off, says nothing of a circle at the fourth", async () => {
    await setLimits(16, 48, false);
    const other = await ledger();
    const wire = await connect(scout());
    const ask = "@Ledger please send the ledger lines for PO 4471 as one table";
    await say(scout(), ask);
    await say(other, "@Scout I sent them to the shared sheet an hour ago");
    await say(scout(), ask);
    const fourth = await say(other, "@Scout they are in the shared sheet, tab two, rows 4 to 19");
    await settled();
    expect(factsOf(wire, fourth.event.id)).toBeUndefined();
  });

  it("reads the numbers as each message lands: a stop set mid-stretch counts from the next", async () => {
    const other = await ledger();
    const wire = await connect(other);
    const before = await trade(other, 5);
    await setLimits(4, 10);
    const after = await say(scout(), "@Ledger here is step 5 of the plan, with its own numbers");
    await settled();
    // The fifth was quiet under Chips's own numbers; the sixth is past the new stop.
    expect(factsOf(wire, before[4]?.event.id)).toBeUndefined();
    expect(factsOf(wire, after.event.id)).toMatchObject({
      count: 6,
      stage: "warning",
      allowance: 10,
    });
  });
});
