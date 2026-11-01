/**
 * A room's changes locked (13 October 2026, ADR 0156).
 *
 * `spaces` gains `locked`: 1 while a person there has locked the room's changes, so that no person
 * renames, archives or deletes it, and the door reads this column to refuse them. A room starts
 * unlocked.
 *
 * `spaces` is a projection, so a rebuild fills it from the log: a `space.lock_set` writes it.
 * There is nothing to backfill: no room could be locked before this build, whose schema is the
 * first to have the event.
 */

import type { Kysely } from "kysely";

// biome-ignore lint/suspicious/noExplicitAny: a migration runs against the schema of its moment.
type Db = Kysely<any>;

export const name = "0045-room-lock";

export async function up(db: Db): Promise<void> {
  await db.schema
    .alterTable("spaces")
    .addColumn("locked", "integer", (column) => column.notNull().defaultTo(0))
    .execute();
}

export async function down(db: Db): Promise<void> {
  await db.schema.alterTable("spaces").dropColumn("locked").execute();
}
