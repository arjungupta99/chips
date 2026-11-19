/**
 * A harness's Permissions (ADR 0299): a hold on its asks, kept on its everywhere policy row and on
 * the workspace's for every harness, and what the harness says it runs on its own, kept as it last
 * sent it (a report, not policy, so a registry row and not a projection).
 */

import type { Kysely } from "kysely";

// biome-ignore lint/suspicious/noExplicitAny: a migration runs against the schema of its moment.
type Db = Kysely<any>;

export const name = "0066-harness-permissions";

export async function up(db: Db): Promise<void> {
  await db.schema.alterTable("harness_policy").addColumn("hold", "text").execute();
  await db.schema.alterTable("workspace_policy").addColumn("hold", "text").execute();
  await db.schema
    .createTable("harness_own_rules")
    .addColumn("harness_id", "text", (c) => c.primaryKey())
    .addColumn("workspace_id", "text", (c) => c.notNull().references("workspaces.id"))
    .addColumn("own_rules", "text", (c) => c.notNull())
    .addColumn("heard_at", "text", (c) => c.notNull())
    .execute();
}

export async function down(db: Db): Promise<void> {
  await db.schema.dropTable("harness_own_rules").execute();
  await db.schema.alterTable("workspace_policy").dropColumn("hold").execute();
  await db.schema.alterTable("harness_policy").dropColumn("hold").execute();
}
