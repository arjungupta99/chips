/**
 * ADR 0047: a workspace caps what may be attached, by kind, under the server's ceiling.
 *
 * One projection table, of `attachment.limits_set`: the latest caps a workspace set — a number
 * of bytes, or null where the server's own limit applies — and who set them. A projection, not
 * a registry: the log carries every change, so a rebuild reaches the same row and the audit says
 * who capped what.
 */

import type { Kysely } from "kysely";

// biome-ignore lint/suspicious/noExplicitAny: a migration runs against the schema of its moment.
type Db = Kysely<any>;

export const name = "0017-attachment-limits";

export async function up(db: Db): Promise<void> {
  await db.schema
    .createTable("workspace_limits")
    .addColumn("workspace_id", "text", (c) => c.primaryKey().references("workspaces.id"))
    .addColumn("image_bytes", "integer")
    .addColumn("video_bytes", "integer")
    .addColumn("file_bytes", "integer")
    .addColumn("set_by", "text", (c) => c.notNull())
    .addColumn("updated_seq", "integer", (c) => c.notNull().defaultTo(0))
    .execute();
}

export async function down(db: Db): Promise<void> {
  await db.schema.dropTable("workspace_limits").execute();
}
