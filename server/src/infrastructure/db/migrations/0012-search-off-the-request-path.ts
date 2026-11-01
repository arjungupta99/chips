/**
 * Gate 5: the search index comes off the append path.
 *
 * Migration 0010 kept `messages_fts` and `steps_fts` in step by triggers that wrote the index
 * inside every append, and found the row to replace by a column FTS5 does not index — a scan
 * of the whole index per change. Ten thousand steps updated in twelve seconds and deleted in
 * six, and the append-and-replay benchmark, two seconds' budget, took eleven. Keyed by rowid the
 * scan goes, but FTS5 still flushes a segment on every commit, and an event that carries thirty
 * words of text cost more in the index than in the log and its projections together: three
 * seconds against the same budget.
 *
 * So the triggers now write nothing into the index. A change to a message or a step is a row in
 * `search_queue` — append-only, one plain insert — and the index is brought up to date in one
 * transaction by `drainSearchIndex`, before every search, so a hit is never stale, and on the
 * sweep's timer, so the queue never grows long. A row deleted, and a message taken back, leave
 * the index at once, by rowid, which costs nothing: a taken-back message must not sit in the
 * index for even a sweep's length.
 *
 * FTS5 finds a row at once by rowid alone, so each index has a small map beside it —
 * `messages_fts_map`, `steps_fts_map` — whose integer primary key *is* the FTS row's rowid and
 * whose other columns are the base row's key, indexed. The map's key is an alias of its rowid,
 * which VACUUM never renumbers; that is why the map exists rather than the base tables' own
 * rowids, which VACUUM may. What is already indexed keeps its rowid: the maps are filled from
 * the FTS tables themselves.
 */

import { type Kysely, sql } from "kysely";

// biome-ignore lint/suspicious/noExplicitAny: a migration runs against the schema of its moment.
type Db = Kysely<any>;

export const name = "0012-search-off-the-request-path";

const TRIGGERS = [
  "messages_fts_insert",
  "messages_fts_update",
  "messages_fts_delete",
  "steps_fts_insert",
  "steps_fts_update",
  "steps_fts_delete",
];

/** Drop the six triggers, this migration's and 0010's alike. The store calls this around a rebuild. */
export async function dropSearchTriggers(db: Db): Promise<void> {
  for (const trigger of TRIGGERS) {
    await sql`drop trigger if exists ${sql.raw(trigger)}`.execute(db);
  }
}

/**
 * The triggers that keep the queue and, for a deletion, the index: created by `up`, and again by
 * the store after a rebuild, which drops them first so that ten thousand rows deleted and
 * written again cost two bulk statements rather than thirty thousand trigger statements.
 */
export async function createSearchTriggers(db: Db): Promise<void> {
  await sql`create trigger messages_fts_insert after insert on messages
    begin
      insert into search_queue (kind, key1) values ('message', new.id);
    end`.execute(db);
  // A message taken back leaves the index now, by rowid; anything else waits for the drain.
  await sql`create trigger messages_fts_update after update on messages
    begin
      delete from messages_fts
        where new.deleted_at is not null
          and rowid = (select fts_rowid from messages_fts_map where message_id = old.id);
      delete from messages_fts_map where new.deleted_at is not null and message_id = old.id;
      insert into search_queue (kind, key1) select 'message', new.id where new.deleted_at is null;
    end`.execute(db);
  // A queue row for a row that is gone is harmless: the drain finds nothing to index and
  // empties the queue. So a deletion pays for the index and the map alone.
  await sql`create trigger messages_fts_delete after delete on messages
    begin
      delete from messages_fts
        where rowid = (select fts_rowid from messages_fts_map where message_id = old.id);
      delete from messages_fts_map where message_id = old.id;
    end`.execute(db);

  await sql`create trigger steps_fts_insert after insert on steps
    begin
      insert into search_queue (kind, key1, key2) values ('step', new.run_id, new.step_id);
    end`.execute(db);
  await sql`create trigger steps_fts_update after update on steps
    begin
      insert into search_queue (kind, key1, key2) values ('step', new.run_id, new.step_id);
    end`.execute(db);
  await sql`create trigger steps_fts_delete after delete on steps
    begin
      delete from steps_fts where rowid = (
        select fts_rowid from steps_fts_map where run_id = old.run_id and step_id = old.step_id
      );
      delete from steps_fts_map where run_id = old.run_id and step_id = old.step_id;
    end`.execute(db);
}

export async function up(db: Db): Promise<void> {
  await dropSearchTriggers(db);

  // Append-only, keyed by nothing but its rowid: a change costs the append one plain insert,
  // and a row queued twice before a drain is folded once by the drain's `distinct`.
  await sql`create table search_queue (
    id integer primary key,
    kind text not null,
    key1 text not null,
    key2 text not null default ''
  )`.execute(db);

  await sql`create table messages_fts_map (
    fts_rowid integer primary key,
    message_id text not null unique
  )`.execute(db);
  await sql`insert or ignore into messages_fts_map (fts_rowid, message_id)
    select rowid, message_id from messages_fts`.execute(db);

  await sql`create table steps_fts_map (
    fts_rowid integer primary key,
    run_id text not null,
    step_id text not null,
    unique (run_id, step_id)
  )`.execute(db);
  await sql`insert or ignore into steps_fts_map (fts_rowid, run_id, step_id)
    select rowid, run_id, step_id from steps_fts`.execute(db);

  await createSearchTriggers(db);
}

/** Back to 0010's triggers, which write the index inside the append; the queue and maps go. */
export async function down(db: Db): Promise<void> {
  await dropSearchTriggers(db);
  await sql`drop table if exists steps_fts_map`.execute(db);
  await sql`drop table if exists messages_fts_map`.execute(db);
  await sql`drop table if exists search_queue`.execute(db);

  await sql`create trigger messages_fts_insert after insert on messages
    when new.text is not null and new.deleted_at is null
    begin
      insert into messages_fts (text, message_id, workspace_id, space_id, created_at, author_id)
      values (new.text, new.id, new.workspace_id, coalesce(new.space_id, ''), new.created_at, new.author_id);
    end`.execute(db);
  await sql`create trigger messages_fts_update after update on messages
    begin
      delete from messages_fts where message_id = old.id;
      insert into messages_fts (text, message_id, workspace_id, space_id, created_at, author_id)
      select new.text, new.id, new.workspace_id, coalesce(new.space_id, ''), new.created_at, new.author_id
      where new.text is not null and new.deleted_at is null;
    end`.execute(db);
  await sql`create trigger messages_fts_delete after delete on messages
    begin
      delete from messages_fts where message_id = old.id;
    end`.execute(db);
  await sql`create trigger steps_fts_insert after insert on steps
    begin
      insert into steps_fts (text, run_id, step_id, workspace_id, space_id, updated_at)
      values (
        trim(coalesce(new.title, '') || ' ' || coalesce(new.summary, '')),
        new.run_id, new.step_id, new.workspace_id,
        coalesce((select space_id from runs where runs.id = new.run_id), ''),
        new.updated_at
      );
    end`.execute(db);
  await sql`create trigger steps_fts_update after update on steps
    begin
      delete from steps_fts where run_id = old.run_id and step_id = old.step_id;
      insert into steps_fts (text, run_id, step_id, workspace_id, space_id, updated_at)
      values (
        trim(coalesce(new.title, '') || ' ' || coalesce(new.summary, '')),
        new.run_id, new.step_id, new.workspace_id,
        coalesce((select space_id from runs where runs.id = new.run_id), ''),
        new.updated_at
      );
    end`.execute(db);
  await sql`create trigger steps_fts_delete after delete on steps
    begin
      delete from steps_fts where run_id = old.run_id and step_id = old.step_id;
    end`.execute(db);
}
