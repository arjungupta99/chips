/**
 * The event log, on SQLite.
 *
 * The rule this file exists to keep: **an event and the projections it implies are written in
 * one transaction** (technical-plan 6.1, ADR 0004). Nothing can observe a log entry whose read
 * models have not been updated, and nothing can observe a read model that the log does not
 * explain. `rebuild` drops the projections and replays through exactly the same code, which is
 * what makes that claim testable rather than aspirational.
 */

import type { ChipsInstruments } from "@chipschat/platform";
import { type ExpressionBuilder, type Kysely, sql, type Transaction } from "kysely";
import {
  AppendRefused,
  type AppendResult,
  type EraseInput,
  type EraseResult,
  type EventPage,
  type EventStore,
  type IncomingEvent,
  type StoredEvent,
  type VisibilityScope,
} from "../../application/ports/index.js";
import {
  APPROVER_EVENTS,
  ASK_EVENTS,
  DIRECTORY_EVENTS,
  FACE_EVENTS,
  FORK_EVENTS,
  HELD_EVENTS,
  JOIN_EVENTS,
  LOCK_EVENTS,
  MEMBERSHIP_EVENTS,
  SELF_EVENTS,
  WHEREABOUTS_EVENTS,
} from "../../application/visibility.js";
import { PROJECTION_TABLES, project, ROWS_OF_THE_LOG } from "../../domain/index.js";
import type { Database } from "../db/schema.js";
import { eraseInPlace, planInPlace } from "./erase-in-place.js";
import { applyChanges } from "./projection-writer.js";
import { resumeSearchIndex, suspendSearchIndex } from "./search-index.js";

/** Rows in the log carry the event verbatim; these are the columns we also index on. */
interface EventRow {
  workspace_id: string;
  seq: number;
  id: string;
  type: string;
  ts: string;
  space_id: string | null;
  run_id: string | null;
  actor_kind: string;
  actor_id: string;
  idempotency_key: string | null;
  payload: string;
  appended_at: string;
}

export interface EventStoreOptions {
  readonly db: Kysely<Database>;
  /** Defaults to the system clock. Injected so tests are deterministic. */
  readonly now?: () => string;
  /** Optional, so the store can be used in a test without wiring observability. */
  readonly instruments?: ChipsInstruments;
  /** Called after a successful append, outside the transaction. This is where fan-out hangs. */
  readonly onAppended?: (event: StoredEvent) => void;
  /**
   * A rule every append must keep, asked inside its transaction with the transaction's own
   * connection: the reason to refuse, or nothing. The serving store is given the one-room rule
   * (`agentGate`); a store with none takes whatever it is handed, which is what a replay of
   * history and the upgrades that settle it want.
   */
  readonly gate?: (
    trx: Transaction<Database>,
    event: IncomingEvent,
  ) => Promise<AppendRefused["refusal"] | undefined>;
}

export function createSqliteEventStore(options: EventStoreOptions): EventStore {
  const { db, instruments, onAppended, gate } = options;
  const now = options.now ?? (() => new Date().toISOString());

  /**
   * Insert first, ask later. The unique indexes on `(workspace_id, id)` and
   * `(workspace_id, actor_id, idempotency_key)` are the real guarantee that an event is applied once, so
   * the common path — an event nobody has seen — does not pay for a lookup that almost always
   * misses. A duplicate costs one aborted transaction and one query, which is the right way
   * round: retries are rare and appends are not. Benchmark: `server/bench/append.ts`.
   */
  async function insertOrFindDuplicate(
    event: IncomingEvent,
  ): Promise<{ row: EventRow; duplicate: boolean }> {
    try {
      return await db.transaction().execute(async (trx) => {
        const row = toRow(event, now());
        // The sequence number is allocated by the insert itself rather than by a preceding
        // `select max(seq)`: one statement instead of two, and the number cannot go stale
        // between being read and being used.
        const inserted = await trx
          .insertInto("events")
          .values({
            ...row,
            seq: sql<number>`(select coalesce(max(seq), 0) + 1 from events where workspace_id = ${event.workspace_id})`,
          })
          .returning("seq")
          .executeTakeFirstOrThrow();

        const seq = inserted.seq;
        // Asked once the row is in, so a retry of an event already appended is answered as the
        // duplicate it is and never as a refusal; and before its projection, so the gate reads
        // the workspace as this event finds it. A refusal rolls the row back.
        const refused = await gate?.(trx, event);
        if (refused !== undefined) throw new AppendRefused(refused);
        await applyChanges(trx, project({ ...event, seq } as Parameters<typeof project>[0]));
        return { row: { ...row, seq }, duplicate: false };
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;

      const existing = await findExisting(db, event);
      // The constraint fired but nothing is there: something else is wrong, and swallowing it
      // would hide it.
      if (existing === undefined) throw error;
      return { row: existing, duplicate: true };
    }
  }

  async function append(event: IncomingEvent): Promise<AppendResult> {
    const stored = await insertOrFindDuplicate(event);

    const result = { event: toStored(stored.row), duplicate: stored.duplicate };
    if (!stored.duplicate) {
      instruments?.eventsAppended.add(1, { workspace: event.workspace_id, type: event.type });
      onAppended?.(result.event);
    }
    return result;
  }

  async function since(
    workspaceId: string,
    seq: number,
    limit = 500,
    scope?: VisibilityScope,
  ): Promise<EventPage> {
    let query = db
      .selectFrom("events")
      .selectAll()
      .where("workspace_id", "=", workspaceId)
      .where("seq", ">", seq);

    if (scope !== undefined) {
      // A viewer sees their spaces, the workspace-wide events that belong to none
      // (phase-0-review finding 6), and the events that add or remove them — the same three
      // clauses `canSee` applies live, so a client resuming after it left a space elsewhere
      // hears that it did. An empty set still returns the workspace-wide events.
      const viewer = scope.participantId;
      // A harness answers to its agents too (ADR 0087).
      const ids = viewer === undefined ? [] : [viewer, ...(scope.alsoIs ?? [])];
      // An agent made or changed is everybody's who is told every agent, and otherwise its own
      // harness's, its harness's owner's, and whoever shares a room with it now (agents review,
      // finding 3; ADR 0034's addendum).
      const notForAll = notEverybodys(scope);
      query = query.where((eb) =>
        eb.or([
          // What an agent said in no room is its harness's alone (ADR 0087), below.
          eb.and([eb("space_id", "is", null), eb("type", "not in", [...notForAll])]),
          ...(scope.seesAgents === true ? [] : [eb.and(agentsKnownTo(eb, scope, ids))]),
          // A room's events, but for what one person did for themselves (ADR 0167), below.
          ...(scope.spaces.length === 0
            ? []
            : [
                eb.and([
                  eb("space_id", "in", [...scope.spaces]),
                  eb("type", "not in", [...SELF_EVENTS]),
                ]),
              ]),
          ...namingTheViewer(eb, ids),
          ...(viewer === undefined
            ? []
            : [eb.and([eb("type", "in", [...SELF_EVENTS]), eb("actor_id", "=", viewer)])]),
        ]),
      );
    }

    const rows = await query
      .orderBy("seq", "asc")
      .limit(limit + 1)
      .execute();

    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      events: page.map(toStored),
      nextCursor: rows.length > limit && last !== undefined ? last.seq : null,
    };
  }

  async function head(workspaceId: string): Promise<number> {
    const row = await db
      .selectFrom("events")
      .select(({ fn }) => fn.max<number>("seq").as("head"))
      .where("workspace_id", "=", workspaceId)
      .executeTakeFirst();
    return row?.head ?? 0;
  }

  /**
   * Drop every projection for a workspace and replay its log through the same projector live
   * traffic uses. One transaction, so nothing ever observes half a rebuild.
   */
  async function rebuild(workspaceId: string): Promise<{ replayed: number }> {
    return db.transaction().execute(async (trx) => ({
      replayed: await rebuildInto(trx, workspaceId),
    }));
  }

  /**
   * Erase spaces (ADR 0067), in one transaction: the tombstone's number is taken before anything
   * goes, so no number a device has already passed is handed out again; the spaces' events go;
   * the rows kept beside the log for them go; the projections become exactly what a later replay
   * would make; what the rooms cost stays on each harness's account through the tombstone; and
   * the uploads nothing refers to any more go.
   *
   * The projections are made so in place where that can be shown to agree with a rebuild: the
   * rooms' rows go, and the few outside them their events reached are made again (ADR 0258). Else
   * they are rebuilt from what is left, which holds the server for as long as the log takes.
   *
   * Then, outside it, the search index is compacted and the log's write-ahead file is folded in
   * and emptied, with SQLite zeroing what it frees throughout, so the words are not left behind
   * in free pages. Backups taken before the erase still hold them.
   */
  async function erase(input: EraseInput): Promise<EraseResult> {
    const { workspaceId, tombstone } = input;
    const secure = await secureDelete(db, true);
    try {
      const done = await db.transaction().execute(async (trx) => {
        const seq = (await headIn(trx, workspaceId)) + 1;
        const spaceIds = await withThreads(trx, workspaceId, input.spaceId);
        const held = await heldBy(trx, workspaceId, spaceIds);
        const inPlace = await planInPlace(trx, workspaceId, spaceIds);
        const before = await spentByHarness(trx, workspaceId);
        const spentInPlace = inPlace && (await eraseInPlace(trx, inPlace));
        await trx
          .deleteFrom("events")
          .where("workspace_id", "=", workspaceId)
          .where("space_id", "in", spaceIds)
          .execute();
        await forgetRegistryRows(trx, workspaceId, spaceIds, held.asks);
        const spent = spentInPlace ?? (await rebuiltSpend(trx, workspaceId, before));
        const event = {
          ...tombstone,
          erased: spaceIds,
          ...(spent.length === 0 ? {} : { spent }),
        };
        const row = { ...toRow(event, now()), seq };
        await trx.insertInto("events").values(row).execute();
        await applyChanges(trx, tombstoneChanges({ ...event, seq }, spentInPlace !== undefined));
        const orphanedDigests = await dropOrphanedUploads(trx, workspaceId, held.uploads);
        return { row, erased: spaceIds, orphanedDigests, rebuilt: spentInPlace === undefined };
      });
      await compact(db);
      const event = toStored(done.row);
      instruments?.eventsAppended.add(1, { workspace: workspaceId, type: event.type });
      onAppended?.(event);
      return {
        event,
        erased: done.erased,
        orphanedDigests: done.orphanedDigests,
        rebuilt: done.rebuilt,
      };
    } finally {
      await secureDelete(db, secure);
    }
  }

  return { append, since, head, rebuild, erase };
}

/**
 * The events with no space this viewer is not sent as everybody is: held words, always; an agent
 * made, changed or locked (ADR 0199), unless they are told every agent; and what came of a join
 * request (ADR 0122) and a person's face chosen (ADR 0139), unless they are told every person.
 */
function notEverybodys(scope: VisibilityScope): readonly string[] {
  return [
    ...HELD_EVENTS,
    ...(scope.seesAgents === true ? [] : [...DIRECTORY_EVENTS, ...LOCK_EVENTS]),
    ...(scope.seesDirectory === true ? [] : [...JOIN_EVENTS, ...FACE_EVENTS]),
  ];
}

/**
 * The events about the viewer from rooms it is not in: where one of its agents went, what one of
 * them said while in none, a person asking for a copy of one (ADR 0087) or asking it for a new one
 * (ADR 0108), its being added or taken out, and the approvals that name it (M5.5). `ids` is the
 * viewer first, then the agents a harness speaks for.
 */
function namingTheViewer(eb: ExpressionBuilder<Database, "events">, ids: readonly string[]) {
  const [viewer] = ids;
  if (viewer === undefined) return [];
  return [
    eb.and([
      eb("type", "in", [...WHEREABOUTS_EVENTS, ...HELD_EVENTS, ...FORK_EVENTS]),
      eb(sql<string>`json_extract(payload, '$.agent_id')`, "in", ids),
    ]),
    eb.and([
      eb("type", "in", [...ASK_EVENTS]),
      eb(sql<string>`json_extract(payload, '$.harness_id')`, "=", viewer),
    ]),
    eb.and([
      eb("type", "in", [...MEMBERSHIP_EVENTS]),
      eb.or([
        eb(sql<string>`json_extract(payload, '$.participant_id')`, "in", ids),
        eb(sql<string>`json_extract(payload, '$.to')`, "in", ids),
        eb(sql<string>`json_extract(payload, '$.from')`, "in", ids),
      ]),
    ]),
    eb.and([
      eb("type", "in", [...APPROVER_EVENTS]),
      sql<boolean>`exists (select 1 from json_each(events.payload, '$.approvers') where json_each.value in (${sql.join(ids)}))`,
    ]),
  ];
}

/**
 * `agent.registered`, `agent.updated` and `agent.deleted` for a viewer who is not told every
 * agent: the agent is one of theirs, its harness is them or is theirs (ADR 0034's addendum), or it
 * is in one of their rooms now. The same rule the live path asks (`canSee`, then `knowsAgent`).
 */
function agentsKnownTo(
  eb: ExpressionBuilder<Database, "events">,
  scope: VisibilityScope,
  ids: readonly string[],
) {
  const agent = sql<string>`json_extract(payload, '$.agent_id')`;
  const viewer = scope.participantId;
  const known = [
    ...(ids.length === 0 ? [] : [eb(agent, "in", [...ids])]),
    ...(viewer === undefined
      ? []
      : [
          eb(sql<string>`json_extract(payload, '$.harness_id')`, "=", viewer),
          eb.exists(
            eb
              .selectFrom("participants as its")
              .innerJoin("participants as harness", "harness.id", "its.harness_id")
              .select("its.id")
              .whereRef("its.workspace_id", "=", "events.workspace_id")
              .whereRef("its.id", "=", agent)
              .where("harness.owner_id", "=", viewer),
          ),
        ]),
    ...(scope.spaces.length === 0
      ? []
      : [
          eb.exists(
            eb
              .selectFrom("memberships")
              .select("memberships.participant_id")
              .whereRef("memberships.workspace_id", "=", "events.workspace_id")
              .whereRef("memberships.participant_id", "=", agent)
              .where("memberships.space_id", "in", [...scope.spaces]),
          ),
        ]),
  ];
  return [
    eb("space_id", "is", null),
    eb("type", "in", [...DIRECTORY_EVENTS]),
    known.length === 0 ? sql<boolean>`0` : eb.or(known),
  ];
}

/** The projections dropped and replayed, inside the caller's transaction. */
async function rebuildInto(trx: Transaction<Database>, workspaceId: string): Promise<number> {
  // The search index follows the projections by a queue (Gate 5); around a rebuild its triggers
  // are off and it is cleared and re-queued in bulk, or ten thousand rows deleted and written
  // again would cost thirty thousand trigger statements.
  await suspendSearchIndex(trx, workspaceId);
  for (const table of PROJECTION_TABLES) {
    const only = ROWS_OF_THE_LOG[table];
    let clear = trx.deleteFrom(table).where("workspace_id", "=", workspaceId);
    // biome-ignore lint/suspicious/noExplicitAny: the column is one of the table's, named above.
    if (only !== undefined) clear = clear.where(only.column as any, "=", only.equals);
    await clear.execute();
  }
  const replayed = await replayInto(trx, workspaceId);
  await resumeSearchIndex(trx, workspaceId);
  return replayed;
}

/** A space and every thread grown in it, the space first. */
async function withThreads(
  trx: Transaction<Database>,
  workspaceId: string,
  spaceId: string,
): Promise<string[]> {
  const threads = await trx
    .selectFrom("spaces")
    .select("id")
    .where("workspace_id", "=", workspaceId)
    .where("parent_space_id", "=", spaceId)
    .orderBy("id")
    .execute();
  return [spaceId, ...threads.map((row) => row.id)];
}

async function headIn(trx: Transaction<Database>, workspaceId: string): Promise<number> {
  const row = await trx
    .selectFrom("events")
    .select(({ fn }) => fn.max<number>("seq").as("head"))
    .where("workspace_id", "=", workspaceId)
    .executeTakeFirst();
  return row?.head ?? 0;
}

/**
 * What each harness has spent, by its largest row: every row of a harness grows with its
 * `usage`, so the oldest — the one set everywhere — holds all of it.
 */
async function spentByHarness(
  trx: Transaction<Database>,
  workspaceId: string,
): Promise<Map<string, number>> {
  const rows = await trx
    .selectFrom("harness_policy")
    .select(["harness_id", ({ fn }) => fn.max<number>("spent_usd").as("spent")])
    .where("workspace_id", "=", workspaceId)
    .groupBy("harness_id")
    .execute();
  return new Map(rows.map((row) => [row.harness_id, row.spent ?? 0]));
}

/** The projections rebuilt from what is left, and what went off each harness's account with it. */
async function rebuiltSpend(
  trx: Transaction<Database>,
  workspaceId: string,
  before: ReadonlyMap<string, number>,
): Promise<{ harness_id: string; usd: number }[]> {
  await rebuildInto(trx, workspaceId);
  return spentSince(before, await spentByHarness(trx, workspaceId));
}

/**
 * What the tombstone writes: the rooms' cost back on each harness's account after a rebuild. In
 * place, the spend never left the harnesses' rows, so it has none to put back.
 */
function tombstoneChanges(event: Record<string, unknown>, inPlace: boolean) {
  const changes = project(event as Parameters<typeof project>[0]);
  return inPlace ? changes.filter((change) => change.kind !== "carried_spend") : changes;
}

/** What went off each harness's account with the rooms: the tombstone puts it back. */
function spentSince(
  before: ReadonlyMap<string, number>,
  after: ReadonlyMap<string, number>,
): { harness_id: string; usd: number }[] {
  const out: { harness_id: string; usd: number }[] = [];
  for (const [harnessId, was] of before) {
    const usd = was - (after.get(harnessId) ?? 0);
    // Sums of floats that should cancel leave dust; a millionth of a cent is not a cost.
    if (Math.abs(usd) > 1e-9) out.push({ harness_id: harnessId, usd });
  }
  return out;
}

/** What the rooms hold outside their events, read before the events go. */
async function heldBy(
  trx: Transaction<Database>,
  workspaceId: string,
  spaceIds: readonly string[],
): Promise<{ uploads: string[]; asks: string[] }> {
  const uploads = await trx
    .selectFrom("attachments")
    .select("id")
    .where("workspace_id", "=", workspaceId)
    .where("space_id", "in", spaceIds)
    .execute();
  const approvals = await trx
    .selectFrom("approvals")
    .select("id")
    .where("workspace_id", "=", workspaceId)
    .where("space_id", "in", spaceIds)
    .execute();
  return { uploads: uploads.map((row) => row.id), asks: approvals.map((row) => row.id) };
}

/**
 * The rows kept beside the log for the rooms, which no replay rebuilds: each person's face for
 * them, whether they hid them (ADR 0205) or pinned them (ADR 0240), how far they have read them
 * (ADR 0262), which visit their messages go to, and which device raised the banner for an ask in
 * them.
 */
async function forgetRegistryRows(
  trx: Transaction<Database>,
  workspaceId: string,
  spaceIds: readonly string[],
  asks: readonly string[],
): Promise<void> {
  for (const table of [
    "space_icons",
    "hidden_spaces",
    "pinned_spaces",
    "read_state",
    "session_pins",
  ] as const) {
    await trx
      .deleteFrom(table)
      .where("workspace_id", "=", workspaceId)
      .where("space_id", "in", spaceIds)
      .execute();
  }
  if (asks.length === 0) return;
  await trx
    .deleteFrom("notification_claims")
    .where("workspace_id", "=", workspaceId)
    .where(
      "key",
      "in",
      asks.map((ask) => `decision:${ask}`),
    )
    .execute();
}

/**
 * The uploads the rooms carried that nothing refers to now — no attachment the rebuild made, no
 * event left in the log, a lane's copy of its files in the lead's room included — and of their
 * files, the digests no other upload anywhere shares. The rows go here; the files go once the
 * transaction has committed, since a file cannot be put back if it rolls back.
 */
async function dropOrphanedUploads(
  trx: Transaction<Database>,
  workspaceId: string,
  uploadIds: readonly string[],
): Promise<string[]> {
  const digests = new Set<string>();
  for (const uploadId of uploadIds) {
    if (await referenced(trx, workspaceId, uploadId)) continue;
    const upload = await trx
      .selectFrom("uploads")
      .select(["sha256", "thumbnail_sha256", "view_sha256", "playable_sha256"])
      .where("workspace_id", "=", workspaceId)
      .where("id", "=", uploadId)
      .executeTakeFirst();
    await trx
      .deleteFrom("uploads")
      .where("workspace_id", "=", workspaceId)
      .where("id", "=", uploadId)
      .execute();
    for (const digest of Object.values(upload ?? {})) {
      if (typeof digest === "string") digests.add(digest);
    }
  }
  const orphaned: string[] = [];
  for (const digest of digests) {
    if (!(await digestInUse(trx, digest))) orphaned.push(digest);
  }
  return orphaned;
}

/** Whether an upload is still some room's: an attachment row, or an event that names it. */
async function referenced(
  trx: Transaction<Database>,
  workspaceId: string,
  uploadId: string,
): Promise<boolean> {
  const attachment = await trx
    .selectFrom("attachments")
    .select("id")
    .where("workspace_id", "=", workspaceId)
    .where("id", "=", uploadId)
    .executeTakeFirst();
  if (attachment !== undefined) return true;
  const event = await trx
    .selectFrom("events")
    .select("seq")
    .where("workspace_id", "=", workspaceId)
    .where(sql<number>`instr(payload, ${uploadId})`, ">", 0)
    .limit(1)
    .executeTakeFirst();
  return event !== undefined;
}

/**
 * Whether a stored file is anyone else's. The store is content-addressed and shared by every
 * workspace on the server, so the same bytes sent twice are one file (ADR 0010).
 */
async function digestInUse(trx: Transaction<Database>, digest: string): Promise<boolean> {
  const upload = await trx
    .selectFrom("uploads")
    .select("id")
    .where((eb) =>
      eb.or([
        eb("sha256", "=", digest),
        eb("thumbnail_sha256", "=", digest),
        eb("view_sha256", "=", digest),
        eb("playable_sha256", "=", digest),
      ]),
    )
    .limit(1)
    .executeTakeFirst();
  if (upload !== undefined) return true;
  const attachment = await trx
    .selectFrom("attachments")
    .select("id")
    .where("sha256", "=", digest)
    .limit(1)
    .executeTakeFirst();
  if (attachment !== undefined) return true;
  const event = await trx
    .selectFrom("events")
    .select("seq")
    .where(sql<number>`instr(payload, ${digest})`, ">", 0)
    .limit(1)
    .executeTakeFirst();
  return event !== undefined;
}

/**
 * Turn SQLite's secure delete on or off, returning what it was. On, a deleted row's bytes are
 * overwritten with zeros rather than left in a free page for a file reader to find.
 */
async function secureDelete(db: Kysely<Database>, on: boolean): Promise<boolean> {
  const was = await sql<{ secure_delete: number }>`pragma secure_delete`.execute(db);
  await sql.raw(`pragma secure_delete = ${on ? 1 : 0}`).execute(db);
  return (was.rows[0]?.secure_delete ?? 0) === 1;
}

/**
 * After an erase: merge the search index's segments, so a deleted row's words are not kept in
 * an old one, and fold the write-ahead file into the database and empty it.
 */
async function compact(db: Kysely<Database>): Promise<void> {
  await sql`insert into messages_fts(messages_fts) values ('optimize')`.execute(db);
  await sql`insert into steps_fts(steps_fts) values ('optimize')`.execute(db);
  await sql`pragma wal_checkpoint(TRUNCATE)`.execute(db);
}

/**
 * The event already in the log with this id, or with this sender's idempotency key, if there is
 * one. A key is the sender's own: another actor's `hello-1` is a different promise.
 */
async function findExisting(
  db: Kysely<Database>,
  event: IncomingEvent,
): Promise<EventRow | undefined> {
  const key = event["idempotency_key"];
  return db
    .selectFrom("events")
    .selectAll()
    .where("workspace_id", "=", event.workspace_id)
    .where((eb) =>
      typeof key === "string"
        ? eb.or([
            eb("id", "=", event.id),
            eb.and([eb("actor_id", "=", event.actor.id), eb("idempotency_key", "=", key)]),
          ])
        : eb("id", "=", event.id),
    )
    .executeTakeFirst();
}

/** SQLite reports a broken unique index this way; Postgres will need its own arm in Phase 6. */
function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: unknown }).code;
  return code === "SQLITE_CONSTRAINT_UNIQUE" || code === "SQLITE_CONSTRAINT_PRIMARYKEY";
}

/** The log row, with `seq` filled in by the insert that allocates it. */
function toRow(event: IncomingEvent, appendedAt: string): Omit<EventRow, "seq"> {
  const key = event["idempotency_key"];
  return {
    workspace_id: event.workspace_id,
    id: event.id,
    type: event.type,
    ts: event.ts,
    space_id: (event["space_id"] as string | undefined) ?? null,
    run_id: (event["run_id"] as string | undefined) ?? null,
    actor_kind: event.actor.kind,
    actor_id: event.actor.id,
    idempotency_key: typeof key === "string" ? key : null,
    // The payload is the event exactly as it arrived. `seq` is not in it: the column is the
    // authoritative copy, and `toStored` puts it back on the way out, so there is never a row
    // whose two copies of the number could disagree.
    payload: JSON.stringify(event),
    appended_at: appendedAt,
  };
}

/**
 * Who an event is by: its columns, and, for an agent, the harness it spoke through (ADR 0087),
 * which only the event itself keeps.
 */
function actorOf(row: EventRow, payload: Readonly<Record<string, unknown>>): StoredEvent["actor"] {
  const harness = (payload["actor"] as { harness_id?: unknown } | undefined)?.harness_id;
  return {
    kind: row.actor_kind,
    id: row.actor_id,
    ...(typeof harness === "string" ? { harness_id: harness } : {}),
  };
}

function toStored(row: EventRow): StoredEvent {
  const payload = JSON.parse(row.payload) as Record<string, unknown>;
  return {
    seq: row.seq,
    workspace_id: row.workspace_id,
    id: row.id,
    type: row.type,
    ts: row.ts,
    space_id: row.space_id,
    run_id: row.run_id,
    actor: actorOf(row, payload),
    idempotency_key: row.idempotency_key,
    payload: { ...payload, seq: row.seq },
  };
}

/** Replay a workspace's log, a page at a time so a long history does not have to fit in memory. */
async function replayInto(trx: Transaction<Database>, workspaceId: string): Promise<number> {
  let replayed = 0;
  let cursor = 0;

  for (;;) {
    const rows = await trx
      .selectFrom("events")
      .selectAll()
      .where("workspace_id", "=", workspaceId)
      .where("seq", ">", cursor)
      .orderBy("seq", "asc")
      .limit(1000)
      .execute();
    if (rows.length === 0) return replayed;

    for (const row of rows) {
      await applyChanges(trx, project({ ...JSON.parse(row.payload), seq: row.seq }));
      replayed += 1;
      cursor = row.seq;
    }
  }
}

/** Used by the benchmark and by `chipsd doctor` later: how big is this workspace's log. */
export async function countEvents(db: Kysely<Database>, workspaceId: string): Promise<number> {
  const row = await db
    .selectFrom("events")
    .select(({ fn }) => fn.countAll<number>().as("count"))
    .where("workspace_id", "=", workspaceId)
    .executeTakeFirst();
  return row?.count ?? 0;
}
