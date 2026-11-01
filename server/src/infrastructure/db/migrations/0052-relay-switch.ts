/**
 * The owner's relay switch (21 October 2026, ADR 0211 Phase 4): whether this server dials its
 * relay, who said so and when, and each device's way in.
 *
 * `relay_switch` is one row for the server, absent until an owner first turns it: the relay is a
 * server's, one tunnel key and one link, so it is on or off for every workspace here. `devices`
 * gains the way its newest socket came (`socket`, `lan` or `relay`), when, and when it last came
 * other than through the relay, which is what tells an owner who would be cut off.
 */

import type { Kysely } from "kysely";

// biome-ignore lint/suspicious/noExplicitAny: a migration runs against the schema of its moment.
type Db = Kysely<any>;

export const name = "0052-relay-switch";

export async function up(db: Db): Promise<void> {
  await db.schema
    .createTable("relay_switch")
    .addColumn("id", "text", (c) => c.primaryKey())
    .addColumn("on", "integer", (c) => c.notNull())
    .addColumn("set_by", "text", (c) => c.notNull())
    .addColumn("workspace_id", "text", (c) => c.notNull())
    .addColumn("set_at", "text", (c) => c.notNull())
    .execute();
  await db.schema.alterTable("devices").addColumn("last_via", "text").execute();
  await db.schema.alterTable("devices").addColumn("last_via_at", "text").execute();
  await db.schema.alterTable("devices").addColumn("direct_at", "text").execute();
}

export async function down(db: Db): Promise<void> {
  await db.schema.alterTable("devices").dropColumn("direct_at").execute();
  await db.schema.alterTable("devices").dropColumn("last_via_at").execute();
  await db.schema.alterTable("devices").dropColumn("last_via").execute();
  await db.schema.dropTable("relay_switch").execute();
}
