/**
 * The harness a room was asked of (24 September 2026).
 *
 * A person can open a room and ask a harness into it — `space.created` with `asked_of` — for the
 * harness to make something of its own for it and claim the room under its own key. The harness
 * finds the rooms waiting for it by this column: asked of it, and no key yet.
 *
 * `spaces` is a projection, so a rebuild fills it from the log. There is nothing to backfill: no
 * `space.created` could carry `asked_of` before this build, whose schema is the first to have it.
 */

import type { Kysely } from "kysely";

// biome-ignore lint/suspicious/noExplicitAny: a migration runs against the schema of its moment.
type Db = Kysely<any>;

export const name = "0027-asked-of";

export async function up(db: Db): Promise<void> {
  await db.schema.alterTable("spaces").addColumn("asked_of", "text").execute();
}

export async function down(db: Db): Promise<void> {
  await db.schema.alterTable("spaces").dropColumn("asked_of").execute();
}
