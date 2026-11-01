/**
 * M5.6: notifications per person.
 *
 * Two registry tables (ADR 0018: identity and credentials are not projections, and neither is
 * a person's private data). `notification_settings` holds one row per person per workspace —
 * their tiers, quiet hours and per-harness words, as JSON, theirs alone to read and write.
 * `notification_claims` is the ledger that makes "exactly one notification per event per
 * person" true across devices: a device claims a key before it raises a banner, the primary
 * key lets one claim through, and the rest see it taken. Claims are pruned after a week.
 */

import type { Kysely } from "kysely";

// biome-ignore lint/suspicious/noExplicitAny: a migration runs against the schema of its moment.
type Db = Kysely<any>;

export const name = "0011-notifications";

export async function up(db: Db): Promise<void> {
  await db.schema
    .createTable("notification_settings")
    .addColumn("workspace_id", "text", (c) => c.notNull().references("workspaces.id"))
    .addColumn("participant_id", "text", (c) => c.notNull())
    .addColumn("settings", "text", (c) => c.notNull())
    .addColumn("updated_at", "text", (c) => c.notNull())
    .addPrimaryKeyConstraint("notification_settings_pk", ["workspace_id", "participant_id"])
    .execute();

  await db.schema
    .createTable("notification_claims")
    .addColumn("workspace_id", "text", (c) => c.notNull().references("workspaces.id"))
    .addColumn("participant_id", "text", (c) => c.notNull())
    .addColumn("key", "text", (c) => c.notNull())
    .addColumn("device_id", "text", (c) => c.notNull())
    .addColumn("claimed_at", "text", (c) => c.notNull())
    .addPrimaryKeyConstraint("notification_claims_pk", ["workspace_id", "participant_id", "key"])
    .execute();
  // The prune, by age.
  await db.schema
    .createIndex("notification_claims_claimed_at")
    .on("notification_claims")
    .columns(["claimed_at"])
    .execute();
}

export async function down(db: Db): Promise<void> {
  await db.schema.dropIndex("notification_claims_claimed_at").execute();
  await db.schema.dropTable("notification_claims").execute();
  await db.schema.dropTable("notification_settings").execute();
}
