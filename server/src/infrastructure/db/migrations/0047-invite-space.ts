/**
 * An invite to a space (15 October 2026, ADR 0168).
 *
 * `invites` gains `space_id`: the space a link brings whoever opens it into, as the person who
 * made it would add them, or `null` for a link to the workspace alone. Every invite made before
 * this build is the second kind, so there is nothing to backfill.
 *
 * `invites` is a registry, not a projection: the token's digest is never in the log, so a rebuild
 * does not touch it.
 */

import type { Kysely } from "kysely";

// biome-ignore lint/suspicious/noExplicitAny: a migration runs against the schema of its moment.
type Db = Kysely<any>;

export const name = "0047-invite-space";

export async function up(db: Db): Promise<void> {
  await db.schema.alterTable("invites").addColumn("space_id", "text").execute();
}

export async function down(db: Db): Promise<void> {
  await db.schema.alterTable("invites").dropColumn("space_id").execute();
}
