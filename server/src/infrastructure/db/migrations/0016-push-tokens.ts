/**
 * M4.3: a phone registers where a push may reach it.
 *
 * One registry table (ADR 0018 again: a device's push token is a credential, not a projection
 * of any event). The device is the primary key, because a token belongs to an installation and
 * not to a person: the same person's two phones hold two, and a phone that is re-paired holds
 * one. `time_zone` is the phone's own IANA zone, which is what quiet hours are computed in —
 * the server's clock says nothing about when it is ten at night where the phone is.
 *
 * The index is the way the sender reads: everyone who may answer an ask, at once.
 */

import type { Kysely } from "kysely";

// biome-ignore lint/suspicious/noExplicitAny: a migration runs against the schema of its moment.
type Db = Kysely<any>;

export const name = "0016-push-tokens";

export async function up(db: Db): Promise<void> {
  await db.schema
    .createTable("push_tokens")
    .addColumn("device_id", "text", (c) => c.primaryKey().references("devices.id"))
    .addColumn("workspace_id", "text", (c) => c.notNull().references("workspaces.id"))
    .addColumn("participant_id", "text", (c) => c.notNull())
    .addColumn("token", "text", (c) => c.notNull())
    .addColumn("platform", "text", (c) => c.notNull())
    .addColumn("time_zone", "text", (c) => c.notNull())
    .addColumn("updated_at", "text", (c) => c.notNull())
    .execute();

  await db.schema
    .createIndex("push_tokens_person")
    .on("push_tokens")
    .columns(["workspace_id", "participant_id"])
    .execute();
}

export async function down(db: Db): Promise<void> {
  await db.schema.dropIndex("push_tokens_person").execute();
  await db.schema.dropTable("push_tokens").execute();
}
