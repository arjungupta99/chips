/**
 * M5.4: messaging depth — threads, edit, delete, pin, and search.
 *
 * A thread is a space with a parent (`parent_space_id`) grown from a message in it
 * (`root_message_id`); it has no members of its own, so the read models resolve them through
 * the parent. A message keeps its row when edited or deleted: `edited_at` says it changed, and
 * `deleted_at` that it was taken back, its text gone from the row and the search index while
 * the log keeps the words. `pins` is a projection of `message.pinned` and `message.unpinned`.
 *
 * Search is FTS5, in tables of its own kept in step by triggers rather than external-content
 * tables: `messages` is keyed by a text id, and the rowid an external-content index would hang
 * on can change under VACUUM. The indexed text is copied; the columns after it are filters.
 * Postgres (Phase 6) gets its own migration for these, since the syntax is the dialect's.
 */

import { type Kysely, sql } from "kysely";

// biome-ignore lint/suspicious/noExplicitAny: a migration runs against the schema of its moment.
type Db = Kysely<any>;

export const name = "0010-messaging-depth";

export async function up(db: Db): Promise<void> {
  await db.schema.alterTable("spaces").addColumn("parent_space_id", "text").execute();
  await db.schema.alterTable("spaces").addColumn("root_message_id", "text").execute();
  // The threads of a space, for resolving who is in them.
  await db.schema
    .createIndex("spaces_workspace_id_parent_space_id")
    .on("spaces")
    .columns(["workspace_id", "parent_space_id"])
    .execute();
  // The thread a message roots, for the rule that a message roots one thread.
  await db.schema
    .createIndex("spaces_workspace_id_root_message_id")
    .on("spaces")
    .columns(["workspace_id", "root_message_id"])
    .execute();

  await db.schema.alterTable("messages").addColumn("edited_at", "text").execute();
  await db.schema.alterTable("messages").addColumn("deleted_at", "text").execute();

  await db.schema
    .createTable("pins")
    .addColumn("workspace_id", "text", (c) => c.notNull().references("workspaces.id"))
    .addColumn("space_id", "text", (c) => c.notNull())
    .addColumn("message_id", "text", (c) => c.notNull())
    .addColumn("pinned_by", "text", (c) => c.notNull())
    .addColumn("pinned_at", "text", (c) => c.notNull())
    .addPrimaryKeyConstraint("pins_pk", ["space_id", "message_id"])
    .execute();
  // The pins of a space, oldest first.
  await db.schema
    .createIndex("pins_workspace_id_space_id")
    .on("pins")
    .columns(["workspace_id", "space_id", "pinned_at"])
    .execute();

  await sql`create virtual table messages_fts using fts5(
    text,
    message_id unindexed,
    workspace_id unindexed,
    space_id unindexed,
    created_at unindexed,
    author_id unindexed,
    tokenize = 'unicode61 remove_diacritics 2'
  )`.execute(db);
  // A message is searchable while it has text and has not been taken back.
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
  // What is already there is indexed once.
  await sql`insert into messages_fts (text, message_id, workspace_id, space_id, created_at, author_id)
    select text, id, workspace_id, coalesce(space_id, ''), created_at, author_id from messages
    where text is not null and deleted_at is null`.execute(db);

  // A receipt: a step's title and summary, findable by the space of its run.
  await sql`create virtual table steps_fts using fts5(
    text,
    run_id unindexed,
    step_id unindexed,
    workspace_id unindexed,
    space_id unindexed,
    updated_at unindexed,
    tokenize = 'unicode61 remove_diacritics 2'
  )`.execute(db);
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
  await sql`insert into steps_fts (text, run_id, step_id, workspace_id, space_id, updated_at)
    select trim(coalesce(title, '') || ' ' || coalesce(summary, '')), run_id, step_id, workspace_id,
      coalesce((select space_id from runs where runs.id = steps.run_id), ''), updated_at
    from steps`.execute(db);
}

export async function down(db: Db): Promise<void> {
  for (const trigger of [
    "messages_fts_insert",
    "messages_fts_update",
    "messages_fts_delete",
    "steps_fts_insert",
    "steps_fts_update",
    "steps_fts_delete",
  ]) {
    await sql`drop trigger if exists ${sql.raw(trigger)}`.execute(db);
  }
  await sql`drop table if exists steps_fts`.execute(db);
  await sql`drop table if exists messages_fts`.execute(db);
  await db.schema.dropTable("pins").execute();
  await db.schema.alterTable("messages").dropColumn("deleted_at").execute();
  await db.schema.alterTable("messages").dropColumn("edited_at").execute();
  await db.schema.dropIndex("spaces_workspace_id_root_message_id").execute();
  await db.schema.dropIndex("spaces_workspace_id_parent_space_id").execute();
  await db.schema.alterTable("spaces").dropColumn("root_message_id").execute();
  await db.schema.alterTable("spaces").dropColumn("parent_space_id").execute();
}
