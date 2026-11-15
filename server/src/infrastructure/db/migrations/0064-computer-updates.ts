/**
 * The owner's switch, "Update this computer automatically" (13 November 2026, everything in step,
 * phase 6): one row for the computer, as `relay_switch` is. Off until an owner turns it on.
 */

import type { Kysely } from "kysely";

// biome-ignore lint/suspicious/noExplicitAny: a migration runs against the schema of its moment.
type Db = Kysely<any>;

export const name = "0064-computer-updates";

export async function up(db: Db): Promise<void> {
  await db.schema
    .createTable("computer_updates")
    .addColumn("id", "text", (c) => c.primaryKey())
    .addColumn("automatic", "integer", (c) => c.notNull())
    .addColumn("set_by", "text", (c) => c.notNull())
    .addColumn("workspace_id", "text", (c) => c.notNull().references("workspaces.id"))
    .addColumn("set_at", "text", (c) => c.notNull())
    .execute();
}

export async function down(db: Db): Promise<void> {
  await db.schema.dropTable("computer_updates").execute();
}
