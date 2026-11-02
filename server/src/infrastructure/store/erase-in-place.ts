/**
 * Erasing rooms in place (ADR 0258, amending ADR 0067): their rows go, and the few rows outside
 * them that their events reached are made again from the events that are left, without replaying
 * the workspace.
 *
 * ADR 0067 rebuilt every projection after an erase. That is exact by construction, but SQLite
 * answers in the server's own thread, so the whole server waits on the replay: half a second for
 * Arjun's 27,651 events on a quiet machine, and 19 s on a busy one (1 November 2026, when a space
 * made from the + reached the server a minute late and a Delete was told the server had gone).
 *
 * Here the rooms' events are projected again, in memory, to learn every row they wrote. The rows
 * in the rooms go. The rows outside them — an agent's, a lane homed in another room — are cleared
 * as a rebuild clears them and made again from the events that name them, in the order a rebuild
 * would. What the rooms cost stays on each harness's account, as a rebuild's tombstone puts it
 * back; how much it was is learnt by replaying the rooms alone, in a savepoint undone after.
 *
 * Whatever this cannot show a rebuild would agree with, it declines, and the store rebuilds as
 * before: a change it cannot place, another room's event that builds on these rooms' rows, or a
 * policy row begun after the rooms began spending, whose total a rebuild would make otherwise.
 */

import { sql, type Transaction } from "kysely";
import {
  type Change,
  type ProjectionTable,
  project,
  ROWS_OF_THE_LOG,
  type Row,
} from "../../domain/index.js";
import type { Database } from "../db/schema.js";
import { applyChanges, KEYS } from "./projection-writer.js";

/** A row outside the rooms that their events reached, made again from the events that name it. */
interface Outside {
  readonly table: "participants" | "lanes";
  readonly id: string;
}

/** Where a change lands: in the rooms, on a row nowhere (a no-op), outside, or nowhere this can say. */
type Landing = "own" | "nowhere" | Outside | undefined;

/** An erase in place, worked out before anything changes. */
export interface InPlace {
  readonly workspaceId: string;
  readonly spaceIds: readonly string[];
  /** What the rooms' events project to, in the order they were written. */
  readonly changes: readonly Change[];
  /** The harnesses the rooms spent for. */
  readonly spenders: ReadonlySet<string>;
  /** Each row outside the rooms, with what the events that are left make of it, in order. */
  readonly remade: readonly { readonly row: Outside; readonly changes: readonly Change[] }[];
}

/** The rooms' rows the erase reads by id, gathered once. */
interface Own {
  readonly spaces: ReadonlySet<string>;
  readonly runs: ReadonlySet<string>;
  readonly approvals: ReadonlySet<string>;
  readonly sessions: ReadonlySet<string>;
  readonly byId: Readonly<Record<IdTable, ReadonlySet<string>>>;
}

/** The tables whose rows have an id of their own and name their room. */
const ID_TABLES = ["messages", "runs", "approvals", "questions", "attachments", "lanes"] as const;
type IdTable = (typeof ID_TABLES)[number];

/** Each table whose rows name their room, and the column that does. */
const ROOM_COLUMN: Partial<Record<ProjectionTable, string>> = {
  spaces: "id",
  memberships: "space_id",
  read_state: "space_id",
  replacements: "space_id",
  pins: "space_id",
  harness_policy: "space_id",
  messages: "space_id",
  runs: "space_id",
  approvals: "space_id",
  questions: "space_id",
  attachments: "space_id",
  sessions: "space_id",
  lanes: "home_space_id",
};

/** The tables whose rows belong to a run, and so to its room. */
const RUN_TABLES: readonly ProjectionTable[] = ["steps", "session_rules"];

/** A policy row the erase alone writes, to count what the rooms spent; undone with its savepoint. */
const TALLY = "~erase";

/**
 * Whether the rooms can be erased in place, and if so what that takes. Read inside the erase's
 * transaction, before anything is deleted; `undefined` when only a rebuild is sure.
 */
export async function planInPlace(
  trx: Transaction<Database>,
  workspaceId: string,
  spaceIds: readonly string[],
): Promise<InPlace | undefined> {
  const own = await ownRows(trx, workspaceId, spaceIds);
  const events = await eventsIn(trx, workspaceId, spaceIds);
  const reach = await reachOf(trx, workspaceId, own, events);
  if (reach === undefined) return undefined;
  if (await othersBuildOn(trx, workspaceId, own)) return undefined;
  if (!(await policiesPredate(trx, workspaceId, spaceIds, reach.firstSpend))) return undefined;
  const remade = await remakes(trx, workspaceId, spaceIds, reach.outside);
  if (remade === undefined) return undefined;
  return {
    workspaceId,
    spaceIds,
    changes: events.flatMap((event) => event.changes),
    spenders: new Set(reach.firstSpend.keys()),
    remade,
  };
}

/**
 * Erase in place: what the rooms spent, counted; their words out of the search index; their rows
 * gone; the rows outside them made again. The caller deletes their events and keeps the spend.
 */
export async function eraseInPlace(
  trx: Transaction<Database>,
  plan: InPlace,
): Promise<{ harness_id: string; usd: number }[]> {
  const spent = await roomsSpent(trx, plan);
  await forgetIndexed(trx, plan.workspaceId, plan.spaceIds);
  await clearRooms(trx, plan.workspaceId, plan.spaceIds);
  for (const { row, changes } of plan.remade) {
    await clearAsRebuild(trx, plan.workspaceId, row);
    await applyChanges(trx, changes);
  }
  return spent;
}

async function ownRows(
  trx: Transaction<Database>,
  workspaceId: string,
  spaceIds: readonly string[],
): Promise<Own> {
  const ids = async (table: string, id = "id", column = "space_id") => {
    const rows = await sql<{ id: string }>`select ${sql.ref(id)} as id from ${sql.table(table)}
      where workspace_id = ${workspaceId} and ${sql.ref(column)} in (${sql.join(spaceIds)})`.execute(
      trx,
    );
    return new Set(rows.rows.map((row) => row.id));
  };
  const byId = {} as Record<IdTable, ReadonlySet<string>>;
  for (const table of ID_TABLES) byId[table] = await ids(table, "id", ROOM_COLUMN[table]);
  return {
    spaces: new Set(spaceIds),
    runs: byId.runs,
    approvals: byId.approvals,
    sessions: await ids("sessions", "session_ref"),
    byId,
  };
}

/** The rooms' events, in order, each with what it projects to. */
async function eventsIn(
  trx: Transaction<Database>,
  workspaceId: string,
  spaceIds: readonly string[],
): Promise<{ readonly seq: number; readonly changes: readonly Change[] }[]> {
  const rows = await trx
    .selectFrom("events")
    .select(["seq", "payload"])
    .where("workspace_id", "=", workspaceId)
    .where("space_id", "in", spaceIds)
    .orderBy("seq", "asc")
    .execute();
  return rows.map((row) => ({ seq: row.seq, changes: projected(row) }));
}

function projected(row: { readonly seq: number; readonly payload: string }): Change[] {
  return project({ ...JSON.parse(row.payload), seq: row.seq });
}

/**
 * Where the rooms' events reached outside them: the rows to make again, and the first time each
 * harness spent there. `undefined` for a change that lands where this cannot follow it.
 */
async function reachOf(
  trx: Transaction<Database>,
  workspaceId: string,
  own: Own,
  events: readonly { readonly seq: number; readonly changes: readonly Change[] }[],
): Promise<{ outside: Outside[]; firstSpend: Map<string, number> } | undefined> {
  const outside = new Map<string, Outside>();
  const firstSpend = new Map<string, number>();
  for (const { seq, changes } of events) {
    for (const change of changes) {
      const landing = await landingOf(trx, workspaceId, own, change);
      if (landing === undefined) return undefined;
      if (typeof landing === "object") outside.set(`${landing.table}:${landing.id}`, landing);
      noteSpend(firstSpend, change, seq);
    }
  }
  return { outside: [...outside.values()], firstSpend };
}

/** The first time a harness spent in the rooms. */
function noteSpend(firstSpend: Map<string, number>, change: Change, seq: number): void {
  const harness = change.kind === "spend" ? change.harness["harness_id"] : undefined;
  if (typeof harness === "string" && !firstSpend.has(harness)) firstSpend.set(harness, seq);
}

/** Where one change lands, as the rooms see it. */
async function landingOf(
  trx: Transaction<Database>,
  workspaceId: string,
  own: Own,
  change: Change,
): Promise<Landing> {
  switch (change.kind) {
    case "upsert":
      return rowLanding(own, change.table, change.row);
    case "patch":
    case "delete":
      return keyLanding(trx, workspaceId, own, change.table, change.key);
    case "spend":
    case "replace_plan":
    case "run_transition":
      return idLanding(trx, workspaceId, own, "runs", change.key["id"]);
    case "session_rule":
      return own.approvals.has(String(change.key["id"])) && own.runs.has(change.runId)
        ? "own"
        : undefined;
    case "take_runs":
      return own.spaces.has(change.key.space_id) ? "own" : undefined;
    default:
      return undefined;
  }
}

/** Where a row written whole lands: its room's, by the column that names it, or an agent's. */
function rowLanding(own: Own, table: ProjectionTable, row: Row): Landing {
  if (RUN_TABLES.includes(table)) return own.runs.has(String(row["run_id"])) ? "own" : undefined;
  if (table === "participants" && typeof row["id"] === "string") {
    return { table, id: row["id"] };
  }
  const column = ROOM_COLUMN[table];
  if (column === undefined) return undefined;
  if (own.spaces.has(String(row[column]))) return "own";
  return table === "lanes" && typeof row["id"] === "string" ? { table, id: row["id"] } : undefined;
}

/** Where a change to the rows a key matches lands. */
async function keyLanding(
  trx: Transaction<Database>,
  workspaceId: string,
  own: Own,
  table: ProjectionTable,
  key: Row,
): Promise<Landing> {
  if (!(ID_TABLES as readonly string[]).includes(table)) return keyedLanding(own, table, key);
  return byIdOnly(key) ? idLanding(trx, workspaceId, own, table as IdTable, key["id"]) : undefined;
}

/** Where a change lands whose key names the room, a run, a session or an agent. */
function keyedLanding(own: Own, table: ProjectionTable, key: Row): Landing {
  if (RUN_TABLES.includes(table)) return own.runs.has(String(key["run_id"])) ? "own" : undefined;
  if (table === "participants") return byIdOnly(key) ? { table, id: String(key["id"]) } : undefined;
  if (table === "sessions") return own.sessions.has(String(key["session_ref"])) ? "own" : undefined;
  const column = ROOM_COLUMN[table];
  return column !== undefined && own.spaces.has(String(key[column])) ? "own" : undefined;
}

/**
 * A row by its id: the rooms', another room's lane, nowhere at all, or another room's. A change
 * that names no row at all — a run's, from an event outside any run — is one the writer skips.
 */
async function idLanding(
  trx: Transaction<Database>,
  workspaceId: string,
  own: Own,
  table: IdTable,
  id: unknown,
): Promise<Landing> {
  if (typeof id !== "string") return "nowhere";
  if (own.byId[table].has(id)) return "own";
  const there = await sql<{ one: number }>`select 1 as one from ${sql.table(table)}
    where workspace_id = ${workspaceId} and id = ${id}`.execute(trx);
  if (there.rows.length === 0) return "nowhere";
  return table === "lanes" ? { table, id } : undefined;
}

/** Whether a key names one row by its id, as the projector names an agent's or a lane's. */
function byIdOnly(key: Row): boolean {
  return (
    typeof key["id"] === "string" &&
    Object.keys(key).every((column) => column === "id" || column === "workspace_id")
  );
}

/**
 * Whether an event outside the rooms builds on their rows, which a rebuild would not have: one
 * about one of their runs, or one naming the rooms that writes into them. A change to a row of
 * theirs that only patches or deletes is no change once the row is gone, as in a rebuild.
 */
async function othersBuildOn(
  trx: Transaction<Database>,
  workspaceId: string,
  own: Own,
): Promise<boolean> {
  if (await aboutTheirRuns(trx, workspaceId, own)) return true;
  const naming = await eventsNaming(trx, workspaceId, [...own.spaces], [...own.spaces]);
  for (const row of naming) {
    for (const change of projected(row)) {
      if (change.kind === "patch" || change.kind === "delete") continue;
      if ((await landingOf(trx, workspaceId, own, change)) === "own") return true;
    }
  }
  return false;
}

/** Whether an event outside the rooms is about one of their runs. */
async function aboutTheirRuns(
  trx: Transaction<Database>,
  workspaceId: string,
  own: Own,
): Promise<boolean> {
  if (own.runs.size === 0) return false;
  const about = await sql<{ one: number }>`select 1 as one from events
    where workspace_id = ${workspaceId} and run_id in (${sql.join([...own.runs])})
      and (space_id is null or space_id not in (${sql.join([...own.spaces])}))
    limit 1`.execute(trx);
  return about.rows.length > 0;
}

/** The events outside the rooms whose words name any of these ids, in order: one read of the log. */
async function eventsNaming(
  trx: Transaction<Database>,
  workspaceId: string,
  spaceIds: readonly string[],
  ids: readonly string[],
): Promise<{ readonly seq: number; readonly payload: string }[]> {
  const naming = await sql<{ seq: number; payload: string }>`select seq, payload from events
    where workspace_id = ${workspaceId}
      and (space_id is null or space_id not in (${sql.join(spaceIds)}))
      and (${sql.join(
        ids.map((id) => sql`instr(payload, ${id}) > 0`),
        sql` or `,
      )})
    order by seq`.execute(trx);
  return naming.rows;
}

/**
 * Whether every policy row of each harness the rooms spent for, outside them, was begun before
 * they first spent. Each `usage` grows every row of its harness there is, so such a row holds the
 * rooms' spend, and a rebuild takes it off and puts it back by the tombstone: it is as it was. A
 * row begun later held only part of it, and a rebuild would give it the whole.
 */
async function policiesPredate(
  trx: Transaction<Database>,
  workspaceId: string,
  spaceIds: readonly string[],
  firstSpend: ReadonlyMap<string, number>,
): Promise<boolean> {
  for (const [harnessId, first] of firstSpend) {
    const rows = await trx
      .selectFrom("harness_policy")
      .select("space_id")
      .where("workspace_id", "=", workspaceId)
      .where("harness_id", "=", harnessId)
      .where("space_id", "not in", spaceIds)
      .execute();
    if (rows.length === 0) continue;
    const begun = await sql<{ space: string; first: number }>`
      select coalesce(space_id, '*') as space, min(seq) as first from events
      where workspace_id = ${workspaceId} and type = 'policy.updated'
        and json_extract(payload, '$.harness_id') = ${harnessId}
      group by coalesce(space_id, '*')`.execute(trx);
    const since = new Map(begun.rows.map((row) => [row.space, row.first]));
    for (const row of rows) {
      const at = since.get(row.space_id);
      if (at === undefined || at >= first) return false;
    }
  }
  return true;
}

/**
 * What the events left outside the rooms make of each row the rooms reached, in order: the
 * changes to that row alone. `undefined` when one reaches it in a way only a rebuild follows.
 */
async function remakes(
  trx: Transaction<Database>,
  workspaceId: string,
  spaceIds: readonly string[],
  outside: readonly Outside[],
): Promise<InPlace["remade"] | undefined> {
  if (outside.length === 0) return [];
  const remade = outside.map((row) => ({ row, changes: [] as Change[] }));
  const naming = await eventsNaming(
    trx,
    workspaceId,
    spaceIds,
    outside.map((row) => row.id),
  );
  for (const event of naming) {
    for (const change of projected(event)) {
      if (!sortInto(remade, change)) return undefined;
    }
  }
  return remade;
}

/** A change, to the row it is to: `false` for one that reaches a row in a way only a rebuild follows. */
function sortInto(remade: readonly { row: Outside; changes: Change[] }[], change: Change): boolean {
  for (const { row, changes } of remade) {
    const touches = touching(change, row);
    if (touches === undefined) return false;
    if (touches) changes.push(change);
  }
  return true;
}

/** Whether a change is to this row and no other; `undefined` for one that reaches it otherwise. */
function touching(change: Change, row: Outside): boolean | undefined {
  if (!("table" in change) || change.table !== row.table) return false;
  if (change.kind === "upsert") {
    return KEYS[row.table].every((column) => column === "id") && change.row["id"] === row.id;
  }
  if (change.kind === "patch" || change.kind === "delete") {
    if (change.key["id"] !== row.id) return false;
    return byIdOnly(change.key) ? true : undefined;
  }
  return undefined;
}

/**
 * What the rooms cost each harness that spent there: the rooms replayed alone, from none of their
 * rows, onto a policy row of each harness's that holds only that, then all of it undone. Every
 * `usage` grows every row of its harness, so the row ends holding exactly what a rebuild would
 * take off the harness's account and the tombstone put back.
 */
async function roomsSpent(
  trx: Transaction<Database>,
  plan: InPlace,
): Promise<{ harness_id: string; usd: number }[]> {
  if (plan.spenders.size === 0) return [];
  const { workspaceId } = plan;
  await sql`savepoint erase_spent`.execute(trx);
  try {
    await clearRooms(trx, workspaceId, plan.spaceIds);
    for (const harnessId of plan.spenders) {
      await trx
        .insertInto("harness_policy")
        .values({
          workspace_id: workspaceId,
          harness_id: harnessId,
          space_id: TALLY,
          autonomy: 0,
          rules: "[]",
          spent_usd: 0,
          updated_at: "",
          updated_seq: 0,
        })
        .execute();
    }
    await applyChanges(trx, plan.changes);
    const rows = await trx
      .selectFrom("harness_policy")
      .select(["harness_id", "spent_usd"])
      .where("workspace_id", "=", workspaceId)
      .where("space_id", "=", TALLY)
      .execute();
    // Sums of floats that should cancel leave dust; a millionth of a cent is not a cost.
    return rows
      .filter((row) => Math.abs(row.spent_usd) > 1e-9)
      .map((row) => ({ harness_id: row.harness_id, usd: row.spent_usd }));
  } finally {
    await sql`rollback to savepoint erase_spent`.execute(trx);
    await sql`release savepoint erase_spent`.execute(trx);
  }
}

/**
 * The rooms' words out of the search index now, inside the transaction, as a rebuild takes them
 * (ADR 0067): left to the queue, they would wait in the index for the next search or sweep.
 */
async function forgetIndexed(
  trx: Transaction<Database>,
  workspaceId: string,
  spaceIds: readonly string[],
): Promise<void> {
  const rooms = sql.join(spaceIds);
  await sql`delete from messages_fts where workspace_id = ${workspaceId} and space_id in (${rooms})`.execute(
    trx,
  );
  await sql`delete from messages_fts_map where message_id in (
    select id from messages where workspace_id = ${workspaceId} and space_id in (${rooms})
  )`.execute(trx);
  await sql`delete from steps_fts where workspace_id = ${workspaceId} and space_id in (${rooms})`.execute(
    trx,
  );
  await sql`delete from steps_fts_map where run_id in (
    select id from runs where workspace_id = ${workspaceId} and space_id in (${rooms})
  )`.execute(trx);
}

/** Every row of the rooms: a run's own rows first, while its run still says whose room it was. */
async function clearRooms(
  trx: Transaction<Database>,
  workspaceId: string,
  spaceIds: readonly string[],
): Promise<void> {
  const rooms = sql.join(spaceIds);
  for (const table of RUN_TABLES) {
    await sql`delete from ${sql.table(table)} where workspace_id = ${workspaceId} and run_id in (
      select id from runs where workspace_id = ${workspaceId} and space_id in (${rooms})
    )`.execute(trx);
  }
  for (const [table, column] of Object.entries(ROOM_COLUMN)) {
    await sql`delete from ${sql.table(table)}
      where workspace_id = ${workspaceId} and ${sql.ref(column)} in (${rooms})`.execute(trx);
  }
}

/** A row outside the rooms, cleared as a rebuild clears it: a row the registry keeps stays. */
async function clearAsRebuild(
  trx: Transaction<Database>,
  workspaceId: string,
  row: Outside,
): Promise<void> {
  const only = ROWS_OF_THE_LOG[row.table];
  await sql`delete from ${sql.table(row.table)}
    where workspace_id = ${workspaceId} and id = ${row.id}
      ${only === undefined ? sql`` : sql`and ${sql.ref(only.column)} = ${only.equals}`}`.execute(
    trx,
  );
}
