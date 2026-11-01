/**
 * A voice note's words are searchable (ADR 0054, addendum).
 *
 * The message index gains a second column, `heard`: what was said in the message's voice notes,
 * as the server wrote it down, beside `text`, which is what was typed. Two columns rather than one
 * so a hit can say which it quotes: words somebody said out loud, and a machine heard, should not
 * read as words they typed. The drain fills `heard` from the transcripts in the message's
 * `attachments`, which carry them as the message was posted.
 *
 * FTS5 cannot add a column, so the index is made again under its own name. What is indexed keeps
 * its rowid, so `messages_fts_map` still points at it, and only the messages with a transcript are
 * queued to be indexed again. The triggers are dropped around it: renaming a table reads every
 * trigger, and theirs name an index that is, for a moment, not there.
 */

import { type Kysely, sql } from "kysely";
import { createSearchTriggers, dropSearchTriggers } from "./0012-search-off-the-request-path.js";

// biome-ignore lint/suspicious/noExplicitAny: a migration runs against the schema of its moment.
type Db = Kysely<any>;

export const name = "0021-voice-notes-are-searchable";

const UNINDEXED = sql.raw(`message_id unindexed,
    workspace_id unindexed,
    space_id unindexed,
    created_at unindexed,
    author_id unindexed,
    tokenize = 'unicode61 remove_diacritics 2'`);

const KEYS = sql.raw("message_id, workspace_id, space_id, created_at, author_id");

export async function up(db: Db): Promise<void> {
  await dropSearchTriggers(db);
  await sql`create virtual table messages_fts_next using fts5(text, heard, ${UNINDEXED})`.execute(
    db,
  );
  await sql`insert into messages_fts_next (rowid, text, heard, ${KEYS})
    select rowid, text, null, ${KEYS} from messages_fts`.execute(db);
  await sql`drop table messages_fts`.execute(db);
  await sql`alter table messages_fts_next rename to messages_fts`.execute(db);
  // Only a message that may carry a transcript is queued. The match is loose, and the drain reads
  // the attachments properly, so a file called "transcript" costs a queue row and nothing more.
  await sql`insert into search_queue (kind, key1)
    select 'message', id from messages
    where text is not null and deleted_at is null and attachments like '%"transcript"%'`.execute(
    db,
  );
  await createSearchTriggers(db);
}

/** Back to one column: the typed words stay indexed where they were, and what was heard goes. */
export async function down(db: Db): Promise<void> {
  await dropSearchTriggers(db);
  await sql`create virtual table messages_fts_next using fts5(text, ${UNINDEXED})`.execute(db);
  await sql`insert into messages_fts_next (rowid, text, ${KEYS})
    select rowid, text, ${KEYS} from messages_fts`.execute(db);
  await sql`drop table messages_fts`.execute(db);
  await sql`alter table messages_fts_next rename to messages_fts`.execute(db);
  await createSearchTriggers(db);
}
