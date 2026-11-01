/**
 * The search index, brought up to date (Gate 5; migration 0012).
 *
 * An append writes nothing into FTS5: a change to a message or a step is a row in
 * `search_queue` — append-only, so the append pays for one plain insert — and this drains the
 * queue in one transaction: the keys taken once each into a temp table, the stale index rows
 * dropped by rowid through the maps, the current text written back for what still has text and
 * was not taken back (a message's typed words, and what was heard in its voice notes), the queue
 * emptied. Called before every search, so a hit is never stale, and on the sweep's timer, so the
 * queue stays short. Nothing to do costs one indexed read.
 */

import { type Kysely, sql } from "kysely";
import type { SearchIndex } from "../../application/ports/search-index.js";
import {
  createSearchTriggers,
  dropSearchTriggers,
} from "../db/migrations/0012-search-off-the-request-path.js";
import type { Database } from "../db/schema.js";

/**
 * What was said in the voice notes of the message `s` (ADR 0054): each attachment's transcript,
 * in the order they were attached, a line apart, or null for none. Attachments that are not JSON
 * have none, so one bad row cannot stop every search.
 */
const HEARD = sql`(select group_concat(a.value ->> '$.transcript', char(10))
  from json_each(case when json_valid(s.attachments) then s.attachments else '[]' end) a
  where a.value ->> '$.transcript' is not null)`;

/** Bring the index up to date with everything queued. Answers how many rows were drained. */
export async function drainSearchIndex(db: Kysely<Database>): Promise<number> {
  const pending = await sql<{ one: number }>`select 1 as one from search_queue limit 1`.execute(db);
  if (pending.rows.length === 0) return 0;
  return db.transaction().execute(async (trx) => {
    // The keys queued, each once: the queue is append-only, so a change made twice is there twice.
    await sql`create temp table if not exists pending (kind text, key1 text, key2 text)`.execute(
      trx,
    );
    await sql`delete from pending`.execute(trx);
    await sql`insert into pending select distinct kind, key1, key2 from search_queue`.execute(trx);

    await sql`delete from messages_fts where rowid in (
      select fts_rowid from messages_fts_map
      where message_id in (select key1 from pending where kind = 'message')
    )`.execute(trx);
    await sql`delete from messages_fts_map
      where message_id in (select key1 from pending where kind = 'message')`.execute(trx);
    await sql`insert into messages_fts_map (message_id)
      select id from messages
      where id in (select key1 from pending where kind = 'message')
        and text is not null and deleted_at is null`.execute(trx);
    await sql`insert into messages_fts (rowid, text, heard, message_id, workspace_id, space_id, created_at, author_id)
      select m.fts_rowid, s.text, ${HEARD},
        s.id, s.workspace_id, coalesce(s.space_id, ''), s.created_at, s.author_id
      from pending q
      join messages s on s.id = q.key1
      join messages_fts_map m on m.message_id = s.id
      where q.kind = 'message'`.execute(trx);

    await sql`delete from steps_fts where rowid in (
      select m.fts_rowid from steps_fts_map m
      join pending q on q.kind = 'step' and q.key1 = m.run_id and q.key2 = m.step_id
    )`.execute(trx);
    await sql`delete from steps_fts_map where exists (
      select 1 from pending q
      where q.kind = 'step' and q.key1 = steps_fts_map.run_id and q.key2 = steps_fts_map.step_id
    )`.execute(trx);
    await sql`insert into steps_fts_map (run_id, step_id)
      select s.run_id, s.step_id from steps s
      join pending q on q.kind = 'step' and q.key1 = s.run_id and q.key2 = s.step_id`.execute(trx);
    await sql`insert into steps_fts (rowid, text, run_id, step_id, workspace_id, space_id, updated_at)
      select m.fts_rowid,
        trim(coalesce(s.title, '') || ' ' || coalesce(s.summary, '')),
        s.run_id, s.step_id, s.workspace_id,
        coalesce((select space_id from runs where runs.id = s.run_id), ''),
        s.updated_at
      from pending q
      join steps s on s.run_id = q.key1 and s.step_id = q.key2
      join steps_fts_map m on m.run_id = s.run_id and m.step_id = s.step_id
      where q.kind = 'step'`.execute(trx);

    await sql`delete from pending`.execute(trx);
    const drained = await sql`delete from search_queue`.execute(trx);
    return Number(drained.numAffectedRows ?? 0);
  });
}

/**
 * Around a rebuild (ADR 0004): the triggers off, the workspace's index rows and map rows gone in
 * two statements, so that deleting and replaying ten thousand projection rows costs no trigger
 * work; then everything the replay wrote queued in two statements, and the triggers back. The
 * caller's transaction holds all of it, so nothing observes the index without its triggers.
 */
export async function suspendSearchIndex(
  trx: Kysely<Database>,
  workspaceId: string,
): Promise<void> {
  await dropSearchTriggers(trx);
  await sql`delete from messages_fts_map
    where message_id in (select id from messages where workspace_id = ${workspaceId})`.execute(trx);
  await sql`delete from messages_fts where workspace_id = ${workspaceId}`.execute(trx);
  await sql`delete from steps_fts_map where (run_id, step_id) in (
    select run_id, step_id from steps where workspace_id = ${workspaceId}
  )`.execute(trx);
  await sql`delete from steps_fts where workspace_id = ${workspaceId}`.execute(trx);
}

export async function resumeSearchIndex(trx: Kysely<Database>, workspaceId: string): Promise<void> {
  await sql`insert into search_queue (kind, key1)
    select 'message', id from messages
    where workspace_id = ${workspaceId} and text is not null and deleted_at is null`.execute(trx);
  await sql`insert into search_queue (kind, key1, key2)
    select 'step', run_id, step_id from steps where workspace_id = ${workspaceId}`.execute(trx);
  await createSearchTriggers(trx);
}

export function createSearchIndex(db: Kysely<Database>): SearchIndex {
  return { drain: () => drainSearchIndex(db) };
}
