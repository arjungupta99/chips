/**
 * The event log, against a real SQLite file in a temporary directory (technical-plan 6.3).
 *
 * The invariant these tests exist for is ADR 0004's: the log and the read models are written in
 * one transaction, and the read models are a function of the log. `rebuild` is how that is
 * checked, and the property test is how it is checked for sequences nobody thought to write.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createIdGenerator, type IdKind, parseEvent } from "@chipschat/protocol";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { EventStore, IncomingEvent, StoredEvent } from "../../application/ports/index.js";
import { PROJECTION_TABLES } from "../../domain/index.js";
import { openDatabase } from "../db/connection.js";
import { migrateToLatest } from "../db/migrator.js";
import type { Database } from "../db/schema.js";
import { createSqliteEventStore } from "./sqlite-event-store.js";

let directory: string;
let db: Kysely<Database>;
let close: () => Promise<void>;
let store: EventStore;
let published: StoredEvent[];

/** Deterministic ids and a clock the test drives (technical-plan 6.3). */
let ids = createIdGenerator({ now: () => 1_756_800_000_000, randomFill: (b) => b.fill(1) });
let tick = 0;
const now = () => new Date(1_756_800_000_000 + tick++).toISOString();

const WS = "ws_01K4ZQPX000000000000000001";
const CONV = "spc_01K4ZQPX000000000000000002";
const ARJUN = "usr_01K4ZQPX000000000000000003";
const SCOUT = "hrn_01K4ZQPX000000000000000004";

function newId(kind: IdKind): string {
  return ids.next(kind);
}

/**
 * An envelope with everything the store reads, validated the way the gateway will validate it
 * in M0.4. Going through `parseEvent` here means a test cannot build an event the edge would
 * refuse, and the schema's defaults are applied exactly as they will be in production.
 */
function event(type: string, extra: Record<string, unknown> = {}): IncomingEvent {
  const draft = {
    v: 1,
    type,
    id: newId("event"),
    ts: now(),
    workspace_id: WS,
    space_id: CONV,
    actor: { kind: "harness", id: SCOUT },
    ...extra,
  };
  const parsed = parseEvent(draft);
  if (!parsed.ok) {
    throw new Error(`the test built an invalid ${type}: ${JSON.stringify(parsed.error)}`);
  }
  // The envelope's optional fields are dropped by the schema when absent, and a test that
  // passes `space_id: undefined` means it.
  return { ...parsed.value, ...pickUndefined(extra) } as unknown as IncomingEvent;
}

/** Keep the explicit `undefined`s a test wrote, which a schema parse would otherwise drop. */
function pickUndefined(extra: Record<string, unknown>): Record<string, undefined> {
  return Object.fromEntries(
    Object.entries(extra).filter(([, value]) => value === undefined),
  ) as Record<string, undefined>;
}

beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), "chips-store-"));
  const connection = openDatabase({ databaseUrl: `sqlite:${join(directory, "chips.db")}` });
  db = connection.db;
  close = connection.close;
  await migrateToLatest(db, () => "2026-09-02T00:00:00.000Z");

  published = [];
  ids = createIdGenerator({ now: () => 1_756_800_000_000, randomFill: (b) => b.fill(1) });
  tick = 0;
  store = createSqliteEventStore({ db, now, onAppended: (e) => published.push(e) });

  await db.insertInto("workspaces").values({ id: WS, name: "Solo", created_at: now() }).execute();
  // A space is a read model, so it is created by an event like everything else
  // (ADR 0018). Inserting the row directly would make `rebuild` delete it.
  await store.append(
    event("space.created", {
      actor: { kind: "person", id: ARJUN },
      kind: "group",
      title: "PO-4471",
    }),
  );
  published = [];
});

afterEach(async () => {
  await close();
  rmSync(directory, { recursive: true, force: true });
});

describe("append", () => {
  it("numbers a workspace's events from one", async () => {
    // The fixture already appended `space.created` as sequence one.
    const result = await store.append(event("checkpoint", { run_id: newId("run"), label: "one" }));
    expect(result.event.seq).toBe(2);
    expect(result.duplicate).toBe(false);
  });

  it("numbers events monotonically", async () => {
    const run = newId("run");
    const seqs: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      seqs.push(
        (await store.append(event("checkpoint", { run_id: run, label: `${i}` }))).event.seq,
      );
    }
    expect(seqs).toEqual([2, 3, 4, 5, 6]);
  });

  it("numbers each workspace independently", async () => {
    const other = "ws_01K4ZQPX00000000000000000B";
    await db
      .insertInto("workspaces")
      .values({ id: other, name: "Other", created_at: now() })
      .execute();

    const first = await store.append(event("checkpoint", { run_id: newId("run"), label: "a" }));
    const second = await store.append(
      event("checkpoint", {
        workspace_id: other,
        space_id: undefined,
        run_id: newId("run"),
        label: "b",
      }),
    );
    expect(first.event.seq).toBe(2);
    expect(second.event.seq).toBe(1);
  });

  it("publishes each appended event once", async () => {
    const run = newId("run");
    await store.append(event("checkpoint", { run_id: run, label: "one" }));
    await store.append(event("checkpoint", { run_id: run, label: "two" }));
    expect(published.map((e) => e.seq)).toEqual([2, 3]);
  });

  it("writes the log and the projection in one step", async () => {
    const run = newId("run");
    await store.append(event("run.started", { run_id: run, goal: "Confirm PO #4471", plan: [] }));

    const logged = await db.selectFrom("events").selectAll().execute();
    const runs = await db.selectFrom("runs").selectAll().execute();
    expect(logged).toHaveLength(2);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ id: run, state: "running", goal: "Confirm PO #4471" });
  });

  it("stores the sequence number in the payload, so a replay sees what a subscriber saw", async () => {
    const result = await store.append(event("checkpoint", { run_id: newId("run"), label: "x" }));
    expect(result.event.payload["seq"]).toBe(result.event.seq);
  });
});

describe("idempotency", () => {
  it("treats the same event id as already applied", async () => {
    const once = event("checkpoint", { run_id: newId("run"), label: "one" });
    const first = await store.append(once);
    const again = await store.append(once);

    expect(again.duplicate).toBe(true);
    expect(again.event.seq).toBe(first.event.seq);
    expect(await store.head(WS)).toBe(2);
  });

  it("treats the same idempotency key as already applied, even with a new event id", async () => {
    const run = newId("run");
    const first = await store.append(
      event("checkpoint", { run_id: run, label: "one", idempotency_key: "scout-1" }),
    );
    const again = await store.append(
      event("checkpoint", { run_id: run, label: "one", idempotency_key: "scout-1" }),
    );

    expect(again.duplicate).toBe(true);
    expect(again.event.seq).toBe(first.event.seq);
  });

  it("does not publish a duplicate a second time", async () => {
    const once = event("checkpoint", { run_id: newId("run"), label: "one" });
    await store.append(once);
    await store.append(once);
    expect(published).toHaveLength(1);
  });

  it("keeps different keys apart", async () => {
    const run = newId("run");
    await store.append(event("checkpoint", { run_id: run, label: "a", idempotency_key: "k1" }));
    await store.append(event("checkpoint", { run_id: run, label: "b", idempotency_key: "k2" }));
    expect(await store.head(WS)).toBe(3);
  });
});

describe("since", () => {
  it("returns exactly the events after a cursor, once", async () => {
    const run = newId("run");
    for (let i = 0; i < 6; i += 1) {
      await store.append(event("checkpoint", { run_id: run, label: `${i}` }));
    }
    const page = await store.since(WS, 4);
    expect(page.events.map((e) => e.seq)).toEqual([5, 6, 7]);
  });

  it("returns nothing when the caller is already up to date", async () => {
    await store.append(event("checkpoint", { run_id: newId("run"), label: "x" }));
    expect((await store.since(WS, 2)).events).toEqual([]);
  });

  it("pages by cursor rather than by offset", async () => {
    const run = newId("run");
    for (let i = 0; i < 10; i += 1) {
      await store.append(event("checkpoint", { run_id: run, label: `${i}` }));
    }

    const seen: number[] = [];
    let cursor = 0;
    for (;;) {
      const page = await store.since(WS, cursor, 4);
      seen.push(...page.events.map((e) => e.seq));
      if (page.nextCursor === null) break;
      cursor = page.nextCursor;
    }
    expect(seen).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it("does not leak another workspace's events", async () => {
    const other = "ws_01K4ZQPX00000000000000000C";
    await db
      .insertInto("workspaces")
      .values({ id: other, name: "Other", created_at: now() })
      .execute();
    await store.append(event("checkpoint", { run_id: newId("run"), label: "mine" }));
    await store.append(
      event("checkpoint", {
        workspace_id: other,
        space_id: undefined,
        run_id: newId("run"),
        label: "theirs",
      }),
    );

    const page = await store.since(WS, 1);
    expect(page.events).toHaveLength(1);
    expect(page.events[0]?.workspace_id).toBe(WS);
  });
});

describe("head", () => {
  it("is zero for a workspace with no events", async () => {
    expect(await store.head("ws_01K4ZQPX00000000000000000E")).toBe(0);
  });

  it("is the highest sequence number appended", async () => {
    const run = newId("run");
    await store.append(event("checkpoint", { run_id: run, label: "a" }));
    await store.append(event("checkpoint", { run_id: run, label: "b" }));
    expect(await store.head(WS)).toBe(3);
  });
});

/** Read every projection row for a workspace, ordered, so two states can be compared. */
async function snapshot(workspaceId: string): Promise<Record<string, unknown[]>> {
  const out: Record<string, unknown[]> = {};
  for (const table of PROJECTION_TABLES) {
    const rows = await db
      .selectFrom(table)
      .selectAll()
      .where("workspace_id", "=", workspaceId)
      .execute();
    out[table] = rows.map((row) => JSON.stringify(row, Object.keys(row as object).sort())).sort();
  }
  return out;
}

describe("rebuild", () => {
  it("reproduces the projections exactly", async () => {
    const run = newId("run");
    const approval = newId("approval");
    await store.append(
      event("run.started", {
        run_id: run,
        goal: "Confirm PO #4471",
        plan: [{ step_id: "a", title: "Read" }],
      }),
    );
    await store.append(
      event("step.log", { run_id: run, step_id: "a", status: "done", tool: "drive.read" }),
    );
    await store.append(
      event("approval.request", {
        run_id: run,
        approval_id: approval,
        action: { kind: "email.send" },
        risk: ["external"],
        expires_in: 3600,
      }),
    );
    await store.append(
      event("approval.resolved", {
        run_id: run,
        actor: { kind: "person", id: ARJUN },
        approval_id: approval,
        decision: "approved",
        resolved_by: ARJUN,
        resolved_at: now(),
      }),
    );
    await store.append(event("run.completed", { run_id: run, summary: "Done." }));

    const before = await snapshot(WS);
    const result = await store.rebuild(WS);
    const after = await snapshot(WS);

    expect(result.replayed).toBe(6);
    expect(after).toEqual(before);
  });

  it("leaves the log itself untouched", async () => {
    const run = newId("run");
    await store.append(event("run.started", { run_id: run, goal: "g", plan: [] }));
    await store.rebuild(WS);
    expect(await store.head(WS)).toBe(2);
  });

  it("does not touch another workspace's projections", async () => {
    const other = "ws_01K4ZQPX00000000000000000D";
    await db
      .insertInto("workspaces")
      .values({ id: other, name: "Other", created_at: now() })
      .execute();
    await store.append(
      event("run.started", {
        workspace_id: other,
        space_id: undefined,
        run_id: newId("run"),
        goal: "theirs",
        plan: [],
      }),
    );

    const before = await snapshot(other);
    await store.rebuild(WS);
    expect(await snapshot(other)).toEqual(before);
  });
});

describe("an approval that names the viewer (M5.5)", () => {
  it("is replayed to them from a space they are not in, and to nobody else", async () => {
    const ask = (approvers: string[]) =>
      event("approval.request", {
        space_id: "spc_01K4ZQPX00000000000000000Z",
        run_id: newId("run"),
        approval_id: newId("approval"),
        action: { kind: "drive.read" },
        risk: [],
        expires_in: 3600,
        fallback: "deny",
        approvers,
      });
    const LEAD = "hrn_01K4ZQPX00000000000000000B";
    const OTHER = "usr_01K4ZQPX000000000000000009";
    await store.append(ask([LEAD]));
    await store.append(ask([OTHER]));
    const lead = await store.since(WS, 0, 500, { spaces: [], participantId: LEAD });
    expect(lead.events.map((each) => each.payload["approvers"])).toEqual([[LEAD]]);
    const nobody = await store.since(WS, 0, 500, { spaces: [], participantId: SCOUT });
    expect(nobody.events).toEqual([]);
  });

  it("replays the ask, the hand-on and the decision, and nothing else of that room (ADR 0042)", async () => {
    const ROOM = "spc_01K4ZQPX00000000000000000Y";
    const OUTSIDER = "usr_01K4ZQPX000000000000000009";
    const approvalId = newId("approval");
    const runId = newId("run");
    const inRoom = (type: string, payload: Record<string, unknown>) =>
      event(type, { space_id: ROOM, run_id: runId, ...payload });
    await store.append(
      inRoom("approval.request", {
        approval_id: approvalId,
        action: { kind: "payment.send", money_usd: 5 },
        risk: [],
        expires_in: 3600,
        fallback: "deny",
        approvers: [OUTSIDER],
      }),
    );
    await store.append(
      inRoom("approval.routed", {
        approval_id: approvalId,
        to: [OUTSIDER],
        approvers: [OUTSIDER],
        routed_by: ARJUN,
        routed_at: "2026-09-07T00:00:00.000Z",
      }),
    );
    await store.append(
      inRoom("approval.resolved", {
        approval_id: approvalId,
        decision: "approved",
        scope: "once",
        resolved_by: OUTSIDER,
        resolved_at: "2026-09-07T00:00:01.000Z",
        resolved_elsewhere: false,
        approvers: [OUTSIDER],
      }),
    );
    await store.append(
      inRoom("approval.executed", {
        approval_id: approvalId,
        outcome: "executed",
        approvers: [OUTSIDER],
      }),
    );
    // The room's own traffic, which is none of theirs.
    await store.append(inRoom("message.post", { message_id: newId("message"), text: "hello" }));

    const seen = await store.since(WS, 0, 500, { spaces: [], participantId: OUTSIDER });
    expect(seen.events.map((each) => each.type)).toEqual([
      "approval.request",
      "approval.routed",
      "approval.resolved",
      "approval.executed",
    ]);
  });
});

describe("a message deleted for oneself (ADR 0167)", () => {
  it("is replayed to the person who did it, and to nobody else in the room", async () => {
    const DANA = "usr_01K4ZQPX00000000000000000D";
    const messageId = newId("message");
    await store.append(event("message.post", { message_id: messageId, text: "hello" }));
    const asPerson = (type: string, who: string) =>
      event(type, { actor: { kind: "person", id: who }, message_id: messageId });
    await store.append(asPerson("message.hidden", ARJUN));
    await store.append(asPerson("message.shown", ARJUN));
    await store.append(asPerson("message.hidden", DANA));

    const who = (id: string) => (id === ARJUN ? "arjun" : id === DANA ? "dana" : "scout");
    const types = async (participantId: string) =>
      (await store.since(WS, 0, 500, { spaces: [CONV], participantId })).events
        .filter((each) => each.type.startsWith("message."))
        .map((each) => `${each.type} ${who(each.actor.id)}`);
    expect(await types(ARJUN)).toEqual([
      "message.post scout",
      "message.hidden arjun",
      "message.shown arjun",
    ]);
    expect(await types(DANA)).toEqual(["message.post scout", "message.hidden dana"]);
    expect(await types(SCOUT)).toEqual(["message.post scout"]);
    // Out of the room, a person still has their own: the fold has no room to put them in.
    const away = await store.since(WS, 0, 500, { spaces: [], participantId: DANA });
    expect(away.events.map((each) => each.type)).toEqual(["message.hidden"]);
  });
});
