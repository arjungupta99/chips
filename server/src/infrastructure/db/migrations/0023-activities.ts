/** ADR 0060: current Activity snapshots; the event log remains the source of truth. */
import type { Kysely } from "kysely";

// biome-ignore lint/suspicious/noExplicitAny: a migration runs against the schema of its moment.
type Db = Kysely<any>;
export const name = "0023-activities";

export async function up(db: Db): Promise<void> {
  await db.schema
    .createTable("activities")
    .addColumn("workspace_id", "text", (c) => c.notNull())
    .addColumn("id", "text", (c) => c.notNull())
    .addColumn("space_id", "text", (c) => c.notNull())
    .addColumn("publisher_id", "text", (c) => c.notNull())
    .addColumn("revision", "integer", (c) => c.notNull())
    .addColumn("message_id", "text")
    .addColumn("snapshot", "text", (c) => c.notNull())
    .addColumn("first_seq", "integer", (c) => c.notNull())
    .addColumn("last_seq", "integer", (c) => c.notNull())
    .addColumn("event_id", "text", (c) => c.notNull())
    .addColumn("received_at", "text", (c) => c.notNull())
    .addPrimaryKeyConstraint("activities_pk", ["workspace_id", "id"])
    .addUniqueConstraint("activities_message", ["workspace_id", "message_id"])
    .execute();
  await db.schema
    .createIndex("activities_space_seq")
    .on("activities")
    .columns(["workspace_id", "space_id", "first_seq"])
    .execute();
}

export async function down(db: Db): Promise<void> {
  await db.schema.dropTable("activities").execute();
}
