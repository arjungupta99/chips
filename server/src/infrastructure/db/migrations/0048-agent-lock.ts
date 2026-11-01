/**
 * An agent's changes locked (18 October 2026, ADR 0199).
 *
 * `participants` gains `locked`: 1 while a person has locked an agent's changes, so that no person
 * renames, archives or deletes it, and the door reads this column to refuse them. An agent starts
 * unlocked, and a person or a harness never has one.
 *
 * `participants` is a projection, so a rebuild fills it from the log: an `agent.lock_set` writes it.
 * There is nothing to backfill: no agent could be locked before this build, whose schema is the
 * first to have the event.
 */

import type { Kysely } from "kysely";

// biome-ignore lint/suspicious/noExplicitAny: a migration runs against the schema of its moment.
type Db = Kysely<any>;

export const name = "0048-agent-lock";

export async function up(db: Db): Promise<void> {
  await db.schema
    .alterTable("participants")
    .addColumn("locked", "integer", (column) => column.notNull().defaultTo(0))
    .execute();
}

export async function down(db: Db): Promise<void> {
  await db.schema.alterTable("participants").dropColumn("locked").execute();
}
