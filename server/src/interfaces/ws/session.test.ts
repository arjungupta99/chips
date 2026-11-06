/**
 * The WebSocket rules, driven through the `Socket` interface rather than a port.
 *
 * These are the cases M0.4's acceptance criteria name: two people and a harness on the same
 * stream, an approval round trip over sockets, and — the one that matters most — a client that
 * disconnects mid-stream and resumes with `since` receiving exactly the missed events, once.
 */

import { CEILING, messageIdOf, schemaFor } from "@chipschat/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { IncomingEvent, Principal } from "../../application/index.js";
import { createTestWorkspace, type TestWorkspace } from "../../testing/workspace.js";
import { Session, type SessionOptions } from "./session.js";

let ws: TestWorkspace;
let clock = 0;

beforeEach(async () => {
  ws = await createTestWorkspace();
  clock = 1_756_800_000_000;
});

afterEach(async () => {
  await ws.close();
});

/** A socket that records what was sent, and whether it was closed. */
function fakeSocket() {
  const sent: Record<string, unknown>[] = [];
  const closes: { code: number; reason: string }[] = [];
  return {
    sent,
    closes,
    socket: {
      send: (data: string) => sent.push(JSON.parse(data)),
      close: (code: number, reason: string) => closes.push({ code, reason }),
    },
    /** Only the frames of one kind, for readable assertions. */
    frames: (name: string) => sent.filter((frame) => frame["frame"] === name),
    /** The events delivered, in the order they arrived. */
    events: () =>
      sent
        .filter((frame) => frame["frame"] === "event")
        .map((frame) => frame["event"] as Record<string, unknown>),
  };
}

function principalFor(kind: "harness" | "person"): Principal {
  return kind === "harness"
    ? {
        kind: "harness",
        participantId: ws.scout.participantId,
        workspaceId: ws.workspaceId,
        displayName: "Scout",
        via: "harness_token",
        ownerId: ws.arjun.participantId,
      }
    : {
        kind: "person",
        participantId: ws.arjun.participantId,
        workspaceId: ws.workspaceId,
        displayName: "Arjun",
        via: "device_key",
        deviceId: ws.arjun.deviceId,
        role: "owner",
      };
}

function open(
  kind: "harness" | "person",
  overrides: {
    maxUnackedFrames?: number;
    attachmentUrl?: SessionOptions["attachmentUrl"];
    tokenId?: string;
    /** Somebody other than Scout or Arjun: a second harness, say. */
    principal?: Principal;
  } = {},
) {
  const wire = fakeSocket();
  const principal = overrides.principal ?? principalFor(kind);
  const session = new Session({
    socket: wire.socket,
    principal:
      overrides.tokenId === undefined ? principal : { ...principal, tokenId: overrides.tokenId },
    ...(overrides.attachmentUrl === undefined ? {} : { attachmentUrl: overrides.attachmentUrl }),
    store: ws.gateway.deps.store,
    fanOut: ws.gateway.deps.fanOut,
    readModels: ws.gateway.deps.readModels,
    submitEvent: ws.gateway.deps.submitEvent,
    ids: ws.ids,
    serverVersion: "0.0.0-test",
    maxUnackedFrames: overrides.maxUnackedFrames ?? ws.config.realtime.maxUnackedFrames,
    now: () => clock,
  });
  return { ...wire, session };
}

const HELLO = JSON.stringify({
  frame: "hello",
  protocol: { min: 1, max: 1 },
  client: { name: "scout", version: "0.1.0" },
});

/** Append an event straight to the store, as another surface would. */
async function append(type: string, extra: Record<string, unknown> = {}): Promise<number> {
  const result = await ws.gateway.deps.store.append({
    v: 1,
    type,
    id: ws.ids.next("event"),
    ts: new Date(clock).toISOString(),
    workspace_id: ws.workspaceId,
    space_id: ws.spaceId,
    actor: { kind: "harness", id: ws.scout.participantId },
    idempotency_key: ws.ids.next("event"),
    ...extra,
  } as IncomingEvent);
  return result.event.seq;
}

describe("the handshake", () => {
  it("negotiates a version and says who the connection is", async () => {
    const wire = open("harness");
    await wire.session.receive(HELLO);

    expect(wire.session.version).toBe(1);
    const [hello] = wire.events();
    // The level, the rules and the budget come from the policy projection (ADR 0019).
    expect(hello).toMatchObject({
      type: "hello",
      protocol: { min: 1, max: 1 },
      server: { name: "chipsd", version: "0.0.0-test" },
      autonomy: 2,
      policy: { autonomy: 2, rules: [] },
      budget: { limit_usd: 25, spent_usd: 0 },
    });
    // And which spaces this credential is in, so a client can drop what it has left.
    expect(hello?.["spaces"]).toEqual([ws.spaceId]);
    const harnesses = (hello?.["harnesses"] ?? []) as { owner_id: string }[];
    expect(harnesses[0]?.owner_id).toBe(ws.arjun.participantId);
  });

  it("says what the workspace is called now, so a device paired under an old name takes the new one", async () => {
    const before = open("person");
    await before.session.receive(HELLO);
    expect(before.events()[0]?.["workspace"]).toEqual({ name: "Solo" });

    await ws.db
      .updateTable("workspaces")
      .set({ name: "Gupta Labs" })
      .where("id", "=", ws.workspaceId)
      .execute();
    try {
      const after = open("person");
      await after.session.receive(HELLO);
      expect(after.events()[0]?.["workspace"]).toEqual({ name: "Gupta Labs" });
    } finally {
      await ws.db
        .updateTable("workspaces")
        .set({ name: "Solo" })
        .where("id", "=", ws.workspaceId)
        .execute();
    }
  });

  it("refuses a client that speaks no version this server does, and closes", async () => {
    const wire = open("harness");
    await wire.session.receive(
      JSON.stringify({
        frame: "hello",
        protocol: { min: 7, max: 9 },
        client: { name: "future", version: "9.0.0" },
      }),
    );

    expect(wire.frames("error")[0]).toMatchObject({ code: "protocol_unsupported" });
    expect(wire.closes).toHaveLength(1);
  });

  it("refuses a frame that is not JSON", async () => {
    const wire = open("harness");
    await wire.session.receive("{not json");
    expect(wire.frames("error")[0]).toMatchObject({ code: "invalid_frame" });
  });

  it("refuses a frame with no name this server knows", async () => {
    const wire = open("harness");
    await wire.session.receive(JSON.stringify({ frame: "shout", text: "hi" }));
    expect(wire.frames("error")[0]).toMatchObject({ code: "invalid_frame" });
  });

  it("will not subscribe before hello", async () => {
    const wire = open("harness");
    await wire.session.receive(
      JSON.stringify({ frame: "subscribe", workspace_id: ws.workspaceId }),
    );
    expect(wire.frames("error")[0]?.["message"]).toContain("hello");
    expect(wire.session.isSubscribed).toBe(false);
  });

  it("answers a ping with a pong that echoes the timestamp", async () => {
    const wire = open("harness");
    await wire.session.receive(HELLO);
    await wire.session.receive(JSON.stringify({ frame: "ping", ts: 42 }));
    expect(wire.frames("pong")[0]).toMatchObject({ ts: 42 });
  });
});

describe("subscribing", () => {
  it("refuses another workspace", async () => {
    const wire = open("harness");
    await wire.session.receive(HELLO);
    await wire.session.receive(
      JSON.stringify({ frame: "subscribe", workspace_id: "ws_01K4ZQPX00000000000000000Z" }),
    );
    expect(wire.frames("error")[0]).toMatchObject({ code: "forbidden" });
  });

  it("replays from the beginning when asked for since zero", async () => {
    const wire = open("person");
    await wire.session.receive(HELLO);
    await wire.session.receive(
      JSON.stringify({ frame: "subscribe", workspace_id: ws.workspaceId, since: 0 }),
    );

    // The workspace was set up with two people joining, a space, three memberships and a policy.
    const seqs = wire
      .events()
      .slice(1)
      .map((event) => event["seq"]);
    expect(seqs).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("sends the replay in pages to a client that takes them, and one frame each to one that does not (ADR 0043)", async () => {
    const PAGED = JSON.stringify({
      frame: "hello",
      protocol: { min: 1, max: 1 },
      client: { name: "phone", version: "0.1.0" },
      accepts: ["events"],
    });
    // A store page holds 500, so this is one page; `scale.spec.ts` is what crosses several.
    const live: number[] = [];
    for (let n = 0; n < 12; n += 1) {
      live.push(await append("checkpoint", { run_id: ws.ids.next("run"), label: `c${n}` }));
    }

    const paged = open("person");
    await paged.session.receive(PAGED);
    await paged.session.receive(
      JSON.stringify({ frame: "subscribe", workspace_id: ws.workspaceId, since: 0 }),
    );
    const pages = paged.frames("events") as { events: Record<string, unknown>[] }[];
    expect(pages.length).toBeGreaterThan(0);
    // The hello is an `event` frame still; nothing else of the replay is.
    expect(paged.events()).toHaveLength(1);
    const inPages = pages.flatMap((page) => page.events.map((event) => event["seq"] as number));
    expect(inPages).toEqual([...inPages].sort((a, b) => a - b));
    expect(inPages.at(-1)).toBe(live.at(-1));
    expect(paged.session.lastDeliveredSeq).toBe(live.at(-1));

    // A live event after the replay is one frame of its own, as it always was.
    const after = await append("checkpoint", { run_id: ws.ids.next("run"), label: "live" });
    await paged.session.settled;
    expect(paged.events().at(-1)).toMatchObject({ type: "checkpoint", seq: after });
    expect(paged.frames("events")).toHaveLength(pages.length);

    // A client that said nothing gets what it always got: one frame per event, no pages.
    const plain = open("person");
    await plain.session.receive(HELLO);
    await plain.session.receive(
      JSON.stringify({ frame: "subscribe", workspace_id: ws.workspaceId, since: 0 }),
    );
    expect(plain.frames("events")).toHaveLength(0);
    expect(plain.events().length).toBe(inPages.length + 2);
  });

  it("counts a page as one frame against how far behind a consumer is", async () => {
    const PAGED = JSON.stringify({
      frame: "hello",
      protocol: { min: 1, max: 1 },
      client: { name: "phone", version: "0.1.0" },
      accepts: ["events"],
    });
    for (let n = 0; n < 12; n += 1) {
      await append("checkpoint", { run_id: ws.ids.next("run"), label: `d${n}` });
    }
    // One frame for the hello, one for the page: a replay that would be twenty frames is two.
    const wire = open("person", { maxUnackedFrames: 2 });
    await wire.session.receive(PAGED);
    await wire.session.receive(
      JSON.stringify({ frame: "subscribe", workspace_id: ws.workspaceId, since: 0 }),
    );
    expect(wire.frames("error")).toHaveLength(0);
    expect(wire.frames("events")).toHaveLength(1);
  });

  it("answers a hello that names a frame it does not know, and sends none of it (ADR 0211)", async () => {
    const newer = open("person");
    await newer.session.receive(
      JSON.stringify({
        frame: "hello",
        protocol: { min: 1, max: 1 },
        client: { name: "phone", version: "9.0.0" },
        accepts: ["events", "a_frame_from_later"],
      }),
    );
    expect(newer.frames("error")).toHaveLength(0);
    expect(newer.events()[0]).toMatchObject({ type: "hello" });
    expect(newer.session.hears("a_frame_from_later")).toBe(true);
    expect(newer.session.hears("presence")).toBe(false);
  });

  it("starts from now when no cursor is given", async () => {
    await append("checkpoint", { run_id: ws.ids.next("run"), label: "before" });

    const wire = open("person");
    await wire.session.receive(HELLO);
    await wire.session.receive(
      JSON.stringify({ frame: "subscribe", workspace_id: ws.workspaceId }),
    );
    // Only the hello. Nothing that happened before the subscription.
    expect(wire.events()).toHaveLength(1);
  });

  it("delivers live events to every subscriber of the workspace", async () => {
    const arjun = open("person");
    const dana = open("person");
    for (const wire of [arjun, dana]) {
      await wire.session.receive(HELLO);
      await wire.session.receive(
        JSON.stringify({ frame: "subscribe", workspace_id: ws.workspaceId }),
      );
    }

    const seq = await append("checkpoint", { run_id: ws.ids.next("run"), label: "live" });
    for (const wire of [arjun, dana]) {
      await wire.session.settled;
      expect(wire.events().at(-1)).toMatchObject({ type: "checkpoint", seq });
    }
  });
});

describe("resuming", () => {
  it("receives exactly the missed events, once", async () => {
    const runId = ws.ids.next("run");
    const wire = open("person");
    await wire.session.receive(HELLO);
    await wire.session.receive(
      JSON.stringify({ frame: "subscribe", workspace_id: ws.workspaceId, since: 0 }),
    );

    await append("run.started", { run_id: runId, goal: "Confirm PO #4471", plan: [] });
    const lastSeen = wire.session.lastDeliveredSeq;

    // The client drops off the network mid-stream.
    wire.session.onDisconnected();

    // Three events happen while it is away.
    const missed: number[] = [];
    missed.push(
      await append("run.status", { run_id: runId, phase: "reading", verb_phrase: "Reading…" }),
    );
    missed.push(await append("step.log", { run_id: runId, step_id: "a", status: "done" }));
    missed.push(await append("checkpoint", { run_id: runId, label: "halfway" }));

    // It comes back and resumes from where it got to.
    const resumed = open("person");
    await resumed.session.receive(HELLO);
    await resumed.session.receive(
      JSON.stringify({ frame: "subscribe", workspace_id: ws.workspaceId, since: lastSeen }),
    );

    const delivered = resumed
      .events()
      .slice(1)
      .map((event) => event["seq"]);
    expect(delivered).toEqual(missed);
    expect(new Set(delivered).size).toBe(delivered.length);
  });

  it("loses nothing when an event is appended during the replay", async () => {
    // The hard case: the store is still paging out history when a new event arrives. Without
    // buffering, the live frame would move the cursor past the history not yet sent.
    const runId = ws.ids.next("run");
    for (let i = 0; i < 40; i += 1) {
      await append("checkpoint", { run_id: runId, label: `${i}` });
    }
    const head = await ws.gateway.deps.store.head(ws.workspaceId);

    const wire = open("person");
    await wire.session.receive(HELLO);

    const subscribing = wire.session.receive(
      JSON.stringify({ frame: "subscribe", workspace_id: ws.workspaceId, since: 0 }),
    );
    // Slip an event in while the replay is in flight.
    const during = await append("checkpoint", { run_id: runId, label: "during" });
    await subscribing;

    const delivered = wire
      .events()
      .slice(1)
      .map((event) => event["seq"] as number);
    expect(delivered).toEqual([...Array(head).keys()].map((n) => n + 1).concat(during));
    expect(new Set(delivered).size).toBe(delivered.length);
  });

  it("delivers each event once per subscription", async () => {
    const runId = ws.ids.next("run");
    const wire = open("person");
    await wire.session.receive(HELLO);
    await wire.session.receive(
      JSON.stringify({ frame: "subscribe", workspace_id: ws.workspaceId, since: 0 }),
    );
    await append("checkpoint", { run_id: runId, label: "one" });

    await wire.session.settled;
    const first = wire
      .events()
      .slice(1)
      .map((event) => event["seq"]);
    expect(new Set(first).size).toBe(first.length);

    // Subscribing again with an explicit cursor is a deliberate request to re-read from there,
    // which is not the same thing as a duplicate: a client that only wants what it has missed
    // passes the cursor it got to, and one that wants nothing older omits `since` entirely.
    wire.sent.length = 0;
    await wire.session.receive(
      JSON.stringify({ frame: "subscribe", workspace_id: ws.workspaceId, since: 0 }),
    );

    const second = wire.events().map((event) => event["seq"]);
    expect(second).toEqual(first);
  });

  it("jumps to now when a re-subscription omits the cursor", async () => {
    const wire = open("person");
    await wire.session.receive(HELLO);
    await wire.session.receive(
      JSON.stringify({ frame: "subscribe", workspace_id: ws.workspaceId, since: 0 }),
    );

    wire.sent.length = 0;
    await wire.session.receive(
      JSON.stringify({
        frame: "subscribe",
        workspace_id: ws.workspaceId,
        space_ids: [ws.spaceId],
      }),
    );
    expect(wire.events()).toEqual([]);
  });
});

describe("writing over the socket", () => {
  it("acknowledges an event with the sequence number it was appended at", async () => {
    const wire = open("harness");
    await wire.session.receive(HELLO);
    await wire.session.receive(
      JSON.stringify({
        frame: "event",
        event: {
          type: "run.started",
          space_id: ws.spaceId,
          run_id: ws.ids.next("run"),
          goal: "Confirm PO #4471",
          plan: [],
          idempotency_key: "scout-ws-1",
        },
      }),
    );

    const [ack] = wire.frames("ack");
    expect(ack).toMatchObject({ idempotency_key: "scout-ws-1", duplicate: false });
    expect(ack?.["seq"]).toBeGreaterThan(0);
  });

  it("acknowledges a retry as a duplicate, at the same sequence number", async () => {
    const wire = open("harness");
    await wire.session.receive(HELLO);
    const runId = ws.ids.next("run");
    await append("run.started", { run_id: runId, goal: "g", plan: [] });
    const frame = JSON.stringify({
      frame: "event",
      event: {
        type: "checkpoint",
        space_id: ws.spaceId,
        run_id: runId,
        label: "one",
        idempotency_key: "scout-ws-2",
      },
    });

    await wire.session.receive(frame);
    await wire.session.receive(frame);

    const [first, second] = wire.frames("ack");
    expect(second).toMatchObject({ duplicate: true, seq: first?.["seq"] });
  });

  it("refuses a write with no idempotency key", async () => {
    const wire = open("harness");
    await wire.session.receive(HELLO);
    await wire.session.receive(
      JSON.stringify({ frame: "event", event: { type: "checkpoint", label: "one" } }),
    );
    expect(wire.frames("error")[0]?.["message"]).toContain("idempotency key");
  });

  it("refuses an event sent on somebody else's behalf", async () => {
    const wire = open("harness");
    await wire.session.receive(HELLO);
    await wire.session.receive(
      JSON.stringify({
        frame: "event",
        event: {
          type: "checkpoint",
          space_id: ws.spaceId,
          run_id: ws.ids.next("run"),
          actor: { kind: "person", id: ws.arjun.participantId },
          label: "forged",
          idempotency_key: "forged-ws-1",
        },
      }),
    );
    expect(wire.frames("error")[0]).toMatchObject({ code: "forbidden" });
  });

  it("refuses a harness saying always for its own approval", async () => {
    // The run and the ask exist: what refuses the decision is rule 9, not a missing run. A
    // harness may settle its own ask once (ADR 0079); always is a person's to give.
    const runId = ws.ids.next("run");
    const approvalId = ws.ids.next("approval");
    await append("run.started", { run_id: runId, goal: "g", plan: [] });
    await append("approval.request", {
      run_id: runId,
      approval_id: approvalId,
      action: { kind: "payment.transfer", money_usd: 50_000, external: true },
      risk: ["financial"],
      expires_in: 3600,
      fallback: "deny",
      editable: false,
      approvers: [ws.arjun.participantId],
    });
    const wire = open("harness");
    await wire.session.receive(HELLO);
    await wire.session.receive(
      JSON.stringify({
        frame: "event",
        event: {
          type: "approval.resolved",
          space_id: ws.spaceId,
          run_id: runId,
          approval_id: approvalId,
          decision: "approved",
          scope: "always",
          resolved_by: ws.arjun.participantId,
          resolved_at: new Date(clock).toISOString(),
          idempotency_key: "self-approve-ws",
        },
      }),
    );
    expect(wire.frames("error")[0]).toMatchObject({
      code: "invalid_event",
      idempotency_key: "self-approve-ws",
    });
    expect(wire.frames("ack")).toEqual([]);
  });
});

describe("writing to a run, over the socket (M1.3)", () => {
  it("names a run nobody started as not found, and a run that has ended as invalid", async () => {
    const wire = open("harness");
    await wire.session.receive(HELLO);
    const runId = ws.ids.next("run");
    await wire.session.receive(
      JSON.stringify({
        frame: "event",
        event: {
          type: "run.status",
          space_id: ws.spaceId,
          run_id: runId,
          phase: "reading",
          verb_phrase: "Reading…",
          idempotency_key: "ws-unknown-run",
        },
      }),
    );
    expect(wire.frames("error")[0]).toMatchObject({
      code: "not_found",
      idempotency_key: "ws-unknown-run",
    });

    await append("run.started", { run_id: runId, goal: "g", plan: [] });
    await append("run.completed", { run_id: runId, summary: "Done." });
    await wire.session.receive(
      JSON.stringify({
        frame: "event",
        event: {
          type: "step.log",
          space_id: ws.spaceId,
          run_id: runId,
          step_id: "late",
          status: "done",
          idempotency_key: "ws-late",
        },
      }),
    );
    expect(wire.frames("error")[1]).toMatchObject({
      code: "invalid_event",
      idempotency_key: "ws-late",
    });
    expect(wire.frames("ack")).toEqual([]);
  });

  it("tells a person whether their mid-run message was queued or steered", async () => {
    const runId = ws.ids.next("run");
    await append("run.started", { run_id: runId, goal: "g", plan: [] });

    const arjun = open("person");
    await arjun.session.receive(HELLO);
    await arjun.session.receive(
      JSON.stringify({
        frame: "event",
        event: {
          type: "message.post",
          space_id: ws.spaceId,
          text: "Any news?",
          idempotency_key: "ws-msg",
        },
      }),
    );
    await arjun.session.receive(
      JSON.stringify({
        frame: "event",
        event: {
          type: "run.steer",
          space_id: ws.spaceId,
          run_id: runId,
          mode: "interrupt",
          text: "Stop and mention the pallet count.",
          idempotency_key: "ws-steer",
        },
      }),
    );

    expect(arjun.frames("receipt")).toEqual([
      { frame: "receipt", idempotency_key: "ws-msg", disposition: "queued" },
      { frame: "receipt", idempotency_key: "ws-steer", disposition: "steered" },
    ]);
    // The ack came first each time; the receipt says what happened after it.
    const kinds = arjun.sent.map((frame) => frame["frame"]);
    expect(kinds.indexOf("ack")).toBeLessThan(kinds.indexOf("receipt"));
  });

  it("gives no receipt for a message when no run is going", async () => {
    const arjun = open("person");
    await arjun.session.receive(HELLO);
    await arjun.session.receive(
      JSON.stringify({
        frame: "event",
        event: {
          type: "message.post",
          space_id: ws.spaceId,
          text: "Hello?",
          idempotency_key: "ws-quiet",
        },
      }),
    );
    expect(arjun.frames("ack")).toHaveLength(1);
    expect(arjun.frames("receipt")).toEqual([]);
  });

  it("hands the run's harness a receipt beside a person's mid-run message", async () => {
    const runId = ws.ids.next("run");
    await append("run.started", { run_id: runId, goal: "g", plan: [] });

    const scout = open("harness");
    await scout.session.receive(HELLO);
    await scout.session.receive(
      JSON.stringify({ frame: "subscribe", workspace_id: ws.workspaceId }),
    );

    const arjun = open("person");
    await arjun.session.receive(HELLO);
    await arjun.session.receive(
      JSON.stringify({
        frame: "event",
        event: {
          type: "run.steer",
          space_id: ws.spaceId,
          run_id: runId,
          mode: "followup",
          text: "When you are done, update the tracker too.",
          idempotency_key: "ws-followup",
        },
      }),
    );
    // The receipt to the harness follows a lookup, so it lands a tick after the event.
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(scout.events().some((event) => event["type"] === "run.steer")).toBe(true);
    expect(scout.frames("receipt")).toEqual([
      { frame: "receipt", idempotency_key: "ws-followup", disposition: "queued" },
    ]);
    const steer = scout.events().find((event) => event["type"] === "run.steer");
    expect(steer?.["from"]).toMatchObject({ display_name: "Arjun", role: "owner" });
  });
});

describe("a person renamed (ADR 0082)", () => {
  it("is heard under the new name from the next message, on a socket that knew the old one", async () => {
    const scout = open("harness");
    await scout.session.receive(HELLO);
    await scout.session.receive(
      JSON.stringify({ frame: "subscribe", workspace_id: ws.workspaceId }),
    );
    const arjun = open("person");
    await arjun.session.receive(HELLO);
    const say = (text: string, key: string) =>
      arjun.session.receive(
        JSON.stringify({
          frame: "event",
          event: { type: "message.post", space_id: ws.spaceId, text, idempotency_key: key },
        }),
      );
    const heard = () =>
      scout
        .events()
        .filter((event) => event["type"] === "message.new")
        .map((event) => (event["from"] as { display_name: string }).display_name);

    await say("Morning.", "rename-1");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(heard()).toEqual(["Arjun"]);

    const renamed = await ws.gateway.deps.renamePerson({
      principal: principalFor("person"),
      participantId: ws.arjun.participantId,
      displayName: "Arjun G",
    });
    expect(renamed.ok).toBe(true);
    await say("Me again.", "rename-2");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(heard()).toEqual(["Arjun", "Arjun G"]);
    // And the harness was told, for the names it keeps itself.
    expect(scout.events().find((event) => event["type"] === "person.renamed")).toMatchObject({
      participant_id: ws.arjun.participantId,
      display_name: "Arjun G",
      previous_name: "Arjun",
    });
  });
});

describe("a message that names a harness (M3.3)", () => {
  /** A second harness in the room, so a mention can pick one of two. */
  async function seatLedger(): Promise<string> {
    const added = await ws.gateway.deps.addHarness({
      principal: principalFor("person"),
      displayName: "Ledger",
      openDirectSpace: false,
    });
    if (!added.ok) throw new Error(added.error.message);
    await ws.gateway.deps.store.append({
      v: 1,
      type: "membership.added",
      id: ws.ids.next("event"),
      ts: new Date(clock).toISOString(),
      workspace_id: ws.workspaceId,
      space_id: ws.spaceId,
      actor: { kind: "person", id: ws.arjun.participantId },
      idempotency_key: "seat-ledger",
      participant_id: added.value.harnessId,
      participant_kind: "harness",
      role: "member",
    } as IncomingEvent);
    return added.value.harnessId;
  }

  it("is that harness's, so the receipt follows the mention rather than whichever run is going", async () => {
    const ledger = await seatLedger();
    const runId = ws.ids.next("run");
    await append("run.started", { run_id: runId, goal: "g", plan: [] });

    const scout = open("harness");
    await scout.session.receive(HELLO);
    await scout.session.receive(
      JSON.stringify({ frame: "subscribe", workspace_id: ws.workspaceId }),
    );
    const arjun = open("person");
    await arjun.session.receive(HELLO);

    // To Ledger, which has nothing going: nobody gets a receipt, and Scout overhears a message
    // for somebody else (ADR 0081).
    await arjun.session.receive(
      JSON.stringify({
        frame: "event",
        event: {
          type: "message.post",
          space_id: ws.spaceId,
          text: "@Ledger are the quotes in line?",
          idempotency_key: "ws-to-ledger",
        },
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(arjun.frames("receipt")).toEqual([]);
    expect(scout.frames("receipt")).toEqual([]);
    expect(scout.events().some((event) => event["type"] === "message.new")).toBe(false);
    const heard = scout.events().find((event) => event["type"] === "message.overheard");
    expect(heard?.["mentions"]).toEqual([ledger]);
    expect(heard?.["addressed_to"]).toEqual([ledger]);

    // To Scout, whose run is going: queued, on both sides.
    await arjun.session.receive(
      JSON.stringify({
        frame: "event",
        event: {
          type: "message.post",
          space_id: ws.spaceId,
          text: "@Scout any news?",
          idempotency_key: "ws-to-scout",
        },
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(arjun.frames("receipt")).toEqual([
      { frame: "receipt", idempotency_key: "ws-to-scout", disposition: "queued" },
    ]);
    expect(scout.frames("receipt")).toEqual([
      { frame: "receipt", idempotency_key: "ws-to-scout", disposition: "queued" },
    ]);
  });
});

/** Ledger, seated beside Scout and connected on a socket of its own. */
async function ledgerOnline() {
  const added = await ws.gateway.deps.addHarness({
    principal: principalFor("person"),
    displayName: "Ledger",
    openDirectSpace: false,
  });
  if (!added.ok) throw new Error(added.error.message);
  await append("membership.added", {
    actor: { kind: "person", id: ws.arjun.participantId },
    participant_id: added.value.harnessId,
    participant_kind: "harness",
    role: "member",
  });
  const wire = open("harness", {
    principal: {
      kind: "harness",
      participantId: added.value.harnessId,
      workspaceId: ws.workspaceId,
      displayName: "Ledger",
      via: "harness_token",
      ownerId: ws.arjun.participantId,
    },
  });
  await wire.session.receive(HELLO);
  await wire.session.receive(JSON.stringify({ frame: "subscribe", workspace_id: ws.workspaceId }));
  return { id: added.value.harnessId, wire };
}

async function everyoneOnline() {
  const ledger = await ledgerOnline();
  const scout = open("harness");
  await scout.session.receive(HELLO);
  await scout.session.receive(JSON.stringify({ frame: "subscribe", workspace_id: ws.workspaceId }));
  const arjun = open("person");
  await arjun.session.receive(HELLO);
  return { ledger, scout, arjun };
}

async function say(
  wire: ReturnType<typeof open>,
  text: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  await wire.session.receive(
    JSON.stringify({
      frame: "event",
      event: {
        type: "message.post",
        space_id: ws.spaceId,
        text,
        idempotency_key: ws.ids.next("event"),
        ...extra,
      },
    }),
  );
  await new Promise((resolve) => setTimeout(resolve, 20));
}

function heard(wire: ReturnType<typeof open>, text: string) {
  return wire.events().find((event) => event["text"] === text);
}

describe("who a message is for (ADR 0081)", () => {
  it("is new to the harnesses it is for, and overheard by the others", async () => {
    const { ledger, scout, arjun } = await everyoneOnline();
    await say(arjun, "Hi both");
    expect(heard(scout, "Hi both")?.["type"]).toBe("message.new");
    expect(heard(ledger.wire, "Hi both")?.["type"]).toBe("message.new");
    // Before Arjun's first message here, every harness.
    const addressed = heard(scout, "Hi both")?.["addressed_to"] as string[] | undefined;
    expect([...(addressed ?? [])].sort()).toEqual([ws.scout.participantId, ledger.id].sort());

    await say(arjun, "Your turn", { to: [ledger.id] });
    expect(heard(ledger.wire, "Your turn")).toMatchObject({
      type: "message.new",
      addressed_to: [ledger.id],
    });
    const overheard = heard(scout, "Your turn");
    expect(overheard).toMatchObject({
      type: "message.overheard",
      addressed_to: [ledger.id],
      from: { participant_id: ws.arjun.participantId, kind: "person" },
    });
    expect(overheard?.["held"]).toBeUndefined();

    // Unnamed, it goes where Arjun's last one went.
    await say(arjun, "And the quotes?");
    expect(heard(ledger.wire, "And the quotes?")?.["type"]).toBe("message.new");
    expect(heard(scout, "And the quotes?")?.["type"]).toBe("message.overheard");
  });

  it("was new to every harness when it was logged before Chips said who it is for", async () => {
    const { ledger, scout } = await everyoneOnline();
    await append("message.post", {
      actor: { kind: "person", id: ws.arjun.participantId },
      text: "From the old days",
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(heard(scout, "From the old days")?.["type"]).toBe("message.new");
    expect(heard(ledger.wire, "From the old days")?.["type"]).toBe("message.new");
    expect(heard(scout, "From the old days")?.["addressed_to"]).toBeUndefined();
  });

  it("reaches the others as overheard and held once harnesses have talked past the ceiling, and is handed over when a person speaks (ADR 0097)", async () => {
    const { ledger, scout, arjun } = await everyoneOnline();
    await say(arjun, "Sort it out between you");
    for (let turn = 1; turn <= CEILING; turn += 1) {
      await say(scout, `@Ledger ${turn}`);
    }
    expect(heard(ledger.wire, `@Ledger ${CEILING}`)?.["type"]).toBe("message.new");
    const past = `@Ledger ${CEILING + 1}`;
    await say(scout, past);
    expect(heard(ledger.wire, past)).toMatchObject({
      type: "message.overheard",
      addressed_to: [],
      held: true,
    });
    // Scout hears its own words as it said them; its ack is what says they were held.
    expect(heard(scout, past)).toMatchObject({ type: "message.post", held: true });

    await say(arjun, "@Ledger go on");
    // The held message reaches Ledger now, once, as a message for it.
    const handed = ledger.wire.events().filter((event) => event["handed"] === true);
    expect(handed).toEqual([expect.objectContaining({ type: "message.new", text: past })]);
    await say(scout, `@Ledger ${CEILING + 2}`);
    expect(heard(ledger.wire, `@Ledger ${CEILING + 2}`)?.["type"]).toBe("message.new");
  });

  it("gives the receipt to the harness it is for, and none to one that overheard it", async () => {
    const { ledger, scout, arjun } = await everyoneOnline();
    await append("run.started", { run_id: ws.ids.next("run"), goal: "g", plan: [] });
    await say(arjun, "How far along?", { to: [ledger.id], idempotency_key: "to-ledger" });
    expect(arjun.frames("receipt")).toEqual([]);
    expect(scout.frames("receipt")).toEqual([]);

    await say(arjun, "How far along, Scout?", {
      to: [ws.scout.participantId],
      idempotency_key: "to-scout",
    });
    expect(scout.frames("receipt")).toEqual([
      { frame: "receipt", idempotency_key: "to-scout", disposition: "queued" },
    ]);
    expect(arjun.frames("receipt")).toEqual([
      { frame: "receipt", idempotency_key: "to-scout", disposition: "queued" },
    ]);
  });
});

describe("what a harness is handed with a question (ADR 0088)", () => {
  /** Scout on a socket of its own, with the budget it gives in its hello. */
  async function scoutWith(context?: Record<string, number>, since?: number) {
    const wire = open("harness");
    await wire.session.receive(
      JSON.stringify({ ...JSON.parse(HELLO), ...(context === undefined ? {} : { context }) }),
    );
    await wire.session.receive(
      JSON.stringify({
        frame: "subscribe",
        workspace_id: ws.workspaceId,
        ...(since === undefined ? {} : { since }),
      }),
    );
    await wire.session.settled;
    return wire;
  }

  type Handed = { lines: { kind: string; from: { name: string }; text?: string }[] } & Record<
    string,
    unknown
  >;

  function handed(wire: ReturnType<typeof open>, text: string): Handed | undefined {
    return heard(wire, text)?.["context"] as Handed | undefined;
  }

  function said(context: Handed | undefined): string[] {
    return (context?.lines ?? []).map((line) =>
      line.kind === "said" ? `${line.from.name}: ${line.text}` : `${line.kind} ${line.from.name}`,
    );
  }

  it("hands a message for a harness what was said since it last spoke, and an overheard one nothing", async () => {
    const { ledger, scout, arjun } = await everyoneOnline();
    await say(scout, "Morning, all");
    const spoke = heard(ledger.wire, "Morning, all")?.["seq"];
    await say(arjun, "@Ledger are the quotes in?");
    await say(ledger.wire, "Three of them, yes.");
    await say(arjun, "@Scout and the tracker?");

    const context = handed(scout, "@Scout and the tracker?");
    expect(said(context)).toEqual([
      "Arjun: @Ledger are the quotes in?",
      "Ledger: Three of them, yes.",
    ]);
    expect(context).toMatchObject({ since_seq: spoke, truncated: false });
    // Each line says who it was for, so a harness can leave out what it already answered.
    expect(context?.lines[0]).toMatchObject({ addressed_to: [ledger.id] });
    // What it overheard was context itself, and came with none.
    expect(heard(scout, "@Ledger are the quotes in?")).toMatchObject({ type: "message.overheard" });
    expect(heard(scout, "@Ledger are the quotes in?")).not.toHaveProperty("context");
  });

  it("counts a turn passed with NO_REPLY as a turn, so what came before it isn't handed again", async () => {
    const { ledger, scout, arjun } = await everyoneOnline();
    await say(scout, "Morning, all");
    await say(arjun, "@Ledger are the quotes in?");
    await say(arjun, "@Scout anything to add?");
    await say(scout, "NO_REPLY");
    await say(ledger.wire, "Three of them, yes.");
    await say(arjun, "@Scout and the tracker?");

    // Bruh chat, 5 November 2026: the turn after a pass was handed everything since the words
    // before it, again.
    expect(said(handed(scout, "@Scout and the tracker?"))).toEqual(["Ledger: Three of them, yes."]);
  });

  it("hands a harness that has never spoken in a room what was said since it joined", async () => {
    const { ledger, arjun } = await everyoneOnline();
    await say(arjun, "@Scout one");
    await say(arjun, "@all two");
    const context = handed(ledger.wire, "@all two");
    // Its own coming in is where it starts, and is not a line of it.
    expect(said(context)).toEqual(["Arjun: @Scout one"]);
    expect(context?.["since_seq"]).toBeGreaterThan(0);

    // Scout was in the room first, so it is told of Ledger coming in.
    expect(said(handed(await scoutWith(undefined, 0), "@all two"))).toEqual([
      "joined Ledger",
      "Arjun: @Scout one",
    ]);
  });

  it("keeps to the budget a harness gives in its hello, the newest lines kept", async () => {
    const { arjun } = await everyoneOnline();
    const scout = await scoutWith({ lines: 2 });
    const quiet = await scoutWith({ lines: 0 });
    for (const text of ["a", "b", "c"]) await say(arjun, `@Ledger ${text}`);
    await say(arjun, "@Scout d");

    const context = handed(scout, "@Scout d");
    expect(said(context)).toEqual(["Arjun: @Ledger b", "Arjun: @Ledger c"]);
    expect(context).toMatchObject({ truncated: true });
    expect(heard(quiet, "@Scout d")).not.toHaveProperty("context");
  });

  it("hands the same lines on a replay after a reconnect, as the room reads now", async () => {
    const { scout, arjun } = await everyoneOnline();
    await say(arjun, "@Ledger Frday");
    await say(arjun, "@Ledger oops");
    await say(arjun, "@Scout ready?");
    const live = handed(scout, "@Scout ready?");
    expect(said(live)).toEqual(["joined Ledger", "Arjun: @Ledger Frday", "Arjun: @Ledger oops"]);

    const again = await scoutWith(undefined, 0);
    expect(handed(again, "@Scout ready?")).toEqual(live);

    // An edit and a delete since then: the room as it reads now.
    await append("message.edited", {
      actor: { kind: "person", id: ws.arjun.participantId },
      message_id: heard(scout, "@Ledger Frday")?.["message_id"],
      text: "@Ledger Friday",
    });
    await append("message.deleted", {
      actor: { kind: "person", id: ws.arjun.participantId },
      message_id: heard(scout, "@Ledger oops")?.["message_id"],
    });
    const later = await scoutWith(undefined, 0);
    expect(said(handed(later, "@Scout ready?"))).toEqual([
      "joined Ledger",
      "Arjun: @Ledger Friday",
    ]);
  });
});

describe("the approval round trip, over sockets", () => {
  it("reaches the harness, and both people, in sequence order", async () => {
    const runId = ws.ids.next("run");
    const approvalId = ws.ids.next("approval");

    const scout = open("harness");
    const arjun = open("person");
    const dana = open("person");
    for (const wire of [scout, arjun, dana]) {
      await wire.session.receive(HELLO);
      await wire.session.receive(
        JSON.stringify({ frame: "subscribe", workspace_id: ws.workspaceId }),
      );
    }

    // Scout starts a run and asks.
    for (const [key, event] of [
      ["run", { type: "run.started", run_id: runId, goal: "Confirm PO #4471", plan: [] }],
      [
        "ask",
        {
          type: "approval.request",
          run_id: runId,
          approval_id: approvalId,
          action: { kind: "email.send", external: true },
          risk: ["external_communication"],
          expires_in: 3600,
        },
      ],
    ] as const) {
      await scout.session.receive(
        JSON.stringify({
          frame: "event",
          event: { space_id: ws.spaceId, idempotency_key: `ws-${key}`, ...event },
        }),
      );
    }

    // Everyone watching sees the ask.
    for (const wire of [arjun, dana]) {
      expect(wire.events().some((event) => event["type"] === "approval.request")).toBe(true);
    }

    // Arjun answers.
    await arjun.session.receive(
      JSON.stringify({
        frame: "event",
        event: {
          type: "approval.resolved",
          space_id: ws.spaceId,
          run_id: runId,
          approval_id: approvalId,
          decision: "approved",
          scope: "once",
          resolved_by: ws.arjun.participantId,
          resolved_at: new Date(clock).toISOString(),
          idempotency_key: "ws-approve",
        },
      }),
    );

    // Scout hears the decision, and the run is working again.
    const resolved = scout.events().find((event) => event["type"] === "approval.resolved");
    expect(resolved).toMatchObject({ decision: "approved", resolved_by: ws.arjun.participantId });

    // Dana sees it too — a second surface is told, rather than left showing a stale card.
    expect(dana.events().some((event) => event["type"] === "approval.resolved")).toBe(true);

    const run = await ws.gateway.deps.readModels.run(ws.workspaceId, runId);
    expect(run?.state).toBe("running");
  });
});

describe("heartbeats and backpressure", () => {
  it("pings on a tick", () => {
    const wire = open("harness");
    wire.session.tick(60_000);
    expect(wire.frames("ping")).toHaveLength(1);
  });

  it("closes a socket that has been silent past the idle timeout", () => {
    const wire = open("harness");
    clock += 61_000;
    wire.session.tick(60_000);
    expect(wire.closes[0]).toMatchObject({ reason: "idle" });
  });

  /**
   * The guard in `close`. A session is asked to close twice whenever the server shuts down
   * inside the window between a close it ordered itself — a revoked device, an idle socket —
   * and that socket's own close event arriving, which is what takes the session out of the
   * hub's set (`closeWhere` and `disconnected` in `hub.ts`). Whether the window is open is a
   * matter of timing, so until this test the line was covered on some runs and not others, and
   * the branch total moved by one between them.
   */
  it("closes once, however many times it is asked", () => {
    const wire = open("harness");
    wire.session.close(1001, "server shutting down");
    wire.session.close(1001, "server shutting down");
    expect(wire.closes).toHaveLength(1);
  });

  it("does not write to a socket whose peer has already gone", () => {
    const wire = open("harness");
    wire.session.onDisconnected();
    wire.session.close(1001, "server shutting down");
    expect(wire.closes).toHaveLength(0);
  });

  it("does not count the server's own stall as the socket's silence", () => {
    const wire = open("harness");
    // The server stood still for 79 s: the socket's frames from then are still unread.
    clock += 99_000;
    wire.session.tick(60_000, 79_000);
    expect(wire.closes).toEqual([]);
    expect(wire.frames("ping")).toHaveLength(1);
    // Silent after it all the same, it goes on the next beats.
    clock += 41_000;
    wire.session.tick(60_000);
    expect(wire.closes[0]).toMatchObject({ reason: "idle" });
  });

  it("keeps a socket that answered its ping", async () => {
    const wire = open("harness");
    clock += 30_000;
    await wire.session.receive(JSON.stringify({ frame: "pong", ts: clock }));
    clock += 30_000;
    wire.session.tick(60_000);
    expect(wire.closes).toEqual([]);
  });

  it("drops a consumer that has fallen too far behind, telling it to resume", async () => {
    const runId = ws.ids.next("run");
    const wire = open("person", { maxUnackedFrames: 3 });
    await wire.session.receive(HELLO);
    await wire.session.receive(
      JSON.stringify({ frame: "subscribe", workspace_id: ws.workspaceId }),
    );

    for (let i = 0; i < 10; i += 1) {
      await append("checkpoint", { run_id: runId, label: `${i}` });
    }

    const [error] = wire.frames("error");
    expect(error).toMatchObject({ code: "too_far_behind" });
    expect(String(error?.["message"])).toContain("`since`");
    expect(wire.closes[0]).toMatchObject({ reason: "too_far_behind" });
  });

  it("forgets a dropped consumer, so it stops costing anything", async () => {
    const wire = open("person", { maxUnackedFrames: 2 });
    await wire.session.receive(HELLO);
    await wire.session.receive(
      JSON.stringify({ frame: "subscribe", workspace_id: ws.workspaceId }),
    );
    const before = ws.gateway.deps.fanOut.subscriberCount();

    for (let i = 0; i < 6; i += 1) {
      await append("checkpoint", { run_id: ws.ids.next("run"), label: `${i}` });
    }

    expect(ws.gateway.deps.fanOut.subscriberCount()).toBe(before - 1);
  });

  it("releases its subscription when the peer goes away", async () => {
    const wire = open("person");
    await wire.session.receive(HELLO);
    await wire.session.receive(
      JSON.stringify({ frame: "subscribe", workspace_id: ws.workspaceId }),
    );
    const before = ws.gateway.deps.fanOut.subscriberCount();

    wire.session.onDisconnected();
    expect(ws.gateway.deps.fanOut.subscriberCount()).toBe(before - 1);
  });
});

describe("scoped by membership (finding 6)", () => {
  /** Append an event to any space, as another surface would. */
  async function appendTo(
    spaceId: string,
    type: string,
    extra: Record<string, unknown>,
  ): Promise<number> {
    const result = await ws.gateway.deps.store.append({
      v: 1,
      type,
      id: ws.ids.next("event"),
      ts: new Date(clock).toISOString(),
      workspace_id: ws.workspaceId,
      space_id: spaceId,
      actor: { kind: "person", id: ws.dana.participantId },
      idempotency_key: ws.ids.next("event"),
      ...extra,
    } as IncomingEvent);
    return result.event.seq;
  }

  async function subscribe(): Promise<ReturnType<typeof open>> {
    const wire = open("person");
    await wire.session.receive(HELLO);
    await wire.session.receive(
      JSON.stringify({ frame: "subscribe", workspace_id: ws.workspaceId }),
    );
    return wire;
  }

  it("does not deliver a space the subscriber is not in", async () => {
    const wire = await subscribe();
    const other = ws.ids.next("space");
    await appendTo(other, "space.created", { kind: "direct" });
    await appendTo(other, "membership.added", {
      participant_id: ws.dana.participantId,
      participant_kind: "person",
      role: "owner",
    });
    const hidden = await appendTo(other, "message.post", { text: "Dana only." });

    expect(wire.events().map((event) => event["seq"])).not.toContain(hidden);
  });

  it("delivers a space once the subscriber is added to it", async () => {
    const wire = await subscribe();
    const other = ws.ids.next("space");
    await appendTo(other, "space.created", { kind: "direct" });
    // Arjun is added: the join names him, so he sees it even though he was not yet a member.
    const join = await appendTo(other, "membership.added", {
      participant_id: ws.arjun.participantId,
      participant_kind: "person",
      role: "member",
    });
    const after = await appendTo(other, "message.post", { text: "Now Arjun can see this." });

    await wire.session.settled;
    const seqs = wire.events().map((event) => event["seq"]);
    expect(seqs).toContain(join);
    expect(seqs).toContain(after);
  });

  it("delivers a thread opened in one of the subscriber's spaces, and its messages (M5.4)", async () => {
    const wire = await subscribe();
    const thread = ws.ids.next("space");
    const opened = await appendTo(thread, "space.created", {
      kind: "thread",
      parent_space_id: ws.spaceId,
    });
    const reply = await appendTo(thread, "message.post", { text: "In the thread." });

    await wire.session.settled;
    const seqs = wire.events().map((event) => event["seq"]);
    expect(seqs).toContain(opened);
    expect(seqs).toContain(reply);
  });

  it("keeps a thread of a space the subscriber is not in to itself (M5.4)", async () => {
    const wire = await subscribe();
    const other = ws.ids.next("space");
    await appendTo(other, "space.created", { kind: "direct" });
    const thread = ws.ids.next("space");
    const opened = await appendTo(thread, "space.created", {
      kind: "thread",
      parent_space_id: other,
    });
    const reply = await appendTo(thread, "message.post", { text: "Dana's thread." });

    const seqs = wire.events().map((event) => event["seq"]);
    expect(seqs).not.toContain(opened);
    expect(seqs).not.toContain(reply);
  });

  it("stops delivering a space's threads when the subscriber leaves the space (M5.4)", async () => {
    const thread = ws.ids.next("space");
    await appendTo(thread, "space.created", { kind: "thread", parent_space_id: ws.spaceId });
    const wire = await subscribe();
    const before = await appendTo(thread, "message.post", { text: "Still in." });
    const left = await appendTo(ws.spaceId, "membership.removed", {
      participant_id: ws.arjun.participantId,
      removed_by: ws.dana.participantId,
    });
    const after = await appendTo(thread, "message.post", { text: "Not for Arjun now." });
    const inTheRoom = await appendTo(ws.spaceId, "message.post", { text: "Nor this." });

    const seqs = wire.events().map((event) => event["seq"]);
    expect(seqs).toContain(before);
    expect(seqs).toContain(left);
    expect(seqs).not.toContain(after);
    expect(seqs).not.toContain(inTheRoom);
  });

  it("delivers an approval that names the subscriber, from a room they are not in (M5.5)", async () => {
    const wire = await subscribe();
    const other = ws.ids.next("space");
    await appendTo(other, "space.created", { kind: "direct" });
    const ask = (approvers: string[]) =>
      appendTo(other, "approval.request", {
        run_id: ws.ids.next("run"),
        approval_id: ws.ids.next("approval"),
        action: { kind: "drive.read" },
        risk: [],
        expires_in: 3600,
        fallback: "deny",
        editable: false,
        approvers,
      });
    const named = await ask([ws.arjun.participantId]);
    const notNamed = await ask([ws.dana.participantId]);

    const seqs = wire.events().map((event) => event["seq"]);
    expect(seqs).toContain(named);
    expect(seqs).not.toContain(notNamed);
  });

  it("replays only the spaces a resuming client is in", async () => {
    const other = ws.ids.next("space");
    await appendTo(other, "space.created", { kind: "direct" });
    await appendTo(other, "membership.added", {
      participant_id: ws.dana.participantId,
      participant_kind: "person",
      role: "owner",
    });
    const hidden = await appendTo(other, "message.post", { text: "Not for Arjun." });

    const wire = open("person");
    await wire.session.receive(HELLO);
    await wire.session.receive(
      JSON.stringify({ frame: "subscribe", workspace_id: ws.workspaceId, since: 0 }),
    );

    const seqs = wire
      .events()
      .slice(1)
      .map((event) => event["seq"]);
    expect(seqs).not.toContain(hidden);
    // Arjun's own space, set up with four events, and the workspace-wide ones, is all he sees.
    expect(seqs).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("replays a resuming client's own removal from a space it left elsewhere", async () => {
    // Arjun was in a second space, and left it from another client while this one was away.
    const other = ws.ids.next("space");
    await appendTo(other, "space.created", { kind: "group", title: "Analyst" });
    const joined = await appendTo(other, "membership.added", {
      participant_id: ws.arjun.participantId,
      participant_kind: "person",
      role: "member",
    });
    const said = await appendTo(other, "message.post", { text: "While he was in." });
    const left = await appendTo(other, "membership.removed", {
      participant_id: ws.arjun.participantId,
    });
    const after = await appendTo(other, "message.post", { text: "After he left." });

    const wire = open("person");
    await wire.session.receive(HELLO);
    await wire.session.receive(
      JSON.stringify({ frame: "subscribe", workspace_id: ws.workspaceId, since: 0 }),
    );

    const seqs = wire
      .events()
      .slice(1)
      .map((event) => event["seq"]);
    // The join and the leave both name him, so both reach him; the space's own history is no
    // longer his, before or after — but without the leave, a client resuming from its cache
    // would keep the space for ever.
    expect(seqs).toContain(joined);
    expect(seqs).toContain(left);
    expect(seqs).not.toContain(said);
    expect(seqs).not.toContain(after);
  });
});

describe("writing, scoped by membership (phase-1-interim-review finding 1)", () => {
  /** A direct space Dana alone is in. */
  async function danaOnly(): Promise<string> {
    const spaceId = ws.ids.next("space");
    await ws.gateway.deps.store.append({
      v: 1,
      type: "space.created",
      id: ws.ids.next("event"),
      ts: new Date(clock).toISOString(),
      workspace_id: ws.workspaceId,
      space_id: spaceId,
      actor: { kind: "person", id: ws.dana.participantId },
      idempotency_key: ws.ids.next("event"),
      kind: "direct",
    } as IncomingEvent);
    return spaceId;
  }

  async function subscribed(): Promise<ReturnType<typeof open>> {
    const wire = open("person");
    await wire.session.receive(HELLO);
    await wire.session.receive(
      JSON.stringify({ frame: "subscribe", workspace_id: ws.workspaceId }),
    );
    return wire;
  }

  function send(wire: ReturnType<typeof open>, event: Record<string, unknown>): Promise<void> {
    return wire.session.receive(JSON.stringify({ frame: "event", event }));
  }

  it("refuses a person's message into a space they are not in, with no ack", async () => {
    const other = await danaOnly();
    const wire = await subscribed();
    await send(wire, {
      type: "message.post",
      space_id: other,
      text: "Let me in.",
      idempotency_key: "knock",
    });
    expect(wire.frames("ack")).toHaveLength(0);
    expect(wire.frames("error")[0]).toMatchObject({ code: "forbidden", idempotency_key: "knock" });
  });

  it("refuses a person adding themself to a space they are not in", async () => {
    const other = await danaOnly();
    const wire = await subscribed();
    await send(wire, {
      type: "membership.added",
      space_id: other,
      participant_id: ws.arjun.participantId,
      participant_kind: "person",
      role: "member",
      idempotency_key: "self-invite",
    });
    expect(wire.frames("ack")).toHaveLength(0);
    expect(wire.frames("error")[0]).toMatchObject({ code: "forbidden" });
  });

  it("makes whoever opens a space its first member, and shows it to them live", async () => {
    const wire = await subscribed();
    const spaceId = ws.ids.next("space");
    await send(wire, {
      type: "space.created",
      space_id: spaceId,
      kind: "direct",
      title: "Notes to self",
      idempotency_key: "open",
    });
    await send(wire, {
      type: "message.post",
      space_id: spaceId,
      text: "First.",
      idempotency_key: "first",
    });

    expect(wire.frames("error")).toEqual([]);
    expect(wire.frames("ack").map((ack) => ack["idempotency_key"])).toEqual(["open", "first"]);
    // Both came back on the stream: the opening, because its actor is the viewer, and the
    // message, because opening it made the viewer a member.
    const delivered = wire.events().map((event) => event["type"]);
    expect(delivered).toContain("space.created");
    expect(delivered).toContain("message.post");
    expect(
      await ws.gateway.deps.readModels.isMember(ws.workspaceId, spaceId, ws.arjun.participantId),
    ).toBe(true);
  });
});

describe("first answer wins, across surfaces (M1.4)", () => {
  async function askOverSocket(): Promise<{
    runId: string;
    approvalId: string;
    scout: ReturnType<typeof open>;
  }> {
    const runId = ws.ids.next("run");
    const approvalId = ws.ids.next("approval");
    const scout = open("harness");
    await scout.session.receive(HELLO);
    await scout.session.receive(
      JSON.stringify({ frame: "subscribe", workspace_id: ws.workspaceId }),
    );
    for (const [key, event] of [
      ["run", { type: "run.started", run_id: runId, goal: "g", plan: [] }],
      [
        "ask",
        {
          type: "approval.request",
          run_id: runId,
          approval_id: approvalId,
          action: { kind: "email.send", external: true },
          risk: ["external"],
          expires_in: 3600,
        },
      ],
    ] as const) {
      await scout.session.receive(
        JSON.stringify({
          frame: "event",
          event: { space_id: ws.spaceId, idempotency_key: `fa-${key}`, ...event },
        }),
      );
    }
    return { runId, approvalId, scout };
  }

  async function person(): Promise<ReturnType<typeof open>> {
    const wire = open("person");
    await wire.session.receive(HELLO);
    await wire.session.receive(
      JSON.stringify({ frame: "subscribe", workspace_id: ws.workspaceId }),
    );
    return wire;
  }

  const decision = (runId: string, approvalId: string, decision: string, key: string) =>
    JSON.stringify({
      frame: "event",
      event: {
        type: "approval.resolved",
        space_id: ws.spaceId,
        run_id: runId,
        approval_id: approvalId,
        decision,
        idempotency_key: key,
      },
    });

  it("marks a decision as made elsewhere on every surface but the one that made it", async () => {
    const { runId, approvalId, scout } = await askOverSocket();
    const laptop = await person();
    const phone = await person();

    await laptop.session.receive(decision(runId, approvalId, "approved", "from-laptop"));

    const resolvedAt = (wire: ReturnType<typeof open>) =>
      wire.events().find((event) => event["type"] === "approval.resolved");
    expect(resolvedAt(laptop)?.["resolved_elsewhere"]).toBe(false);
    expect(resolvedAt(phone)?.["resolved_elsewhere"]).toBe(true);
    expect(resolvedAt(scout)?.["resolved_elsewhere"]).toBe(false);

    // The log holds the decision once, as it was made.
    const stored = await ws.gateway.deps.store.since(ws.workspaceId, 0, 100);
    const logged = stored.events.find((event) => event.type === "approval.resolved");
    expect(logged?.payload["resolved_elsewhere"]).toBe(false);
  });

  it("tells the second decider that the first won", async () => {
    const { runId, approvalId } = await askOverSocket();
    const laptop = await person();
    const phone = await person();
    await laptop.session.receive(decision(runId, approvalId, "approved", "l1"));
    await phone.session.receive(decision(runId, approvalId, "denied", "p1"));

    expect(phone.frames("error")[0]).toMatchObject({
      code: "invalid_event",
      idempotency_key: "p1",
    });
    expect(String(phone.frames("error")[0]?.["message"])).toContain("first answer wins");
    expect(phone.frames("ack")).toEqual([]);
    const approval = await ws.gateway.deps.readModels.approval(ws.workspaceId, approvalId);
    expect(approval?.decision).toBe("approved");
  });
});

describe("feedback on a harness's message (M3.4)", () => {
  const subscribed = async (wire: ReturnType<typeof open>) => {
    await wire.session.receive(HELLO);
    await wire.session.receive(
      JSON.stringify({ frame: "subscribe", workspace_id: ws.workspaceId }),
    );
    return wire;
  };
  const feedbackHeard = (wire: ReturnType<typeof open>) =>
    wire.events().filter((event) => event["type"] === "feedback");

  it("reaches the harness whose message it is and every person, and not another harness", async () => {
    // Ledger: a second harness, in the room.
    const added = await ws.gateway.deps.addHarness({
      principal: principalFor("person"),
      displayName: "Ledger",
    });
    if (!added.ok) throw new Error(added.error.message);
    await append("membership.added", {
      actor: { kind: "person", id: ws.arjun.participantId },
      participant_id: added.value.harnessId,
      participant_kind: "harness",
      role: "member",
    });
    const scout = await subscribed(open("harness"));
    const ledger = await subscribed(
      open("harness", {
        principal: {
          kind: "harness",
          participantId: added.value.harnessId,
          workspaceId: ws.workspaceId,
          displayName: "Ledger",
          via: "harness_token",
          ownerId: ws.arjun.participantId,
        },
      }),
    );
    const person = await subscribed(open("person"));

    // Scout says something, with an id this test chose, so the message's id is known.
    const eventId = ws.ids.next("event");
    await append("message.post", { id: eventId, text: "Delivery is on the 12th." });
    // Arjun reacts through his own session, so the door fills in who.
    await person.session.receive(
      JSON.stringify({
        frame: "event",
        event: {
          type: "feedback",
          space_id: ws.spaceId,
          message_id: messageIdOf(eventId),
          kind: "reaction",
          reaction: "👎",
          idempotency_key: "thumbs-1",
        },
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(person.frames("ack")).toHaveLength(1);
    expect(feedbackHeard(scout)).toHaveLength(1);
    expect(feedbackHeard(scout)[0]).toMatchObject({
      message_id: messageIdOf(eventId),
      kind: "reaction",
      reaction: "👎",
      from: {
        participant_id: ws.arjun.participantId,
        kind: "person",
        display_name: "Arjun",
        role: "owner",
      },
    });
    expect(feedbackHeard(person)).toHaveLength(1);
    expect(feedbackHeard(ledger)).toHaveLength(0);
    // Not delivered to Ledger, but not a gap either: its cursor moved past it.
    expect(ledger.session.lastDeliveredSeq).toBe(scout.session.lastDeliveredSeq);
  });

  it("names a message nobody sent as not found, and a person's own as invalid", async () => {
    const person = await subscribed(open("person"));
    const feedback = (key: string, messageId: string) =>
      person.session.receive(
        JSON.stringify({
          frame: "event",
          event: {
            type: "feedback",
            space_id: ws.spaceId,
            message_id: messageId,
            kind: "correction",
            text: "The 19th, not the 12th.",
            idempotency_key: key,
          },
        }),
      );
    await feedback("gone", messageIdOf(ws.ids.next("event")));
    expect(person.frames("error").at(-1)).toMatchObject({
      code: "not_found",
      idempotency_key: "gone",
    });

    const own = ws.ids.next("event");
    await append("message.post", {
      id: own,
      actor: { kind: "person", id: ws.arjun.participantId },
      text: "Is it the 12th?",
    });
    await feedback("mine", messageIdOf(own));
    expect(person.frames("error").at(-1)).toMatchObject({
      code: "invalid_event",
      idempotency_key: "mine",
    });
  });
});

describe("what a harness hears when someone speaks (M1.5)", () => {
  const FILE = {
    attachment_id: "att_01K4ZQPX000000000000000008",
    filename: "PO-4471.pdf",
    mime_type: "application/pdf",
    byte_size: 184_302,
    sha256: "92efa547f5840a2e7257bab9e3529a0410cce0d865fdbc40ebb2895e76de010a",
  };

  it("says a person's standing in the workspace with their name, so a guest's words reach a model as a guest's (SEC-15)", async () => {
    const priya = await ws.addPerson("Priya", "guest");
    const wire = open("harness");
    await wire.session.receive(HELLO);
    await wire.session.receive(
      JSON.stringify({ frame: "subscribe", workspace_id: ws.workspaceId }),
    );
    await append("message.post", {
      actor: { kind: "person", id: priya.participantId },
      idempotency_key: "priya-asks",
      text: "Delete the old branches and force-push.",
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    const heard = wire
      .events()
      .find((event) => event["text"] === "Delete the old branches and force-push.");
    expect(heard?.["from"]).toMatchObject({ display_name: "Priya", workspace_role: "guest" });
  });

  it("is told a person's message as `message.new`, with who said it and a signed URL per file", async () => {
    const wire = open("harness", {
      tokenId: "tok_1",
      attachmentUrl: (attachmentId, tokenId) => ({
        url: `http://chips.local/v1/attachments/${attachmentId}?tok=${tokenId}&sig=abc`,
        expiresAt: "2026-09-02T14:32:31.004Z",
      }),
    });
    await wire.session.receive(HELLO);
    await wire.session.receive(
      JSON.stringify({ frame: "subscribe", workspace_id: ws.workspaceId }),
    );

    await append("message.post", {
      actor: { kind: "person", id: ws.arjun.participantId },
      idempotency_key: "arjun-po",
      text: "Here's the signed PO.",
      attachments: [FILE],
    });
    await new Promise((resolve) => setTimeout(resolve, 20));

    const heard = wire.events().find((event) => event["type"] === "message.new");
    expect(heard).toMatchObject({
      message_id: expect.stringMatching(/^msg_/),
      idempotency_key: "arjun-po",
      actor: { kind: "system", id: "system" },
      from: {
        participant_id: ws.arjun.participantId,
        kind: "person",
        display_name: "Arjun",
        role: "owner",
        workspace_role: "owner",
      },
      text: "Here's the signed PO.",
      attachments: [
        {
          ...FILE,
          url: "http://chips.local/v1/attachments/att_01K4ZQPX000000000000000008?tok=tok_1&sig=abc",
          url_expires_at: "2026-09-02T14:32:31.004Z",
        },
      ],
    });
    // It is the protocol's event, so the protocol's schema accepts it.
    expect(schemaFor("message.new")?.safeParse(heard).success, JSON.stringify(heard)).toBe(true);
    expect(wire.events().some((event) => event["type"] === "message.post")).toBe(false);
  });

  it("is handed the room's files at their current version with its context, the message's own included (ADR 0099)", async () => {
    const wire = open("harness", {
      tokenId: "tok_1",
      attachmentUrl: (attachmentId, tokenId) => ({
        url: `http://chips.local/v1/attachments/${attachmentId}?tok=${tokenId}&sig=abc`,
        expiresAt: "2026-09-02T14:32:31.004Z",
      }),
    });
    await wire.session.receive(HELLO);
    await wire.session.receive(
      JSON.stringify({ frame: "subscribe", workspace_id: ws.workspaceId }),
    );
    const page = (n: number, letter: string) => ({
      ...FILE,
      attachment_id: `att_01K4ZQPX00000000000000001${n}`,
      filename: "gallery.html",
      mime_type: "text/html",
      sha256: letter.repeat(64),
    });
    for (const [n, file] of [page(1, "a"), FILE, page(2, "b")].entries()) {
      await append("message.post", {
        actor: { kind: "person", id: ws.arjun.participantId },
        idempotency_key: `arjun-file-${n}`,
        text: `File ${n}`,
        attachments: [file],
      });
    }
    await new Promise((resolve) => setTimeout(resolve, 20));

    const heard = wire.events().filter((event) => event["type"] === "message.new");
    const filesOf = (event: Record<string, unknown> | undefined): Record<string, unknown>[] =>
      (event?.["context"] as { files?: Record<string, unknown>[] } | undefined)?.files ?? [];
    const files = filesOf(heard.at(-1));
    expect(files.map((file) => [file["name"], file["version"], file["attachment_id"]])).toEqual([
      ["gallery.html", 2, page(2, "b").attachment_id],
      ["PO-4471.pdf", 1, FILE.attachment_id],
    ]);
    expect(files[0]).toMatchObject({
      by: { id: ws.arjun.participantId, kind: "person", name: "Arjun" },
      url: `http://chips.local/v1/attachments/${page(2, "b").attachment_id}?tok=tok_1&sig=abc`,
      url_expires_at: "2026-09-02T14:32:31.004Z",
    });
    // The first message was handed the room as it was then: its own file, v1.
    const first = filesOf(heard[0]);
    expect(first.map((file) => [file["name"], file["version"]])).toEqual([["gallery.html", 1]]);
    expect(schemaFor("message.new")?.safeParse(heard.at(-1)).success).toBe(true);
  });

  it("hears a voice note with the words said in it, beside a URL for the sound (ADR 0054)", async () => {
    const wire = open("harness", {
      tokenId: "tok_1",
      attachmentUrl: (attachmentId, tokenId) => ({
        url: `http://chips.local/v1/attachments/${attachmentId}?tok=${tokenId}&sig=abc`,
        expiresAt: "2026-09-02T14:32:31.004Z",
      }),
    });
    await wire.session.receive(HELLO);
    await wire.session.receive(
      JSON.stringify({ frame: "subscribe", workspace_id: ws.workspaceId }),
    );
    const note = {
      attachment_id: "att_01K4ZQPX000000000000000009",
      filename: "voice-note.m4a",
      mime_type: "audio/mp4",
      byte_size: 96_512,
      sha256: "b".repeat(64),
      duration_ms: 8400,
      transcript: "Send Priya the receipt from the hardware store.",
    };

    await append("message.post", {
      actor: { kind: "person", id: ws.arjun.participantId },
      idempotency_key: "arjun-voice",
      text: "",
      attachments: [note],
    });
    await new Promise((resolve) => setTimeout(resolve, 20));

    const heard = wire.events().find((event) => event["type"] === "message.new");
    expect(heard).toMatchObject({
      attachments: [
        {
          ...note,
          url: "http://chips.local/v1/attachments/att_01K4ZQPX000000000000000009?tok=tok_1&sig=abc",
        },
      ],
    });
    expect(schemaFor("message.new")?.safeParse(heard).success, JSON.stringify(heard)).toBe(true);
  });

  it("hears its own message back as it sent it, and a person hears every message as posted", async () => {
    const harness = open("harness");
    await harness.session.receive(HELLO);
    await harness.session.receive(
      JSON.stringify({ frame: "subscribe", workspace_id: ws.workspaceId }),
    );
    const person = open("person");
    await person.session.receive(HELLO);
    await person.session.receive(
      JSON.stringify({ frame: "subscribe", workspace_id: ws.workspaceId }),
    );

    await append("message.post", { text: "Confirmed with Northwind." });
    await append("message.post", {
      actor: { kind: "person", id: ws.dana.participantId },
      text: "Thanks!",
    });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(harness.events().map((event) => event["type"])).toEqual([
      "hello",
      "message.post",
      "message.new",
    ]);
    expect(person.events().map((event) => event["type"])).toEqual([
      "hello",
      "message.post",
      "message.post",
    ]);
  });
});

describe("a task over the socket (M3.5)", () => {
  it("acknowledges with where the lane is", async () => {
    const wire = open("harness");
    await wire.session.receive(HELLO);
    const runId = ws.ids.next("run");
    await append("run.started", { run_id: runId, goal: "Look into it", plan: [] });
    const laneId = ws.ids.next("lane");
    await wire.session.receive(
      JSON.stringify({
        frame: "event",
        event: {
          type: "task",
          space_id: ws.spaceId,
          run_id: runId,
          task_id: laneId,
          to: ws.scout.participantId,
          home: ws.spaceId,
          label: "Explore",
          on_behalf_of: ws.arjun.participantId,
          goal: "Find where the quotes live",
          idempotency_key: "scout-task-1",
        },
      }),
    );

    const [ack] = wire.frames("ack");
    const lane = await ws.gateway.deps.readModels.lane(ws.workspaceId, laneId);
    expect(ack).toMatchObject({
      idempotency_key: "scout-task-1",
      lane: { lane_id: laneId, run_id: lane?.run_id, space_id: ws.spaceId },
    });
  });
});

describe("a reply, and the message it answers (ADR 0219)", () => {
  type Line = { kind: string; from: { name: string }; text?: string };

  function lines(said: readonly Line[] | undefined): string[] {
    return (said ?? []).map((line) =>
      line.kind === "said" ? `${line.from.name}: ${line.text}` : `${line.kind} ${line.from.name}`,
    );
  }

  function replyingTo(wire: ReturnType<typeof open>, text: string) {
    return heard(wire, text)?.["replying_to"] as
      | (Record<string, unknown> & { seq: number; before?: Line[] })
      | undefined;
  }

  it("hands a turn the message it answers, and the lines just before it once that is older than the turn's context", async () => {
    const { ledger, scout, arjun } = await everyoneOnline();
    await say(arjun, "@Scout find us a table for Friday");
    await say(scout, "Held for 6 at 7:30. They need a card by Thursday noon.");
    const held = heard(ledger.wire, "Held for 6 at 7:30. They need a card by Thursday noon.")?.[
      "message_id"
    ];
    await say(arjun, "@Scout and a cake?");
    await say(scout, "Ordered the chocolate one.");
    await say(arjun, "@Ledger anything from you?");
    await say(arjun, "Make it 8 people", { reply_to: held });

    const reply = heard(scout, "Make it 8 people");
    // For Scout, whose message it answers, though Arjun last spoke to Ledger (ADR 0081, rule 3).
    expect(reply).toMatchObject({
      type: "message.new",
      reply_to: held,
      addressed_to: [ws.scout.participantId],
      replying_to: {
        message_id: held,
        kind: "said",
        from: { name: "Scout" },
        text: "Held for 6 at 7:30. They need a card by Thursday noon.",
      },
    });
    const quoted = replyingTo(scout, "Make it 8 people");
    // What the turn was handed starts after it, so what it was about comes with it.
    const context = reply?.["context"] as { since_seq: number; lines: Line[] };
    expect(context.since_seq).toBeGreaterThanOrEqual(quoted?.seq ?? Number.POSITIVE_INFINITY);
    expect(lines(context.lines)).toEqual(["Arjun: @Ledger anything from you?"]);
    expect(quoted?.before?.length).toBeLessThanOrEqual(3);
    expect(lines(quoted?.before).at(-1)).toBe("Arjun: @Scout find us a table for Friday");
    expect(schemaFor("message.new")?.safeParse(reply).success, JSON.stringify(reply)).toBe(true);

    // Ledger overhears it with the quote alone: an overheard message gives no turn.
    const overheard = heard(ledger.wire, "Make it 8 people");
    expect(overheard).toMatchObject({
      type: "message.overheard",
      replying_to: { message_id: held },
    });
    expect(overheard?.["replying_to"]).not.toHaveProperty("before");
    expect(schemaFor("message.overheard")?.safeParse(overheard).success).toBe(true);
  });

  it("hands the same quote on a replay after a reconnect", async () => {
    const { ledger, scout, arjun } = await everyoneOnline();
    await say(arjun, "@Scout what's the plan?");
    await say(scout, "Lunch at noon, then the site visit.");
    const plan = heard(ledger.wire, "Lunch at noon, then the site visit.")?.["message_id"];
    await say(scout, "And I booked the van.");
    await say(arjun, "Push lunch to one", { reply_to: plan });
    const live = replyingTo(scout, "Push lunch to one");
    expect(live).toMatchObject({ text: "Lunch at noon, then the site visit." });

    const again = open("harness");
    await again.session.receive(HELLO);
    await again.session.receive(
      JSON.stringify({ frame: "subscribe", workspace_id: ws.workspaceId, since: 0 }),
    );
    await again.session.settled;
    expect(replyingTo(again, "Push lunch to one")).toEqual(live);
  });

  it("hands the quote alone when the message is among the lines the turn was handed", async () => {
    const { ledger, scout, arjun } = await everyoneOnline();
    await say(scout, "Morning, all");
    await say(ledger.wire, "The quotes are in: three of them.");
    const quotes = heard(scout, "The quotes are in: three of them.")?.["message_id"];
    await say(arjun, "@Scout check these against the budget", { reply_to: quotes });

    const reply = heard(scout, "@Scout check these against the budget");
    expect(lines((reply?.["context"] as { lines: Line[] } | undefined)?.lines)).toContain(
      "Ledger: The quotes are in: three of them.",
    );
    expect(reply?.["replying_to"]).toMatchObject({
      message_id: quotes,
      from: { name: "Ledger" },
      text: "The quotes are in: three of them.",
    });
    expect(reply?.["replying_to"]).not.toHaveProperty("before");
  });

  it("quotes a message as it reads now: edited, and one taken back with no words", async () => {
    const { scout, arjun } = await everyoneOnline();
    await say(arjun, "@Scout the table is for 6");
    await say(arjun, "@Scout and bring the PO");
    const table = heard(scout, "@Scout the table is for 6")?.["message_id"];
    const po = heard(scout, "@Scout and bring the PO")?.["message_id"];
    const arjunActs = { actor: { kind: "person", id: ws.arjun.participantId } };
    await append("message.edited", {
      ...arjunActs,
      message_id: table,
      text: "@Scout the table is for 7",
    });
    await append("message.deleted", { ...arjunActs, message_id: po });
    await say(arjun, "Make it 8", { reply_to: table });
    await say(arjun, "Never mind that", { reply_to: po });

    expect(replyingTo(scout, "Make it 8")).toMatchObject({
      text: "@Scout the table is for 7",
      edited: true,
    });
    const gone = replyingTo(scout, "Never mind that");
    expect(gone).toMatchObject({ message_id: po, deleted: true, from: { name: "Arjun" } });
    expect(gone).not.toHaveProperty("text");
  });

  it("hands the files of the message it answers, each with a URL for this harness", async () => {
    const FILE = {
      attachment_id: "att_01K4ZQPX000000000000000008",
      filename: "PO-4471.pdf",
      mime_type: "application/pdf",
      byte_size: 184_302,
      sha256: "92efa547f5840a2e7257bab9e3529a0410cce0d865fdbc40ebb2895e76de010a",
    };
    const wire = open("harness", {
      tokenId: "tok_1",
      attachmentUrl: (attachmentId, tokenId) => ({
        url: `http://chips.local/v1/attachments/${attachmentId}?tok=${tokenId}&sig=abc`,
        expiresAt: "2026-09-02T14:32:31.004Z",
      }),
    });
    await wire.session.receive(HELLO);
    await wire.session.receive(
      JSON.stringify({ frame: "subscribe", workspace_id: ws.workspaceId }),
    );
    const arjunSays = { actor: { kind: "person", id: ws.arjun.participantId } };
    await append("message.post", { ...arjunSays, text: "Here's the PO.", attachments: [FILE] });
    await new Promise((resolve) => setTimeout(resolve, 20));
    const po = heard(wire, "Here's the PO.")?.["message_id"];
    await append("message.post", { ...arjunSays, text: "Is this one signed?", reply_to: po });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(replyingTo(wire, "Is this one signed?")).toMatchObject({
      message_id: po,
      files: ["PO-4471.pdf"],
      attachments: [
        {
          ...FILE,
          url: "http://chips.local/v1/attachments/att_01K4ZQPX000000000000000008?tok=tok_1&sig=abc",
          url_expires_at: "2026-09-02T14:32:31.004Z",
        },
      ],
    });
  });

  it("refuses a reply to a message there is none of", async () => {
    const { arjun } = await everyoneOnline();
    await say(arjun, "Hello?", {
      reply_to: "msg_01K4ZQPX000000000000000099",
      idempotency_key: "to-nothing",
    });
    expect(arjun.frames("error").at(-1)).toMatchObject({
      code: "not_found",
      idempotency_key: "to-nothing",
    });
  });
});
