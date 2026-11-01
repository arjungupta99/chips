/**
 * When an agent reads its context files (27 October 2026, ADR 0238).
 *
 * `context_sets` gains `read_note`: an agent's harness says in its own words when the agent reads
 * its files, for the foot under them, where it does not give them at the start of every turn.
 * `null` for every set sent before it, and for a harness's own set.
 *
 * A registry, not a projection: a rebuild does not touch it.
 */

import type { Kysely } from "kysely";

// biome-ignore lint/suspicious/noExplicitAny: a migration runs against the schema of its moment.
type Db = Kysely<any>;

export const name = "0055-context-read-note";

export async function up(db: Db): Promise<void> {
  await db.schema.alterTable("context_sets").addColumn("read_note", "text").execute();
}

export async function down(db: Db): Promise<void> {
  await db.schema.alterTable("context_sets").dropColumn("read_note").execute();
}
