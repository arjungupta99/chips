/**
 * How each part of a command starts, for a This session answer (27 October 2026, ADR 0239).
 *
 * `session_rules` gains `starts_with`: for an ask that carried a command, the starts its parts
 * were remembered by, as JSON (`[["node","--check"],["echo","ok"]]`), so the rest of the run lets
 * through only commands made of those, not every command of the kind. `null` for an ask with no
 * command, and for every row made before it, which keep answering the kind whole.
 *
 * A projection: a rebuild fills it from the log.
 */

import type { Kysely } from "kysely";

// biome-ignore lint/suspicious/noExplicitAny: a migration runs against the schema of its moment.
type Db = Kysely<any>;

export const name = "0056-session-rule-starts";

export async function up(db: Db): Promise<void> {
  await db.schema.alterTable("session_rules").addColumn("starts_with", "text").execute();
}

export async function down(db: Db): Promise<void> {
  await db.schema.alterTable("session_rules").dropColumn("starts_with").execute();
}
