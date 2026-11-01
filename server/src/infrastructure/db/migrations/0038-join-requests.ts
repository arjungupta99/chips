/**
 * Join requests (5 October 2026, ADR 0122): something asks to join, and a person allows it.
 *
 * A registry table, as invites are (ADR 0018): a request is a capability on its way to becoming a
 * credential, and nothing a replay should rebuild. The secret is kept only as its digest; the code
 * beside it is for comparing on two screens, not a secret. What a person decided is in the log as
 * `join.allowed` or `join.denied`; this row is what the requester's poll and the person's card
 * read.
 *
 * The digest is unique because it is how a link is found. The other index is how the people who
 * may decide read what waits.
 */

import type { Kysely } from "kysely";

// biome-ignore lint/suspicious/noExplicitAny: a migration runs against the schema of its moment.
type Db = Kysely<any>;

export const name = "0038-join-requests";

export async function up(db: Db): Promise<void> {
  await db.schema
    .createTable("join_requests")
    .addColumn("id", "text", (c) => c.primaryKey())
    .addColumn("workspace_id", "text", (c) => c.notNull().references("workspaces.id"))
    .addColumn("kind", "text", (c) => c.notNull())
    .addColumn("secret_hash", "text", (c) => c.notNull().unique())
    .addColumn("code", "text")
    .addColumn("name", "text")
    .addColumn("software", "text")
    .addColumn("machine", "text")
    .addColumn("from_addr", "text")
    .addColumn("wants", "text", (c) => c.notNull().defaultTo("[]"))
    .addColumn("public_key", "text")
    .addColumn("state", "text", (c) => c.notNull())
    .addColumn("allowed_caps", "text", (c) => c.notNull().defaultTo("[]"))
    .addColumn("started_by", "text", (c) => c.notNull())
    .addColumn("url", "text", (c) => c.notNull())
    .addColumn("decided_by", "text")
    .addColumn("decided_at", "text")
    .addColumn("created_at", "text", (c) => c.notNull())
    .addColumn("expires_at", "text", (c) => c.notNull())
    .addColumn("harness_id", "text")
    .addColumn("space_id", "text")
    .addColumn("device_id", "text")
    .execute();

  await db.schema
    .createIndex("join_requests_state")
    .on("join_requests")
    .columns(["workspace_id", "state"])
    .execute();
}

export async function down(db: Db): Promise<void> {
  await db.schema.dropIndex("join_requests_state").execute();
  await db.schema.dropTable("join_requests").execute();
}
