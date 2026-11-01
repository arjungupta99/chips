/**
 * A harness can be removed (27 September 2026, ADR 0078).
 *
 * `removed_at` is when a person took the harness out of the workspace: its tokens were withdrawn,
 * and it can no longer connect, be added to a room or be asked for one. The row stays, so what it
 * said keeps its name in every room it was in.
 *
 * `participants` is the registry, not a projection (ADR 0018), and `harness.removed` in the log is
 * the audit's line, as `harness.transferred` is for an owner. There is nothing to backfill: no
 * harness could be removed before this build.
 */

import type { Kysely } from "kysely";

// biome-ignore lint/suspicious/noExplicitAny: a migration runs against the schema of its moment.
type Db = Kysely<any>;

export const name = "0029-harness-removed";

export async function up(db: Db): Promise<void> {
  await db.schema.alterTable("participants").addColumn("removed_at", "text").execute();
}

export async function down(db: Db): Promise<void> {
  await db.schema.alterTable("participants").dropColumn("removed_at").execute();
}
