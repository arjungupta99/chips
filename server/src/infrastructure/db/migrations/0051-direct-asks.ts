/**
 * Direct asks (20 October 2026, ADR 0211 Phase 3): a guest asks the workspace's owners to share
 * the server's machine with them in Tailscale, and an owner answers with Tailscale's share link.
 *
 * `direct_asks` is a registry, not a projection, as join requests are (ADR 0122): a share link
 * lets whoever holds it onto the owner's machine, so it is never in the log. `direct_links` keeps
 * the one link an owner chose to give the next guest who asks, a row per workspace.
 */

import type { Kysely } from "kysely";

// biome-ignore lint/suspicious/noExplicitAny: a migration runs against the schema of its moment.
type Db = Kysely<any>;

export const name = "0051-direct-asks";

export async function up(db: Db): Promise<void> {
  await db.schema
    .createTable("direct_asks")
    .addColumn("id", "text", (c) => c.primaryKey())
    .addColumn("workspace_id", "text", (c) => c.notNull().references("workspaces.id"))
    .addColumn("participant_id", "text", (c) => c.notNull())
    .addColumn("device_id", "text")
    .addColumn("state", "text", (c) => c.notNull())
    .addColumn("trip_ms", "integer")
    .addColumn("link", "text")
    .addColumn("shared_by", "text")
    .addColumn("created_at", "text", (c) => c.notNull())
    .addColumn("shared_at", "text")
    .addColumn("direct_at", "text")
    .execute();
  await db.schema
    .createIndex("direct_asks_person")
    .on("direct_asks")
    .columns(["workspace_id", "participant_id"])
    .execute();
  await db.schema
    .createTable("direct_links")
    .addColumn("workspace_id", "text", (c) => c.primaryKey().references("workspaces.id"))
    .addColumn("link", "text", (c) => c.notNull())
    .addColumn("kept_by", "text", (c) => c.notNull())
    .addColumn("kept_at", "text", (c) => c.notNull())
    .execute();
}

export async function down(db: Db): Promise<void> {
  await db.schema.dropTable("direct_links").execute();
  await db.schema.dropIndex("direct_asks_person").execute();
  await db.schema.dropTable("direct_asks").execute();
}
