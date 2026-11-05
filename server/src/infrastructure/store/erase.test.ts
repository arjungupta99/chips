/**
 * Erasing a space from the log (ADR 0067), at the store: what goes, what stays, and the two
 * promises the rest of Chips leans on — no sequence number is handed out twice, and the
 * projections are what a replay of the log makes, before and after.
 */

import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { type Kysely, sql } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { EventStore } from "../../application/ports/index.js";
import { PROJECTION_TABLES, project } from "../../domain/index.js";
import { openDatabase } from "../db/connection.js";
import { migrateToLatest } from "../db/migrator.js";
import type { Database } from "../db/schema.js";
import { drainSearchIndex } from "./search-index.js";
import { createSqliteEventStore } from "./sqlite-event-store.js";

const WS = "ws_01K4ZQPX000000000000000001";
const CHESS = "spc_01K4ZQPX0000000000000CHESS";
const THREAD = "spc_01K4ZQPX000000000000THREAD";
const TRIP = "spc_01K4ZQPX00000000000000TRIP";
const ARJUN = "usr_01K4ZQPX000000000000000003";
const SCOUT = "hrn_01K4ZQPX000000000000000004";
const X = "a".repeat(64);
const Y = "b".repeat(64);

let db: Kysely<Database>;
let store: EventStore;
let close: () => Promise<void>;
let n = 0;

beforeEach(async () => {
  const directory = mkdtempSync(join(tmpdir(), "chips-erase-"));
  const connection = openDatabase({ databaseUrl: `sqlite:${join(directory, "chips.db")}` });
  await migrateToLatest(connection.db, () => "2026-09-02T00:00:00.000Z");
  db = connection.db;
  let tick = 0;
  store = createSqliteEventStore({
    db,
    now: () => new Date(1_758_500_000_000 + tick++).toISOString(),
  });
  await db
    .insertInto("workspaces")
    .values({ id: WS, name: "Solo", created_at: "2026-09-02T00:00:00.000Z" })
    .execute();
  close = async () => {
    await connection.close();
    rmSync(directory, { recursive: true, force: true });
  };
});

afterEach(async () => {
  await close();
});

/** Append one event into a space, as the named actor. */
async function put(
  type: string,
  space: string | undefined,
  fields: Record<string, unknown> = {},
  actor: { kind: string; id: string } = { kind: "person", id: ARJUN },
) {
  n += 1;
  const id = `evt_01K4ZQPX${String(n).padStart(18, "0")}`;
  return (
    await store.append({
      v: 1,
      type,
      id,
      ts: new Date(1_758_400_000_000 + n * 1000).toISOString(),
      workspace_id: WS,
      ...(space === undefined ? {} : { space_id: space }),
      actor,
      idempotency_key: `k-${n}`,
      ...fields,
    })
  ).event;
}

function attachment(id: string, sha256: string) {
  return {
    attachment_id: id,
    filename: `${id}.jpg`,
    mime_type: "image/jpeg",
    byte_size: 3,
    sha256,
  };
}

async function upload(id: string, sha256: string, thumbnail: string | null = null) {
  await db
    .insertInto("uploads")
    .values({
      id,
      workspace_id: WS,
      uploaded_by: ARJUN,
      filename: `${id}.jpg`,
      state: "stored",
      mime_type: "image/jpeg",
      byte_size: 3,
      sha256,
      width: null,
      height: null,
      duration_ms: null,
      thumbnail_sha256: thumbnail,
      thumbnail_mime_type: null,
      keep_metadata: 0,
      created_at: "2026-09-20T00:00:00.000Z",
      expires_at: "2026-09-21T00:00:00.000Z",
      stored_at: "2026-09-20T00:00:00.000Z",
      declared_bytes: null,
      playable_state: null,
      playable_how: null,
      playable_sha256: null,
      playable_mime_type: null,
      playable_note: null,
      transcript: null,
      view_sha256: null,
      view_mime_type: null,
    })
    .execute();
}

/** Every projection row of the workspace, ordered, so two states compare exactly. */
async function projections(): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = {};
  for (const table of PROJECTION_TABLES) {
    const rows = await db.selectFrom(table).selectAll().where("workspace_id", "=", WS).execute();
    out[table] = rows.map((row) => JSON.stringify(row, Object.keys(row as object).sort())).sort();
  }
  return out;
}

async function spent(): Promise<number> {
  const row = await db
    .selectFrom("harness_policy")
    .select("spent_usd")
    .where("harness_id", "=", SCOUT)
    .where("space_id", "=", "*")
    .executeTakeFirstOrThrow();
  return row.spent_usd;
}

/**
 * Two rooms and a thread: Chess (erased in these tests), its thread, and a trip that stays.
 * Scout runs in both, at a cost; a lane goes from Chess, the lead's room, to the trip; a photo
 * in Chess shares its bytes with one in the trip; and Chess's own events are the newest.
 */
async function twoRooms(): Promise<void> {
  await put("policy.updated", undefined, {
    harness_id: SCOUT,
    policy: { autonomy: 1, rules: [] },
    workspace_max_autonomy: 2,
  });
  for (const [space, title] of [
    [TRIP, "India trip"],
    [CHESS, "Chess Game"],
  ] as const) {
    await put("space.created", space, { kind: "group", title });
    await put("membership.added", space, {
      participant_id: SCOUT,
      participant_kind: "harness",
      role: "member",
    });
  }
  await put("space.created", THREAD, {
    kind: "thread",
    parent_space_id: CHESS,
    root_message_id: "msg_01K4ZQPX00000000000000ROOT",
  });

  await upload("att_01K4ZQPX000000000000000TRIP", Y);
  await put("message.post", TRIP, {
    text: "Flights hold until Friday.",
    attachments: [attachment("att_01K4ZQPX000000000000000TRIP", Y)],
  });
  const run = "run_01K4ZQPX0000000000000TRIP1";
  await put(
    "run.started",
    TRIP,
    { goal: "Hold the flights", run_id: run },
    { kind: "harness", id: SCOUT },
  );
  await put(
    "usage",
    TRIP,
    { run_id: run, scope: "step", input_tokens: 10, output_tokens: 5, cost: { usd: 0.25 } },
    { kind: "harness", id: SCOUT },
  );

  // The lane: asked for in Chess, done in the trip.
  await put(
    "run.requested",
    TRIP,
    {
      lane_id: "lane_01K4ZQPX0000000000000LANE",
      goal: "Find a hotel",
      on_behalf_of: ARJUN,
      requested_by: SCOUT,
      specialist_id: SCOUT,
      trail: [{ participant_id: ARJUN }, { participant_id: SCOUT }],
      link_to: [CHESS],
    },
    { kind: "system", id: "system" },
  );
  await put(
    "lane.updated",
    CHESS,
    { lane_id: "lane_01K4ZQPX0000000000000LANE", state: "completed", delivery: "delivered" },
    { kind: "system", id: "system" },
  );

  await put(
    "run.started",
    CHESS,
    { goal: "Play e4", run_id: "run_01K4ZQPX000000000000CHESS1" },
    { kind: "harness", id: SCOUT },
  );
  await put(
    "approval.request",
    CHESS,
    {
      approval_id: "apr_01K4ZQPX00000000000000CHESS",
      action: { kind: "email.send" },
      risk: [],
      fallback: "deny",
      editable: false,
    },
    { kind: "harness", id: SCOUT },
  );
  await put(
    "usage",
    CHESS,
    {
      run_id: "run_01K4ZQPX000000000000CHESS1",
      scope: "step",
      input_tokens: 20,
      output_tokens: 8,
      cost: { usd: 0.5 },
    },
    { kind: "harness", id: SCOUT },
  );
  await put("message.post", THREAD, { text: "Why not d4?" });
  await upload("att_01K4ZQPX0000000000000CHESS", X, "c".repeat(64));
  await upload("att_01K4ZQPX0000000000000SHARE", Y);
  await put("message.post", CHESS, {
    text: "Your move. I'd play Nf3 here.",
    attachments: [
      attachment("att_01K4ZQPX0000000000000CHESS", X),
      attachment("att_01K4ZQPX0000000000000SHARE", Y),
    ],
  });

  await db
    .insertInto("space_icons")
    .values({
      workspace_id: WS,
      participant_id: ARJUN,
      space_id: CHESS,
      icon: "rook",
      ground: 3,
      updated_at: "2026-09-21T00:00:00.000Z",
    })
    .execute();
  await db
    .insertInto("hidden_spaces")
    .values({
      workspace_id: WS,
      participant_id: ARJUN,
      space_id: CHESS,
      hidden_at: "2026-10-19T00:00:00.000Z",
    })
    .execute();
  await db
    .insertInto("pinned_spaces")
    .values({
      workspace_id: WS,
      participant_id: ARJUN,
      space_id: CHESS,
      pinned_at: "2026-10-27T00:00:00.000Z",
    })
    .execute();
  await db
    .insertInto("read_state")
    .values({
      workspace_id: WS,
      participant_id: ARJUN,
      space_id: CHESS,
      last_read_seq: 3,
      updated_at: "2026-11-03T00:00:00.000Z",
    })
    .execute();
  await db
    .insertInto("notification_claims")
    .values({
      workspace_id: WS,
      participant_id: ARJUN,
      key: "decision:apr_01K4ZQPX00000000000000CHESS",
      device_id: "dev_01K4ZQPX000000000000000001",
      claimed_at: "2026-09-21T00:00:00.000Z",
    })
    .execute();
}

function tombstone() {
  return {
    v: 1,
    type: "space.erased",
    id: "evt_01K4ZQPX0000000000000ERASE",
    ts: "2026-09-22T21:00:00.000Z",
    workspace_id: WS,
    actor: { kind: "person", id: ARJUN },
    idempotency_key: `erase-${CHESS}`,
  };
}

describe("erasing a space", () => {
  it("numbers its line past everything the room held, though the room's were the newest", async () => {
    await twoRooms();
    const head = await store.head(WS);

    const { event, erased } = await store.erase({
      workspaceId: WS,
      spaceId: CHESS,
      tombstone: tombstone(),
    });

    expect(event.seq).toBe(head + 1);
    expect(event.space_id).toBeNull();
    expect(erased).toEqual([CHESS, THREAD]);
    expect(event.payload["erased"]).toEqual([CHESS, THREAD]);
    // The next thing anybody says is numbered after it, not into the gap the room left.
    const next = await put("message.post", TRIP, { text: "Booked." });
    expect(next.seq).toBe(head + 2);
  });

  it("takes the room's events, its thread's, and every row built from them", async () => {
    await twoRooms();
    await store.erase({ workspaceId: WS, spaceId: CHESS, tombstone: tombstone() });

    const left = await db
      .selectFrom("events")
      .select("space_id")
      .where("space_id", "in", [CHESS, THREAD])
      .execute();
    expect(left).toEqual([]);
    const rooms = await db.selectFrom("spaces").select("id").orderBy("id").execute();
    expect(rooms.map((row) => row.id)).toEqual([TRIP]);
    for (const table of ["messages", "runs", "approvals", "attachments", "memberships"] as const) {
      const rows = await db
        .selectFrom(table)
        .selectAll()
        .where("space_id", "in", [CHESS, THREAD])
        .execute();
      expect(rows, table).toEqual([]);
    }
    // And the rows kept beside the log, which no replay would have taken.
    expect(await db.selectFrom("space_icons").selectAll().execute()).toEqual([]);
    expect(await db.selectFrom("hidden_spaces").selectAll().execute()).toEqual([]);
    expect(await db.selectFrom("pinned_spaces").selectAll().execute()).toEqual([]);
    expect(await db.selectFrom("read_state").selectAll().execute()).toEqual([]);
    expect(await db.selectFrom("notification_claims").selectAll().execute()).toEqual([]);
    // Search has nothing of it: the index is rebuilt from what is left, and finds what is left.
    await drainSearchIndex(db);
    const indexed = await sql<{ space_id: string }>`select space_id from messages_fts`.execute(db);
    expect(new Set(indexed.rows.map((row) => row.space_id))).toEqual(new Set([TRIP]));
  });

  it("leaves the other room as it was", async () => {
    await twoRooms();
    const trip = async () =>
      db.selectFrom("messages").select(["id", "text"]).where("space_id", "=", TRIP).execute();
    const before = await trip();

    await store.erase({ workspaceId: WS, spaceId: CHESS, tombstone: tombstone() });

    expect(await trip()).toEqual(before);
    const lane = await db.selectFrom("lanes").selectAll().executeTakeFirstOrThrow();
    // The lane was asked for in Chess; the trip's history of it stays, news it had from Chess
    // does not.
    expect(lane.home_space_id).toBe(TRIP);
    expect(lane.state).toBe("running");
  });

  it("leaves projections that a replay of the log makes again, exactly", async () => {
    await twoRooms();
    const { rebuilt } = await store.erase({
      workspaceId: WS,
      spaceId: CHESS,
      tombstone: tombstone(),
    });
    const live = await projections();
    // A lane that crossed into the trip, a spend and a thread are all erased in place (ADR 0258).
    expect(rebuilt).toBe(false);

    await store.rebuild(WS);

    expect(await projections()).toEqual(live);
  });

  it("takes the words and leaves the spend, live and after a replay", async () => {
    await twoRooms();
    expect(await spent()).toBeCloseTo(0.75);

    const { event } = await store.erase({
      workspaceId: WS,
      spaceId: CHESS,
      tombstone: tombstone(),
    });

    expect(event.payload["spent"]).toEqual([{ harness_id: SCOUT, usd: expect.closeTo(0.5) }]);
    expect(await spent()).toBeCloseTo(0.75);
    await store.rebuild(WS);
    expect(await spent()).toBeCloseTo(0.75);
  });

  it("lets go of the uploads only the room had, and of the files nobody else shares", async () => {
    await twoRooms();

    const { orphanedDigests } = await store.erase({
      workspaceId: WS,
      spaceId: CHESS,
      tombstone: tombstone(),
    });

    const uploads = await db.selectFrom("uploads").select("id").orderBy("id").execute();
    expect(uploads.map((row) => row.id)).toEqual(["att_01K4ZQPX000000000000000TRIP"]);
    // The photo and its thumbnail were Chess's alone; the other photo's bytes are the trip's too.
    expect([...orphanedDigests].sort()).toEqual([X, "c".repeat(64)]);
  });

  it("keeps an upload a lane handed on, since the lead's room still shows it", async () => {
    await twoRooms();
    await put(
      "lane.updated",
      TRIP,
      {
        lane_id: "lane_01K4ZQPX0000000000000LANE",
        state: "completed",
        delivery: "delivered",
        attachments: [attachment("att_01K4ZQPX0000000000000CHESS", X)],
      },
      { kind: "system", id: "system" },
    );

    const { orphanedDigests } = await store.erase({
      workspaceId: WS,
      spaceId: CHESS,
      tombstone: tombstone(),
    });

    const kept = await db
      .selectFrom("uploads")
      .select("id")
      .where("id", "=", "att_01K4ZQPX0000000000000CHESS")
      .execute();
    expect(kept).toHaveLength(1);
    expect(orphanedDigests).toEqual([]);
  });
});

/** An agent of Scout's, put in Chess in Scout's place and taken out of it there, its row the log's. */
async function anAgentInChess(): Promise<void> {
  // Scout's own row is the registry's, which a rebuild keeps and only patches.
  await db
    .insertInto("participants")
    .values({
      id: SCOUT,
      workspace_id: WS,
      kind: "harness",
      display_name: "Scout",
      ephemeral: 0,
      created_at: "2026-09-02T00:00:00.000Z",
    })
    .execute();
  await put(
    "agent.registered",
    undefined,
    { agent_id: AGENT, harness_id: SCOUT, key: "chess", name: "Magnus", lead: false },
    { kind: "harness", id: SCOUT },
  );
  await put("agent.released", TRIP, { agent_id: AGENT, reason: "archived" }, SYSTEM);
  await put("membership.replaced", CHESS, { from: SCOUT, to: AGENT }, SYSTEM);
  await put("agent.attached", CHESS, { agent_id: AGENT }, SYSTEM);
  await put("agent.released", CHESS, { agent_id: AGENT, reason: "removed" }, SYSTEM);
}

const AGENT = "agt_01K4ZQPX00000000000000AGNT";
const SYSTEM = { kind: "system", id: "system" };
const FIXTURES = fileURLToPath(new URL("../../../../packages/protocol/fixtures/", import.meta.url));

/** Erase Chess, and the projections then and after a rebuild of what the log keeps. */
async function eraseThenRebuild() {
  const { rebuilt } = await store.erase({
    workspaceId: WS,
    spaceId: CHESS,
    tombstone: tombstone(),
  });
  const live = await projections();
  await store.rebuild(WS);
  return { rebuilt, live, replayed: await projections() };
}

describe("erasing a space in place (ADR 0258)", () => {
  it("makes again the rows outside the room it reached, as a rebuild of what is left would", async () => {
    await twoRooms();
    await anAgentInChess();

    const { rebuilt, live, replayed } = await eraseThenRebuild();

    expect(rebuilt).toBe(false);
    expect(live).toEqual(replayed);
    const agent = await db
      .selectFrom("participants")
      .select(["last_space_id", "released_from"])
      .where("id", "=", AGENT)
      .executeTakeFirstOrThrow();
    // Chess's news of it went with Chess: it was last let go from the trip, by an archive.
    expect(agent).toEqual({ last_space_id: TRIP, released_from: TRIP });
  });

  it("takes the room's words out of the search index before it answers", async () => {
    await twoRooms();
    await drainSearchIndex(db);

    await store.erase({ workspaceId: WS, spaceId: CHESS, tombstone: tombstone() });

    const indexed = await sql<{ space_id: string }>`select space_id from messages_fts`.execute(db);
    expect(new Set(indexed.rows.map((row) => row.space_id))).toEqual(new Set([TRIP]));
  });

  it("rebuilds when a policy row began after the room spent, which held only part of it", async () => {
    await twoRooms();
    await put("policy.updated", TRIP, {
      harness_id: SCOUT,
      policy: { autonomy: 2, rules: [] },
      workspace_max_autonomy: 2,
    });
    await put(
      "usage",
      CHESS,
      { run_id: "run_01K4ZQPX000000000000CHESS1", scope: "step", cost: { usd: 0.125 } },
      { kind: "harness", id: SCOUT },
    );

    const { rebuilt, live, replayed } = await eraseThenRebuild();

    expect(rebuilt).toBe(true);
    expect(live).toEqual(replayed);
  });

  it("rebuilds when another room's event is about one of the room's runs", async () => {
    await twoRooms();
    await put(
      "usage",
      TRIP,
      { run_id: "run_01K4ZQPX000000000000CHESS1", scope: "step", cost: { usd: 0.125 } },
      { kind: "harness", id: SCOUT },
    );

    const { rebuilt, live, replayed } = await eraseThenRebuild();

    expect(rebuilt).toBe(true);
    expect(live).toEqual(replayed);
  });

  it("finds every change to an agent's or a lane's row by its id, as it makes them again", () => {
    // `remakes` reads the events naming the row's id. A change reaching such a row any other way
    // (every agent of a harness, say) would be missed there, so none may.
    for (const file of readdirSync(FIXTURES).filter((name) => name.endsWith(".json"))) {
      const event = JSON.parse(readFileSync(join(FIXTURES, file), "utf8"));
      for (const key of agentOrLaneKeys(project({ ...event, seq: 7 }))) {
        expect(typeof key["id"], file).toBe("string");
        expect(Object.keys(key).filter(notIdOrWorkspace), file).toEqual([]);
      }
    }
  });
});

/** What names the row of each change a projector makes to an agent's or a lane's row. */
function agentOrLaneKeys(changes: ReturnType<typeof project>): Record<string, unknown>[] {
  return changes.flatMap((change) => {
    if (!("table" in change) || (change.table !== "participants" && change.table !== "lanes")) {
      return [];
    }
    if (change.kind === "upsert") return [{ id: change.row["id"] }];
    return "key" in change ? [change.key] : [{}];
  });
}

function notIdOrWorkspace(column: string): boolean {
  return column !== "id" && column !== "workspace_id";
}
