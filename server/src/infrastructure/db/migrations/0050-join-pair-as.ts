/**
 * Whom a device that asked to join is paired as (19 October 2026, ADR 0206).
 *
 * `join_requests` gains `pair_as`: the person an owner chose when allowing a device that asked,
 * somebody already in the workspace whose phone is new, or `null` for the one who allowed it, as
 * every request before this build was. Nothing to backfill.
 *
 * `join_requests` is a registry, not a projection (ADR 0122): a rebuild does not touch it.
 */

import type { Kysely } from "kysely";

// biome-ignore lint/suspicious/noExplicitAny: a migration runs against the schema of its moment.
type Db = Kysely<any>;

export const name = "0050-join-pair-as";

export async function up(db: Db): Promise<void> {
  await db.schema.alterTable("join_requests").addColumn("pair_as", "text").execute();
}

export async function down(db: Db): Promise<void> {
  await db.schema.alterTable("join_requests").dropColumn("pair_as").execute();
}
