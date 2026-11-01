/**
 * A harness's home (25 September 2026, ADR 0069).
 *
 * The room a harness's lead speaks in is always there: nobody archives or erases it, and the apps
 * offer neither. The harness says which room that is with `space.updated` and `home: true`, and
 * the door reads this column to refuse a person's archive or erase.
 *
 * `spaces` is a projection, so a rebuild fills it from the log. There is nothing to backfill: no
 * `space.updated` could carry `home` before this build, whose schema is the first to have it.
 */

import type { Kysely } from "kysely";

// biome-ignore lint/suspicious/noExplicitAny: a migration runs against the schema of its moment.
type Db = Kysely<any>;

export const name = "0028-home";

export async function up(db: Db): Promise<void> {
  await db.schema
    .alterTable("spaces")
    .addColumn("home", "integer", (column) => column.notNull().defaultTo(0))
    .execute();
}

export async function down(db: Db): Promise<void> {
  await db.schema.alterTable("spaces").dropColumn("home").execute();
}
