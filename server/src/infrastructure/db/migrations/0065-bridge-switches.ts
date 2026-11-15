/**
 * The owner's switch on a harness page, "Keep this bridge up to date" (13 November 2026,
 * everything in step): a row only for a harness whose switch an owner has turned, on by default.
 */

import type { Kysely } from "kysely";

// biome-ignore lint/suspicious/noExplicitAny: a migration runs against the schema of its moment.
type Db = Kysely<any>;

export const name = "0065-bridge-switches";

export async function up(db: Db): Promise<void> {
  await db.schema
    .createTable("bridge_switches")
    .addColumn("harness_id", "text", (c) => c.primaryKey())
    .addColumn("workspace_id", "text", (c) => c.notNull().references("workspaces.id"))
    .addColumn("keep_current", "integer", (c) => c.notNull())
    .addColumn("set_by", "text", (c) => c.notNull())
    .addColumn("set_at", "text", (c) => c.notNull())
    .execute();
}

export async function down(db: Db): Promise<void> {
  await db.schema.dropTable("bridge_switches").execute();
}
