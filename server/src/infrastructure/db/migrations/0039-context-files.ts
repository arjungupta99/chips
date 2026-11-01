/**
 * Context files (7 October 2026, ADR 0134): the copy a harness sends of each agent's context
 * files, and of its own set, and the edits people ask of them on their way to the harness.
 *
 * Registry tables, as join requests are (ADR 0122): what a person wrote about themselves in a
 * file their agent reads is not replayed to every device, and an edit is never sent twice. A set
 * is one row: the files are read and written whole, as the harness sends them, never one by one.
 * An edit keeps its text only until the harness answers it.
 */

import type { Kysely } from "kysely";

// biome-ignore lint/suspicious/noExplicitAny: a migration runs against the schema of its moment.
type Db = Kysely<any>;

export const name = "0039-context-files";

export async function up(db: Db): Promise<void> {
  await db.schema
    .createTable("context_sets")
    .addColumn("workspace_id", "text", (c) => c.notNull().references("workspaces.id"))
    .addColumn("owner_kind", "text", (c) => c.notNull())
    .addColumn("owner_id", "text", (c) => c.notNull())
    .addColumn("harness_id", "text", (c) => c.notNull())
    .addColumn("files", "text", (c) => c.notNull().defaultTo("[]"))
    .addColumn("not_shown", "text", (c) => c.notNull().defaultTo("[]"))
    .addColumn("new_agents_note", "text")
    .addColumn("read_at", "text", (c) => c.notNull())
    .addPrimaryKeyConstraint("context_sets_pk", ["workspace_id", "owner_kind", "owner_id"])
    .execute();

  await db.schema
    .createTable("context_edits")
    .addColumn("id", "text", (c) => c.primaryKey())
    .addColumn("workspace_id", "text", (c) => c.notNull().references("workspaces.id"))
    .addColumn("owner_kind", "text", (c) => c.notNull())
    .addColumn("owner_id", "text", (c) => c.notNull())
    .addColumn("harness_id", "text", (c) => c.notNull())
    .addColumn("name", "text", (c) => c.notNull())
    .addColumn("base_hash", "text")
    .addColumn("text", "text", (c) => c.notNull())
    .addColumn("asked_by", "text", (c) => c.notNull())
    .addColumn("asked_at", "text", (c) => c.notNull())
    .addColumn("state", "text", (c) => c.notNull())
    .addColumn("message", "text")
    .addColumn("answered_at", "text")
    .execute();

  await db.schema
    .createIndex("context_edits_owner")
    .on("context_edits")
    .columns(["workspace_id", "owner_kind", "owner_id"])
    .execute();
}

export async function down(db: Db): Promise<void> {
  await db.schema.dropIndex("context_edits_owner").execute();
  await db.schema.dropTable("context_edits").execute();
  await db.schema.dropTable("context_sets").execute();
}
