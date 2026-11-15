/**
 * What each device and each harness last said it runs (13 November 2026, everything in step).
 *
 * A registry table, not a projection (ADR 0018): no event says it, a rebuild leaves it alone, and
 * it is written as a socket says hello. One row per device or harness, keyed by its id: the
 * client's name and version as it said them (`chips-iphone 1.2.5`, `chips-hermes 1.0.30`), when
 * it was last heard, and when its version last changed.
 */

import type { Kysely } from "kysely";

// biome-ignore lint/suspicious/noExplicitAny: a migration runs against the schema of its moment.
type Db = Kysely<any>;

export const name = "0063-software-seen";

export async function up(db: Db): Promise<void> {
  await db.schema
    .createTable("software_seen")
    .addColumn("workspace_id", "text", (c) => c.notNull().references("workspaces.id"))
    .addColumn("subject_id", "text", (c) => c.notNull())
    .addColumn("kind", "text", (c) => c.notNull())
    .addColumn("participant_id", "text", (c) => c.notNull())
    .addColumn("name", "text", (c) => c.notNull())
    .addColumn("version", "text", (c) => c.notNull())
    .addColumn("seen_at", "text", (c) => c.notNull())
    .addColumn("changed_at", "text", (c) => c.notNull())
    .addPrimaryKeyConstraint("software_seen_pk", ["workspace_id", "subject_id"])
    .execute();
}

export async function down(db: Db): Promise<void> {
  await db.schema.dropTable("software_seen").execute();
}
